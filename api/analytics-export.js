'use strict';

/**
 * GET /api/analytics-export?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Возвращает данные для Excel-отчёта: заявки, образцы, ткани, пользователи
 */

const { dbGet }   = require('../lib/db');
const { checkAuth } = require('../lib/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).end();
  if (!checkAuth(req, res))    return;

  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Укажите from и to (YYYY-MM-DD)' });

  const fromISO = new Date(from).toISOString();
  const toISO   = new Date(to + 'T23:59:59.999Z').toISOString();

  try {
    // ── Заявки и их позиции ──────────────────────────────────
    const orders = await dbGet(
      `orders?select=*&created_at=gte.${fromISO}&created_at=lte.${toISO}&order=created_at.asc&limit=99999`
    );

    let orderItems = [];
    if (orders.length > 0) {
      const ids = orders.map(o => o.id).join(',');
      orderItems = await dbGet(`order_items?select=*&order_id=in.(${ids})&limit=99999`);
    }

    // ── Образцы и их позиции ─────────────────────────────────
    const sampleReqs = await dbGet(
      `sample_requests?select=*&created_at=gte.${fromISO}&created_at=lte.${toISO}&order=created_at.asc&limit=99999`
    );

    let sampleItems = [];
    if (sampleReqs.length > 0) {
      const ids = sampleReqs.map(s => s.id).join(',');
      sampleItems = await dbGet(`sample_request_items?select=*&sample_request_id=in.(${ids})&limit=99999`);
    }

    // ── Просмотры тканей за период ───────────────────────────
    const views = await dbGet(
      `analytics_views?select=fabric_id,fabrics(name,article),viewed_at` +
      `&viewed_at=gte.${fromISO}&viewed_at=lte.${toISO}&limit=99999`
    );

    // ── Сессии за период ─────────────────────────────────────
    const sessions = await dbGet(
      `analytics_sessions?select=tg_user_id,duration_seconds,screens_visited,started_at` +
      `&started_at=gte.${fromISO}&started_at=lte.${toISO}&limit=99999`
    );

    // ── Все пользователи ─────────────────────────────────────
    const users = await dbGet(
      `analytics_users?select=tg_user_id,first_name,username,first_seen,last_seen&order=last_seen.desc&limit=99999`
    );

    // ── Агрегация по тканям ──────────────────────────────────
    const fabricMap = {};

    const _fabric = (id, name, article) => {
      if (!fabricMap[id]) {
        fabricMap[id] = { name: name || `#${id}`, article: article || '', views: 0, orderPositions: 0, orderMeters: 0, orderRevenue: 0, sampleCount: 0 };
      }
      return fabricMap[id];
    };

    for (const v of views) {
      _fabric(v.fabric_id, v.fabrics?.name, v.fabrics?.article).views++;
    }

    const orderIdSet = new Set(orders.map(o => o.id));
    for (const item of orderItems) {
      if (!orderIdSet.has(item.order_id)) continue;
      const f = _fabric(item.fabric_id, item.fabric_name, '');
      f.orderPositions++;
      f.orderMeters   += Number(item.meters) || 0;
      f.orderRevenue  += (Number(item.price_per_meter) || 0) * (Number(item.meters) || 0);
    }

    const sampleIdSet = new Set(sampleReqs.map(s => s.id));
    for (const item of sampleItems) {
      if (!sampleIdSet.has(item.sample_request_id)) continue;
      _fabric(item.fabric_id, item.fabric_name, '').sampleCount++;
    }

    // ── Сессии по пользователям ──────────────────────────────
    const sessionsByUser = {};
    for (const s of sessions) {
      const uid = String(s.tg_user_id);
      if (!sessionsByUser[uid]) sessionsByUser[uid] = [];
      sessionsByUser[uid].push(s);
    }

    // ── Формируем объект ответа ──────────────────────────────
    const itemsByOrder = {};
    for (const item of orderItems) {
      (itemsByOrder[item.order_id] = itemsByOrder[item.order_id] || []).push(item);
    }
    const itemsBySample = {};
    for (const item of sampleItems) {
      (itemsBySample[item.sample_request_id] = itemsBySample[item.sample_request_id] || []).push(item);
    }

    return res.status(200).json({
      period: { from, to },
      orders: orders.map(o => ({ ...o, items: itemsByOrder[o.id] || [] })),
      samples: sampleReqs.map(s => ({ ...s, items: itemsBySample[s.id] || [] })),
      fabrics: Object.values(fabricMap).sort((a, b) => b.views - a.views),
      users: users.map(u => {
        const uSessions = sessionsByUser[String(u.tg_user_id)] || [];
        const done = uSessions.filter(s => s.duration_seconds != null);
        return {
          ...u,
          sessions_count: uSessions.length,
          avg_duration_sec: done.length
            ? Math.round(done.reduce((s, x) => s + (x.duration_seconds || 0), 0) / done.length)
            : 0,
          avg_screens: done.length
            ? Math.round(done.reduce((s, x) => s + (x.screens_visited || 0), 0) / done.length)
            : 0,
        };
      }),
    });

  } catch (err) {
    console.error('[GET /api/analytics-export]', err.message);
    return res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
  }
};
