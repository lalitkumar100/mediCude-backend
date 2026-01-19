// chahit impleent kar login , change in password, logout, register
//table in pstgrsql bhi ready kar login ka login 


const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET;

const generateToken = (user) => {
  return jwt.sign(
    { login_id: user.login_id,
      role: user.role,
      name: user.full_name,
      employee_id: user.employee_id,
      password_updated_at: user.password_updated_at.toISOString()
       },
    SECRET,
    { expiresIn: '1d' }
  );
};

const verifyToken = (token) => jwt.verify(token, SECRET);

module.exports = { generateToken, verifyToken }