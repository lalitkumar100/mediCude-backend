const { verifyToken } = require('../services/JWT_Service');
const asyncHandler = require('../services/asyncHandler');
const pool = require('../config/db');

// ===============================
// Auth Middleware with Freshness & Status Check
// ===============================
const authMiddleware = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  const { login_id, password_updated_at } = decoded;

  const { rows } = await pool.query(
    `SELECT password_updated_at, status FROM logins WHERE login_id = $1`,
    [login_id]
  );

  if (!rows.length) {
    return res.status(401).json({ message: 'User not found' });
  }

  const dbPwdTime = rows[0].password_updated_at?.toISOString();
  if (!dbPwdTime || dbPwdTime !== password_updated_at) {
    return res.status(401).json({ message: 'Token is no longer valid, please login again' });
  }

  const accountStatus = rows[0].status?.toLowerCase();
  if (accountStatus !== 'active') {
    return res.status(403).json({ message: 'Account is inactive or suspended' });
  }

  // Attach user info to request for downstream use
  req.user = decoded;

  next();
});

module.exports = authMiddleware;
