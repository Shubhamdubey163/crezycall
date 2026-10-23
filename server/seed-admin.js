require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function seed() {
  const email = 'demo@admin.com';
  const password = '1234567';
  const hash = await bcrypt.hash(password, 10);
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE users SET password_hash = $1, role = 'admin', name = 'Crezycall Admin' WHERE email = $2`,
      [hash, email]
    );
    console.log('Admin updated: demo@admin.com / 1234567');
  } else {
    await pool.query(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'admin', 'Crezycall Admin')`,
      [email, hash]
    );
    console.log('Admin created: demo@admin.com / 1234567');
  }
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
