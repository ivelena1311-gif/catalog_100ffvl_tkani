'use strict';

const { dbGet } = require('../../lib/db');

/**
 * GET /api/fabrics/:id
 * Возвращает одну ткань со всеми данными:
 *   - поля ткани + имя категории
 *   - colors[]  — цвета с остатками
 *   - photos[]  — массив URL фотографий (string[])
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).end();

  const id = Number(req.query.id);
  if (!id || !Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Некорректный id' });
  }

  try {
    // Три параллельных запроса
    const [fabrics, colors, photos] = await Promise.all([
      dbGet(
        `fabrics?select=*,categories(name)&id=eq.${id}&is_active=eq.true`
      ),
      dbGet(
        `fabric_colors?select=id,hex,name,stock,rolls&fabric_id=eq.${id}&order=id`
      ),
      dbGet(
        `fabric_photos?select=url&fabric_id=eq.${id}&order=sort_order`
      ),
    ]);

    if (!fabrics.length) {
      return res.status(404).json({ error: 'Ткань не найдена' });
    }

    const fabric = fabrics[0];
    fabric.colors = colors;
    // photos[] — просто массив URL строк, как в data.js
    fabric.photos = photos.map((p) => p.url);

    res.status(200).json(fabric);
  } catch (err) {
    console.error(`[GET /api/fabrics/${id}]`, err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
