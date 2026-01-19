const pool = require('../config/db');
const asyncHandler = require('../services/asyncHandler');
const {    getWholesalerIdByName, getOrCreateInvoice, updateInvoiceTotal,delete1  } = require('../services/medicie_serivce');
const { addExpiryStock } = require('../services/expiry_Service');

const handleExpiringMedicines = asyncHandler(async (req, res) => {


   const days = parseInt(req.query.days);
  const months = parseInt(req.query.months);
  const years = parseInt(req.query.years);
  let interval = '';

  if (!isNaN(days) && days > 0) {
    interval = `${days} DAY`;
  } else if (!isNaN(months) && months > 0) {
    interval = `${months} MONTH`;
  } else if (!isNaN(years) && years > 0) {
    interval = `${years} YEAR`;
  } else {
    return res.status(400).json({
      error: 'Please provide a valid query parameter: "days", "months", or "years".',
    });
  }


    const result = await pool.query(
      ` SELECT count(*) OVER() AS total_count,
        medicine_id,
        medicine_name,
        brand_name,
        batch_no,
        expiry_date,
        stock_quantity,
        mrp
      FROM 
        medicine_stock
      WHERE 
        expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '${interval}')
      ORDER BY 
        expiry_date ASC;
      `
    );


    const rows = result.rows;    
if (!rows || rows.length === 0) {
  return res.status(404).json({ message: 'No expiring medicines found' });
}
    res.json({expriy_no:rows.length,rows});

});

//=======================
//remoce exprie medicine
//========================
const removeExpiringMedicines = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Medicine ID is required' });
  }

  const addExpiryStock = await addExpiryStock(id);
  if (!addExpiryStock.success) {  
     res.status(500)
     throw new Error('Failed to add medicine to expiry stock');
  }
  const deleteResult = await delete1(id);
  if (!deleteResult) {  
    res.status(500)
    throw new Error('Failed to delete medicine from stock');
  }

  res.json({
    message: 'Medicine as exprire successfully',
    data: result.rows[0],
  });
});


const handleReturnMedicine = asyncHandler(async (req, res) => {
  const { id } = req.params; // This corresponds to medicine_id

  // We need a specific client from the pool to run a transaction
  const client = await pool.connect();

  try {
    // 1. Start Transaction
    await client.query('BEGIN');

    // 2. Delete from medicine_stock and return the deleted data immediately
    const deleteQuery = `
      DELETE FROM medicine_stock 
      WHERE medicine_id = $1 
      RETURNING *
    `;
    const deleteResult = await client.query(deleteQuery, [id]);

    // Check if medicine existed
    if (deleteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        status: 'error', 
        message: 'Medicine not found in stock.' 
      });
    }

    const medicine = deleteResult.rows[0];

    // 3. Insert into expiry_stock
    // Note: We map the old 'medicine_id' (PK) to the 'medicine_id' column in expiry_stock
    const insertQuery = `
      INSERT INTO expiry_stock (
        invoice_id, 
        medicine_id, 
        medicine_name, 
        brand_name, 
        stock_quantity, 
        mfg_date, 
        expiry_date, 
        purchase_price, 
        mrp, 
        batch_no, 
        packed_type, 
        invoice_no
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    const insertValues = [
      medicine.invoice_id,
      medicine.medicine_id, 
      medicine.medicine_name,
      medicine.brand_name,
      medicine.stock_quantity,
      medicine.mfg_date,
      medicine.expiry_date,
      medicine.purchase_price,
      medicine.mrp,
      medicine.batch_no,
      medicine.packed_type,
      medicine.invoice_no
    ];

    await client.query(insertQuery, insertValues);

    // 4. Commit Transaction
    await client.query('COMMIT');

    res.json({
      status: 'success',
      message: 'Medicine successfully moved to expiry stock.',
      data: { 
        medicine_id: medicine.medicine_id,
        name: medicine.medicine_name 
      }
    });

  } catch (error) {
    // If any error occurs, undo the delete
    await client.query('ROLLBACK');
    console.error('Error moving medicine to expiry:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Server error processing return.' 
    });
  } finally {
    // Always release the client back to the pool
    client.release();
  }
});


const handleGetExpiryStockData = asyncHandler(async (req, res) => {
  // We join with invoices and wholesalers to get the Wholesaler Name, 
  // just like the main stock function.
  const query = `
    SELECT 
      es.expiry_id as id,           -- Using expiry_id as the unique row ID
      es.medicine_name,
      es.brand_name AS brand,
      es.batch_no,
      es.stock_quantity AS quantity,
      es.mrp,
      es.purchase_price,
      es.invoice_no,
      es.expiry_date,
      w.name AS wholesaler,
      es.packed_type,
      es.mfg_date,
      es.created_at
    FROM 
      expiry_stock es
    LEFT JOIN 
      invoices i ON es.invoice_id = i.invoice_id
    LEFT JOIN 
      wholesalers w ON i.wholesaler_id = w.wholesaler_id
    ORDER BY 
      es.created_at DESC
  `;

  const { rows } = await pool.query(query);

  res.status(200).json({ 
    status: 'success', 
    no_medicine: rows.length, 
    rows 
  });
});

const getExpiryMedicineInfoById = asyncHandler(async (req, res) => {
  const { id } = req.params; // Using lowercase 'id' is standard convention

  if (!id) {
    throw new Error('Valid ID is required');
  }

  // We join tables here to get the same level of detail (like wholesaler name)
  // as your 'view_medicine_stock_with_wholesaler' provided.
  const query = `
    SELECT 
      es.*,
      w.name AS wholesaler_name,
      i.invoice_date
    FROM 
      expiry_stock es
    LEFT JOIN 
      invoices i ON es.invoice_id = i.invoice_id
    LEFT JOIN 
      wholesalers w ON i.wholesaler_id = w.wholesaler_id
    WHERE 
      es.expiry_id = $1
  `;

  const { rows: result } = await pool.query(query, [id]);

  if (result.length === 0) {
    throw new Error(`No expiry record found by this id: ${id}`);
  }

  res.status(200).json({
    status: "success",
    message: "Expiry medicine info is found",
    medicine: result, // result is an array, usually you might want result[0] for a single ID
  });
});

module.exports = {
  handleExpiringMedicines,
  removeExpiringMedicines,
  handleReturnMedicine,
  handleGetExpiryStockData,
  getExpiryMedicineInfoById,
};


// =======================
