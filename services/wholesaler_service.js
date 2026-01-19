const pool = require('../config/db');

const checkWholesalerExists = async (wholesaler_id) => {
  const result = await pool.query(
    'SELECT wholesaler_id FROM wholesalers WHERE wholesaler_id = $1 and deleted_at =FALSE',
    [wholesaler_id]
  );
  return  result.rows[0] ? result.rows[0].wholesaler_id : null;
};

const checkWholesalerExistsByName = async (wholesaler_name) => {
  const result = await pool.query(
    'SELECT wholesaler_id FROM wholesalers WHERE name ILIKE $1 AND deleted_at IS NULL',
    [`%${wholesaler_name}%`]
  );
  return result.rows[0] ? result.rows[0].wholesaler_id : null;
};

module.exports = { checkWholesalerExists,checkWholesalerExistsByName };