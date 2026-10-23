const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { getAdminPermissions } = require('../middleware/permissions');
const { calcAge } = require('../customer-profile');

const router = express.Router();

function customerUserPayload(row) {
  const age = calcAge(row.date_of_birth);
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    name: row.name,
    phone: row.phone,
    gender: row.gender,
    date_of_birth: row.date_of_birth,
    age,
    photo_url: row.photo_url,
    wallet_balance: parseFloat(row.wallet_balance),
  };
}

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    const result = await query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (user.is_blocked) {
      return res.status(403).json({ error: 'Your account is blocked. Contact support.' });
    }
    if (user.account_disabled) {
      return res.status(403).json({ error: 'Account disabled. Contact support to re-enable.' });
    }
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    let agentProfile = null;
    if (user.role === 'agent') {
      const ag = await query('SELECT * FROM agents WHERE user_id = $1', [user.id]);
      agentProfile = ag.rows[0] || null;
    }
    let permissions = null;
    if (user.role === 'admin' || user.role === 'super_admin') {
      permissions = await getAdminPermissions(user.id, user.role);
    }

    res.json({
      token,
      user: customerUserPayload(user),
      agent: agentProfile,
      permissions,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/register/customer', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const { password, name, phone, gender, date_of_birth, photo_url } = req.body;
    if (!email || !password || !name || !phone || !gender || !date_of_birth) {
      return res.status(400).json({ error: 'Name, email, password, phone, gender and date of birth are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const age = calcAge(date_of_birth);
    if (age == null) return res.status(400).json({ error: 'Enter a valid date of birth' });
    if (age < 18) return res.status(400).json({ error: 'You must be 18 or older' });

    if (!photo_url || String(photo_url).length < 80) {
      return res.status(400).json({ error: 'Upload a profile photo with your face clearly visible' });
    }
    const hash = await bcrypt.hash(password, 10);
    const defaultPhoto = photo_url;
    const result = await query(
      `INSERT INTO users (email, password_hash, role, name, phone, gender, date_of_birth, photo_url, wallet_balance)
       VALUES ($1, $2, 'customer', $3, $4, $5, $6, $7, 0)
       RETURNING id, email, role, name, phone, gender, date_of_birth, photo_url, wallet_balance`,
      [email, hash, name.trim(), String(phone).trim(), gender, date_of_birth, defaultPhoto]
    );
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: customerUserPayload(user) });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/register/agent/step1', async (req, res) => {
  try {
    const { email, password, name, phone, display_name, age } = req.body;
    if (!email || !password || !name || !phone || !display_name || !age) {
      return res.status(400).json({ error: 'Name, phone, email, password required' });
    }
    const hash = await bcrypt.hash(password, 10);
    const userRes = await query(
      `INSERT INTO users (email, password_hash, role, name, phone) VALUES ($1, $2, 'agent', $3, $4) RETURNING id`,
      [email, hash, name, phone]
    );
    const agentRes = await query(
      `INSERT INTO agents (user_id, display_name, age, phone, status, photo_url)
       VALUES ($1, $2, $3, $4, 'pending', 'https://i.pravatar.cc/300?img=32') RETURNING id`,
      [userRes.rows[0].id, display_name, parseInt(age, 10), phone]
    );
    res.json({
      message: 'Step 1 done. Complete face verification.',
      agentId: agentRes.rows[0].id,
      userId: userRes.rows[0].id,
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/register/agent/verify', async (req, res) => {
  try {
    const { email, face_scan_data, verification_photo_url, photo_url, bio } = req.body;
    const user = await query('SELECT id FROM users WHERE email = $1 AND role = $2', [email, 'agent']);
    if (!user.rows[0]) return res.status(404).json({ error: 'Registration not found' });

    await query(
      `UPDATE agents SET face_scan_data = $1, verification_photo_url = $2, bio = $3,
       status = 'pending', display_profile_set = false
       WHERE user_id = $4`,
      [
        JSON.stringify(face_scan_data || []),
        verification_photo_url || photo_url,
        bio || '',
        user.rows[0].id,
      ]
    );

    res.json({
      message:
        'Registration complete! Our host team will verify your face scan and approve you soon. You will be notified.',
      status: 'pending',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Login required' });
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const result = await query(
      'SELECT id, email, role, name, phone, gender, date_of_birth, photo_url, wallet_balance FROM users WHERE id = $1',
      [payload.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user: customerUserPayload(user) });
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });

    const result = await query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    const generic = { message: 'If this email is registered, a reset code has been sent.' };

    if (!result.rows[0]) {
      return res.json(generic);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    await query(
      'UPDATE users SET password_reset_code = $1, password_reset_expires = $2 WHERE id = $3',
      [code, expires, result.rows[0].id]
    );

    res.json({
      ...generic,
      reset_code: code,
      expires_in_minutes: 15,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const { code, password } = req.body;
    if (!email || !code || !password) {
      return res.status(400).json({ error: 'Email, code and new password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const result = await query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid code or email' });

    if (
      !user.password_reset_code ||
      String(user.password_reset_code) !== String(code).trim() ||
      !user.password_reset_expires ||
      new Date(user.password_reset_expires) < new Date()
    ) {
      return res.status(400).json({ error: 'Invalid or expired code — try Forgot Password again' });
    }

    const hash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE users SET password_hash = $1, password_reset_code = NULL, password_reset_expires = NULL WHERE id = $2`,
      [hash, user.id]
    );

    res.json({ message: 'Password changed! Log in with your new password.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
