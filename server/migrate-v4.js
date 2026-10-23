require('dotenv').config();
const { pool } = require('./db');

const EMPLOYEE_ADMIN_PERMS = {
  dashboard: true,
  users: true,
  agents: true,
  pending: true,
  withdrawals: false,
  calls: true,
  messages: true,
  reports: true,
  create_user: true,
  create_host: true,
  create_accounts: true,
  payment_gateway: false,
  sms_settings: false,
  notifications: false,
  manage_admins: false,
  platform_settings: false,
  rates_settings: false,
  system_settings: false,
};

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      label VARCHAR(150) NOT NULL,
      value JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const defaults = [
    {
      key: 'payment_gateway',
      label: 'Payment Gateway',
      value: { provider: 'razorpay', key_id: '', key_secret: '', webhook_secret: '', enabled: false },
    },
    {
      key: 'sms',
      label: 'SMS API',
      value: { provider: 'msg91', api_key: '', sender_id: 'CREZY', template_otp: '', enabled: false },
    },
    {
      key: 'notifications',
      label: 'Push Notifications',
      value: { fcm_server_key: '', enabled: false, default_title: 'Crezycall' },
    },
    {
      key: 'platform',
      label: 'Platform',
      value: { platform_fee_percent: 10, min_withdrawal: 100, free_text_msgs: 10, text_msg_cost: 0.1, gift_cost: 1 },
    },
  ];

  for (const s of defaults) {
    await pool.query(
      `INSERT INTO system_settings (setting_key, label, value) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [s.key, s.label, JSON.stringify(s.value)]
    );
  }

  await pool.query(
    `UPDATE admin_permissions SET permissions = $1::jsonb WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')`,
    [JSON.stringify(EMPLOYEE_ADMIN_PERMS)]
  );

  console.log('Migration v4: withdrawals/payment locked for regular admins');
  await pool.end();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
