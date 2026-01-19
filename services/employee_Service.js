const pool = require('../config/db');



// For Add: check if any employee has this email
const isEmailAlreadyTaken = async (email) => {
  const query = `SELECT 1 FROM employees WHERE email = $1 LIMIT 1`;
  const { rows } = await pool.query(query, [email]);
  return rows.length > 0;
};

// For Update: check if another employee already uses this email
const isEmailTakenByOtherEmployee = async (email, employeeId) => {
  const query = `SELECT 1 FROM employees WHERE email = $1 AND employee_id != $2 LIMIT 1`;
  const { rows } = await pool.query(query, [email, employeeId]);
  return rows.length > 0;
};

module.exports = {
  isEmailTakenByOtherEmployee,
  isEmailAlreadyTaken
};


