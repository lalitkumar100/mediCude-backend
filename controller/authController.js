const pool = require('../config/db');
const { generateToken } = require('../services/JWT_Service');
const asyncHandler = require('../services/asyncHandler');
const bcrypt = require('bcrypt');

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query("SELECT e.employee_id, (e.first_name || ' ' || e.last_name) AS full_name, e.role, l.* FROM employees e JOIN logins l ON e.employee_id = l.employee_id WHERE l.email = $1;", [email]);
  const user = rows[0];

 
  if (!user || !user.password_hash) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.status === 'Inactive') {
    return res.status(403).json({ message: 'Account is inactived by admin' });
  }

  if (user.status === 'Suspended') {
    return res.status(403).json({ message: 'Account is Suspended by admin' });
  }

  // Optional: update last login timestamp
  await pool.query('UPDATE logins SET last_login = NOW() WHERE email = $1', [email]);



  res.json({
    message: 'Login successful',
    token: generateToken(user),
    last_login: user.last_login,
    role: user.role,
    employee_id: user.employee_id
  }); 
});
