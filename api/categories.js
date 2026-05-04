'use strict';

const { dbGet } = require('../lib/db');

/**
 * GET /api/categories  — список категорий
 * GET /api/banners     — активные баннеры + настройки (route через vercel.json → ?_banners=1)
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).end();

  // /api/banners → rewritten here with ?_banners=1
  if (req.query._banners === '1') {
    try {
      const [banners, settings] = await Promise.all([
        dbGet('banners?select=*&is_active=eq.true&order=sort_order'),
        dbGet('settings?select=key,value&key=in.(banner_max_visible,banner_interval_ms)'),
      ]);
      const maxVisible = parseInt(
        settings.find(s => s.key === 'banner_max_visible')?.value ?? '3', 10
      );
      const intervalMs = parseInt(
        settings.find(s => s.key === 'banner_interval_ms')?.value ?? '4000', 10
      );
      return res.status(200).json({
        banners:     banners.slice(0, maxVisible),
        interval_ms: intervalMs,
      });
    } catch (err) {
      console.error('[GET /api/banners]', err.message);
      return res.status(200).json({ banners: [], interval_ms: 4000 });
    }
  }

  // /api/categories
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
