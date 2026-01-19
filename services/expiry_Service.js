// Main route

const asyncHandler = require('./asyncHandler');
const pool = require('../config/db');
const {  getWholesalerIdByName, getOrCreateInvoice, updateInvoiceTotal } = require('./medicie_serivce');


const addExpiryStock = async (id) => {
 
    const medicine = await pool.query(
      `SELECT * FROM medicine_stock WHERE medicine_id = $1`,[id]);
    if (medicine.rows.length === 0) {
      throw new Error(`Medicine not found with id ${id}`);
    }
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
      invoice_id,
    } = medicine.rows[0];

    //object to array of values

    const values = [
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
    ];
    const text = `
      INSERT INTO expiry_stock (
        packed_type,
        medicine_name,
        brand_name,
        expiry_date,
        batch_no,
        purchase_price,
        mrp,
        mfg_date,
        stock_quantity,
        invoice_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;
    const result = await pool.query(text, values);
    if (result.rows.length === 0) {
      throw new Error('Failed to add expiry stock');
    }
    const expiryStock = result.rows[0];
    return {
      success: true,  
      message: 'Expiry stock added successfully',
      data: expiryStock,  
    };
};
module.exports={ addExpiryStock}