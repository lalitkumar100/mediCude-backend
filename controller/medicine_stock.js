const pool = require("../config/db");
const asyncHandler = require("../services/asyncHandler");
const {
  buildMedicineSearchQuery,
  getWholesalerIdByName,
  getOrCreateInvoice,
  updateInvoiceTotal,
  delete1,
} = require("../services/medicie_serivce");

// Main route
const addMedicineStock = asyncHandler(async (req, res) => {
  const { wholesaler, invoiceNumber, medicine } = req.body;

  if (!wholesaler || !invoiceNumber || !Array.isArray(medicine)) {
    res.status(400);
    throw new Error("Invalid request body");
  }

  // 1. Wholesaler check
  const wholesalerId = await getWholesalerIdByName(wholesaler);
  if (!wholesalerId) {
    res.status(400);
    throw new Error("Wholesaler not found. Please register first.");
  }

  // 2. Get or create invoice
  const invoiceId = await getOrCreateInvoice(invoiceNumber, wholesalerId);
  if (!invoiceId) {
    res.status(400);
    throw new Error("Invoice not found or failed to create.");
  }

  // 3. Prepare to insert
  let totalAmount = 0;

  // In-memory duplicate check
  const seenMedicines = new Set();

  for (const med of medicine) {
    const {
      packed_type,
      medicine_name,
      brand_name,
      expiry_date,
      batch_no,
      purchase_price = 0,
      mrp,
      mfg_date,
      stock_quantity = 0,
    } = med;

    // In-request duplicate key
    const key = `${packed_type}|${medicine_name}|${brand_name}|${expiry_date}|${batch_no}`;
    if (seenMedicines.has(key)) {
      res.status(409);
      throw new Error(
        `Duplicate medicine "${medicine_name}" with batch "${batch_no}" found in request.`
      );
    }
    seenMedicines.add(key);

    // DB duplicate check
    const checkQuery = `
      SELECT medicine_id FROM medicine_stock
      WHERE packed_type = $1 AND medicine_name = $2 AND brand_name = $3  AND batch_no = $4 AND invoice_id = $5
    `;
    const result = await pool.query(checkQuery, [
      packed_type,
      medicine_name,
      brand_name,
      batch_no,
      invoiceId,
    ]);

    if (result.rowCount > 0) {
      const medicineId = result.rows[0].medicine_id;
      res.status(409);
      throw new Error(
        `Medicine "${medicine_name}" with batch "${batch_no}" already exists. `
      );
    }

    // Insert medicine
    const insertQuery = `
      INSERT INTO medicine_stock (
        packed_type,
        medicine_name, 
        brand_name, 
        expiry_date,
        batch_no,
        purchase_price, 
        mrp, 
        mfg_date, 
        stock_quantity, 
        invoice_id,
        invoice_no
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `;
    await pool.query(insertQuery, [
      packed_type,
      medicine_name,
      brand_name,
      expiry_date,
      batch_no,
      purchase_price,
      mrp,
      mfg_date,
      stock_quantity,
      invoiceId,
      invoiceNumber,
    ]);

    totalAmount += Number(purchase_price) * Number(stock_quantity);
  }

  // 4. Update invoice total
  await updateInvoiceTotal(invoiceId, totalAmount);

  res.status(201).json({
    message: "Medicines added successfully and invoice updated.",
    invoiceId,
    totalAddedAmount: totalAmount,
  });
});

//===================================================
//updateMedicine_info
//========================================================

const updateMedicine_info = asyncHandler(async (req, res) => {
  const medicine_id = req.params.Id;

  
  const {
    packed_type,
    medicine_name,
    brand_name,
    expiry_date,
    batch_no,
    purchase_price,
    mrp,
    mfg_date,
    stock_quantity,
  } = req.body;

  // Step 1: Get current medicine data
  const { rows: oldRows } = await pool.query(
    "SELECT * FROM medicine_stock WHERE medicine_id = $1",
    [medicine_id]
  );

  if (oldRows.length === 0) {
    throw new Error("Medicine not found. Please check the ID.");
  }
  const oldMedicine = oldRows[0];

  const invoiceId = oldRows[0].invoice_id;
  let checkPurchasePrice = false;
  let checkStock_quantity = false;

  // Step 2: Prepare dynamic SET clause
  const fields = [];
  const values = [];
  let index = 1;

  if (medicine_name && medicine_name !== oldMedicine.medicine_name) {
    fields.push(`medicine_name = $${index++}`);
    values.push(medicine_name);
  }
  if (brand_name && brand_name !== oldMedicine.brand_name) {
    fields.push(`brand_name = $${index++}`);
    values.push(brand_name);
  }
  if (
    stock_quantity !== undefined &&
    stock_quantity !== oldMedicine.stock_quantity
  ) {
    fields.push(`stock_quantity = $${index++}`);
    values.push(stock_quantity);
    checkStock_quantity = true;
  }
  if (mfg_date && mfg_date !== oldMedicine.mfg_date) {
    fields.push(`mfg_date = $${index++}`);
    values.push(mfg_date);
  }
  if (expiry_date && expiry_date !== oldMedicine.expiry_date) {
    fields.push(`expiry_date = $${index++}`);
    values.push(expiry_date);
  }
  if (
    purchase_price !== undefined &&
    purchase_price !== oldMedicine.purchase_price
  ) {
    fields.push(`purchase_price = $${index++}`);
    values.push(purchase_price);
    checkPurchasePrice = true;
  }
  if (mrp !== undefined && mrp !== oldMedicine.mrp) {
    fields.push(`mrp = $${index++}`);
    values.push(mrp);
  }
  if (batch_no && batch_no !== oldMedicine.batch_no) {
    fields.push(`batch_no = $${index++}`);
    values.push(batch_no);
  }

  if (packed_type && packed_type !== oldMedicine.packed_type) {
    fields.push(`packed_type = $${index++}`);
    values.push(packed_type);
  }

  if (fields.length === 0) {
    throw new Error(
      "No fields to update. Please provide at least one field to update."
    );
  }

  values.push(medicine_id);

  const updateQuery = `
    UPDATE medicine_stock
    SET ${fields.join(", ")}
    WHERE medicine_id = $${index}
    RETURNING *;
  `;

  const updatedMedicine = await pool.query(updateQuery, values).rows;
  let invoice_adjustment;
  //there change in stock and purchase price
  if (checkPurchasePrice || checkStock_quantity) {
    // Step 3: Calculate old and new line totals

    const oldTotal =
      parseFloat(oldMedicine.purchase_price) *
      parseInt(oldMedicine.stock_quantity);
    const newPurchasePrice =
      purchase_price !== undefined
        ? purchase_price
        : oldMedicine.purchase_price;
    const newStockQuantity =
      stock_quantity !== undefined
        ? stock_quantity
        : oldMedicine.stock_quantity;
    const newTotal = newPurchasePrice * newStockQuantity;
    const delta = newTotal - oldTotal;

    await updateInvoiceTotal(invoiceId, delta);
    invoice_adjustment = {
      previous_amount: oldTotal.toFixed(2),
      new_amount: newTotal.toFixed(2),
      delta: delta.toFixed(2),
    };
  }

  res.status(200).json({
    message: "Medicine updated and invoice total adjusted.",
    updated_medicine: updatedMedicine,
    invoice_adjustment: invoice_adjustment,
  });
});

// =======================
// 2. Get All Medicine Stock
// =======================
const handleGetMedicineStockData = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT 
    ms.medicine_id as id,
    ms.medicine_name,
    ms.brand_name AS brand,
    ms.batch_no,
    ms.stock_quantity AS quantity,
    ms.mrp,
    ms.purchase_price,
    ms.invoice_no,
    ms.expiry_date,
    w.name AS wholesaler,
    ms.packed_type,
    ms.mfg_date,
    ms.created_at
FROM 
    medicine_stock ms
JOIN 
    invoices i ON ms.invoice_id = i.invoice_id
JOIN 
    wholesalers w ON i.wholesaler_id = w.wholesaler_id
WHERE 
    ms.stock_quantity > 0
    AND (ms.expiry_date IS NULL OR ms.expiry_date > CURRENT_DATE)`);

  res.status(200).json({ no_medicine: rows.length, rows });
});

//================================================================
//delete medicine
//===============================================================
const deleteMedicine = asyncHandler(async (req, res) => {
  const medicine_id = req.params.id;
  await delete1(medicine_id);

  res.status(200).json({
    status: "success",
    message: `Deleted medicine with id ${medicine_id}`,
  });
});

// ===============================
// Controller: Get Filtered Medicines
// ===============================

const getFilteredMedicines = asyncHandler(async (req, res) => {
  const params = req.query;

  const limit = parseInt(params.limit) || 10;
  const offset = parseInt(params.offset) || 0;
  const currentPage = Math.floor(offset / limit) + 1;

  // Validation
  if (limit <= 0 || offset < 0) {
    return res.status(400).json({
      status: "fail",
      message: "Invalid pagination parameters",
    });
  }

  // Build both queries
  const { text: dataQuery, values: dataValues } = buildMedicineSearchQuery(
    { ...params, limit, offset },
    false
  );

  const { limit: _l, offset: _o, ...countParams } = params;
  const { text: countQueryText, values: countValues } =
    buildMedicineSearchQuery({ ...countParams }, true);

  const countQuery = `SELECT COUNT(*) AS total_count FROM (${countQueryText}) AS subquery`;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, dataValues),
    pool.query(countQuery, countValues),
  ]);

  const totalCount = parseInt(countResult.rows[0].total_count, 10);
  const totalPages = Math.ceil(totalCount / limit);

  res.status(200).json({
    status: "success",
    message: "Medicines fetched successfully",
    data: {
      medicines: dataResult.rows,
      pagination: {
        total_items: totalCount,
        total_pages: totalPages,
        current_page: currentPage,
        per_page: limit,
      },
    },
  });
});

//=========================================//
//getMedicineInfoById
//===========================================//
const getMedicineInfoById = asyncHandler(async (req, res) => {
  const { Id } = req.params;

  if (!Id) {
    throw new Error(`valid id`);
  }
  const query = `SELECT * FROM view_medicine_stock_with_wholesaler where medicine_id=$1`;
  const { rows: result } = await pool.query(query, [Id]);
  if (!result || result.length == 0) {
     res.status(404);                 // 👈 set status here
    throw new Error(`not medicine is found by this id ${Id}`);
  }
  res.status(200).json({
    status: "success",
    message: "medicne info is found",
    medicine: result,
  });
});

const recommondationMedicineName = asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim() === "") {
    return res.status(400).json({
      status: "fail",
      message: "Query parameter is required",
    });
  }

  const search = `%${query.toLowerCase()}%`;

  const sql = `
    SELECT medicine_name,medicine_id ,batch_no
    FROM medicine_stock 
    WHERE LOWER(medicine_name) LIKE $1
    ORDER BY medicine_name
    LIMIT 5;
  `;

  const { rows } = await pool.query(sql, [search]);

  res.status(200).json({
    status: "success",
    recommendations: rows,
  });
});

const recommondationMedicineName2 = asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim() === "") {
    return res.status(400).json({
      status: "fail",
      message: "Query parameter is required",
    });
  }

  const search = `%${query.toLowerCase()}%`;

  const sql = `
    SELECT DISTINCT medicine_name,medicine_id 
    FROM medicine_stock 
    WHERE LOWER(medicine_name) LIKE $1
    ORDER BY medicine_name
    LIMIT 5;
  `;

  const { rows } = await pool.query(sql, [search]);

  res.status(200).json({
    status: "success",
    recommendations: rows.map((row) => row.medicine_name),
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

module.exports = {
  handleGetMedicineStockData,
  getFilteredMedicines,
  addMedicineStock,
  updateMedicine_info,
  deleteMedicine,
  getMedicineInfoById,
  recommondationMedicineName,
  handleReturnMedicine,
};
