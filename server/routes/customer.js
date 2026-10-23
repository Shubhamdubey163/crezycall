const express = require('express');
const { query } = require('../db');
const { auth } = require('../middleware/auth');
const { getIo } = require('../socket-io');
const { FREE_FIRST_MINUTE } = require('../call-billing');
const { processMessageCharge, FREE_TEXT_MSGS, TEXT_MSG_COST, GIFT_COST } = require('../message-billing');
const { calcAge, customerDisplayName } = require('../customer-profile');
const { DEPOSIT_OFFERS, getOffer } = require('../deposit-offers');

const router = express.Router();

function mapAgentRow(r, { newAgentIds = [], followIds = [] } = {}) {
  const joined = r.approved_at || r.created_at;
  return {
    ...r,
    audio_rate: parseFloat(r.audio_rate),
    video_rate: parseFloat(r.video_rate),
    min_rate: Math.min(parseFloat(r.audio_rate), parseFloat(r.video_rate)),
    is_online: !!r.is_online,
    is_busy: !!r.is_busy,
    is_new: newAgentIds.includes(r.id),
    is_followed: followIds.includes(r.id),
    last_contact_at: r.last_contact_at || null,
    joined_at: joined,
  };
}

function formatCallStatement(c) {
  const secs = c.talk_seconds || c.duration_seconds || 0;
  const mins = Math.max(1, Math.ceil(secs / 60));
  const rate = parseFloat(c.rate_per_min || 0);
  const charge = parseFloat(c.total_charge || 0);
  const type = c.call_type === 'video' ? 'Video' : 'Audio';
  return `${c.agent_name} — ${type} ${mins} min @ ₹${rate.toFixed(0)}/min = ₹${charge.toFixed(0)} charged`;
}

router.get('/deposit-offers', auth('customer'), (req, res) => {
  res.json(DEPOSIT_OFFERS);
});

router.get('/profile', auth('customer'), async (req, res) => {
  try {
    const r = await query(
      'SELECT id, email, name, phone, gender, date_of_birth, wallet_balance, photo_url FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'User not found' });
    const u = r.rows[0];
    res.json({
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      gender: u.gender,
      date_of_birth: u.date_of_birth,
      age: calcAge(u.date_of_birth),
      wallet_balance: parseFloat(u.wallet_balance),
      photo_url: u.photo_url || 'https://i.pravatar.cc/150?img=5',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/profile', auth('customer'), async (req, res) => {
  try {
    const { name, photo_url, phone, gender, date_of_birth } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    if (date_of_birth) {
      const age = calcAge(date_of_birth);
      if (age == null || age < 18) return res.status(400).json({ error: 'You must be 18 or older' });
    }
    await query(
      `UPDATE users SET name = $1, photo_url = COALESCE($2, photo_url), phone = COALESCE($3, phone),
       gender = COALESCE($4, gender), date_of_birth = COALESCE($5, date_of_birth) WHERE id = $6`,
      [name.trim(), photo_url || null, phone || null, gender || null, date_of_birth || null, req.user.id]
    );
    const r = await query(
      'SELECT id, email, name, phone, gender, date_of_birth, wallet_balance, photo_url FROM users WHERE id = $1',
      [req.user.id]
    );
    const u = r.rows[0];
    res.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        gender: u.gender,
        date_of_birth: u.date_of_birth,
        age: calcAge(u.date_of_birth),
        role: 'customer',
        wallet_balance: parseFloat(u.wallet_balance),
        photo_url: u.photo_url,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/change-password', auth('customer'), async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Enter current and new password' });
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const r = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(current_password, r.rows[0].password_hash))) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/disable-account', auth('customer'), async (req, res) => {
  try {
    await query('UPDATE users SET account_disabled = true WHERE id = $1', [req.user.id]);
    res.json({ message: 'Account disabled — contact support to re-enable' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/account', auth('customer'), async (req, res) => {
  try {
    const { password } = req.body;
    const bcrypt = require('bcryptjs');
    const r = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!password || !(await bcrypt.compare(password, r.rows[0].password_hash))) {
      return res.status(400).json({ error: 'Confirm your password' });
    }
    await query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ message: 'Account permanently deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/follows', auth('customer'), async (req, res) => {
  try {
    const rows = await query(
      `SELECT cf.agent_id, a.display_name, a.photo_url, a.is_online
       FROM customer_follows cf
       JOIN agents a ON a.id = cf.agent_id
       WHERE cf.customer_id = $1 AND a.status = 'approved'
       ORDER BY cf.created_at DESC`,
      [req.user.id]
    );
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/follows/:agentId', auth('customer'), async (req, res) => {
  try {
    const ag = await query(`SELECT id FROM agents WHERE id = $1 AND status = 'approved'`, [req.params.agentId]);
    if (!ag.rows[0]) return res.status(404).json({ error: 'Host not found' });
    await query(
      `INSERT INTO customer_follows (customer_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.id, req.params.agentId]
    );
    res.json({ message: 'Following' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/follows/:agentId', auth('customer'), async (req, res) => {
  try {
    await query('DELETE FROM customer_follows WHERE customer_id = $1 AND agent_id = $2', [
      req.user.id,
      req.params.agentId,
    ]);
    res.json({ message: 'Unfollowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/blocks', auth('customer'), async (req, res) => {
  try {
    const rows = await query(
      `SELECT cb.agent_id, cb.reason, cb.created_at, a.display_name, a.photo_url
       FROM customer_blocks cb
       JOIN agents a ON a.id = cb.agent_id
       WHERE cb.customer_id = $1 ORDER BY cb.created_at DESC`,
      [req.user.id]
    );
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/blocks/:agentId', auth('customer'), async (req, res) => {
  try {
    const reason = (req.body.reason || '').trim() || null;
    await query(
      `INSERT INTO customer_blocks (customer_id, agent_id, reason) VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, agent_id) DO UPDATE SET reason = EXCLUDED.reason`,
      [req.user.id, req.params.agentId, reason]
    );
    await query('DELETE FROM customer_follows WHERE customer_id = $1 AND agent_id = $2', [
      req.user.id,
      req.params.agentId,
    ]);
    res.json({ message: 'Host blocked' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/blocks/:agentId', auth('customer'), async (req, res) => {
  try {
    await query('DELETE FROM customer_blocks WHERE customer_id = $1 AND agent_id = $2', [
      req.user.id,
      req.params.agentId,
    ]);
    res.json({ message: 'Unblocked' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agents', auth('customer'), async (req, res) => {
  try {
    const sort = req.query.sort || 'default';
    const search = (req.query.search || '').trim().toLowerCase();
    const lang = (req.query.lang || '').trim();

    const [followRes, blockRes] = await Promise.all([
      query('SELECT agent_id FROM customer_follows WHERE customer_id = $1', [req.user.id]),
      query('SELECT agent_id FROM customer_blocks WHERE customer_id = $1', [req.user.id]),
    ]);
    const followIds = followRes.rows.map((r) => r.agent_id);
    const blockIds = new Set(blockRes.rows.map((r) => r.agent_id));

    const result = await query(
      `SELECT a.id, a.display_name, a.age, a.photo_url, a.bio, a.audio_rate, a.video_rate,
              a.is_online, a.approved_at, a.created_at,
              LEAST(a.audio_rate, a.video_rate) as min_rate,
              EXISTS (
                SELECT 1 FROM calls c
                WHERE c.agent_id = a.id AND c.status IN ('ringing', 'active')
              ) as is_busy,
              recent.last_contact_at
       FROM agents a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT MAX(ts) as last_contact_at FROM (
           SELECT created_at as ts FROM messages
           WHERE customer_id = $1 AND agent_id = a.id
           UNION ALL
           SELECT created_at FROM calls
           WHERE customer_id = $1 AND agent_id = a.id
         ) t
       ) recent ON true
       WHERE a.status = 'approved' AND a.admin_forced_offline = false
       AND u.is_blocked = false`,
      [req.user.id]
    );

    let agents = result.rows.filter((r) => !blockIds.has(r.id));

    const newAgentIds = [...agents]
      .sort((a, b) => new Date(b.approved_at || b.created_at) - new Date(a.approved_at || a.created_at))
      .slice(0, 3)
      .map((a) => a.id);

    agents = agents.map((r) => mapAgentRow(r, { newAgentIds, followIds }));

    if (search) {
      agents = agents.filter(
        (a) =>
          a.display_name?.toLowerCase().includes(search) ||
          String(a.id).toLowerCase().includes(search)
      );
    }
    if (lang) {
      agents = agents.filter((a) => (a.languages || '').toLowerCase().includes(lang.toLowerCase()));
    }

    const recentIds = [...agents]
      .filter((a) => a.last_contact_at)
      .sort((a, b) => new Date(b.last_contact_at) - new Date(a.last_contact_at))
      .slice(0, 10)
      .map((a) => a.id);

    if (sort === 'price_low') {
      agents.sort((a, b) => a.min_rate - b.min_rate || a.display_name.localeCompare(b.display_name));
    } else if (sort === 'price_high') {
      agents.sort((a, b) => b.min_rate - a.min_rate || a.display_name.localeCompare(b.display_name));
    } else {
      agents.sort((a, b) => {
        const aRecent = recentIds.indexOf(a.id);
        const bRecent = recentIds.indexOf(b.id);
        if (aRecent >= 0 && bRecent < 0) return -1;
        if (bRecent >= 0 && aRecent < 0) return 1;
        if (aRecent >= 0 && bRecent >= 0) return aRecent - bRecent;
        if (a.is_online !== b.is_online) return (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0);
        return a.display_name.localeCompare(b.display_name);
      });
    }

    res.json({ agents, recent_ids: recentIds, follow_ids: followIds, new_agent_ids: newAgentIds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/statement', auth('customer'), async (req, res) => {
  try {
    const [tx, calls, msgs] = await Promise.all([
      query(
        `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.user.id]
      ),
      query(
        `SELECT c.*, a.display_name as agent_name,
         EXTRACT(EPOCH FROM (c.ended_at - c.started_at))::int as talk_seconds
         FROM calls c JOIN agents a ON c.agent_id = a.id
         WHERE c.customer_id = $1 ORDER BY c.created_at DESC LIMIT 30`,
        [req.user.id]
      ),
      query(
        `SELECT m.*, a.display_name FROM messages m
         JOIN agents a ON m.agent_id = a.id
         WHERE m.customer_id = $1 AND m.sender_role = 'customer' ORDER BY m.created_at DESC LIMIT 30`,
        [req.user.id]
      ),
    ]);
    const bal = await query('SELECT wallet_balance FROM users WHERE id = $1', [req.user.id]);
    res.json({
      balance: parseFloat(bal.rows[0].wallet_balance),
      transactions: tx.rows,
      calls: calls.rows.map((c) => ({
        ...c,
        statement_line: formatCallStatement(c),
      })),
      messages: msgs.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/wallet', auth('customer'), async (req, res) => {
  try {
    const user = await query('SELECT wallet_balance FROM users WHERE id = $1', [req.user.id]);
    const tx = await query(
      `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({
      balance: parseFloat(user.rows[0].wallet_balance),
      transactions: tx.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/recharge', auth('customer'), async (req, res) => {
  try {
    let credit = 0;
    let desc = '';

    if (req.body.offer_id) {
      const offer = getOffer(req.body.offer_id);
      if (!offer) return res.status(400).json({ error: 'Invalid offer' });
      credit = offer.credit;
      desc = `Deposit ₹${offer.pay} + ₹${offer.bonus} bonus → ₹${offer.credit} coins`;
    } else {
      const amount = parseFloat(req.body.amount);
      if (!amount || amount < 10) return res.status(400).json({ error: 'Minimum recharge ₹10' });
      credit = amount;
      desc = `Wallet recharge ₹${amount}`;
    }

    await query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [
      credit,
      req.user.id,
    ]);
    await query(
      `INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES ($1, $2, 'recharge', $3)`,
      [req.user.id, credit, desc]
    );
    const user = await query('SELECT wallet_balance FROM users WHERE id = $1', [req.user.id]);
    res.json({ balance: parseFloat(user.rows[0].wallet_balance), message: `₹${credit} coins added!` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agents/:id', auth('customer'), async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, u.name as host_name FROM agents a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = $1 AND a.status = 'approved' AND u.is_blocked = false`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Host not found' });
    const a = result.rows[0];

    const textCount = await query(
      `SELECT COUNT(*) FROM messages WHERE customer_id = $1 AND agent_id = $2
       AND sender_role = 'customer' AND msg_type = 'text' AND COALESCE(gist_charge,0)=0`,
      [req.user.id, req.params.id]
    );

    res.json({
      id: a.id,
      display_name: a.display_name,
      age: a.age,
      photo_url: a.photo_url,
      bio: a.bio || 'Friendly host ready to chat and guide you.',
      audio_rate: parseFloat(a.audio_rate),
      video_rate: parseFloat(a.video_rate),
      is_online: a.is_online && !a.admin_forced_offline,
      teaching_topics: a.teaching_topics || 'Chat, Advice, Fun conversations',
      languages: a.languages || 'Hindi, English',
      experience_years: a.experience_years || 1,
      free_first_minute: FREE_FIRST_MINUTE,
      free_text_left: Math.max(0, FREE_TEXT_MSGS - parseInt(textCount.rows[0].count, 10)),
      text_msg_cost: TEXT_MSG_COST,
      gift_cost: GIFT_COST,
      gifts: ['❤️', '💕', '😍', '🥰', '💖', '💗', '💝', '🔥', '✨', '🌹'],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agents/:id/timeline', auth('customer'), async (req, res) => {
  try {
    const [msgs, calls] = await Promise.all([
      query(
        `SELECT id, body, sender_role, msg_type, gift_emoji, gist_charge, created_at, 'message' as item_type
         FROM messages WHERE customer_id = $1 AND agent_id = $2 ORDER BY created_at ASC`,
        [req.user.id, req.params.id]
      ),
      query(
        `SELECT id, call_type, status, rate_per_min, total_charge,
         EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - COALESCE(started_at, created_at)))::int as talk_seconds,
         created_at, 'call' as item_type
         FROM calls WHERE customer_id = $1 AND agent_id = $2 AND status IN ('ended', 'active', 'missed')
         ORDER BY created_at ASC`,
        [req.user.id, req.params.id]
      ),
    ]);
    const items = [
      ...msgs.rows.map((m) => ({
        item_type: 'message',
        id: m.id,
        body: m.body,
        sender_role: m.sender_role,
        msg_type: m.msg_type,
        gist_charge: m.gist_charge,
        created_at: m.created_at,
      })),
      ...calls.rows.map((c) => {
        const secs = c.talk_seconds || 0;
        const mins = Math.max(1, Math.ceil(secs / 60));
        const rate = parseFloat(c.rate_per_min || 0);
        const charge = parseFloat(c.total_charge || 0);
        const typeLabel = c.call_type === 'video' ? 'Video call' : 'Voice call';
        let body = `${typeLabel} · ${c.status}`;
        if (c.status === 'ended' && charge > 0) {
          body = `${typeLabel} · ${mins} min @ ₹${rate.toFixed(0)}/min · ₹${charge.toFixed(0)} charged`;
        } else if (c.status === 'missed') {
          body = `${typeLabel} · missed`;
        }
        return {
          item_type: 'call',
          id: c.id,
          body,
          call_type: c.call_type,
          status: c.status,
          sender_role: 'system',
          created_at: c.created_at,
        };
      }),
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/agents/:id/messages', auth('customer'), async (req, res) => {
  try {
    const msgs = await query(
      `SELECT * FROM messages WHERE customer_id = $1 AND agent_id = $2 ORDER BY created_at ASC LIMIT 100`,
      [req.user.id, req.params.id]
    );
    res.json(msgs.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/agents/:id/messages', auth('customer'), async (req, res) => {
  try {
    const { body, msg_type, gift_emoji } = req.body;
    const type = msg_type || 'text';
    const agent = await query(`SELECT id FROM agents WHERE id = $1 AND status = 'approved'`, [
      req.params.id,
    ]);
    if (!agent.rows[0]) return res.status(404).json({ error: 'Host not found' });

    let displayBody = body?.trim() || '';
    if (type === 'gift') {
      if (!gift_emoji) return res.status(400).json({ error: 'Select a gift' });
      displayBody = gift_emoji;
    }
    if (!displayBody) return res.status(400).json({ error: 'Message required' });

    const bill = await processMessageCharge(req.user.id, req.params.id, type);
    if (!bill.ok) return res.status(400).json({ error: bill.reason });

    const msg = await query(
      `INSERT INTO messages (customer_id, agent_id, sender_role, body, msg_type, gift_emoji, gist_charge, is_gist)
       VALUES ($1, $2, 'customer', $3, $4, $5, $6, false) RETURNING *`,
      [req.user.id, req.params.id, displayBody, type, gift_emoji || null, bill.charge || 0]
    );

    const io = getIo();
    if (io) {
      io.to(`agent:${req.params.id}`).emit('message:new', {
        from: req.user.name,
        body: displayBody,
        msg_type: type,
        vibrate: true,
      });
    }

    res.json({
      message: msg.rows[0],
      balance: bill.balance,
      charge: bill.charge,
      free: bill.free,
      freeLeft: bill.freeLeft,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/chats', auth('customer'), async (req, res) => {
  try {
    const rows = await query(
      `WITH threads AS (
         SELECT agent_id, MAX(created_at) as last_at FROM (
           SELECT agent_id, created_at FROM messages WHERE customer_id = $1
           UNION ALL
           SELECT agent_id, created_at FROM calls WHERE customer_id = $1
         ) t GROUP BY agent_id
       )
       SELECT a.id as agent_id, a.display_name, a.photo_url, a.is_online,
              COALESCE(lm.body, lc.preview) as last_message,
              th.last_at, COALESCE(lm.sender_role, 'system') as sender_role,
              COALESCE(lm.msg_type, lc.item_type) as last_type
       FROM threads th
       JOIN agents a ON a.id = th.agent_id
       LEFT JOIN LATERAL (
         SELECT body, sender_role, msg_type FROM messages
         WHERE customer_id = $1 AND agent_id = th.agent_id
         ORDER BY created_at DESC LIMIT 1
       ) lm ON true
       LEFT JOIN LATERAL (
         SELECT
           CASE
             WHEN c.status = 'ended' THEN
               (CASE WHEN c.call_type = 'video' THEN 'Video call' ELSE 'Voice call' END)
               || ' · ₹' || COALESCE(c.total_charge, 0)::text
             WHEN c.status = 'missed' THEN
               (CASE WHEN c.call_type = 'video' THEN 'Missed video' ELSE 'Missed voice' END)
             ELSE 'Call'
           END as preview,
           'call' as item_type
         FROM calls c
         WHERE c.customer_id = $1 AND c.agent_id = th.agent_id
         ORDER BY c.created_at DESC LIMIT 1
       ) lc ON lm.body IS NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM customer_blocks cb WHERE cb.customer_id = $1 AND cb.agent_id = a.id
       )
       ORDER BY th.last_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/calls', auth('customer'), async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, a.display_name as agent_name
       FROM calls c JOIN agents a ON c.agent_id = a.id
       WHERE c.customer_id = $1 ORDER BY c.created_at DESC LIMIT 30`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
