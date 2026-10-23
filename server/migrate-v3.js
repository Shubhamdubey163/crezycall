require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const DEFAULT_ADMIN_PERMS = {
  dashboard: true,
  agents: true,
  pending: true,
  withdrawals: true,
  calls: true,
  users: true,
  messages: true,
  create_user: true,
  create_host: true,
  manage_admins: false,
  platform_settings: false,
};

const DEFAULT_PLATFORM = [
  { key: 'audio_calls', user: true, host: true, label: 'Audio calls' },
  { key: 'video_calls', user: true, host: true, label: 'Video calls' },
  { key: 'messaging', user: true, host: true, label: 'Text messaging' },
  { key: 'gifts', user: true, host: true, label: 'Gift emojis (₹1)' },
  { key: 'wallet_recharge', user: true, host: false, label: 'Wallet recharge' },
  { key: 'free_first_minute', user: true, host: true, label: '1st minute free' },
  { key: 'host_register', user: false, host: true, label: 'Host registration' },
  { key: 'statement', user: true, host: true, label: 'Statement / history' },
];

async function migrate() {
  await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_permissions (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      permissions JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS platform_features (
      feature_key VARCHAR(80) PRIMARY KEY,
      label VARCHAR(120) NOT NULL,
      user_enabled BOOLEAN NOT NULL DEFAULT true,
      host_enabled BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const f of DEFAULT_PLATFORM) {
    await pool.query(
      `INSERT INTO platform_features (feature_key, label, user_enabled, host_enabled)
       VALUES ($1, $2, $3, $4) ON CONFLICT (feature_key) DO NOTHING`,
      [f.key, f.label, f.user, f.host]
    );
  }

  const superEmail = 'superadmin@crezycall.com';
  const superCheck = await pool.query('SELECT id FROM users WHERE email = $1', [superEmail]);
  if (superCheck.rows.length === 0) {
    const hash = await bcrypt.hash('super123', 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'super_admin', 'Super Admin')`,
      [superEmail, hash]
    );
    console.log('Super Admin: superadmin@crezycall.com / super123');
  }

  const admins = await pool.query(`SELECT id FROM users WHERE role = 'admin'`);
  for (const row of admins.rows) {
    await pool.query(
      `INSERT INTO admin_permissions (user_id, permissions) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [row.id, JSON.stringify(DEFAULT_ADMIN_PERMS)]
    );
  }

  console.log('Migration v3 complete.');
  await pool.end();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
