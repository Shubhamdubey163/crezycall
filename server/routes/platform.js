const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/features/:portal', async (req, res) => {
  try {
    const portal = req.params.portal;
    if (!['user', 'host'].includes(portal)) {
      return res.status(400).json({ error: 'portal must be user or host' });
    }
    const col = portal === 'user' ? 'user_enabled' : 'host_enabled';
    const rows = await query(`SELECT feature_key, label, ${col} as enabled FROM platform_features ORDER BY feature_key`);
    const features = {};
    rows.rows.forEach((r) => {
      features[r.feature_key] = r.enabled;
    });
    res.json({ portal, features });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
