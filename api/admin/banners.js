'use strict';

/**
 * GET    /api/admin/banners              — все баннеры + настройки
 * POST   /api/admin/banners              — создать баннер
 * PATCH  /api/admin/banners?id=N        — обновить баннер
 * PATCH  /api/admin/banners?setting=KEY&value=V — обновить настройку
 * DELETE /api/admin/banners?id=N        — удалить баннер
 */

const { dbGet, dbPost, dbPatch } = require('../../lib/db');
const { checkAuth }              = require('../../lib/admin-auth');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BANNER_FIELDS = [
  'title','subtitle','label','image_url','gradient',
  'action_type','action_value','is_active','sort_order',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req, res)) return;

  // ── GET: все баннеры + настройки ─────────────────────────────────
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

  // ── POST: создать баннер ──────────────────────────────────────────
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
      subtitle:     body.subtitle?.trim()  || null,
      label:        body.label?.trim()     || null,
      image_url:    body.image_url?.trim() || null,
      gradient:     body.gradient?.trim()  || 'linear-gradient(135deg, #1a1108 0%, #2d1f0a 100%)',
      action_type:  body.action_type       || null,
      action_value: body.action_value?.trim() || null,
      is_active:    body.is_active !== false,
      sort_order:   Number(body.sort_order) || 0,
    };

    try {
      const [banner] = await dbPost('banners', row);
      return res.status(201).json(banner);
    } catch (err) {
      console.error('[POST /api/admin/banners]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── PATCH: обновить баннер или настройку ─────────────────────────
  if (req.method === 'PATCH') {
    const { id, setting, value } = req.query;

    // Обновление настройки (setting=key&value=v)
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

    // Обновление баннера
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

  // ── DELETE: удалить баннер ────────────────────────────────────────
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
};
