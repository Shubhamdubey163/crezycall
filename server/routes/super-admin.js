const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authStaff, requireSuper, ALL_PERMS } = require('../middleware/permissions');

const router = express.Router();
router.use(authStaff('super_admin'));

const SUPER_ONLY_KEYS = [
  'withdrawals',
  'payment_gateway',
  'sms_settings',
  'notifications',
  'manage_admins',
  'platform_settings',
  'rates_settings',
  'system_settings',
];

const DEFAULT_EMPLOYEE_PERMS = {
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

router.get('/admins', requireSuper, async (req, res) => {
  try {
    const rows = await query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at, ap.permissions
       FROM users u LEFT JOIN admin_permissions ap ON ap.user_id = u.id
       WHERE u.role IN ('admin', 'super_admin') ORDER BY u.role DESC, u.created_at`
    );
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/admins', requireSuper, async (req, res) => {
  try {
    const { name, email, password, permissions } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    const hash = await bcrypt.hash(password, 10);
    const u = await query(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'admin', $3) RETURNING id, email, name`,
      [email, hash, name]
    );
    await query(
      `INSERT INTO admin_permissions (user_id, permissions) VALUES ($1, $2)`,
      [u.rows[0].id, JSON.stringify({ ...DEFAULT_EMPLOYEE_PERMS, ...permissions })]
    );
    res.json({ message: 'Employee Admin created', user: u.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email exists' });
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admins/:id/permissions', requireSuper, async (req, res) => {
  try {
    const target = await query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (!target.rows[0] || target.rows[0].role === 'super_admin') {
      return res.status(400).json({ error: 'Cannot modify super admin' });
    }
    const perms = { ...req.body.permissions };
    SUPER_ONLY_KEYS.forEach((k) => {
      if (perms[k]) perms[k] = false;
    });
    await query(
      `INSERT INTO admin_permissions (user_id, permissions, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET permissions = $2, updated_at = NOW()`,
      [req.params.id, JSON.stringify(perms)]
    );
    res.json({ message: 'Permissions updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/settings', requireSuper, async (req, res) => {
  try {
    const r = await query('SELECT * FROM system_settings ORDER BY setting_key');
    res.json(r.rows.map((row) => ({ ...row, value: row.value })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/settings/:key', requireSuper, async (req, res) => {
  try {
    await query(
      `UPDATE system_settings SET value = $1, updated_at = NOW() WHERE setting_key = $2`,
      [JSON.stringify(req.body.value), req.params.key]
    );
    res.json({ message: 'Settings saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/platform-features', requireSuper, async (req, res) => {
  try {
    const r = await query('SELECT * FROM platform_features ORDER BY feature_key');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/platform-features', requireSuper, async (req, res) => {
  try {
    for (const f of req.body.features) {
      await query(
        `UPDATE platform_features SET user_enabled = $1, host_enabled = $2, updated_at = NOW() WHERE feature_key = $3`,
        [!!f.user_enabled, !!f.host_enabled, f.feature_key]
      );
    }
    res.json({ message: 'Saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
