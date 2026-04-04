'use strict';

/**
 * POST   /api/admin/photos        — добавить фото (URL)
 * DELETE /api/admin/photos?id=N   — удалить фото
 */

const { dbPost } = require('../../lib/db');
const { checkAuth } = require('../../lib/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;

  // ── POST: добавить фото ───────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }

    const { fabric_id, url, sort_order } = body || {};
    if (!fabric_id) return res.status(400).json({ error: 'fabric_id обязателен' });
    if (!url || !url.trim()) return res.status(400).json({ error: 'url обязателен' });

    try {
      const [photo] = await dbPost('fabric_photos', {
        fabric_id:  Number(fabric_id),
        url:        url.trim(),
        sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      });
      return res.status(201).json(photo);
    } catch (err) {
      console.error('[POST /api/admin/photos]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── DELETE: удалить фото ──────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id обязателен' });

    try {
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/fabric_photos?id=eq.${Number(id)}`,
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
      console.error('[DELETE /api/admin/photos]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).end();
};
