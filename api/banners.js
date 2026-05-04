'use strict';

/**
 * GET /api/banners
 * Возвращает активные баннеры (не более banner_max_visible) + интервал слайдера.
 * Публичный endpoint — авторизация не требуется.
 * При ошибке БД возвращает пустой список, чтобы не ломать tg-app.
 */

const { dbGet } = require('../lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

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

    res.status(200).json({
      banners:     banners.slice(0, maxVisible),
      interval_ms: intervalMs,
    });
  } catch (err) {
    console.error('[GET /api/banners]', err.message);
    res.status(200).json({ banners: [], interval_ms: 4000 });
  }
};
