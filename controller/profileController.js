const asyncHandler = require('../services/asyncHandler');
const pool  =require('../config/db');
const validator = require('validator'); 
const bcrypt = require('bcrypt');


const getProfile = asyncHandler(async (req, res) => {
  const { login_id } = req.user;


    const result = await pool.query(
      `SELECT e.*
       FROM employees e
       JOIN logins l ON l.login_id = $1 AND l.employee_id = e.employee_id`,
      [login_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.status(200).json({ 
        status : "success",
        data: result.rows[0] 
      }) 
});


 const updateProfile  =asyncHandler(async (req, res) => {
  const { login_id } = req.user;
  const updates = req.body;

  // Get employee_id from logins
  const { rows: loginRows } = await pool.query(
    'SELECT employee_id FROM logins WHERE login_id = $1',
    [login_id]
  );
  if (loginRows.length === 0) return res.status(404).json({ message: 'User not found' });

  const employeeId = loginRows[0].employee_id;

  // Validation (Optional)
  if (updates.date_of_birth) {
    const dob = new Date(updates.date_of_birth);

    if (isNaN(dob.getTime())) {
      return res.status(400).json({ message: "Invalid date of birth" });
    }

    updates.date_of_birth = dob.toISOString();
  }
  if (updates.contact_number && !validator.isMobilePhone(updates.contact_number, 'en-IN')) {
    return res.status(400).json({ message: 'Invalid Indian contact number' });
  }
  if (updates.aadhar_card_no && !/^\d{12}$/.test(updates.aadhar_card_no)) {
    return res.status(400).json({ message: 'Invalid Aadhaar number format' });
  }


  // Allowed fields (excluding email and password)
  const allowedFields = [
    'first_name', 'last_name', 'gender', 'date_of_birth',
    'contact_number', 'address', 'role', 'date_of_joining',
    'salary', 'status', 'aadhar_card_no', 'pan_card_no',
    'account_no', 'profile_photo'
  ];

  const fields = [];
  const values = [];
  let index = 1;

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = $${index}`);
      values.push(updates[field]);
      index++;
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: 'No valid fields provided for update' });
  }

  values.push(employeeId); // last param

  const updateQuery = `
    UPDATE employees
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = $${index}
    RETURNING *;
  `;

  const { rows: updated } = await pool.query(updateQuery, values);

  res.status(200).json({
    message: 'Profile updated successfully',
    profile: updated[0],
  });
});




const updatePassword = asyncHandler(async (req, res) => {
  const user = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
   throw new Error('Current and new password are required.');
  }

  // Fetch existing hashed password
  const query = `SELECT password_hash FROM logins WHERE login_id = $1;`;
  const { rows } = await pool.query(query, [user.login_id]);

  if (!rows.length) {
    res.status(404);
 
  }

  const hashedPassword = rows[0].password_hash;

  // Compare old password
  const isMatch = await bcrypt.compare(currentPassword, hashedPassword);
  if (!isMatch) {
    res.status(401);
    throw new Error('Old password is incorrect.');
  }

  // Hash new password and update
  const newHashedPassword = await bcrypt.hash(newPassword, 10);
  const updateQuery = `UPDATE logins SET password_hash = $1, password_updated_at = NOW() WHERE login_id = $2;`;
  await pool.query(updateQuery, [newHashedPassword, user.login_id]);

  res.status(200).json({ status: "success", message: "Password updated successfully." });
});


module.exports ={ getProfile , updateProfile ,updatePassword};