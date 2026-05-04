'use strict';

/**
 * GET    /api/admin/categories        — список всех категорий
 * POST   /api/admin/categories        — создать категорию { name }
 * PATCH  /api/admin/categories?id=N   — переименовать категорию { name }
 * DELETE /api/admin/categories?id=N   — удалить категорию
 *
 * GET    /api/admin/banners           → routed here via vercel.json + ?_banners=1
 * POST   /api/admin/banners           → same
 * PATCH  /api/admin/banners?id=N      → same
 * PATCH  /api/admin/banners?setting=K → same
 * DELETE /api/admin/banners?id=N      → same
 */

const { dbGet, dbPost, dbPatch } = require('../../lib/db');
const { checkAuth }              = require('../../lib/admin-auth');

const BANNER_FIELDS = [
  'title','subtitle','label','image_url','gradient',
  'action_type','action_value','is_active','sort_order',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req, res)) return;

  // ── /api/admin/banners → rewritten here with ?_banners=1 ─────────
  if (req.query._banners === '1') return handleBanners(req, res);

  // ── GET: список категорий ──────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const cats = await dbGet('categories?select=id,name&order=id');
      return res.status(200).json(cats);
    } catch (err) {
      console.error('[GET /api/admin/categories]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── POST: создать категорию ────────────────────────────────────────
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

  // ── PATCH: переименовать ───────────────────────────────────────────
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

  // ── DELETE: удалить ───────────────────────────────────────────────
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

// ── Banner handler (routed from /api/admin/banners) ─────────────────
async function handleBanners(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (req.method === 'GET') {
    try {
      const [banners, settings] = await Promise.all([
        dbGet('banners?select=*&order=sort_order'),
        dbGet('settings?select=key,value&key=in.(banner_max_visible,banner_interval_ms)'),
      ]);
      return res.status(200).json({ banners, settings });
    } catch (err) {
      console.error('[GET /api/admin/banners]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }
    if (!body?.title?.trim()) return res.status(400).json({ error: 'title обязателен' });

    const row = {
      title:        body.title.trim(),
      subtitle:     body.subtitle?.trim()     || null,
      label:        body.label?.trim()        || null,
      image_url:    body.image_url?.trim()    || null,
      gradient:     body.gradient?.trim()     || 'linear-gradient(135deg,#1a1108,#2d1f0a)',
      action_type:  body.action_type          || null,
      action_value: body.action_value?.trim() || null,
      is_active:    body.is_active !== false,
      sort_order:   Number(body.sort_order)   || 0,
    };

    try {
      const [banner] = await dbPost('banners', row);
      return res.status(201).json(banner);
    } catch (err) {
      console.error('[POST /api/admin/banners]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  if (req.method === 'PATCH') {
    const { id, setting, value } = req.query;

    if (setting) {
      const allowed = ['banner_max_visible', 'banner_interval_ms'];
      if (!allowed.includes(setting)) return res.status(400).json({ error: 'Неизвестная настройка' });
      if (!value) return res.status(400).json({ error: 'value обязателен' });
      try {
        await dbPatch(`settings?key=eq.${setting}`, { value });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[PATCH /api/admin/banners setting]', err.message);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
    }

    if (!id) return res.status(400).json({ error: 'id обязателен' });
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }

    const patch = {};
    BANNER_FIELDS.forEach(k => { if (k in (body || {})) patch[k] = body[k]; });
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Нет полей для обновления' });

    try {
      await dbPatch(`banners?id=eq.${Number(id)}`, patch);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[PATCH /api/admin/banners]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id обязателен' });
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/banners?id=eq.${Number(id)}`, {
        method: 'DELETE',
        headers: {
          apikey:        SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[DELETE /api/admin/banners]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).end();
}
