const { query } = require('./db');
const {
  BILLING_INTERVAL_SEC,
  FREE_FIRST_MINUTE,
  chargeableMinutesFromElapsed,
} = require('./billing-config');

const PLATFORM_FEE = () => parseFloat(process.env.PLATFORM_FEE_PERCENT || 10);
const GIST_CHARGE = 1;

async function chargeMinute(callId, customerId, agentId, rate) {
  const cust = await query('SELECT wallet_balance FROM users WHERE id = $1', [customerId]);
  const balance = parseFloat(cust.rows[0].wallet_balance);
  if (balance < rate) {
    return { ok: false, reason: 'Insufficient balance' };
  }

  const feePct = PLATFORM_FEE();
  const platformFee = Math.round((rate * feePct) / 100 * 100) / 100;
  const agentEarn = Math.round((rate - platformFee) * 100) / 100;

  await query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [rate, customerId]);
  await query(
    `INSERT INTO wallet_transactions (user_id, amount, type, description)
     VALUES ($1, $2, 'call_charge', $3)`,
    [customerId, -rate, `Call charge ₹${rate}/min`]
  );
  await query(
    `UPDATE calls SET duration_seconds = duration_seconds + $1,
     total_charge = total_charge + $2, platform_fee = platform_fee + $3, agent_earning = agent_earning + $4
     WHERE id = $5`,
    [BILLING_INTERVAL_SEC, rate, platformFee, agentEarn, callId]
  );
  await query(
    `UPDATE agents SET total_earnings = total_earnings + $1, available_balance = available_balance + $2 WHERE id = $3`,
    [agentEarn, agentEarn, agentId]
  );

  const updated = await query('SELECT wallet_balance FROM users WHERE id = $1', [customerId]);
  return {
    ok: true,
    charged: rate,
    agentEarn,
    balance: parseFloat(updated.rows[0].wallet_balance),
  };
}

async function settleCallEnd(callId) {
  const c = await query('SELECT * FROM calls WHERE id = $1', [callId]);
  if (!c.rows[0] || !c.rows[0].started_at || c.rows[0].status !== 'active') return null;

  const rate = parseFloat(c.rows[0].rate_per_min);
  const paidPeriods = Math.floor(parseFloat(c.rows[0].duration_seconds || 0) / BILLING_INTERVAL_SEC);
  const elapsedMs = Date.now() - new Date(c.rows[0].started_at).getTime();
  const toBill = chargeableMinutesFromElapsed(elapsedMs, paidPeriods);

  let lastBalance = null;
  for (let i = 0; i < toBill; i++) {
    const r = await chargeMinute(callId, c.rows[0].customer_id, c.rows[0].agent_id, rate);
    if (!r.ok) break;
    lastBalance = r.balance;
  }

  const final = await query(
    `SELECT total_charge, EXTRACT(EPOCH FROM (NOW() - started_at))::int as elapsed FROM calls WHERE id = $1`,
    [callId]
  );
  return {
    totalCharge: parseFloat(final.rows[0]?.total_charge || 0),
    durationSeconds: parseInt(final.rows[0]?.elapsed || 0, 10),
    balance: lastBalance,
    freeMinuteUsed: FREE_FIRST_MINUTE,
  };
}

async function chargeGist(customerId, agentId) {
  const charge = GIST_CHARGE;
  const cust = await query('SELECT wallet_balance FROM users WHERE id = $1', [customerId]);
  if (parseFloat(cust.rows[0].wallet_balance) < charge) {
    return { ok: false, reason: 'Need ₹1 in wallet to send gist' };
  }

  const feePct = PLATFORM_FEE();
  const platformFee = Math.round((charge * feePct) / 100 * 100) / 100;
  const agentEarn = Math.round((charge - platformFee) * 100) / 100;

  await query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [charge, customerId]);
  await query(
    `INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES ($1, $2, 'gist_charge', $3)`,
    [customerId, -charge, 'Gist message ₹1']
  );
  await query(
    `UPDATE agents SET total_earnings = total_earnings + $1, available_balance = available_balance + $2 WHERE id = $3`,
    [agentEarn, agentEarn, agentId]
  );

  const updated = await query('SELECT wallet_balance FROM users WHERE id = $1', [customerId]);
  return { ok: true, charge, agentEarn, balance: parseFloat(updated.rows[0].wallet_balance) };
}

module.exports = {
  chargeMinute,
  settleCallEnd,
  chargeGist,
  PLATFORM_FEE,
  FREE_FIRST_MINUTE,
  GIST_CHARGE,
  BILLING_INTERVAL_SEC,
};
