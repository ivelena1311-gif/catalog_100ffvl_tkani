'use strict';

const { dbGet } = require('../lib/db');

/**
 * GET /api/categories
 * Возвращает список категорий, отсортированных по sort_order.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).end();

  try {
    const categories = await dbGet(
      'categories?select=id,name,sort_order&order=sort_order'
    );
    res.status(200).json(categories);
  } catch (err) {
    console.error('[GET /api/categories]', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
