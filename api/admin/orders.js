'use strict';

/**
 * GET /api/admin/orders — Список заявок с позициями
 * Header: Authorization: Bearer <ADMIN_SECRET>
 */

const { dbGet, dbPatch } = require('../../lib/db');
const { checkAuth } = require('../../lib/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;

  // ── PATCH: отметить заявку обработанной ──────────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id обязателен' });
    try {
      await dbPatch(`orders?id=eq.${Number(id)}`, { processed: true });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[PATCH /api/admin/orders]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  if (req.method !== 'GET') return res.status(405).end();

  try {
    const orders = await dbGet(
      'orders?select=id,order_number,first_name,tg_username,phone,comment,' +
      'total_meters,total_usd,notified,processed,created_at' +
      '&order=created_at.desc&limit=200'
    );

    const items = await dbGet(
      'order_items?select=order_id,fabric_name,color_name,meters,price_per_meter,price_type' +
      '&order=id'
    );

    // Группируем позиции по order_id
    const itemsMap = {};
    for (const item of items) {
      if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
      itemsMap[item.order_id].push(item);
    }

    const result = orders.map(o => ({
      ...o,
      items: itemsMap[o.id] || [],
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error('[GET /api/admin/orders]', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
