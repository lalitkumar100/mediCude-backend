const pool = require('../config/db');
const asyncHandler = require('../services/asyncHandler');
const { generateSaleNo, calculateTotals  ,getSalesData ,getFilteredSales,getSaleSummaryDataByID} = require('../services/sale_Service');

const processSale = asyncHandler(async (req, res) => {
  const { customer_name,contact_number , payment_method, medicines } = req.body;
  const employee_id  = req.user.login_id; // Get employee_id from authenticated user
  // Validate input (skipped here for brevity)

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sale_no = await generateSaleNo(req.user.login_id);
    const sale_date = new Date();

    // Calculate totals
    const { purchase_price_total, total_amount, mrp_total } = await calculateTotals(medicines, client);

   
    // Insert into sales
    const saleRes = await client.query(
      `INSERT INTO sales (
        employee_id, sale_no, sale_date, purchase_price, total_amount, mrp_amount,
        payment_method, customer_name,contact_number 
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8 ,$9)
      RETURNING sale_id;`,
      [employee_id, sale_no, sale_date, purchase_price_total, total_amount, mrp_total, payment_method, customer_name ,contact_number]
    );

    const sale_id = saleRes.rows[0].sale_id;
    const soldMedicines = [];

    for (const item of medicines) {
      const { medicine_id, quantity, rate } = item;

      // Get medicine info
      const medRes = await client.query(
        `SELECT medicine_name, mrp, purchase_price, expiry_date, batch_no
         FROM medicine_stock WHERE medicine_id = $1`,
        [medicine_id]
      );
      const medicine = medRes.rows[0];

      // Update stock
      await client.query(
        `UPDATE medicine_stock SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP
         WHERE medicine_id = $2 AND stock_quantity >= $1`,
        [quantity, medicine_id]
      );

try {
        // Insert sale item
      await client.query(
        `INSERT INTO sale_items (
          sale_id, medicine_id, medicine_name, batch_no, expiry_date, purchase_price, mrp, quantity, rate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          sale_id, medicine_id, medicine.medicine_name, medicine.batch_no,
          medicine.expiry_date, medicine.purchase_price, medicine.mrp, quantity, rate
        ]
      );
} catch (error) {
  console.log(error);
  
}

      // Prepare response data
      soldMedicines.push({
        medicine_name: medicine.medicine_name,
        mrp: medicine.mrp,
        rate,
        quantity,
        discount: medicine.mrp - rate
      });
    }

    await client.query('COMMIT');

    return res.json({
      date: sale_date.toISOString().split('T')[0],
      customer_name,
      contact_number,
      invoice_no: sale_no,
      medicine: soldMedicines,
      total_amount
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});


const handleGetSalesData = asyncHandler(async (req, res) => {
  let { limit = 10, offset = 0 } = req.query;

  // Convert to numbers
  limit = parseInt(limit);
  offset = parseInt(offset);

  // 1. Initialize the base query and the parameters array
  let query = `
    SELECT
      e.first_name || ' ' || COALESCE(e.last_name, '') AS employee_name,
      s.sale_id,
      s.sale_no,
      s.sale_date,
      s.total_amount,
      s.payment_method,
      s.customer_name
    FROM
      sales s
    JOIN
      employees e ON s.employee_id = e.employee_id
    WHERE
      s.deleted_at IS NULL
  `;
  
  const queryParams = [];

  // 2. Check the role and modify the query if necessary
  if (req.user.role === 'worker') {
    // Append the condition for the worker
    query += ` AND s.employee_id = $1`;
    // Add the employee_id to the parameters array
    queryParams.push(req.user.employee_id);
  }

  // 3. Add the ordering (and limit/offset if you decide to implement them later)
  query += ` ORDER BY s.sale_date DESC`;

  // 4. Execute query with the dynamic parameters
  const result = await pool.query(query, queryParams);

  res.json({
    status: 'success',
    count: result.rows.length,
    data: result.rows,
  });
});

// GET /sales
const AllSales = asyncHandler(async (req, res) => {
  let { limit = 10, offset = 0 } = req.query;
  limit = parseInt(limit);
  offset = parseInt(offset);

  const query = `SELECT * FROM sales_with_profit ORDER BY sale_date DESC LIMIT $1 OFFSET $2`;
  const result = await pool.query(query, [limit, offset]);

  res.json({
    status: 'success',
    count: result.rows.length,
    data: result.rows
  });
});

// Soft delete a sale
// This marks the sale as deleted without removing it from the database


const softDeleteSale = asyncHandler(async (req, res) => {
  // 1. You extracted 'id' here
  const { id } = req.params; 

  const result = await pool.query(
    `DELETE FROM sales WHERE sale_id = $1`,
    [id] // 2. Fixed: Changed 'sale_id' to 'id'
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ status: 'fail', message: 'Sale not found or already deleted' });
  }

  res.json({
    status: 'success',
    // 3. Fixed: Changed 'sale_id' to 'id' here as well
    message: `Sale ${id} soft-deleted successfully`, 
    data: result.rows[0]
  });
});


const getSaleSummaryByID = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const data = await getSaleSummaryDataByID(id);

  if (data.length === 0) {
    return res.status(404).json({
      status: 'fail',
      message: `No sale found with sale_no: ${id}`
    });
  }

  res.status(200).json({
    status: 'success',
    data: data[0] // since sale_no is unique
  });
});


const searchSales = asyncHandler(async (req, res) => {

    const data = await getFilteredSales(req.query);
    res.json(data); }
  )

module.exports = { processSale ,softDeleteSale,handleGetSalesData,AllSales ,searchSales ,getSaleSummaryByID};