/**
 * Ready accounts for live testing (friend = host, you = user).
 * Run: npm run seed:test-live
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');

async function upsertHost(email, password, name, displayName) {
  const hash = await bcrypt.hash(password, 10);
  let userId;
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    userId = existing.rows[0].id;
    await query('UPDATE users SET password_hash = $1, is_blocked = false WHERE id = $2', [hash, userId]);
  } else {
    const u = await query(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'agent', $3) RETURNING id`,
      [email, hash, name]
    );
    userId = u.rows[0].id;
  }
  const ag = await query('SELECT id FROM agents WHERE user_id = $1', [userId]);
  if (ag.rows[0]) {
    await query(
      `UPDATE agents SET display_name = $1, status = 'approved', is_online = true,
       admin_forced_offline = false, audio_rate = 5, video_rate = 20, approved_at = COALESCE(approved_at, NOW())
       WHERE user_id = $2`,
      [displayName, userId]
    );
  } else {
    await query(
      `INSERT INTO agents (user_id, display_name, age, photo_url, status, audio_rate, video_rate, is_online, approved_at)
       VALUES ($1, $2, 25, 'https://i.pravatar.cc/300?img=32', 'approved', 5, 20, true, NOW())`,
      [userId, displayName]
    );
  }
  return email;
}

async function upsertCustomer(email, password, balance) {
  const hash = await bcrypt.hash(password, 10);
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    await query(
      'UPDATE users SET password_hash = $1, wallet_balance = $2, is_blocked = false WHERE id = $3',
      [hash, balance, existing.rows[0].id]
    );
  } else {
    await query(
      `INSERT INTO users (email, password_hash, role, name, wallet_balance) VALUES ($1, $2, 'customer', 'Test User', $3)`,
      [email, hash, balance]
    );
  }
}

async function main() {
  await upsertHost('host@crezycall.com', 'host123', 'Test Host', 'Test Host Priya');
  await upsertHost('priya@agent.demo', 'agent123', 'Priya', 'Priya');
  await upsertCustomer('user@demo.com', 'user123', 1000);

  console.log('\n✅ Live test accounts ready:\n');
  console.log('  HOST (friend):  host@crezycall.com  /  host123');
  console.log('  USER (you):     user@demo.com       /  user123   (₹1000 wallet)');
  console.log('  Alt host:       priya@agent.demo    /  agent123\n');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
