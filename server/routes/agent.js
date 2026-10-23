const express = require('express');
const { query } = require('../db');
const { auth } = require('../middleware/auth');
const { getIo } = require('../socket-io');
const { calcAge, customerDisplayName } = require('../customer-profile');

const router = express.Router();
const PLATFORM_FEE = () => parseFloat(process.env.PLATFORM_FEE_PERCENT || 10);

async function getAgentByUser(userId) {
  const r = await query('SELECT * FROM agents WHERE user_id = $1', [userId]);
  return r.rows[0];
}

function mapCustomerRow(row) {
  const age = calcAge(row.date_of_birth);
  return {
    ...row,
    customer_age: age,
    customer_label: customerDisplayName(row.customer_name || row.name, age, row.gender),
  };
}

router.get('/profile', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Agent profile not found' });
    res.json({
      ...agent,
      audio_rate: parseFloat(agent.audio_rate),
      video_rate: parseFloat(agent.video_rate),
      total_earnings: parseFloat(agent.total_earnings),
      available_balance: parseFloat(agent.available_balance),
      needs_display_profile:
        agent.status === 'approved' && !agent.display_profile_set,
      status_message:
        agent.status === 'pending'
          ? 'Our host team is checking your face verification. You will appear to users after admin approval.'
          : agent.status === 'approved'
            ? 'Approved'
            : 'Rejected',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function updateAgentProfile(req, res) {
  try {
    const agent = await getAgentByUser(req.user.id);
    if (!agent) return res.status(404).json({ error: 'Host profile not found' });

    const { display_name, bio, photo_url, teaching_topics, languages, age } = req.body;
    const ageNum = age != null && age !== '' ? parseInt(age, 10) : agent.age;

    const newPhoto =
      photo_url != null && String(photo_url).trim() ? String(photo_url).trim() : agent.photo_url;
    const newName =
      display_name != null && String(display_name).trim()
        ? String(display_name).trim()
        : agent.display_name;
    const isDefaultPhoto =
      !newPhoto || newPhoto.includes('pravatar.cc') || newPhoto.includes('default-avatar');
    const markDisplayReady =
      agent.status === 'approved' && !isDefaultPhoto && !!newName;

    await query(
      `UPDATE agents SET
        display_name = $1,
        bio = $2,
        photo_url = $3,
        teaching_topics = $4,
        languages = $5,
        age = $6,
        display_profile_set = CASE WHEN $8 THEN true ELSE display_profile_set END
       WHERE id = $7`,
      [
        newName,
        bio != null ? String(bio) : (agent.bio || ''),
        newPhoto,
        teaching_topics != null ? String(teaching_topics) : (agent.teaching_topics || ''),
        languages != null ? String(languages) : (agent.languages || 'Hindi, English'),
        Number.isFinite(ageNum) ? ageNum : agent.age,
        agent.id,
        markDisplayReady,
      ]
    );
    const updated = await getAgentByUser(req.user.id);
    res.json({
      ...updated,
      audio_rate: parseFloat(updated.audio_rate),
      video_rate: parseFloat(updated.video_rate),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

router.patch('/profile', auth('agent'), updateAgentProfile);
router.put('/profile', auth('agent'), updateAgentProfile);

router.get('/recent-contacts', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    const result = await query(
      `SELECT u.id as customer_id, u.name as customer_name, u.email as customer_email,
              MAX(x.ts) as last_contact_at,
              (SELECT body FROM messages m2
               WHERE m2.agent_id = $1 AND m2.customer_id = u.id
               ORDER BY m2.created_at DESC LIMIT 1) as last_message
       FROM (
         SELECT customer_id, created_at as ts FROM messages WHERE agent_id = $1
         UNION ALL
         SELECT customer_id, created_at as ts FROM calls WHERE agent_id = $1
       ) x
       JOIN users u ON u.id = x.customer_id
       GROUP BY u.id, u.name, u.email
       ORDER BY last_contact_at DESC
       LIMIT 9`,
      [agent.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/messages/thread/:customerId', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    const { customerId } = req.params;
    const msgs = await query(
      `SELECT m.*, u.name as customer_name, u.gender, u.date_of_birth, u.photo_url as customer_photo FROM messages m
       JOIN users u ON m.customer_id = u.id
       WHERE m.agent_id = $1 AND m.customer_id = $2
       ORDER BY m.created_at ASC`,
      [agent.id, customerId]
    );
    const user = await query(
      'SELECT id, name, gender, date_of_birth, photo_url FROM users WHERE id = $1',
      [customerId]
    );
    const u = user.rows[0] || {};
    const age = calcAge(u.date_of_birth);
    res.json({
      customer_id: customerId,
      customer_name: u.name || 'User',
      customer_age: age,
      customer_gender: u.gender,
      customer_photo: u.photo_url,
      customer_label: customerDisplayName(u.name, age, u.gender),
      messages: msgs.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/messages/inbox', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    const msgs = await query(
      `SELECT m.*, u.name as customer_name, u.gender, u.date_of_birth, u.photo_url as customer_photo FROM messages m
       JOIN users u ON m.customer_id = u.id
       WHERE m.agent_id = $1 ORDER BY m.created_at ASC LIMIT 500`,
      [agent.id]
    );
    const threads = {};
    msgs.rows.forEach((m) => {
      const cid = m.customer_id;
      if (!threads[cid]) {
        const age = calcAge(m.date_of_birth);
        threads[cid] = {
          customer_id: cid,
          customer_name: m.customer_name,
          customer_age: age,
          customer_gender: m.gender,
          customer_photo: m.customer_photo,
          customer_label: customerDisplayName(m.customer_name, age, m.gender),
          messages: [],
        };
      }
      threads[cid].messages.push(m);
    });
    const list = Object.values(threads).sort(
      (a, b) =>
        new Date(b.messages[b.messages.length - 1].created_at) -
        new Date(a.messages[a.messages.length - 1].created_at)
    );
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/messages/nudge', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    const { customer_id, nudge_type } = req.body;
    const templates = {
      call: '📞 Please call me when you are free!',
      gift: '🎁 Send me a gift please!',
    };
    const body = templates[nudge_type] || req.body.body || 'Hi!';
    const msg = await query(
      `INSERT INTO messages (customer_id, agent_id, sender_role, body, msg_type)
       VALUES ($1, $2, 'agent', $3, 'text') RETURNING *`,
      [customer_id, agent.id, body]
    );
    const io = getIo();
    if (io) {
      io.to(`user:${customer_id}`).emit('message:new', {
        from: agent.display_name,
        body,
        msg_type: 'text',
        vibrate: true,
      });
    }
    res.json(msg.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/online', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    if (agent.status !== 'approved') {
      return res.status(403).json({ error: 'Account not approved yet' });
    }
    if (agent.admin_forced_offline) {
      return res.status(403).json({ error: 'Admin has set you offline' });
    }
    await query('UPDATE agents SET is_online = $1 WHERE user_id = $2', [
      !!req.body.is_online,
      req.user.id,
    ]);
    res.json({ is_online: !!req.body.is_online });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/statement', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    const [calls, msgs, gifts] = await Promise.all([
      query(
        `SELECT c.*, u.name as customer_name, u.email as customer_email,
         EXTRACT(EPOCH FROM (c.ended_at - c.started_at))::int as talk_seconds
         FROM calls c JOIN users u ON c.customer_id = u.id
         WHERE c.agent_id = $1 ORDER BY c.created_at DESC LIMIT 50`,
        [agent.id]
      ),
      query(
        `SELECT m.*, u.name as customer_name FROM messages m
         JOIN users u ON m.customer_id = u.id
         WHERE m.agent_id = $1 ORDER BY m.created_at DESC LIMIT 50`,
        [agent.id]
      ),
      query(
        `SELECT COALESCE(SUM(gist_charge),0) as gift_earnings FROM messages
         WHERE agent_id = $1 AND msg_type = 'gift'`,
        [agent.id]
      ),
    ]);
    res.json({
      total_earnings: parseFloat(agent.total_earnings),
      available_balance: parseFloat(agent.available_balance),
      calls: calls.rows,
      messages: msgs.rows.slice(0, 30),
      gift_count: msgs.rows.filter((m) => m.msg_type === 'gift').length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/messages', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    const msgs = await query(
      `SELECT m.*, u.name as customer_name FROM messages m
       JOIN users u ON m.customer_id = u.id
       WHERE m.agent_id = $1 ORDER BY m.created_at DESC LIMIT 50`,
      [agent.id]
    );
    res.json(msgs.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/messages/reply', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    const { customer_id, body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Message required' });

    const msg = await query(
      `INSERT INTO messages (customer_id, agent_id, sender_role, body, msg_type)
       VALUES ($1, $2, 'agent', $3, 'text') RETURNING *`,
      [customer_id, agent.id, body.trim()]
    );
    const io = getIo();
    if (io) {
      io.to(`user:${customer_id}`).emit('message:new', {
        from: 'Host',
        body: body.trim(),
        msg_type: 'text',
        vibrate: true,
      });
    }

    res.json(msg.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/earnings', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    const calls = await query(
      `SELECT c.*, u.name as customer_name FROM calls c
       JOIN users u ON c.customer_id = u.id
       WHERE c.agent_id = $1 AND c.status = 'ended' ORDER BY c.ended_at DESC LIMIT 50`,
      [agent.id]
    );
    const withdrawals = await query(
      `SELECT * FROM withdrawals WHERE agent_id = $1 ORDER BY created_at DESC`,
      [agent.id]
    );
    res.json({
      total_earnings: parseFloat(agent.total_earnings),
      available_balance: parseFloat(agent.available_balance),
      platform_fee_percent: PLATFORM_FEE(),
      calls: calls.rows,
      withdrawals: withdrawals.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/withdraw', auth('agent'), async (req, res) => {
  try {
    const agent = await getAgentByUser(req.user.id);
    if (agent.status !== 'approved') {
      return res.status(403).json({ error: 'Not approved' });
    }
    const balance = parseFloat(agent.available_balance);
    if (balance < 100) {
      return res.status(400).json({ error: 'Minimum withdrawal ₹100' });
    }

    const feePercent = PLATFORM_FEE();
    const platformFee = Math.round((balance * feePercent) / 100 * 100) / 100;
    const netAmount = Math.round((balance - platformFee) * 100) / 100;
    const now = new Date();
    const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const pending = await query(
      `SELECT id FROM withdrawals WHERE agent_id = $1 AND status = 'pending'`,
      [agent.id]
    );
    if (pending.rows.length > 0) {
      return res.status(400).json({ error: 'You already have a pending withdrawal' });
    }

    await query(
      `INSERT INTO withdrawals (agent_id, gross_amount, platform_fee, net_amount, month_label)
       VALUES ($1, $2, $3, $4, $5)`,
      [agent.id, balance, platformFee, netAmount, monthLabel]
    );
    await query('UPDATE agents SET available_balance = 0 WHERE id = $1', [agent.id]);

    res.json({
      message: 'Withdrawal request submitted',
      gross: balance,
      platform_fee: platformFee,
      net: netAmount,
      month: monthLabel,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
