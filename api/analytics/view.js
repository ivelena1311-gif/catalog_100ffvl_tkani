'use strict';

/**
 * POST /api/analytics/view
 * Записывает просмотр карточки ткани.
 * Body: { fabric_id: number, tg_user_id?: number }
 */

const { dbPost } = require('../../lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Некорректный JSON' });
  }

  const { fabric_id, tg_user_id } = body || {};
  if (!fabric_id) return res.status(400).json({ error: 'fabric_id обязателен' });

  try {
    await dbPost('analytics_views', {
      fabric_id:  Number(fabric_id),
      tg_user_id: tg_user_id ? Number(tg_user_id) : null,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[POST /api/analytics/view]', err.message);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
};
