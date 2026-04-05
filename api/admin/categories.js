'use strict';

/**
 * GET    /api/admin/categories        — список всех категорий
 * POST   /api/admin/categories        — создать категорию { name }
 * PATCH  /api/admin/categories?id=N   — переименовать категорию { name }
 * DELETE /api/admin/categories?id=N   — удалить категорию
 */

const { dbGet, dbPost, dbPatch } = require('../../lib/db');
const { checkAuth } = require('../../lib/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;

  // ── GET: список категорий ──────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const cats = await dbGet('categories?select=id,name&order=id');
      return res.status(200).json(cats);
    } catch (err) {
      console.error('[GET /api/admin/categories]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── POST: создать категорию ────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }
    const { name } = body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name обязателен' });

    try {
      const [cat] = await dbPost('categories', { name: name.trim() });
      return res.status(201).json(cat);
    } catch (err) {
      console.error('[POST /api/admin/categories]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── PATCH: переименовать ───────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id обязателен' });
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }
    const { name } = body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name обязателен' });

    try {
      await dbPatch(`categories?id=eq.${Number(id)}`, { name: name.trim() });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[PATCH /api/admin/categories]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── DELETE: удалить ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id обязателен' });

    try {
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/categories?id=eq.${Number(id)}`,
        {
          method: 'DELETE',
          headers: {
            apikey:        process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[DELETE /api/admin/categories]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).end();
};
