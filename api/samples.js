'use strict';

/**
 * POST /api/samples — Создать запрос на образцы тканей
 *
 * Body:
 * {
 *   phone:          string   — телефон (обязательно)
 *   recipient_name: string   — ФИО получателя (обязательно)
 *   cdek_address:   string   — адрес ПВЗ СДЭК (обязательно)
 *   tg_user_id:     number
 *   tg_username:    string
 *   first_name:     string
 *   items: [
 *     { fabric_id, fabric_name, color_id, color_name }
 *   ]
 * }
 *
 * Response 201: { request_number, id }
 * Response 400: { error }
 * Response 500: { error }
 */

const { dbPost } = require('../lib/db');
const { sendNotification, formatSampleNotification, formatSampleConfirmation } = require('../lib/notify');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Некорректный JSON' });
  }

  const { phone, recipient_name, cdek_address, tg_user_id, tg_username, first_name, items } = body || {};

  // ── Валидация ─────────────────────────────────────────────────
  if (!phone || !/^\+?[\d\s\-\(\)]{7,20}$/.test(phone.trim())) {
    return res.status(400).json({ error: 'Некорректный номер телефона' });
  }
  if (!recipient_name || !recipient_name.trim()) {
    return res.status(400).json({ error: 'Введите ФИО получателя' });
  }
  if (recipient_name.trim().length > 200) {
    return res.status(400).json({ error: 'ФИО слишком длинное' });
  }
  if (!cdek_address || !cdek_address.trim()) {
    return res.status(400).json({ error: 'Введите адрес ПВЗ СДЭК' });
  }
  if (cdek_address.trim().length > 500) {
    return res.status(400).json({ error: 'Адрес слишком длинный' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Не выбраны ткани для образца' });
  }

  try {
    // ── Сохраняем запрос ──────────────────────────────────────
    const [sampleReq] = await dbPost('sample_requests', {
      tg_user_id:     tg_user_id     || null,
      tg_username:    tg_username    || null,
      first_name:     first_name     || null,
      recipient_name: recipient_name.trim(),
      phone:          phone.trim(),
      cdek_address:   cdek_address.trim(),
    });

    // ── Сохраняем позиции ─────────────────────────────────────
    const reqItems = items.map(i => ({
      sample_request_id: sampleReq.id,
      fabric_id:         i.fabric_id,
      fabric_name:       i.fabric_name,
      color_id:          i.color_id   || null,
      color_name:        i.color_name || 'Уточнить у менеджера',
    }));

    await dbPost('sample_request_items', reqItems);

    // ── Telegram-уведомления ──────────────────────────────────
    const text     = formatSampleNotification(sampleReq, reqItems);
    const notified = await sendNotification(text);

    // Подтверждение клиенту
    if (tg_user_id) {
      await sendNotification(formatSampleConfirmation(sampleReq, reqItems), tg_user_id);
    }

    if (notified) {
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/sample_requests?id=eq.${sampleReq.id}`,
        {
          method:  'PATCH',
          headers: {
            apikey:          process.env.SUPABASE_SERVICE_KEY,
            Authorization:  `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer:         'return=minimal',
          },
          body: JSON.stringify({ notified: true }),
        }
      );
    }

    return res.status(201).json({
      request_number: sampleReq.request_number,
      id:             sampleReq.id,
    });

  } catch (err) {
    console.error('[POST /api/samples]', err.message);
    return res.status(500).json({ error: 'Ошибка сервера при сохранении запроса' });
  }
};
