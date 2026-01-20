const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: Number(process.env.PG_PORT),
  ssl: {
    rejectUnauthorized: false, // REQUIRED for Render
  },
});

pool.connect()
  .then(() => console.log('✅ Connected to Render PostgreSQL'))
  .catch(err => console.error('❌ PostgreSQL connection error:', err));

module.exports = pool;
