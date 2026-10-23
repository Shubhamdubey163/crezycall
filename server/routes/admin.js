const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authStaff, requirePerm, requireSuper } = require('../middleware/permissions');

const router = express.Router();

router.get('/me', authStaff(), async (req, res) => {
  res.json({
    user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role },
    permissions: req.permissions,
  });
});

router.post('/create-account', authStaff(), requirePerm('create_accounts'), async (req, res) => {
  try {
    const { role, name, email, phone, password, display_name, age, wallet_balance, audio_rate, video_rate, auto_approve } =
      req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, role required' });
    }
    if (role === 'super_admin') return res.status(403).json({ error: 'Cannot create super admin here' });
    if (role === 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can create Admin accounts' });
    }

    const hash = await bcrypt.hash(password, 10);

    if (role === 'customer') {
      const r = await query(
        `INSERT INTO users (email, password_hash, role, name, phone, wallet_balance)
         VALUES ($1, $2, 'customer', $3, $4, $5) RETURNING id, email, name, role`,
        [email, hash, name, phone || null, parseFloat(wallet_balance) || 0]
      );
      return res.json({ message: 'User created', account: r.rows[0] });
    }

    if (role === 'admin') {
      const r = await query(
        `INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1, $2, 'admin', $3, $4) RETURNING id, email, name, role`,
        [email, hash, name, phone || null]
      );
      const defaultPerms = {
        dashboard: true, users: true, agents: true, pending: true, withdrawals: false,
        calls: true, messages: true, create_user: true, create_host: true, create_accounts: true,
      };
      await query(
        `INSERT INTO admin_permissions (user_id, permissions) VALUES ($1, $2)`,
        [r.rows[0].id, JSON.stringify(defaultPerms)]
      );
      return res.json({ message: 'Admin employee created', account: r.rows[0] });
    }

    if (role === 'agent' || role === 'host') {
      const userRes = await query(
        `INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1, $2, 'agent', $3, $4) RETURNING id`,
        [email, hash, name, phone || null]
      );
      const status = auto_approve !== false ? 'approved' : 'pending';
      await query(
        `INSERT INTO agents (user_id, display_name, age, phone, status, audio_rate, video_rate, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, ${status === 'approved' ? 'NOW()' : 'NULL'})`,
        [
          userRes.rows[0].id,
          display_name || name,
          parseInt(age, 10) || 22,
          phone || null,
          status,
          parseFloat(audio_rate) || 5,
          parseFloat(video_rate) || 20,
        ]
      );
      return res.json({ message: `Host created (${status})`, account: { email, role: 'host' } });
    }

    return res.status(400).json({ error: 'Invalid role' });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/create-user', authStaff(), requirePerm('create_user'), async (req, res) => {
  try {
    const { name, email, phone, password, wallet_balance } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
    const hash = await bcrypt.hash(password, 10);
    const r = await query(
      `INSERT INTO users (email, password_hash, role, name, phone, wallet_balance)
       VALUES ($1, $2, 'customer', $3, $4, $5) RETURNING id, email, name, wallet_balance`,
      [email, hash, name, phone || null, parseFloat(wallet_balance) || 0]
    );
    res.json({ message: 'User account created', user: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/create-host', authStaff(), requirePerm('create_host'), async (req, res) => {
  try {
    const { name, email, phone, password, display_name, age, audio_rate, video_rate, auto_approve } = req.body;
    if (!name || !email || !password || !display_name || !age) {
      return res.status(400).json({ error: 'Required fields missing' });
    }
    const hash = await bcrypt.hash(password, 10);
    const userRes = await query(
      `INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1, $2, 'agent', $3, $4) RETURNING id`,
      [email, hash, name, phone || null]
    );
    const status = auto_approve !== false ? 'approved' : 'pending';
    const agentRes = await query(
      `INSERT INTO agents (user_id, display_name, age, phone, status, audio_rate, video_rate, is_online, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, ${status === 'approved' ? 'NOW()' : 'NULL'}) RETURNING id`,
      [
        userRes.rows[0].id,
        display_name,
        parseInt(age, 10),
        phone || null,
        status,
        parseFloat(audio_rate) || 5,
        parseFloat(video_rate) || 20,
      ]
    );
    res.json({
      message: status === 'approved' ? 'Host created & approved' : 'Host created (pending)',
      agentId: agentRes.rows[0].id,
      login: { email, password: '(as set)' },
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.get('/stats', authStaff(), requirePerm('dashboard'), async (req, res) => {
  try {
    const [users, agents, calls, revenue, pendingAgents, pendingWithdrawals] = await Promise.all([
      query(`SELECT COUNT(*) FROM users WHERE role = 'customer' AND is_blocked = false`),
      query(`SELECT COUNT(*) FROM agents WHERE status = 'approved'`),
      query(`SELECT COUNT(*) FROM calls WHERE status = 'ended'`),
      query(
        `SELECT COALESCE(SUM(platform_fee), 0) + COALESCE((SELECT SUM(gist_charge) FROM messages),0) as total FROM calls WHERE status = 'ended'`
      ),
      query(`SELECT COUNT(*) FROM agents WHERE status = 'pending'`),
      query(`SELECT COUNT(*) FROM withdrawals WHERE status = 'pending'`),
    ]);
    res.json({
      customers: parseInt(users.rows[0].count, 10),
      approved_agents: parseInt(agents.rows[0].count, 10),
      total_calls: parseInt(calls.rows[0].count, 10),
      platform_revenue: parseFloat(revenue.rows[0].total || 0),
      pending_agents: parseInt(pendingAgents.rows[0].count, 10),
      pending_withdrawals: parseInt(pendingWithdrawals.rows[0].count, 10),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agents', authStaff(), requirePerm('agents'), async (req, res) => {
  try {
    const status = req.query.status;
    let sql = `SELECT a.*, u.email, u.name, u.phone, u.is_blocked FROM agents a JOIN users u ON a.user_id = u.id`;
    const params = [];
    if (status) {
      sql += ` WHERE a.status = $1`;
      params.push(status);
    }
    sql += ' ORDER BY a.created_at DESC';
    res.json((await query(sql, params)).rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agents/:id', authStaff(), requirePerm('agents'), async (req, res) => {
  try {
    const r = await query(
      `SELECT a.*, u.email, u.name, u.phone as user_phone, u.is_blocked
       FROM agents a JOIN users u ON a.user_id = u.id WHERE a.id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Host not found' });
    const a = r.rows[0];
    res.json({
      ...a,
      phone: a.phone || a.user_phone,
      audio_rate: parseFloat(a.audio_rate),
      video_rate: parseFloat(a.video_rate),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agents/:id/verification', authStaff(), requirePerm('pending'), async (req, res) => {
  try {
    const r = await query(
      `SELECT a.*, u.email, u.name, u.phone FROM agents a JOIN users u ON a.user_id = u.id WHERE a.id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    const a = r.rows[0];
    res.json({
      ...a,
      face_scan_data:
        typeof a.face_scan_data === 'string' ? JSON.parse(a.face_scan_data) : a.face_scan_data || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/agents/:id', authStaff(), requirePerm('agents'), async (req, res) => {
  try {
    const {
      status,
      audio_rate,
      video_rate,
      is_online,
      admin_forced_offline,
      display_name,
      age,
      photo_url,
      bio,
      phone,
      name,
      teaching_topics,
      languages,
    } = req.body;
    const agentRow = await query('SELECT user_id FROM agents WHERE id = $1', [req.params.id]);
    if (!agentRow.rows[0]) return res.status(404).json({ error: 'Host not found' });

    const updates = [];
    const params = [];
    let i = 1;
    if (status) {
      updates.push(`status = $${i++}`);
      params.push(status);
      if (status === 'approved') updates.push(`approved_at = NOW()`);
    }
    if (audio_rate != null) {
      updates.push(`audio_rate = $${i++}`);
      params.push(audio_rate);
    }
    if (video_rate != null) {
      updates.push(`video_rate = $${i++}`);
      params.push(video_rate);
    }
    if (is_online != null) {
      updates.push(`is_online = $${i++}`);
      params.push(is_online);
    }
    if (admin_forced_offline != null) {
      updates.push(`admin_forced_offline = $${i++}`);
      params.push(admin_forced_offline);
      if (admin_forced_offline) updates.push(`is_online = false`);
    }
    if (display_name != null) {
      updates.push(`display_name = $${i++}`);
      params.push(String(display_name).trim());
    }
    if (age != null) {
      updates.push(`age = $${i++}`);
      params.push(parseInt(age, 10));
    }
    if (photo_url != null) {
      updates.push(`photo_url = $${i++}`);
      params.push(String(photo_url).trim());
    }
    if (bio != null) {
      updates.push(`bio = $${i++}`);
      params.push(String(bio));
    }
    if (phone != null) {
      updates.push(`phone = $${i++}`);
      params.push(String(phone).trim());
    }
    if (teaching_topics != null) {
      updates.push(`teaching_topics = $${i++}`);
      params.push(String(teaching_topics));
    }
    if (languages != null) {
      updates.push(`languages = $${i++}`);
      params.push(String(languages));
    }
    if (updates.length) {
      params.push(req.params.id);
      await query(`UPDATE agents SET ${updates.join(', ')} WHERE id = $${i}`, params);
    }

    if (name != null || phone != null) {
      const uParts = [];
      const uParams = [];
      let j = 1;
      if (name != null) {
        uParts.push(`name = $${j++}`);
        uParams.push(String(name).trim());
      }
      if (phone != null) {
        uParts.push(`phone = $${j++}`);
        uParams.push(String(phone).trim());
      }
      uParams.push(agentRow.rows[0].user_id);
      await query(`UPDATE users SET ${uParts.join(', ')} WHERE id = $${j}`, uParams);
    }

    if (!updates.length && name == null && phone == null) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    res.json({ message: 'Host updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/users', authStaff(), requirePerm('users'), async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name, email, phone, role, wallet_balance, is_blocked, created_at,
              photo_url, gender, date_of_birth
       FROM users WHERE role = 'customer' ORDER BY created_at DESC LIMIT 100`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/users/:id', authStaff(), requirePerm('users'), async (req, res) => {
  try {
    const target = await query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User not found' });
    if (target.rows[0].role !== 'customer') {
      return res.status(400).json({ error: 'Only customer accounts can be edited here' });
    }
    const { name, phone, photo_url, gender, date_of_birth, wallet_balance } = req.body;
    await query(
      `UPDATE users SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        photo_url = COALESCE($3, photo_url),
        gender = COALESCE($4, gender),
        date_of_birth = COALESCE($5, date_of_birth),
        wallet_balance = COALESCE($6, wallet_balance)
       WHERE id = $7`,
      [
        name != null ? String(name).trim() : null,
        phone != null ? String(phone).trim() : null,
        photo_url != null ? String(photo_url).trim() : null,
        gender != null ? String(gender).trim() : null,
        date_of_birth || null,
        wallet_balance != null ? parseFloat(wallet_balance) : null,
        req.params.id,
      ]
    );
    const r = await query(
      `SELECT id, name, email, phone, role, wallet_balance, is_blocked, photo_url, gender, date_of_birth
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    res.json({ message: 'User updated', user: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/users/:id/block', authStaff(), requirePerm('users'), async (req, res) => {
  try {
    const target = await query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (target.rows[0]?.role === 'super_admin') {
      return res.status(400).json({ error: 'Cannot block super admin' });
    }
    await query('UPDATE users SET is_blocked = $1 WHERE id = $2', [!!req.body.blocked, req.params.id]);
    res.json({ message: req.body.blocked ? 'Blocked' : 'Unblocked' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/withdrawals', authStaff(), requireSuper, async (req, res) => {
  try {
    const result = await query(
      `SELECT w.*, a.display_name, u.email FROM withdrawals w
       JOIN agents a ON w.agent_id = a.id JOIN users u ON a.user_id = u.id ORDER BY w.created_at DESC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/withdrawals/:id', authStaff(), requireSuper, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'paid', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const w = await query('SELECT * FROM withdrawals WHERE id = $1', [req.params.id]);
    if (!w.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (status === 'rejected' && w.rows[0].status === 'pending') {
      await query(
        'UPDATE agents SET available_balance = available_balance + $1 WHERE id = $2',
        [w.rows[0].gross_amount, w.rows[0].agent_id]
      );
    }
    await query(`UPDATE withdrawals SET status = $1, processed_at = NOW() WHERE id = $2`, [
      status,
      req.params.id,
    ]);
    res.json({ message: 'Withdrawal updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/calls', authStaff(), requirePerm('calls'), async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, cu.name as customer_name, cu.email as customer_email, a.display_name as agent_name
       FROM calls c JOIN users cu ON c.customer_id = cu.id JOIN agents a ON c.agent_id = a.id
       ORDER BY c.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/messages', authStaff(), requirePerm('messages'), async (req, res) => {
  try {
    const r = await query(
      `SELECT m.*, cu.name as customer_name, a.display_name as agent_name FROM messages m
       JOIN users cu ON m.customer_id = cu.id JOIN agents a ON m.agent_id = a.id
       ORDER BY m.created_at DESC LIMIT 100`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
