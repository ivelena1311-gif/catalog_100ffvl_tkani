'use strict';

/**
 * GET  /api/user-state?tg_user_id=X  — загрузить корзину, образцы и избранное
 * POST /api/user-state               — сохранить { tg_user_id, cart, samples, favorites }
 */

const { dbGet } = require('../lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { tg_user_id } = req.query;
    if (!tg_user_id) return res.status(400).json({ error: 'tg_user_id обязателен' });
    try {
      const rows = await dbGet(`user_state?tg_user_id=eq.${encodeURIComponent(tg_user_id)}&limit=1`);
      if (rows.length === 0) return res.status(200).json({ cart: [], samples: [], favorites: [] });
      return res.status(200).json({
        cart:      rows[0].cart      || [],
        samples:   rows[0].samples   || [],
        favorites: rows[0].favorites || [],
      });
    } catch (err) {
      console.error('[GET /api/user-state]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { return res.status(400).json({ error: 'Некорректный JSON' }); }

    const { tg_user_id, cart, samples, favorites } = body || {};
    if (!tg_user_id) return res.status(400).json({ error: 'tg_user_id обязателен' });

    try {
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/user_state`, {
        method: 'POST',
        headers: {
          apikey:          process.env.SUPABASE_SERVICE_KEY,
          Authorization:  `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer:         'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          tg_user_id: Number(tg_user_id),
          cart:       Array.isArray(cart)      ? cart      : [],
          samples:    Array.isArray(samples) ? samples : [],
          favorites:  Array.isArray(favorites) ? favorites : [],
          updated_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supabase upsert ${response.status}: ${text}`);
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[POST /api/user-state]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
};
