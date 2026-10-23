require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function seed() {
  const hash = await bcrypt.hash('123456', 10);
  await pool.query(
    `UPDATE users SET password_hash = $1 WHERE email = 'demo@admin.com' AND role = 'admin'`,
    [hash]
  );
  console.log('demo@admin.com password set to: 123456');
  await pool.end();
}

seed().catch(console.error);
