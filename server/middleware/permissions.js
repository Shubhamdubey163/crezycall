const { query } = require('../db');

const ALL_PERMS = {
  dashboard: true,
  users: true,
  agents: true,
  pending: true,
  withdrawals: true,
  calls: true,
  messages: true,
  reports: true,
  create_user: true,
  create_host: true,
  create_accounts: true,
  payment_gateway: true,
  sms_settings: true,
  notifications: true,
  manage_admins: true,
  platform_settings: true,
  rates_settings: true,
  system_settings: true,
};

const SUPER_ONLY_PERMS = [
  'withdrawals',
  'payment_gateway',
  'sms_settings',
  'notifications',
  'manage_admins',
  'platform_settings',
  'rates_settings',
  'system_settings',
];

async function getAdminPermissions(userId, role) {
  if (role === 'super_admin') return { ...ALL_PERMS, is_super: true };
  const r = await query('SELECT permissions FROM admin_permissions WHERE user_id = $1', [userId]);
  const base = {
    dashboard: true,
    users: true,
    agents: true,
    pending: true,
    withdrawals: false,
    calls: true,
    messages: true,
    reports: false,
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
  if (!r.rows[0]) return { ...base, is_super: false };
  return { ...base, ...r.rows[0].permissions, is_super: false };
}

function authStaff(...allowedRoles) {
  const roles = allowedRoles.length ? allowedRoles : ['admin', 'super_admin'];
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Login required' });
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      req.permissions = await getAdminPermissions(req.user.id, req.user.role);
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (req.user.role === 'super_admin') return next();
    if (SUPER_ONLY_PERMS.includes(perm)) {
      return res.status(403).json({ error: 'Super Admin only — contact owner' });
    }
    if (req.permissions?.[perm]) return next();
    return res.status(403).json({ error: 'Permission denied' });
  };
}

function requireSuper(req, res, next) {
  if (req.user.role === 'super_admin') return next();
  return res.status(403).json({ error: 'Super Admin only' });
}

module.exports = {
  getAdminPermissions,
  authStaff,
  requirePerm,
  requireSuper,
  ALL_PERMS,
  SUPER_ONLY_PERMS,
};
