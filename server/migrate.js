require('dotenv').config();
const { pool } = require('./db');

async function migrate() {
  await pool.query(`
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS teaching_topics TEXT DEFAULT '';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS languages VARCHAR(120) DEFAULT 'Hindi, English';
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 1;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      sender_role VARCHAR(20) NOT NULL,
      body TEXT NOT NULL,
      is_gist BOOLEAN NOT NULL DEFAULT false,
      gist_charge DECIMAL(8, 2) DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(customer_id, agent_id);
  `);

  const topics = {
    Priya: 'Relationship tips, Flirting, Fun chat',
    Ananya: 'Life advice, Motivation, Career talk',
    Riya: 'Daily gossip, Entertainment, Listening',
    Kavya: 'Fitness, Health tips, Positive vibes',
  };

  for (const [name, t] of Object.entries(topics)) {
    await pool.query(
      `UPDATE agents SET teaching_topics = $1, languages = 'Hindi, English', experience_years = 2
       WHERE display_name = $2`,
      [t, name]
    );
  }

  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
