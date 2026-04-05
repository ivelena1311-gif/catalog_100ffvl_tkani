'use strict';

/**
 * GET  /api/admin/fabrics        — список всех тканей
 * GET  /api/admin/fabrics?id=N   — одна ткань с colors[] и photos[]
 * POST /api/admin/fabrics        — обновить поля ткани (id в body)
 * PUT  /api/admin/fabrics        — создать новую ткань
 */

const { dbGet, dbPost, dbPatch } = require('../../lib/db');
const { checkAuth } = require('../../lib/admin-auth');

const ALLOWED_FIELDS = [
  'name', 'article', 'category_id', 'composition', 'width', 'density',
  'description', 'thumb', 'base_price', 'cut_price', 'min_order', 'step', 'is_active',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;

  // ── GET ───────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { id } = req.query;

    // Детальная карточка одной ткани
    if (id) {
      const numId = Number(id);
      if (!numId) return res.status(400).json({ error: 'Некорректный id' });
      try {
        const [fabrics, colors, photos] = await Promise.all([
          dbGet(`fabrics?select=*,categories(name)&id=eq.${numId}`),
          dbGet(`fabric_colors?select=*&fabric_id=eq.${numId}&order=id`),
          dbGet(`fabric_photos?select=*&fabric_id=eq.${numId}&order=sort_order`),
        ]);
        if (!fabrics.length) return res.status(404).json({ error: 'Не найдено' });
        const fabric = fabrics[0];
        fabric.colors = colors;
        fabric.photos = photos;
        return res.status(200).json(fabric);
      } catch (err) {
        console.error('[GET /api/admin/fabrics?id]', err.message);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
    }

    // Список всех тканей
    try {
      const fabrics = await dbGet(
        'fabrics?select=id,name,article,category_id,composition,width,density,' +
        'base_price,cut_price,min_order,step,is_active,description,thumb,categories(name)&order=id'
      );
      return res.status(200).json(fabrics);
    } catch (err) {
      console.error('[GET /api/admin/fabrics]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── POST: обновить ткань ──────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }

    const { id, ...rest } = body || {};
    if (!id) return res.status(400).json({ error: 'id обязателен' });

    const patch = {};
    for (const field of ALLOWED_FIELDS) {
      if (!(field in rest)) continue;
      const val = rest[field];
      if (field === 'base_price')   { patch.base_price  = parseFloat(val); continue; }
      if (field === 'cut_price')    { patch.cut_price   = val ? parseFloat(val) : null; continue; }
      if (field === 'width')        { patch.width       = val ? parseInt(val) : null; continue; }
      if (field === 'density')      { patch.density     = val ? parseInt(val) : null; continue; }
      if (field === 'min_order')    { patch.min_order   = val ? parseInt(val) : null; continue; }
      if (field === 'step')         { patch.step        = val ? parseInt(val) : null; continue; }
      if (field === 'category_id')  { patch.category_id = val ? parseInt(val) : null; continue; }
      if (field === 'is_active')    { patch.is_active   = Boolean(val); continue; }
      patch[field] = val ?? null;
    }

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

  // ── PUT: создать новую ткань ──────────────────────────────────
  if (req.method === 'PUT') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }

    const { name, base_price, ...rest } = body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'name обязателен' });
    if (!base_price) return res.status(400).json({ error: 'base_price обязателен' });

    const newFabric = {
      name:        name.trim(),
      base_price:  parseFloat(base_price),
      is_active:   true,
      article:     rest.article?.trim() || null,
      category_id: rest.category_id ? parseInt(rest.category_id) : null,
      composition: rest.composition?.trim() || null,
      width:       rest.width ? parseInt(rest.width) : null,
      density:     rest.density ? parseInt(rest.density) : null,
      description: rest.description?.trim() || null,
      cut_price:   rest.cut_price ? parseFloat(rest.cut_price) : null,
      min_order:   rest.min_order ? parseInt(rest.min_order) : null,
      step:        rest.step ? parseInt(rest.step) : null,
    };

    try {
      const [fabric] = await dbPost('fabrics', newFabric);
      return res.status(201).json(fabric);
    } catch (err) {
      console.error('[PUT /api/admin/fabrics]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).end();
};
