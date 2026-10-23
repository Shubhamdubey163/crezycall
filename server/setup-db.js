require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function setup() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  for (const [adminEmail, adminPass, adminName] of [
    ['demo@admin.com', '1234567', 'Crezycall Admin'],
    ['admin@callconnect.app', 'admin123', 'Platform Admin'],
  ]) {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    const hash = await bcrypt.hash(adminPass, 10);
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (email, password_hash, role, name, wallet_balance) VALUES ($1, $2, 'admin', $3, 0)`,
        [adminEmail, hash, adminName]
      );
      console.log(`Admin created: ${adminEmail} / ${adminPass}`);
    }
  }

  const demoAgents = [
    { name: 'Priya', age: 24, audio: 5, video: 20, photo: 'https://i.pravatar.cc/300?img=1' },
    { name: 'Ananya', age: 22, audio: 10, video: 30, photo: 'https://i.pravatar.cc/300?img=5' },
    { name: 'Riya', age: 26, audio: 15, video: 25, photo: 'https://i.pravatar.cc/300?img=9' },
    { name: 'Kavya', age: 23, audio: 8, video: 22, photo: 'https://i.pravatar.cc/300?img=16' },
  ];

  for (const a of demoAgents) {
    const email = `${a.name.toLowerCase()}@agent.demo`;
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) continue;

    const hash = await bcrypt.hash('agent123', 10);
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'agent', $3) RETURNING id`,
      [email, hash, a.name]
    );
    await pool.query(
      `INSERT INTO agents (user_id, display_name, age, photo_url, status, audio_rate, video_rate, is_online, approved_at)
       VALUES ($1, $2, $3, $4, 'approved', $5, $6, true, NOW())`,
      [userRes.rows[0].id, a.name, a.age, a.photo, a.audio, a.video]
    );
  }

  const demoCustomer = 'user@demo.com';
  const custCheck = await pool.query('SELECT id FROM users WHERE email = $1', [demoCustomer]);
  if (custCheck.rows.length === 0) {
    const hash = await bcrypt.hash('user123', 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, role, name, wallet_balance) VALUES ($1, $2, 'customer', 'Demo User', 500)`,
      [demoCustomer, hash]
    );
    console.log('Demo customer: user@demo.com / user123 (₹500 wallet)');
  }

  console.log('Database setup complete.');
  await pool.end();
}

setup().catch((e) => {
  console.error(e);
  process.exit(1);
});
