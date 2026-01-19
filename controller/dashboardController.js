const pool = require("../config/db");

const asyncHandler = require("../services/asyncHandler");

exports.dashBoradData = asyncHandler(async (req, res) => {
  // 1. Define all queries
  const totalStockQuery = `SELECT COALESCE(SUM(stock_quantity), 0) AS total_stock FROM medicine_stock`;

  const unpaidBillsQuery = `SELECT COUNT(*) AS unpaid_bills FROM invoices WHERE payment_status = 'Unpaid'`;

  const activeStaffQuery = `SELECT COUNT(*) AS active_staff FROM employees WHERE status = 'Active'`;

  const recentStockQuery = `
    SELECT medicine_name, stock_quantity, updated_at 
    FROM medicine_stock 
    ORDER BY updated_at DESC 
    LIMIT 3
  `;

  const SalesQuery = `
    SELECT 
      -- CURRENT MONTH
      COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month', sale_date) = DATE_TRUNC('month', CURRENT_DATE) 
          THEN total_amount ELSE 0 END), 0) 
      AS this_month_sales,

      COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month', sale_date) = DATE_TRUNC('month', CURRENT_DATE) 
          THEN (total_amount - purchase_price) ELSE 0 END), 0) 
      AS this_month_profit,

      -- PREVIOUS MONTH
      COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month', sale_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') 
          THEN total_amount ELSE 0 END), 0) 
      AS prev_month_sales,

      COALESCE(SUM(CASE 
          WHEN DATE_TRUNC('month', sale_date) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') 
          THEN (total_amount - purchase_price) ELSE 0 END), 0) 
      AS prev_month_profit
    FROM 
      sales
    WHERE 
      deleted_at IS NULL
      AND sale_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
  `;

  // 2. Execute all queries and WAIT for all to finish
  const [
    totalStockResult,
    unpaidBillsResult,
    activeStaffResult,
    recentStockResult,
    salesResult,
  ] = await Promise.all([
    pool.query(totalStockQuery),
    pool.query(unpaidBillsQuery),
    pool.query(activeStaffQuery),
    pool.query(recentStockQuery),
    pool.query(SalesQuery),
  ]);

  // 3. Process Sales Data after all queries finish
  const stats = salesResult.rows[0];

  const month_sales = parseFloat(stats.this_month_sales) + parseFloat(stats.prev_month_sales);
  const month_profit = parseFloat(stats.this_month_profit) + parseFloat(stats.prev_month_profit);

  // 4. Send the Response
  return res.status(200).json({
    status: "success",
    data: {
      totalStock: totalStockResult.rows[0].total_stock,
      unpaidBills: unpaidBillsResult.rows[0].unpaid_bills,
      activeStaff: activeStaffResult.rows[0].active_staff,
      recentStockUpdates: recentStockResult.rows,
      sales: month_sales,
      profit: month_profit,
    },
  });
});