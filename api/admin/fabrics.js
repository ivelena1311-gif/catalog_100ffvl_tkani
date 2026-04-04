'use strict';

/**
 * GET  /api/admin/fabrics         — все ткани (включая скрытые)
 * POST /api/admin/fabrics         — обновить ткань (id в body)
 * Header: Authorization: Bearer <ADMIN_SECRET>
 */

const { dbGet, dbPatch } = require('../../lib/db');
const { checkAuth } = require('../../lib/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;

  // ── GET: список всех тканей ───────────────────────────────────
  if (req.method === 'GET') {
    try {
      const fabrics = await dbGet(
        'fabrics?select=id,name,article,category_id,base_price,cut_price,' +
        'min_order,step,is_active,categories(name)&order=id'
      );
      return res.status(200).json(fabrics);
    } catch (err) {
      console.error('[GET /api/admin/fabrics]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── POST: обновить поля ткани ─────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }

    const { id, base_price, cut_price, is_active } = body || {};
    if (!id) return res.status(400).json({ error: 'id обязателен' });

    const patch = {};
    if (base_price !== undefined) patch.base_price = parseFloat(base_price);
    if (cut_price  !== undefined) patch.cut_price  = cut_price ? parseFloat(cut_price) : null;
    if (is_active  !== undefined) patch.is_active  = Boolean(is_active);

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'Нет полей для обновления' });
    }

    try {
      await dbPatch(`fabrics?id=eq.${id}`, patch);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[POST /api/admin/fabrics]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).end();
};
