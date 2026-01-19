const pool = require('../config/db');
const asyncHandler = require('../services/asyncHandler');
const {buildInvoiceSearchQuery,checkInvoiceExists} =require('../services/invoice_Service');
const { checkWholesalerExistsByName } = require('../services/wholesaler_service');




// ============================
// 1. Get All Invoices  
// ============================
const handleGetInvoicesData = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
  w.name,
  i.invoice_id,
  i.invoice_no,
  i.invoice_date,
  i.total_amount,
  i.paid_amount,
  i.payment_status,
  i.payment_date
FROM invoices i
JOIN wholesalers w ON i.wholesaler_id = w.wholesaler_id
WHERE i.deleted_at IS NULL AND w.deleted_at IS NULL
ORDER BY i.invoice_id DESC;`
  );

  if (!rows.length) {
    res.status(404);
    throw new Error('No active invoice data found');
  }

  res.status(200).json({
    no_of_invoices: rows.length,
    invoices: rows
  });
});


// =========================================================
// Update Invoice Payment Amount
// Route: POST /admin/invoice/:id/update_payment
// Body: { "amount": 500, "onlyadd": true }
// =========================================================
const updateInvoicePayment = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;
  const { onlyadd, amount } = req.body;

  // 1. Validate Input
  if (amount === undefined || amount < 0 || isNaN(amount)) {
    res.status(400);
    throw new Error('Please provide a valid non-negative amount');
  }

  // 2. Fetch current invoice details
  const invoiceResult = await pool.query(
    `SELECT invoice_id, total_amount, paid_amount 
     FROM invoices 
     WHERE invoice_id = $1 AND deleted_at IS NULL`,
    [invoiceId]
  );

  if (invoiceResult.rows.length === 0) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  const invoice = invoiceResult.rows[0];
  const currentTotal = parseFloat(invoice.total_amount);
  const currentPaid = parseFloat(invoice.paid_amount);
  const inputAmount = parseFloat(amount);

  // 3. Calculate New Paid Amount based on 'onlyadd' flag
  let newPaidAmount = 0;

  if (onlyadd === true) {
    // Logic: Add incoming amount to existing paid amount
    newPaidAmount = currentPaid + inputAmount;
  } else {
    // Logic: Replace existing paid amount with incoming amount
    newPaidAmount = inputAmount;
  }

  // 4. Constraint Validation
  // Ensure we don't pay more than the total bill
  // Using a small epsilon for float comparison safety, though normally fine with 2 decimal numeric
  if (newPaidAmount > currentTotal) {
    res.status(400);
    throw new Error(
      `Payment failed. Total paid amount (₹${newPaidAmount}) cannot exceed the invoice total (₹${currentTotal}).`
    );
  }

  // 5. Determine New Status (Paid, Unpaid, Partial)
  let newStatus = 'Unpaid';
  
  if (newPaidAmount === currentTotal) {
    newStatus = 'Paid';
  } else if (newPaidAmount > 0 && newPaidAmount < currentTotal) {
    newStatus = 'Partial';
  } else {
    newStatus = 'Unpaid'; // Case where paid amount is 0
  }

  // 6. Update Database
  // NOTICE: The explicit casting ::payment_status_enum fixes the "inconsistent types" error
  const updateResult = await pool.query(
    `UPDATE invoices 
     SET paid_amount = $1, 
         payment_status = $2::payment_status_enum, 
         payment_date = CASE 
            WHEN $2::payment_status_enum = 'Paid'::payment_status_enum THEN CURRENT_DATE 
            WHEN $2::payment_status_enum = 'Unpaid'::payment_status_enum THEN NULL 
            ELSE payment_date -- Keep existing date for Partial payments
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE invoice_id = $3
     RETURNING invoice_id, invoice_no, total_amount, paid_amount, payment_status, payment_date`,
    [newPaidAmount, newStatus, invoiceId]
  );

  res.status(200).json({
    success: true,
    message: 'Payment updated successfully',
    data: updateResult.rows[0]
  });
});


//==========================================
// 2. Update Invoice done
//==========================================
const updateInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const invoice_id = parseInt(id, 10);
 
  
  const {
    invoice_no,
    invoice_date,
    payment_status,
    paid_amount,
    wholesaler_name,
  } = req.body;

  // Check if invoice exists
  const invoiceExists = await checkInvoiceExists(invoice_id);

   
  if (!invoiceExists) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (invoice_no !== undefined) {
    fields.push(`invoice_no = $${paramIndex++}`);
    values.push(invoice_no);
  }
  if (invoice_date !== undefined) {
    fields.push(`invoice_date = $${paramIndex++}`);
    values.push(invoice_date);
  }
  if (payment_status !== undefined) {
    fields.push(`payment_status = $${paramIndex++}`);
    values.push(payment_status);
  }
  if (paid_amount !== undefined) {
    fields.push(`paid_amount = $${paramIndex++}`);
    values.push(paid_amount);
  }

  if (wholesaler_name !== undefined) {
    const ans = await checkWholesalerExistsByName(wholesaler_name);
    if (!ans) {
      res.status(404);
      throw new Error('The given wholesaler was not found');
    }
    fields.push(`wholesaler_id = $${paramIndex++}`);
    values.push(ans);
  }

  if (fields.length === 0) {
    res.status(400);
    throw new Error('No valid fields provided for update');
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);

  const updateQuery = `
    UPDATE invoices
    SET ${fields.join(', ')}
    WHERE invoice_id = $${paramIndex++} AND deleted_at IS NULL
    RETURNING *
  `;

  values.push(invoice_id);

  const { rows } = await pool.query(updateQuery, values);

  res.status(200).json({
    message: 'Invoice updated successfully',
    invoice: rows[0]
  });
});


// ============================
// 4. Delete Invoice
// ============================
const deleteInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const invoice_id = parseInt(id, 10);
  const invoiceExists = await checkInvoiceExists(invoice_id);
  if (!invoiceExists) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  await pool.query('UPDATE invoices SET deleted_at = CURRENT_TIMESTAMP WHERE invoice_id = $1', [invoice_id]);

  res.status(200).json({
    message: 'Invoice deleted successfully'
  });
});

//===============================================================
//serach invoices
//===============================================================
const InvoiceSerach = asyncHandler(async(req,res)=>{
    
        const {text ,values } = buildInvoiceSearchQuery(req.query);
        let result;
 
       result = await  pool.query(text,values);
  
        

      if(result.rows.length == 0){
        res.status(200).json({message:"no invoices is found"})
       }
       res.status(200).json({
         count: result.rows.length,
    data: result.rows,
       })
       
   
});

const getInvoiceById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Step 1: Fetch invoice + wholesaler details
  const invoiceQuery = `
    SELECT 
      i.invoice_id,
      i.invoice_no,
      w.name AS wholesaler,
      i.created_at,
      i.total_amount,
      i.paid_amount,
      i.payment_status
    FROM invoices i
    JOIN wholesalers w ON i.wholesaler_id = w.wholesaler_id
    WHERE i.invoice_id = $1
  `;

  const invoiceResult = await pool.query(invoiceQuery, [id]);

  if (invoiceResult.rows.length === 0) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  const invoice = invoiceResult.rows[0];

  // Step 2: Fetch medicines for the invoice
  const medicineQuery = `
    SELECT 
      medicine_name,
      stock_quantity AS qty,
      purchase_price AS price
    FROM medicine_stock
    WHERE invoice_id = $1
  `;

  const medicineResult = await pool.query(medicineQuery, [invoice.invoice_id]);

  // Step 3: Send response
  return res.json({
    invoice_no: invoice.invoice_no,
    wholesaler: invoice.wholesaler,
    created_at: invoice.created_at,
    total_amount: parseFloat(invoice.total_amount),
    paid_amount: parseFloat(invoice.paid_amount),
    payment_status: invoice.payment_status,
    medicines: medicineResult.rows.map(med => ({
      medicine: med.medicine_name,
      qty: med.qty,
      price: parseFloat(med.price)
    }))
  });
});

module.exports = {
  handleGetInvoicesData,
  updateInvoice,
  deleteInvoice,
  InvoiceSerach,
  getInvoiceById,
  updateInvoicePayment
};
