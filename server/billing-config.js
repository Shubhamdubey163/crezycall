/** Billing timing — use short intervals in demo for live testing */
const BILLING_INTERVAL_MS = parseInt(process.env.BILLING_INTERVAL_MS || '60000', 10);
const FREE_PERIOD_MS = parseInt(
  process.env.FREE_PERIOD_MS || (process.env.DEMO_BILLING_FAST === 'true' ? '20000' : '60000'),
  10
);
const FREE_FIRST_MINUTE = process.env.FREE_FIRST_MINUTE !== 'false';
const BILLING_INTERVAL_SEC = Math.max(5, Math.round(BILLING_INTERVAL_MS / 1000));

function chargeableMinutesFromElapsed(elapsedMs, paidPeriods) {
  const totalPeriods = Math.ceil(elapsedMs / BILLING_INTERVAL_MS);
  const freePeriods = FREE_FIRST_MINUTE ? Math.round(FREE_PERIOD_MS / BILLING_INTERVAL_MS) : 0;
  const shouldCharge = Math.max(0, totalPeriods - freePeriods);
  return Math.max(0, shouldCharge - paidPeriods);
}

module.exports = {
  BILLING_INTERVAL_MS,
  FREE_PERIOD_MS,
  FREE_FIRST_MINUTE,
  BILLING_INTERVAL_SEC,
  chargeableMinutesFromElapsed,
};
