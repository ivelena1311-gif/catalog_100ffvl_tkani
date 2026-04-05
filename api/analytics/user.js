'use strict';

/**
 * POST /api/analytics/user
 * Регистрирует нового пользователя или обновляет last_seen.
 * Body: { tg_user_id: number, first_name?: string, username?: string }
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

  const { tg_user_id, first_name, username } = body || {};
  if (!tg_user_id) return res.status(400).json({ error: 'tg_user_id обязателен' });

  try {
    // Upsert: если пользователь уже есть — обновляем last_seen и имя
    const res2 = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/analytics_users`,
      {
        method: 'POST',
        headers: {
          'apikey':        process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          tg_user_id:  Number(tg_user_id),
          first_name:  first_name || null,
          username:    username   || null,
          last_seen:   new Date().toISOString(),
        }),
      }
    );
    if (!res2.ok) {
      const text = await res2.text();
      throw new Error(`Supabase upsert error ${res2.status}: ${text}`);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[POST /api/analytics/user]', err.message);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
};
