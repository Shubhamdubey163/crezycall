require('dotenv').config();
const { pool } = require('./db');

async function migrate() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE agents ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS face_scan_data JSONB DEFAULT '[]';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS verification_photo_url TEXT;
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS admin_forced_offline BOOLEAN NOT NULL DEFAULT false;

    ALTER TABLE messages ADD COLUMN IF NOT EXISTS msg_type VARCHAR(20) DEFAULT 'text';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS gift_emoji VARCHAR(20);
  `);
  console.log('Migration v2 complete.');
  await pool.end();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
