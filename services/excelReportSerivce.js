const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // adjust path as needed
const ExcelJS = require('exceljs');

// 1. Fetch data from DB
const   fetchTableData= async (tableName) => {
  const allowedTables = ['medicine_stock', 'wholesalers', 'invoices','sales','expiry_stock']; // whitelist important for security
  if (!allowedTables.includes(tableName)) {
    throw new Error('Invalid table name');
  }
  if(tableName === 'medicine_stock' || tableName === 'expiry_stock'){ 
     const result = await pool.query(`SELECT * FROM ${tableName} `);
  return result.rows;
  }
  const result = await pool.query(`SELECT * FROM ${tableName} WHERE deleted_at IS NULL`);
  return result.rows;
};


// 2. Generate Excel workbook
const generateExcelFromData = async (data,tableName) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`${tableName} Report`);

  if (!data || data.length === 0) return workbook;

  worksheet.columns = Object.keys(data[0]).map((key) => ({
    header: key.toUpperCase(),
    key: key,
    width: 20,
  }));

  data.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };

  return workbook;
};

// 3. Send Excel response
const sendExcelResponse = async (res, workbook,tableName) => {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, '-'); // e.g. 2025-07-10T14-35-22-123Z

res.setHeader(
  'Content-Disposition',
  `attachment; filename=${tableName}_report_${timestamp}.xlsx`
);


  await workbook.xlsx.write(res);
  res.end();
};


module.exports = {
  fetchTableData,
  generateExcelFromData,
  sendExcelResponse,
};