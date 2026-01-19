/**
 * Build a parameterized SQL query for searching invoices,
 * with optional filtering, pagination, and sorting.
 *
 * @param {Object} params - Query parameters from req.query
 * @returns {Object}      - { text: SQL string, values: parameter values }
 */

const pool = require('../config/db');

const checkInvoiceExists = async (invoice_id) => {
  console.log(invoice_id);
  
  const result = await pool.query(
    'SELECT * FROM invoices WHERE invoice_id = $1 AND deleted_at IS NULL;',
    [invoice_id]
  );

  
  return result.rowCount > 0;
};



function buildInvoiceSearchQuery(params) {
  const {
    invoice_no,
    invoice_id,
    payment_status,
    payment_date,
    total_amount,
    wholesaler_name,
    invoice_date_from,
    invoice_date_to,

    // pagination & sorting
    limit,
    offset,
    order_by,
    order_dir,
  } = params;

  let text = `
    SELECT 
      i.invoice_id,
      i.invoice_no,
      i.invoice_date,
      i.total_amount,
      i.payment_status,
      i.payment_date,
      w.name AS wholesaler_name
    FROM invoices i
    JOIN wholesalers w ON i.wholesaler_id = w.wholesaler_id
    WHERE 1=1 AND i.deleted_at IS NULL`;

  const values = [];
  let idx = 1;

  // -- filters --
 if (invoice_id) {
  text += ` AND i.invoice_id = $${idx++}`;
  values.push(parseInt(invoice_id, 10));
}
  if (invoice_no) {
    text += ` AND i.invoice_no ILIKE $${idx++}`;
    values.push(`%${invoice_no}%`);
  }

  if (invoice_date_from) {
    text += ` AND i.invoice_date >= $${idx++}`;
    values.push(invoice_date_from);
  }

  if (invoice_date_to) {
    text += ` AND i.invoice_date <= $${idx++}`;
    values.push(invoice_date_to);
  }

  if (payment_status) {
    text += ` AND i.payment_status = $${idx++}`;
    values.push(payment_status);
  }

  if (payment_date) {
    text += ` AND i.payment_date = $${idx++}`;
    values.push(payment_date);
  }

  if (total_amount) {
    text += ` AND i.total_amount = $${idx++}`;
    values.push(total_amount);
  }

  if (wholesaler_name) {
    text += ` AND w.name ILIKE $${idx++}`;
    values.push(`%${wholesaler_name}%`);
  }

  // -- sorting --
  const allowedOrderColumns = new Set([
    'invoice_no',
    'invoice_date',
    'total_amount',
    'payment_status',
    'payment_date',
  ]);
  const col = allowedOrderColumns.has(order_by) ? order_by : 'invoice_date';
  const dir = order_dir && order_dir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  text += ` ORDER BY i.${col} ${dir}`;

  // -- pagination --
  if (limit && !isNaN(parseInt(limit))) {
    text += ` LIMIT $${idx++}`;
    values.push(parseInt(limit, 10));
  }

  if (offset && !isNaN(parseInt(offset))) {
    text += ` OFFSET $${idx++}`;
    values.push(parseInt(offset, 10));
  }

  return { text, values };
}

module.exports ={ buildInvoiceSearchQuery ,checkInvoiceExists};
