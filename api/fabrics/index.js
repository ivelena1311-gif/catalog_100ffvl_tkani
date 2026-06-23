'use strict';

const { dbGet } = require('../../lib/db');

/**
 * GET /api/fabrics          — список тканей (с фильтрами)
 * GET /api/fabrics?id=1     — одна ткань с colors[] и photos[]
 *
 * Query-параметры (список):
 *   ?category=3      — фильтр по category_id
 *   ?search=шелк     — ILIKE по названию, артикулу, составу
 *   ?inStock=true    — только с остатком > 0
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).end();

  const { id, category, search, inStock } = req.query;

  // ── Детальная карточка ─────────────────────────────────────────
  if (id !== undefined) {
    const numId = Number(id);
    if (!numId || !Number.isInteger(numId) || numId < 1) {
      return res.status(400).json({ error: 'Некорректный id' });
    }

    try {
      const [fabrics, colors, photos] = await Promise.all([
        dbGet(`fabrics?select=*,categories(name)&id=eq.${numId}&is_active=eq.true`),
        dbGet(`fabric_colors?select=id,hex,name&fabric_id=eq.${numId}&is_active=eq.true&order=id`),
        dbGet(`fabric_photos?select=url&fabric_id=eq.${numId}&order=sort_order`),
      ]);

      if (!fabrics.length) {
        return res.status(404).json({ error: 'Ткань не найдена' });
      }

      const fabric = fabrics[0];
      fabric.colors = colors;
      fabric.photos = photos.map((p) => p.url);

      return res.status(200).json(fabric);
    } catch (err) {
      console.error(`[GET /api/fabrics?id=${numId}]`, err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── Список тканей ──────────────────────────────────────────────
  let path =
    'fabrics' +
    '?select=id,name,article,category_id,composition,width,density,' +
    'base_price,cut_price,min_order,step,unit,thumb,is_active,is_hit,is_new,' +
    'categories(name)' +
    '&is_active=eq.true' +
    '&order=id';

  if (category) {
    path += `&category_id=eq.${encodeURIComponent(category)}`;
  }

  if (search && search.trim()) {
    const q = encodeURIComponent(`*${search.trim()}*`);
    path += `&or=(name.ilike.${q},article.ilike.${q},composition.ilike.${q})`;
  }

  try {
    let fabrics = await dbGet(path);

    if (inStock === 'true') {
      const fabricIds = fabrics.map((f) => f.id).join(',');
      if (fabricIds) {
        const colors = await dbGet(
          `fabric_colors?select=fabric_id&stock=gt.0&fabric_id=in.(${fabricIds})`
        );
        const inStockIds = new Set(colors.map((c) => c.fabric_id));
        fabrics = fabrics.filter((f) => inStockIds.has(f.id));
      }
    }

    // Подставляем первое загруженное фото как thumb (приоритет над полем fabrics.thumb)
    // Это позволяет любому загруженному фото сразу отображаться в каталоге
    if (fabrics.length) {
      const ids = fabrics.map((f) => f.id).join(',');
      const photos = await dbGet(
        `fabric_photos?select=fabric_id,url&fabric_id=in.(${ids})&order=fabric_id,sort_order`
      );
      // Берём первое фото для каждой ткани (список уже отсортирован по sort_order)
      const firstPhoto = {};
      for (const p of photos) {
        if (!firstPhoto[p.fabric_id]) firstPhoto[p.fabric_id] = p.url;
      }
      fabrics = fabrics.map((f) => ({
        ...f,
        thumb: firstPhoto[f.id] || f.thumb,
      }));
    }

    res.status(200).json(fabrics);
  } catch (err) {
    console.error('[GET /api/fabrics]', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
