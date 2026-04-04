'use strict';

/**
 * POST /api/orders — Создать заявку на покупку тканей
 *
 * Body:
 * {
 *   phone:       string   — телефон покупателя (обязательно)
 *   name:        string   — имя
 *   comment:     string   — комментарий (опционально)
 *   tg_user_id:  number   — Telegram user id
 *   tg_username: string   — Telegram @username
 *   first_name:  string   — имя из Telegram
 *   items: [
 *     {
 *       fabric_id:    number
 *       fabric_name:  string
 *       color_id:     number
 *       color_name:   string
 *       meters:       number
 *       price_per_meter: number
 *       price_type:   'base' | 'cut'
 *     }
 *   ]
 * }
 *
 * Response 201: { order_number, id }
 * Response 400: { error }
 * Response 500: { error }
 */

const { dbGet, dbPost } = require('../lib/db');
const { sendNotification, formatOrderNotification } = require('../lib/notify');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  // ── Парсинг тела ──────────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Некорректный JSON' });
  }

  const { phone, name, comment, tg_user_id, tg_username, first_name, items } = body || {};

  // ── Валидация ─────────────────────────────────────────────────
  if (!phone || !/^\+?[\d\s\-\(\)]{7,20}$/.test(phone.trim())) {
    return res.status(400).json({ error: 'Некорректный номер телефона' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Корзина пустая' });
  }
  for (const item of items) {
    if (!item.fabric_id || !item.meters || item.meters < 1) {
      return res.status(400).json({ error: 'Некорректные данные позиции' });
    }
    if (!['base', 'cut'].includes(item.price_type)) {
      return res.status(400).json({ error: 'Некорректный price_type' });
    }
  }

  // ── Вычисляем итоги ───────────────────────────────────────────
  const total_meters = items.reduce((s, i) => s + Number(i.meters), 0);
  const total_usd    = items.reduce((s, i) => s + Number(i.price_per_meter) * Number(i.meters), 0);

  try {
    // ── Сохраняем заказ ───────────────────────────────────────
    const [order] = await dbPost('orders', {
      tg_user_id:  tg_user_id  || null,
      tg_username: tg_username || null,
      first_name:  first_name  || name || null,
      phone:       phone.trim(),
      comment:     comment     || null,
      total_meters,
      total_usd:   parseFloat(total_usd.toFixed(2)),
    });

    // ── Сохраняем позиции ─────────────────────────────────────
    const orderItems = items.map(i => ({
      order_id:       order.id,
      fabric_id:      i.fabric_id,
      fabric_name:    i.fabric_name,
      color_id:       i.color_id   || null,
      color_name:     i.color_name || 'Уточнить у менеджера',
      meters:         Number(i.meters),
      price_per_meter: parseFloat(Number(i.price_per_meter).toFixed(2)),
      price_type:     i.price_type,
    }));

    await dbPost('order_items', orderItems);

    // ── Telegram-уведомление ──────────────────────────────────
    const text    = formatOrderNotification(order, orderItems);
    const notified = await sendNotification(text);

    // Обновляем флаг notified если успешно
    if (notified) {
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`,
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
      order_number: order.order_number,
      id:           order.id,
    });

  } catch (err) {
    console.error('[POST /api/orders]', err.message);
    return res.status(500).json({ error: 'Ошибка сервера при сохранении заявки' });
  }
};
