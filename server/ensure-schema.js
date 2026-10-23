const { pool } = require('./db');

/** Run on server start — missing columns/tables fix */
async function ensureSchema() {
  await pool.query(`
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS teaching_topics TEXT DEFAULT '';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS languages VARCHAR(120) DEFAULT 'Hindi, English';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 1;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_code VARCHAR(10);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      sender_role VARCHAR(20) NOT NULL,
      body TEXT NOT NULL,
      msg_type VARCHAR(20) DEFAULT 'text',
      gift_charge DECIMAL(8, 2) DEFAULT 0,
      gist_charge DECIMAL(8, 2) DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(customer_id, agent_id);
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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_disabled BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS display_profile_set BOOLEAN NOT NULL DEFAULT false;
  `);

  await pool.query(`
    UPDATE agents SET display_profile_set = true
    WHERE status = 'approved'
      AND photo_url IS NOT NULL
      AND photo_url NOT LIKE '%pravatar.cc%'
      AND photo_url NOT LIKE '%default-avatar%'
  `);
}

module.exports = { ensureSchema };
