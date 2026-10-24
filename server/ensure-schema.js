const { pool } = require('./db');

const DEFAULT_ADMIN_PERMS = {
  dashboard: true,
  agents: true,
  pending: true,
  withdrawals: true,
  calls: true,
  users: true,
  messages: true,
  reports: true,
  create_user: true,
  create_host: true,
  create_accounts: true,
  manage_admins: false,
  platform_settings: false,
  payment_gateway: false,
  sms_settings: false,
  notifications: false,
  rates_settings: false,
  system_settings: false,
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

/** Run on server start + db:setup — missing columns/tables fix (safe to re-run) */
async function ensureSchema() {
  await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'`).catch(() => {});

  await pool.query(`
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS teaching_topics TEXT DEFAULT '';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS languages VARCHAR(120) DEFAULT 'Hindi, English';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 1;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS face_scan_data JSONB DEFAULT '[]';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS verification_photo_url TEXT;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS admin_forced_offline BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS display_profile_set BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_code VARCHAR(10);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_disabled BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      sender_role VARCHAR(20) NOT NULL,
      body TEXT NOT NULL,
      msg_type VARCHAR(20) DEFAULT 'text',
      gift_emoji VARCHAR(20),
      gift_charge DECIMAL(8, 2) DEFAULT 0,
      gist_charge DECIMAL(8, 2) DEFAULT 0,
      is_gist BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(customer_id, agent_id);
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS msg_type VARCHAR(20) DEFAULT 'text';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS gift_emoji VARCHAR(20);
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS gift_charge DECIMAL(8, 2) DEFAULT 0;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_follows (
      customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (customer_id, agent_id)
    );
    CREATE TABLE IF NOT EXISTS customer_blocks (
      customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (customer_id, agent_id)
    );
  `);

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

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      label VARCHAR(150) NOT NULL,
      value JSONB NOT NULL DEFAULT '{}',
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

  const admins = await pool.query(`SELECT id FROM users WHERE role IN ('admin', 'super_admin')`);
  for (const row of admins.rows) {
    await pool.query(
      `INSERT INTO admin_permissions (user_id, permissions) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [row.id, JSON.stringify(DEFAULT_ADMIN_PERMS)]
    );
  }

  await pool.query(`
    UPDATE agents SET display_profile_set = true
    WHERE status = 'approved'
      AND photo_url IS NOT NULL
      AND photo_url NOT LIKE '%pravatar.cc%'
      AND photo_url NOT LIKE '%default-avatar%'
  `);
}

module.exports = { ensureSchema };
