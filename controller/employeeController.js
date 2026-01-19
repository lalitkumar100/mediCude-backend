// ===============================
// Required Modules and Services
// ===============================
const pool = require('../config/db'); // PostgreSQL database connection pool
const bcrypt = require('bcrypt'); // For password hashing
const asyncHandler = require('../services/asyncHandler'); // Wrapper to handle async errors
const validator = require('validator'); // Input validation library
const { isEmailTakenByOtherEmployee, isEmailAlreadyTaken } = require('../services/employee_Service'); // Custom email validation services

// ===============================
// Utility: Generate Random Password
// ===============================
function generateRandomPassword(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    const randIndex = Math.floor(Math.random() * chars.length);
    password += chars[randIndex];
  }
  return password;
}

// Example Usage (for debugging)
const newPassword = generateRandomPassword();
console.log('Generated Password:', newPassword);

// ===============================
// Add New Employee
// ===============================
const addEmployee = asyncHandler(async (req, res) => {
  const {
    first_name,
    last_name,
    gender,
    date_of_birth,
    contact_number,
    email,
    address,
    date_of_joining,
    role,
    salary,
    aadhar_card_no,
    pan_card_no,
    account_no,
    profile_photo
  } = req.body;

  console.log(req.body);

  // Validate required fields
  if (!first_name || !last_name || !gender || !email || !role || !salary) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  // Validate email format
  if (!validator.isEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  // Validate date of birth format
  if (date_of_birth && !validator.isDate(date_of_birth)) {
    return res.status(400).json({ message: 'Invalid date of birth format' });
  }

  // Validate mobile number format for India
  if (contact_number && !validator.isMobilePhone(contact_number, 'en-IN', { strictMode: false })) {
    return res.status(400).json({ message: 'Invalid contact number format' });
  }

  // // Validate PAN card format (optional)
  // if (pan_card_no && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan_card_no)) {
  //   return res.status(400).json({ message: 'Invalid PAN card number format' });
  // }

  // Validate Aadhaar card format (optional)
  if (aadhar_card_no && !/^\d{12}$/.test(aadhar_card_no)) {
    return res.status(400).json({ message: 'Invalid Aadhaar number format' });
  }

  // Check email uniqueness
  const emailTaken = await isEmailAlreadyTaken(email);
  if (emailTaken) {
    throw new Error('The provided email is already registered with another employee.');
  }

  // Insert new employee
  const insertQuery = `
    INSERT INTO employees (
      first_name, last_name, gender, date_of_birth,
      contact_number, email, address, role,
      date_of_joining, salary,
      aadhar_card_no, pan_card_no, account_no, profile_photo,status
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10,
      $11, $12, $13, $14,$15
    )
    RETURNING *;
  `;

  const values = [
    first_name,
    last_name,
    gender,
    date_of_birth,
    contact_number,
    email,
    address,
    role,
    date_of_joining || new Date(),
    salary || 9000,
    aadhar_card_no,
    pan_card_no,
    account_no,
    profile_photo,
    "Active"
  ];

  const { rows: newEmployee } = await pool.query(insertQuery, values);

  if (newEmployee.length === 0) {
    return res.status(500).json({ message: 'Failed to add employee' });
  }

  const employeeId = newEmployee[0].employee_id;
  console.log(`New employee added with ID: ${employeeId}`);

  // Create Login Credentials
  const password = "123456"; // For now static
  const password_hash = await bcrypt.hash(password, 10);

  const loginInsertQuery = `
    INSERT INTO logins (employee_id, email, password_hash, password_updated_at, status)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'Active')
    RETURNING *;
  `;

  const { rows: newLogin } = await pool.query(loginInsertQuery, [employeeId, email, password_hash]);
  if (newLogin.length === 0) {
    return res.status(500).json({ message: 'Failed to create login for employee' });
  }

  // Final response
  return res.status(201).json({
    message: 'Employee added successfully',
    employee: newEmployee[0],
  });
});

// ===============================
// Update Existing Employee
// ===============================
const updateEmployee = asyncHandler(async (req, res) => {
  const employeeId = req.params.id;
  const updates = req.body;

  // Check if employee exists
  const { rows: existing } = await pool.query(
    'SELECT * FROM employees WHERE employee_id = $1',
    [employeeId]
  );

  if (existing.length === 0) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  // Validate email if updating
  if (updates.email) {
    if (!validator.isEmail(updates.email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const emailTaken = await isEmailTakenByOtherEmployee(updates.email, employeeId);
    if (emailTaken) {
      throw new Error('The provided email is already in use by another employee.');
    }
  }

  // Validate date
  if (updates.date_of_birth && !validator.isDate(updates.date_of_birth)) {
    return res.status(400).json({ message: 'Invalid date of birth format' });
  }

  // Validate mobile number
  if (updates.contact_number && !validator.isMobilePhone(updates.contact_number, 'en-IN')) {
    return res.status(400).json({ message: 'Invalid Indian contact number' });
  }

  // Validate Aadhaar number
  if (updates.aadhar_card_no && !/^\d{12}$/.test(updates.aadhar_card_no)) {
    return res.status(400).json({ message: 'Invalid Aadhaar number format' });
  }



  // Allowed fields to update
  const allowedFields = [
    'first_name', 'last_name', 'gender', 'date_of_birth',
    'contact_number', 'email', 'address', 'role',
    'date_of_joining', 'salary', 'status',
    'aadhar_card_no', 'pan_card_no', 'account_no', 'profile_photo'
  ];

  const fields = [];
  const values = [];
  let paramIndex = 1;

  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(updates[key]);
      paramIndex++;
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: 'No valid fields provided to update.' });
  }

  values.push(employeeId); // For WHERE clause

  const updateQuery = `
    UPDATE employees
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = $${paramIndex}
    RETURNING *;
  `;

  const { rows: updated } = await pool.query(updateQuery, values);

  res.status(200).json({
    message: 'Employee updated successfully',
    employee: updated[0],
  });
});

// ===============================
// Soft Delete Employee (Set status to "Inactive")
// ===============================
const hardDeleteEmployee = asyncHandler(async (req, res) => {
  const employeeId = req.params.id;

  // Check if employee exists
  const { rows: existing } = await pool.query(
    'SELECT * FROM employees WHERE employee_id = $1',
    [employeeId]
  );

  if (existing.length === 0) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  // Delete employee
  await pool.query('DELETE FROM employees WHERE employee_id = $1', [employeeId]);

  res.status(200).json({ message: 'Employee permanently deleted' });
});

// ===============================
// Get All Employees
// ===============================
const getAllEmployees = asyncHandler(async (req, res) => {
  const query = `SELECT * FROM employees ORDER BY employee_id`;

  const { rows: employees } = await pool.query(query);

  res.status(200).json({
    count: employees.length,
    employees,
  });
});

// ===============================
// Search Employees by Fields
// ===============================
const searchEmployees = asyncHandler(async (req, res) => {
  const {
    first_name,
    email,
    role,
    contact_number // add status also
  } = req.query;

  let baseQuery = `SELECT 
      employee_id, 
      CONCAT(first_name, ' ', last_name) AS name, 
      role, 
      email, 
      contact_number 
    FROM employees WHERE 1=1`; // Corrected: WHERE 1=1 for dynamic filtering
  const values = [];
  let paramIndex = 1;

  // Add filters if present in query
  if (first_name) {
    baseQuery += ` AND LOWER(first_name) LIKE LOWER($${paramIndex})`;
    values.push(`%${first_name}%`);
    paramIndex++;
  }

  if (email) {
    baseQuery += ` AND LOWER(email) LIKE LOWER($${paramIndex})`;
    values.push(`%${email}%`);
    paramIndex++;
  }

  if (role) {
    baseQuery += ` AND role = $${paramIndex}`;
    values.push(role);
    paramIndex++;
  }

  if (contact_number) {
    baseQuery += ` AND contact_number = $${paramIndex}`;
    values.push(contact_number);
    paramIndex++;
  }

  baseQuery += ` ORDER BY employee_id`; // Sort by ID

  const { rows: employees } = await pool.query(baseQuery, values);

  res.status(200).json({
    count: employees.length,
    employees
  });
});
// ===============================
// Get All Employees (Basic Info)
// ===============================
const getAllEmployeeBasicInfo = asyncHandler(async (req, res) => {
  const query = `
    SELECT 
      employee_id, 
      CONCAT(first_name, ' ', last_name) AS name, 
      role, 
      email, 
      contact_number,
      salary 
    FROM employees
    ORDER BY employee_id
  `;

  const { rows: employees } = await pool.query(query);

  res.status(200).json({
    count: employees.length,
    employees
  });
});

//
const getEmployeeInfoById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const query = `
    SELECT *
    FROM employees
    where employee_id =$1
  `;

  const { rows: employees } = await pool.query(query,[ id]);

  res.status(200).json({
    employees
  });
});




// ===============================
// Export Controllers
// ===============================
module.exports = {
  addEmployee,
  updateEmployee,
  getAllEmployees,
  searchEmployees,
  getAllEmployeeBasicInfo,
  getEmployeeInfoById,
  hardDeleteEmployee
};
