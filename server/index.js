require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { query } = require('./db');
const { chargeMinute, settleCallEnd, BILLING_INTERVAL_SEC } = require('./call-billing');
const { BILLING_INTERVAL_MS, FREE_PERIOD_MS } = require('./billing-config');

const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customer');
const agentRoutes = require('./routes/agent');
const adminRoutes = require('./routes/admin');
const superAdminRoutes = require('./routes/super-admin');
const platformRoutes = require('./routes/platform');

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowUpgrades: true,
  maxHttpBufferSize: 1e7,
});

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use((req, res, next) => {
  // Allow mic/camera for WebRTC on mobile browsers
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self)');
  res.setHeader('Feature-Policy', "camera 'self'; microphone 'self'");
  next();
});
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/platform', platformRoutes);

app.get('/customer', (_, res) => res.sendFile(path.join(__dirname, '../public/customer/index.html')));
app.get('/agent', (_, res) => res.sendFile(path.join(__dirname, '../public/agent/index.html')));
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('/', (_, res) => res.redirect('/customer'));

const { setIo } = require('./socket-io');
const { ensureSchema } = require('./ensure-schema');
const { calcAge } = require('./customer-profile');
const activeCalls = new Map();

setIo(io);

ensureSchema().catch((e) => console.error('Schema check:', e.message));

function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Auth required'));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
}

io.use(socketAuth);

io.on('connection', async (socket) => {
  socket.join(`user:${socket.user.id}`);

  if (socket.user.role === 'agent') {
    const ag = await query('SELECT id FROM agents WHERE user_id = $1', [socket.user.id]);
    if (ag.rows[0]) {
      socket.agentId = ag.rows[0].id;
      socket.join(`agent:${ag.rows[0].id}`);
    }
  }

  socket.on('call:request', async ({ agentId, callType }) => {
    try {
      if (socket.user.role !== 'customer') return socket.emit('call:error', { error: 'Only customers can call' });

      const customer = await query('SELECT wallet_balance FROM users WHERE id = $1', [socket.user.id]);
      const agent = await query(
        `SELECT * FROM agents WHERE id = $1 AND status = 'approved' AND is_online = true`,
        [agentId]
      );
      if (!agent.rows[0]) return socket.emit('call:error', { error: 'Agent not available' });

      const rate =
        callType === 'video'
          ? parseFloat(agent.rows[0].video_rate)
          : parseFloat(agent.rows[0].audio_rate);

      if (parseFloat(customer.rows[0].wallet_balance) < rate) {
        return socket.emit('call:error', { error: `Need at least ₹${rate} in wallet` });
      }

      const callRes = await query(
        `INSERT INTO calls (customer_id, agent_id, call_type, rate_per_min, status)
         VALUES ($1, $2, $3, $4, 'ringing') RETURNING *`,
        [socket.user.id, agentId, callType, rate]
      );
      const call = callRes.rows[0];

      const cust = await query(
        'SELECT name, gender, date_of_birth, photo_url FROM users WHERE id = $1',
        [socket.user.id]
      );
      const cu = cust.rows[0] || {};
      const customerAge = calcAge(cu.date_of_birth);

      io.to(`agent:${agentId}`).emit('call:incoming', {
        callId: call.id,
        customerName: cu.name || socket.user.name,
        customerAge,
        customerGender: cu.gender,
        customerPhoto: cu.photo_url,
        callType,
        rate,
        ring: true,
      });
      socket.emit('call:ringing', { callId: call.id, rate, callType });
    } catch (e) {
      socket.emit('call:error', { error: e.message });
    }
  });

  socket.on('call:accept', async ({ callId }) => {
    try {
      const call = await query('SELECT * FROM calls WHERE id = $1', [callId]);
      if (!call.rows[0] || call.rows[0].status !== 'ringing') return;

      const agent = await query('SELECT user_id FROM agents WHERE id = $1', [call.rows[0].agent_id]);
      if (agent.rows[0].user_id !== socket.user.id) return;

      await query(`UPDATE calls SET status = 'active', started_at = NOW() WHERE id = $1`, [callId]);

      const c = call.rows[0];
      const rate = parseFloat(c.rate_per_min);

      const custBal = await query('SELECT wallet_balance FROM users WHERE id = $1', [c.customer_id]);
      if (parseFloat(custBal.rows[0].wallet_balance) < rate) {
        await query(`UPDATE calls SET status = 'ended', ended_at = NOW() WHERE id = $1`, [callId]);
        io.to(`user:${c.customer_id}`).emit('call:ended', {
          callId,
          reason: `Need ₹${rate} after free 1st minute`,
        });
        return;
      }

      const billing = setInterval(async () => {
        try {
          const row = await query('SELECT * FROM calls WHERE id = $1', [callId]);
          if (!row.rows[0] || row.rows[0].status !== 'active') {
            clearInterval(billing);
            return;
          }
          const r = await chargeMinute(
            callId,
            row.rows[0].customer_id,
            row.rows[0].agent_id,
            parseFloat(row.rows[0].rate_per_min)
          );
          if (!r.ok) {
            await endCall(callId, 'Insufficient balance');
            return;
          }
          io.to(`user:${row.rows[0].customer_id}`).emit('call:tick', {
            callId,
            charged: r.charged,
            balance: r.balance,
            billingIntervalSec: BILLING_INTERVAL_SEC,
          });
          io.to(`agent:${row.rows[0].agent_id}`).emit('call:tick', {
            callId,
            earned: r.agentEarn,
            billingIntervalSec: BILLING_INTERVAL_SEC,
          });
        } catch (err) {
          console.error('Billing error:', err);
        }
      }, BILLING_INTERVAL_MS);

      activeCalls.set(callId, {
        billing,
        customerId: c.customer_id,
        agentId: c.agent_id,
        callType: c.call_type,
        rate,
      });

      const bal = parseFloat(custBal.rows[0].wallet_balance);
      const payload = {
        callId,
        callType: c.call_type,
        rate,
        balance: bal,
        charged: 0,
        freeMinute: true,
        billingIntervalSec: BILLING_INTERVAL_SEC,
        freePeriodSec: Math.round(FREE_PERIOD_MS / 1000),
      };
      io.to(`user:${c.customer_id}`).emit('call:started', payload);
      socket.emit('call:started', payload);
    } catch (e) {
      socket.emit('call:error', { error: e.message });
    }
  });

  socket.on('call:reject', async ({ callId }) => {
    await query(`UPDATE calls SET status = 'missed', ended_at = NOW() WHERE id = $1 AND status = 'ringing'`, [
      callId,
    ]);
    const call = await query('SELECT customer_id FROM calls WHERE id = $1', [callId]);
    if (call.rows[0]) {
      io.to(`user:${call.rows[0].customer_id}`).emit('call:ended', {
        callId,
        reason: 'Host ne call reject kar di',
        vibrate: true,
      });
    }
  });

  socket.on('call:end', async ({ callId }) => {
    await endCall(callId, 'ended');
  });

  async function endCall(callId, reason) {
    const session = activeCalls.get(callId);
    if (session) {
      clearInterval(session.billing);
      activeCalls.delete(callId);
    }

    const settlement = await settleCallEnd(callId);
    await query(`UPDATE calls SET status = 'ended', ended_at = NOW() WHERE id = $1`, [callId]);

    const call = await query(
      `SELECT customer_id, agent_id, total_charge,
       EXTRACT(EPOCH FROM (ended_at - started_at))::int as duration_seconds
       FROM calls WHERE id = $1`,
      [callId]
    );
    if (call.rows[0]) {
      const summary = {
        callId,
        reason,
        totalCharge: parseFloat(call.rows[0].total_charge || 0),
        durationSeconds: call.rows[0].duration_seconds || 0,
        balance: settlement?.balance,
        vibrate: true,
        message:
          reason === 'ended'
            ? `Call khatam · ₹${parseFloat(call.rows[0].total_charge || 0).toFixed(0)} charge`
            : reason === 'Insufficient balance'
              ? 'Balance kam — call band'
              : 'Call disconnect',
      };
      io.to(`user:${call.rows[0].customer_id}`).emit('call:ended', summary);
      io.to(`agent:${call.rows[0].agent_id}`).emit('call:ended', summary);
    }
  }

  socket.on('webrtc:signal', ({ callId, signal, toRole }) => {
    query('SELECT customer_id, agent_id FROM calls WHERE id = $1', [callId]).then((r) => {
      if (!r.rows[0]) return;
      const target =
        toRole === 'agent'
          ? `agent:${r.rows[0].agent_id}`
          : `user:${r.rows[0].customer_id}`;
      io.to(target).emit('webrtc:signal', { callId, signal, from: socket.user.id });
    });
  });

  socket.on('disconnect', async () => {
    for (const [callId, session] of activeCalls.entries()) {
      if (session.customerId === socket.user.id || socket.agentId === session.agentId) {
        await endCall(callId, 'disconnected');
      }
    }
  });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload too large — use a smaller photo' });
  }
  next(err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  Crezycall is running!

  Customer: http://localhost:${PORT}/customer
  Host:     http://localhost:${PORT}/agent
  Admin:    http://localhost:${PORT}/admin
  `);
});
