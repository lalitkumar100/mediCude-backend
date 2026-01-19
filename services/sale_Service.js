const pool = require('../config/db');

function generateSaleNo(employeeId = 0) {
  const now = new Date();

  const base36 = (num) => num.toString(36).toUpperCase();

  const employeePart = base36(employeeId).padStart(3, '0');

  const yearPart = String(now.getFullYear()).slice(-2);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthPart = monthNames[now.getMonth()];

  const dateTimeStr = [
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('');

  const timePart = base36(parseInt(dateTimeStr, 10));

  return `${employeePart}${yearPart}${monthPart}${timePart}`;
}


const calculateTotals = async (medicines, client) => {
  let total_amount = 0;
  let purchase_price_total = 0;
  let mrp_total = 0;

  for (const item of medicines) {
    const { medicine_id, quantity, rate } = item;
    const res = await client.query(
      `SELECT purchase_price, mrp FROM medicine_stock WHERE medicine_id = $1`,
      [medicine_id]
    );
    const med = res.rows[0];
    total_amount += rate * quantity;
    purchase_price_total += med.purchase_price * quantity;
    mrp_total += med.mrp * quantity;
  }

  return { purchase_price_total, total_amount, mrp_total };
};

const buildSalesSearchQuery = (params) => {
  const {
    customer_name,
    medicine_name,
    min_profit,
    max_profit,
    min_total,
    max_total,
    date_from,
    date_to,
    employee_id,
    sale_no
  } = params;

  let whereClauses = [];
  let values = [];
  let i = 1;

  if (customer_name) {
    whereClauses.push(`LOWER(customer_name) LIKE LOWER($${i++})`);
    values.push(`%${customer_name}%`);
  }

  if (medicine_name) {
    whereClauses.push(`EXISTS (
      SELECT 1 FROM json_array_elements(view_sale_with_profit.medicine_details) AS med
      WHERE LOWER(med->>'medicine_name') LIKE LOWER($${i++})
    )`);
    values.push(`%${medicine_name}%`);
  }

  if (min_profit) {
    whereClauses.push(`overall_profit >= $${i++}`);
    values.push(min_profit);
  }

  if (max_profit) {
    whereClauses.push(`overall_profit <= $${i++}`);
    values.push(max_profit);
  }

  if (min_total) {
    whereClauses.push(`total_amount >= $${i++}`);
    values.push(min_total);
  }

  if (max_total) {
    whereClauses.push(`total_amount <= $${i++}`);
    values.push(max_total);
  }

  if (date_from) {
    whereClauses.push(`sale_date >= $${i++}`);
    values.push(date_from);
  }

  if (date_to) {
    whereClauses.push(`sale_date <= $${i++}`);
    values.push(date_to);
  }

  if (employee_id) {
    whereClauses.push(`EXISTS (
      SELECT 1 FROM employees e WHERE e.employee_id = $${i++} AND CONCAT(e.first_name, ' ', COALESCE(e.last_name, '')) = view_sale_with_profit.employee_name
    )`);
    values.push(employee_id);
  }

  if (sale_no) {
    whereClauses.push(`sale_no ILIKE $${i++}`);
    values.push(`%${sale_no}%`);
  }

  const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const query = `
    SELECT * FROM view_sale_with_profit
    ${where}
    ORDER BY sale_date DESC
  `;

  return { query, values };
};

const getSalesData = async (queryParams) => {
  const { query, values } = buildSalesSearchQuery(queryParams);
  const result = await pool.query(query, values);
  return result.rows;
};

const getSaleSummaryDataByID = async (saleid) => {
  const query = `
    SELECT *
    FROM view_sales_summary_with_items
    WHERE sale_id = $1
  `;
  const result = await pool.query(query, [saleid]);
  return result.rows;
};


const getFilteredSales = async (query) => {
  const {
    sale_no,
    sale_id,
    from_date,
    to_date,
    profit_min,
    profit_max,
    employee_name,
    total_min,
    total_max,
    medicine_name,
    page = 1,
    limit = 10
  } = query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const values = [];
  const conditions = [];

  if (sale_no) {
    conditions.push(`sale_no ILIKE $${values.length + 1}`);
    values.push(`%${sale_no}%`);
  }

  if (sale_id) {
    conditions.push(`sale_id = $${values.length + 1}`);
    values.push(sale_id);
  }

  if (from_date) {
    conditions.push(`sale_date >= $${values.length + 1}`);
    values.push(from_date);
  }

  if (to_date) {
    conditions.push(`sale_date <= $${values.length + 1}`);
    values.push(to_date);
  }

  if (profit_min) {
    conditions.push(`profit >= $${values.length + 1}`);
    values.push(profit_min);
  }

  if (profit_max) {
    conditions.push(`profit <= $${values.length + 1}`);
    values.push(profit_max);
  }

  if (employee_name) {
    conditions.push(`employee_name ILIKE $${values.length + 1}`);
    values.push(`%${employee_name}%`);
  }

  if (total_min) {
    conditions.push(`total_amount >= $${values.length + 1}`);
    values.push(total_min);
  }

  if (total_max) {
    conditions.push(`total_amount <= $${values.length + 1}`);
    values.push(total_max);
  }

  if (medicine_name) {
    conditions.push(`medicine_name ILIKE $${values.length + 1}`);
    values.push(`%${medicine_name}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count query
  const countQuery = `SELECT COUNT(*) FROM view_sales_summary_extended ${whereClause}`;
  const countResult = await pool.query(countQuery, values);
  const totalRecords = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalRecords / limit);

  // Data query with pagination
  const dataQuery = `
    SELECT * FROM view_sales_summary_extended
    ${whereClause}
    ORDER BY sale_date DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;
  const paginatedValues = [...values, limit, offset];
  const dataResult = await pool.query(dataQuery, paginatedValues);

  return {
    current_page: parseInt(page),
    total_pages: totalPages,
    total_records: totalRecords,
    per_page: parseInt(limit),
    results: dataResult.rows,
  };
};

module.exports = { getFilteredSales };


module.exports = { generateSaleNo, calculateTotals,buildSalesSearchQuery,getSalesData,getSaleSummaryDataByID ,getFilteredSales};
