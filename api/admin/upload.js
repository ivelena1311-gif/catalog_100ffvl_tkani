'use strict';

/**
 * POST /api/admin/upload
 * Загружает фото в Supabase Storage и возвращает публичный URL.
 * Body: { filename: string, base64: string, contentType?: string }
 * Response: { url: string }
 *
 * Бакет "fabric-photos" должен быть создан в Supabase Storage (публичный).
 */

const { checkAuth } = require('../../lib/admin-auth');

const BUCKET = 'fabric-photos';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).end();

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Некорректный JSON' });
  }

  const { filename, base64, contentType } = body || {};
  if (!filename) return res.status(400).json({ error: 'filename обязателен' });
  if (!base64)   return res.status(400).json({ error: 'base64 обязателен' });

  try {
    const buffer = Buffer.from(base64, 'base64');
    // Безопасное имя файла: timestamp + оригинальное имя без спецсимволов
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${safeName}`;

    const uploadRes = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
      {
        method: 'POST',
        headers: {
          apikey:          process.env.SUPABASE_SERVICE_KEY,
          Authorization:  `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': contentType || 'image/jpeg',
          'x-upsert':     'true',
        },
        body: buffer,
      }
    );

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      throw new Error(`Storage upload ${uploadRes.status}: ${text}`);
    }

    const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return res.status(200).json({ url });
  } catch (err) {
    console.error('[POST /api/admin/upload]', err.message);
    return res.status(500).json({ error: 'Ошибка загрузки: ' + err.message });
  }
};
