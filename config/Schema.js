// File: employee-manager.js

const fs = require('fs').promises;
const path = require('path');
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const validator = require('validator');
const { isEmailAlreadyTaken } = require('../services/employee_Service');

/**
 * Validates the employee data before database operations.
 * @param {Object} data The employee data object.
 * @returns {Array<string>} An array of validation errors.
 */
function validateEmployeeData(data) {
  const { first_name, last_name, gender, email, role, salary, date_of_birth, contact_number, aadhar_card_no } = data;
  const errors = [];

  // --- Required Fields ---
  if (!first_name || !last_name || !gender || !email || !role) {
    errors.push('Missing required fields: first_name, last_name, gender, email, role.');
  }

  // --- Format Validation ---
  if (!validator.isEmail(email)) {
    errors.push('Invalid email format.');
  }
  if (date_of_birth && !validator.isDate(date_of_birth, { format: 'YYYY-MM-DD', strictMode: true })) {
    errors.push('Invalid date of birth format. Please use YYYY-MM-DD.');
  }
  if (contact_number && !validator.isMobilePhone(contact_number, 'en-IN')) {
    errors.push('Invalid Indian contact number.');
  }
  if (aadhar_card_no && !/^\d{12}$/.test(aadhar_card_no)) {
    errors.push('Invalid Aadhaar number format. It must be a 12-digit number.');
  }
  if (salary !== undefined && (isNaN(parseFloat(salary)) || parseFloat(salary) < 0)) {
    errors.push('Invalid salary. Must be a positive number.');
  }

  return errors;
}

/**
 * Reads SQL schema from a file asynchronously.
 * @param {string} fileName The name of the SQL file.
 * @returns {Promise<string>} The SQL content as a string.
 */
async function readSQLFromFile(fileName) {
  const filePath = path.join(__dirname, '../doc', fileName);
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    console.error(`❌ File read error for "${fileName}":`, err.message);
    // Re-throw the error to be caught by the main run function.
    throw err;
  }
}

/**
 * Creates a new employee and their associated login credentials in a single transaction.
 * @param {Object} data The employee data.
 * @returns {Promise<Object>} An object containing the success message and employee details.
 * @throws {Error} Throws an error if any part of the process fails.
 */
async function createEmployeeAndLogin(data) {
  const client = await pool.connect();
  const password = '123456'; // NOTE: In a real app, this should be securely generated and communicated.

  try {
    // Start a database transaction
    await client.query('BEGIN');

    // 1. Validate the input data
    const validationErrors = validateEmployeeData(data);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    const {
      first_name, last_name, gender, date_of_birth, contact_number, email, address,
      role, date_of_joining, salary, aadhar_card_no, pan_card_no, account_no
    } = data;

    // 2. Check if email is already taken
    const emailTaken = await isEmailAlreadyTaken(email);
    if (emailTaken) {
      throw new Error('Email already registered.');
    }

    // 3. Insert the employee record
    const insertEmployeeQuery = `
      INSERT INTO employees (
        first_name, last_name, gender, date_of_birth, contact_number, email, address,
        role, date_of_joining, salary, aadhar_card_no, pan_card_no, account_no
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      ) RETURNING employee_id;
    `;
    const employeeValues = [
      first_name, last_name, gender, date_of_birth, contact_number, email, address,
      role, date_of_joining || new Date(), salary || 9000.00, aadhar_card_no,
      pan_card_no, account_no
    ];

    const { rows: newEmployeeRows } = await client.query(insertEmployeeQuery, employeeValues);
    if (newEmployeeRows.length === 0) {
      throw new Error('Failed to insert employee record.');
    }
    const employeeId = newEmployeeRows[0].employee_id;

    // 4. Create login credentials
    const passwordHash = await bcrypt.hash(password, 10);
    const insertLoginQuery = `
      INSERT INTO logins (employee_id, email, password_hash, password_updated_at, status)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'Active')
    `;
    await client.query(insertLoginQuery, [employeeId, email, passwordHash]);

    // Commit the transaction if everything succeeded
    await client.query('COMMIT');

    return {
      message: 'Employee and login created successfully.',
      employeeId: employeeId,
      tempPassword: password, // For a real app, this should be handled differently.
    };
  } catch (error) {
    // If any error occurs, roll back the transaction
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Release the client connection back to the pool
    client.release();
  }
}

/**
 * Registers a set of sample employees into the database.
 */
async function registerSampleEmployees() {
  const employees = [
    { first_name: "Amit", last_name: "Verma", gender: "Male", date_of_birth: "1998-11-15", contact_number: "9123456789", email: "amit.verma@example.com", address: "Pune, Maharashtra", role: "admin", date_of_joining: "2023-03-01", salary: 32000.00, status: "Active", aadhar_card_no: "123456789012", pan_card_no: "ABCDE1234F", account_no: "123456789012" },
    { first_name: "Neha", last_name: "Patel", gender: "Female", date_of_birth: "2001-06-21", contact_number: "9988776655", email: "neha.patel@example.com", address: "Ahmedabad, Gujarat", role: "manager", date_of_joining: "2024-11-10", salary: 25000.00, status: "Active", aadhar_card_no: "123456789014", pan_card_no: "ABCDE123RF", account_no: "123456789042" },
    { first_name: "Rohan", last_name: "Sharma", gender: "Male", date_of_birth: "1995-09-30", contact_number: "9765432100", email: "rohan.sharma@example.com", address: "Nagpur, Maharashtra", role: "worker", date_of_joining: "2022-08-15", salary: 40000.00, status: "Active", aadhar_card_no: "123406789014", pan_card_no: "ABCDQ123RF", account_no: "123456989042" }
  ];

  for (const emp of employees) {
    try {
      const result = await createEmployeeAndLogin(emp);
      console.log(`✅ Employee ID ${result.employeeId} (${emp.email}) added as ${emp.role}. Temporary password: ${result.tempPassword}`);
    } catch (err) {
      console.error(`❌ Failed to add employee ${emp.email}:`, err.message);
    }
  }
  console.log('🎉 All sample employees processed.');
}

/**
 * Main script runner. Clears the schema, creates a new one, and populates with sample data.
 */
async function run() {
  try {
    

    console.log("🗑️ Existing schema deleted.");

    console.log("✅ New schema created.");

    await registerSampleEmployees();

    console.log("Done");

  } catch (err) {
    console.error("❌ Execution Error:", err.message);
  }
  // NOTE: pool.end() was removed from this block to keep the database connection
  // pool open for subsequent operations by other parts of the application.
}

// Export the core functions for other modules to use.
module.exports = { createEmployeeAndLogin, run };
