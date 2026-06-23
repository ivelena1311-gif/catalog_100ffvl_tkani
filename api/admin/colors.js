'use strict';

/**
 * POST   /api/admin/colors        — добавить цвет
 * DELETE /api/admin/colors?id=N   — удалить цвет
 */

const { dbGet, dbPost, dbPatch } = require('../../lib/db');
const { checkAuth } = require('../../lib/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;

  // ── POST: добавить цвет ───────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }

    const { fabric_id, hex, name } = body || {};
    if (!fabric_id) return res.status(400).json({ error: 'fabric_id обязателен' });
    if (!hex)       return res.status(400).json({ error: 'hex обязателен' });
    if (!name)      return res.status(400).json({ error: 'name обязателен' });

    try {
      const [color] = await dbPost('fabric_colors', {
        fabric_id: Number(fabric_id),
        hex:  hex.trim(),
        name: name.trim(),
      });
      return res.status(201).json(color);
    } catch (err) {
      console.error('[POST /api/admin/colors]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── PATCH: переключить активность цвета ──────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id обязателен' });

    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }

    const { is_active } = body || {};
    if (is_active === undefined) return res.status(400).json({ error: 'is_active обязателен' });

    try {
      const [color] = await dbPatch(`fabric_colors?id=eq.${Number(id)}`, { is_active: Boolean(is_active) });
      return res.status(200).json(color);
    } catch (err) {
      console.error('[PATCH /api/admin/colors]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE: удалить цвет ──────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id обязателен' });

    try {
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/fabric_colors?id=eq.${Number(id)}`,
        {
          method: 'DELETE',
          headers: {
            apikey:         process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[DELETE /api/admin/colors]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).end();
};
