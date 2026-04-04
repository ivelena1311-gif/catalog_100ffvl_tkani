'use strict';

/**
 * GET /api/admin/samples — Список запросов образцов с позициями
 * Header: Authorization: Bearer <ADMIN_SECRET>
 */

const { dbGet } = require('../../lib/db');
const { checkAuth } = require('../../lib/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!checkAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const requests = await dbGet(
      'sample_requests?select=id,request_number,first_name,tg_username,' +
      'recipient_name,phone,cdek_address,notified,created_at' +
      '&order=created_at.desc&limit=200'
    );

    const items = await dbGet(
      'sample_request_items?select=sample_request_id,fabric_name,color_name' +
      '&order=id'
    );

    const itemsMap = {};
    for (const item of items) {
      if (!itemsMap[item.sample_request_id]) itemsMap[item.sample_request_id] = [];
      itemsMap[item.sample_request_id].push(item);
    }

    const result = requests.map(r => ({
      ...r,
      items: itemsMap[r.id] || [],
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error('[GET /api/admin/samples]', err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};
