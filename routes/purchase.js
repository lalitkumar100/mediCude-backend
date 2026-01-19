const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const multer = require("multer");
const pool = require("../config/db");

//=======================================================//
//reportgeneration route
//=======================================================//

const { handleExcelExport } = require("../controller/excelReport"); // adjust path

router.get("/export/excel", handleExcelExport);

//===========================================================//
//medicine_stock route
//==========================================================//

const {
  handleGetMedicineStockData,
  getFilteredMedicines,
  addMedicineStock,
  updateMedicine_info,
  deleteMedicine,
  getMedicineInfoById,
  recommondationMedicineName,
  handleReturnMedicine,
} = require("../controller/medicine_stock"); // adjust

router.get("/medicine_stock", handleGetMedicineStockData);
router.get("/medicne_info/:Id", getMedicineInfoById);
router.get("/medicines/search", getFilteredMedicines); // adjust path
router.post("/medicine_stock", addMedicineStock); // adjust path
router.put("/medicine_stock/:Id", updateMedicine_info); // adjust path
router.delete("/medicine_stock/:id", deleteMedicine);
router.get("/medicines/recommendation", recommondationMedicineName);
router.put("/medicine_stock/return/:id",handleReturnMedicine);


const {dashBoradData} = require("../controller/dashboardController");
router.get("/dashboard",dashBoradData);



//===========================================================//
//invoice route
//==========================================================//

const {
  handleGetInvoicesData,
  updateInvoice,
  deleteInvoice,
  InvoiceSerach,
  getInvoiceById,
  updateInvoicePayment
} = require("../controller/invoicesController"); // adjust path
router.put("/invoice/:id", updateInvoice);
router.delete("/invoice/:id", deleteInvoice); // adjust path
router.get("/invoicesSearch", InvoiceSerach);
router.get("/invoices", handleGetInvoicesData); // adjust path
router.get("/invoice/:id", getInvoiceById); // adjust path
router.put("/invoice/:id/update_payment", updateInvoicePayment);
//===========================================================//
//expiring route
//==========================================================//
const {
  handleExpiringMedicines,
  removeExpiringMedicines,
  handleGetExpiryStockData,
  getExpiryMedicineInfoById
} = require("../controller/expiringController"); // adjust path
router.get("/expiring_medicines", handleExpiringMedicines); // adjust path
router.delete("/expiring_medicines/:id", removeExpiringMedicines); // adjust
router.get("/expiry_stock", handleGetExpiryStockData); // adjust path
router.get("/expiry_medicine/:id", getExpiryMedicineInfoById);

//===========================================================//
//wholeslers route
//==========================================================//

const {
  addWholesaler,
  handleGetwholesalersData,
  deleteWholesaler,
} = require("../controller/wholesalerController"); // adjust path

router.get("/wholesalers", handleGetwholesalersData);
router.post("/Wholesaler", addWholesaler); // adjust path

router.delete("/Wholesaler/:id", deleteWholesaler); // adjust path

//===========================================================//
//employee route
//==========================================================//
const {
  addEmployee,
  updateEmployee,
  hardDeleteEmployee,
  searchEmployees,
  getAllEmployeeBasicInfo,
  getEmployeeInfoById,
} = require("../controller/employeeController"); // adjust path
router.post("/employee", addEmployee); // adjust path
router.put("/employee/:id", updateEmployee); // adjust path
router.delete("/employee/:id", hardDeleteEmployee); // adjust path
router.get("/employeeSearch", searchEmployees);
router.get("/allEmployee", getAllEmployeeBasicInfo);
router.get("/employee/:id", getEmployeeInfoById);

//===========================================================//
//sales route
//==========================================================//
const {
  processSale,
  softDeleteSale,
  handleGetSalesData,
  AllSales,
  getSaleSummaryByID,
  searchSales,
} = require("../controller/salesController"); // adjust path

router.post("/sales", processSale); // adjust path
router.get("/sales", handleGetSalesData); // adjust path')
router.delete("/sales/:id", softDeleteSale);
router.get("/sales/serach", AllSales); // adjust path
router.get("/sales/:id", getSaleSummaryByID);
router.get("sales/serach", searchSales);

//====================================================//
//todo
//=====================================================//
// const todoRoutes = require('../feature/todo');
// app.use('/todos', todoRoutes);


router.get("/wholesaler/:id", async (req, res) => {
  const wholesalerId = parseInt(req.params.id);

  if (isNaN(wholesalerId)) {
    return res.status(400).json({ error: "Invalid wholesaler ID" });
  }

  try {
    const query = `
      WITH selected_wholesaler AS (
          SELECT
              w.wholesaler_id,
              w.name AS wholesaler_name,
              w.gst_no,
              w.address,
              w.contact AS contact_no,
              w.email AS email_address,
              COALESCE(SUM(i.total_amount), 0) AS stock_import,
              COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS unpaid_amount
          FROM
              wholesalers w
          LEFT JOIN
              invoices i ON w.wholesaler_id = i.wholesaler_id AND i.deleted_at IS NULL
          WHERE
              w.deleted_at IS NULL
              AND w.wholesaler_id = $1
          GROUP BY
              w.wholesaler_id
      )

      SELECT
          sw.wholesaler_id,
          sw.wholesaler_name,
          sw.gst_no,
          sw.contact_no,
          sw.email_address,
          sw.address,
          sw.stock_import,
          sw.unpaid_amount,
          i.invoice_no,
          i.total_amount,
          i.invoice_date
      FROM
          selected_wholesaler sw
      LEFT JOIN
          invoices i ON sw.wholesaler_id = i.wholesaler_id AND i.deleted_at IS NULL
      ORDER BY
          i.invoice_date DESC;
    `;

    const result = await pool.query(query, [wholesalerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Wholesaler not found" });
    }

    // Separate wholesaler details and invoice list
    const {
      wholesaler_id,
      wholesaler_name,
      gst_no,
      contact_no,
      email_address,
      address,
      stock_import,
      unpaid_amount,
    } = result.rows[0];

    const invoices = result.rows
      .map((row) => ({
        invoice_no: row.invoice_no,
        total_amount: row.total_amount,
        invoice_date: row.invoice_date,
      }))
      .filter((inv) => inv.invoice_no); // remove nulls if no invoices

    return res.json({
      wholesaler: {
        wholesaler_id,
        wholesaler_name,
        gst_no,
        contact_no,
        email_address,
        address,
        stock_import,
        unpaid_amount,
        invoices,
      },
    });
  } catch (err) {
    console.error("Error fetching wholesaler:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
