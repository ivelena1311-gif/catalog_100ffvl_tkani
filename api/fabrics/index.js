'use strict';

const { dbGet } = require('../../lib/db');

/**
 * GET /api/fabrics
 * Query-параметры:
 *   ?category=3        — фильтр по category_id
 *   ?search=шелк       — поиск по названию, артикулу, составу (ILIKE)
 *   ?inStock=true      — только ткани у которых есть цвета с остатком > 0
 *
 * Возвращает массив тканей с вложенным объектом category: { name }.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).end();

  const { category, search, inStock } = req.query;

  // Базовый SELECT: ткань + имя категории через join
  let path =
    'fabrics' +
    '?select=id,name,article,category_id,composition,width,density,' +
    'base_price,cut_price,min_order,step,thumb,is_active,' +
    'categories(name)' +
    '&is_active=eq.true' +
    '&order=id';

  // Фильтр по категории
  if (category) {
    path += `&category_id=eq.${encodeURIComponent(category)}`;
  }

  // Полнотекстовый поиск через ILIKE по трём полям
  if (search && search.trim()) {
    const q = encodeURIComponent(`*${search.trim()}*`);
    path += `&or=(name.ilike.${q},article.ilike.${q},composition.ilike.${q})`;
  }

  try {
    let fabrics = await dbGet(path);

    // Фильтр "в наличии": убираем ткани без цветов со stock > 0
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

    res.status(200).json(fabrics);
  } catch (err) {
    console.error('[GET /api/fabrics]', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
