const { query } = require('./db');

const FREE_TEXT_MSGS = 10;
const TEXT_MSG_COST = 0.1;
const GIFT_COST = 1;
const PLATFORM_FEE = () => parseFloat(process.env.PLATFORM_FEE_PERCENT || 10);

async function countFreeTextUsed(customerId, agentId) {
  const r = await query(
    `SELECT COUNT(*) FROM messages
     WHERE customer_id = $1 AND agent_id = $2 AND sender_role = 'customer'
     AND msg_type = 'text' AND COALESCE(gist_charge, 0) = 0`,
    [customerId, agentId]
  );
  return parseInt(r.rows[0].count, 10);
}

async function creditAgent(agentId, amount, desc) {
  const feePct = PLATFORM_FEE();
  const platformFee = Math.round((amount * feePct) / 100 * 100) / 100;
  const agentEarn = Math.round((amount - platformFee) * 100) / 100;
  await query(
    `UPDATE agents SET total_earnings = total_earnings + $1, available_balance = available_balance + $2 WHERE id = $3`,
    [agentEarn, agentEarn, agentId]
  );
  return { agentEarn, platformFee };
}

async function chargeCustomer(customerId, amount, type, description) {
  const cust = await query('SELECT wallet_balance, is_blocked FROM users WHERE id = $1', [customerId]);
  if (cust.rows[0].is_blocked) return { ok: false, reason: 'Account blocked' };
  if (parseFloat(cust.rows[0].wallet_balance) < amount) {
    return { ok: false, reason: `Need ₹${amount} in wallet` };
  }
  await query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [amount, customerId]);
  await query(
    `INSERT INTO wallet_transactions (user_id, amount, type, description) VALUES ($1, $2, $3, $4)`,
    [customerId, -amount, type, description]
  );
  const updated = await query('SELECT wallet_balance FROM users WHERE id = $1', [customerId]);
  return { ok: true, balance: parseFloat(updated.rows[0].wallet_balance) };
}

async function processMessageCharge(customerId, agentId, msgType) {
  if (msgType === 'gift') {
    const c = await chargeCustomer(customerId, GIFT_COST, 'gift_charge', 'Gift sent ₹1');
    if (!c.ok) return c;
    await creditAgent(agentId, GIFT_COST, 'gift');
    return { ok: true, charge: GIFT_COST, balance: c.balance, free: false };
  }

  if (msgType === 'text') {
    const used = await countFreeTextUsed(customerId, agentId);
    if (used < FREE_TEXT_MSGS) {
      const bal = await query('SELECT wallet_balance FROM users WHERE id = $1', [customerId]);
      return { ok: true, charge: 0, balance: parseFloat(bal.rows[0].wallet_balance), free: true, freeLeft: FREE_TEXT_MSGS - used - 1 };
    }
    const c = await chargeCustomer(customerId, TEXT_MSG_COST, 'msg_charge', 'Message ₹0.1');
    if (!c.ok) return c;
    await creditAgent(agentId, TEXT_MSG_COST, 'message');
    return { ok: true, charge: TEXT_MSG_COST, balance: c.balance, free: false };
  }

  return { ok: true, charge: 0, balance: null, free: true };
}

module.exports = {
  processMessageCharge,
  FREE_TEXT_MSGS,
  TEXT_MSG_COST,
  GIFT_COST,
};
