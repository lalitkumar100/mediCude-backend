/**
 * Build a parameterized SQL query for searching medicines,
 * with optional filtering, pagination, and sorting.
 *
 * @param {Object} params - Query parameters from req.query
 * @returns {Object}      - { text: SQL string, values: parameter values }
 */

const pool = require('../config/db');

const delete1 = async (medicine_id) => {

    const checkMedicine = `SELECT * FROM medicine_stock WHERE medicine_id = $1;`;
  const { rows: medicine } = await pool.query(checkMedicine, [medicine_id]);

  if (medicine.length === 0) {
    throw new Error(`Medicine not found with id ${medicine_id}`);
  }

  const deleteQuery = `DELETE FROM medicine_stock WHERE medicine_id = $1;`;
  await pool.query(deleteQuery, [medicine_id]);

  const invoice_id = medicine[0].invoice_id;
  const stock_quantity = parseFloat(medicine[0].stock_quantity);
  const purchase_price = parseFloat(medicine[0].purchase_price);
  const delta = -1 * (stock_quantity * purchase_price);
//  console.log(`Delta for invoice adjustment: ${delta}`);
  await updateInvoiceTotal(invoice_id, delta);


};

// Get wholesaler ID by name
const getWholesalerIdByName = async (name) => {
  const query = 'SELECT wholesaler_id FROM wholesalers WHERE name = $1';
  const result = await pool.query(query, [name]);
  return result.rowCount ? result.rows[0].wholesaler_id : null;
};

// Get or create invoice
const getOrCreateInvoice = async (invoiceNumber, wholesalerId) => {
  try {
    const queryInvoice = 'SELECT invoice_id FROM invoices WHERE invoice_no = $1 AND wholesaler_id = $2';
  const result = await pool.query(queryInvoice, [invoiceNumber, wholesalerId]);

  if (result.rowCount > 0) return result.rows[0].invoice_id;

  const insertQuery = `
    INSERT INTO invoices (invoice_no, wholesaler_id)
    VALUES ($1, $2)
    RETURNING invoice_id
  `;
  const insertResult = await pool.query(insertQuery, [invoiceNumber, wholesalerId]);
  if (insertResult.rowCount === 0) return null;

  return insertResult.rows[0].invoice_id;
  } catch (error) {
    throw new Error('Failed to get or create invoice');
    
  }
};

const updateInvoiceTotal = async (invoiceId, Amount) => {
  try {
    const query = `UPDATE invoices
      SET total_amount =total_amount+ $1 
      WHERE invoice_id = $2;
    `;
    await pool.query(query, [Amount, invoiceId]); // ✅ Correct variable
  } catch (error) {
    res.status(500);
    throw new Error('Failed to update invoice total');
  }
};



// Helper Functions (same as before)
function buildFilterConditions(params, values, alias = 'ms') {
  let conditions = 'WHERE 1=1';
  let idx = values.length + 1;

  if (params.medicine_name) {
    conditions += ` AND ${alias}.medicine_name ILIKE $${idx++}`;
    values.push(`%${params.medicine_name}%`);
  }
  if (params.brand_name) {
    conditions += ` AND ${alias}.brand_name ILIKE $${idx++}`;
    values.push(`%${params.brand_name}%`);
  }
  if (params.invoice_no) {
    conditions += ` AND i.invoice_no ILIKE $${idx++}`;
    values.push(`%${params.invoice_no}%`);
  }
  if (params.wholesaler_name) {
    conditions += ` AND w.name ILIKE $${idx++}`;
    values.push(`%${params.wholesaler_name}%`);
  }

  return { conditions, values };
}

function buildOrderClause(order_by, order_dir) {
  const allowed = new Set([
    'medicine_name',
    'brand_name',
    'expiry_date',
    'purchase_price',
    'mrp',
    'invoice_no',
    'wholesaler_name',
    'stock_quantity',
  ]);
  const col = allowed.has(order_by) ? order_by : 'expiry_date';
  const dir = (order_dir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return ` ORDER BY ms.${col} ${dir}`;
}

function buildPaginationClause(limit, offset, values) {
  let clause = '';
  let idx = values.length + 1;

  if (limit && !isNaN(parseInt(limit))) {
    clause += ` LIMIT $${idx++}`;
    values.push(parseInt(limit, 10));
  }
  if (offset && !isNaN(parseInt(offset))) {
    clause += ` OFFSET $${idx++}`;
    values.push(parseInt(offset, 10));
  }

  return { clause, values };
}

function buildMedicineSearchQuery(params, isCount = false) {
  let values = [];
  const selectClause = isCount
    ? 'SELECT 1'
    : `SELECT 
        ms.medicine_id,
        ms.medicine_name,
        ms.brand_name,
        ms.batch_no,
        ms.purchase_price,
        ms.mrp,
        ms.stock_quantity,
        ms.expiry_date,
        i.invoice_no,
        w.name AS wholesaler_name`;

  const fromClause = `
    FROM medicine_stock ms
    JOIN invoices i ON ms.invoice_id = i.invoice_id
    JOIN wholesalers w ON i.wholesaler_id = w.wholesaler_id`;

  const { conditions, values: filteredValues } = buildFilterConditions(params, values);
  values = filteredValues;

  const orderClause = !isCount ? buildOrderClause(params.order_by, params.order_dir) : '';
  const { clause: paginationClause, values: finalValues } = buildPaginationClause(
    params.limit,
    params.offset,
    values
  );

  const text = `
    ${selectClause}
    ${fromClause}
    ${conditions}
    ${orderClause}
    ${paginationClause}
  `;

  return { text, values: finalValues };
}





module.exports = {buildMedicineSearchQuery , delete1, getWholesalerIdByName, getOrCreateInvoice, updateInvoiceTotal, };
