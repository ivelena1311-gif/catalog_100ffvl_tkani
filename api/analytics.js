'use strict';

/**
 * GET  /api/analytics          — сводка для admin (требует Authorization)
 * POST /api/analytics?type=view — записать просмотр ткани { fabric_id, tg_user_id? }
 * POST /api/analytics?type=user — upsert пользователя  { tg_user_id, first_name?, username? }
 */

const { dbGet, dbPost, dbPatch } = require('../lib/db');
const { checkAuth }     = require('../lib/admin-auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: admin-сводка (с авторизацией) ───────────────────────
  if (req.method === 'GET') {
    if (!checkAuth(req, res)) return;
    try {
      const [topFabrics, ordersByDay, userStats, totalOrders, totalSamples, sessionStats] = await Promise.all([
        dbGet(
          'analytics_views?select=fabric_id,fabrics(name,article)' +
          '&viewed_at=gte.' + daysAgo(30) +
          '&order=fabric_id&limit=1000'
        ),
        dbGet(
          'orders?select=created_at' +
          '&created_at=gte.' + daysAgo(30) +
          '&order=created_at.desc&limit=1000'
        ),
        dbGet('analytics_users?select=tg_user_id,first_name,username,first_seen,last_seen&order=last_seen.desc&limit=1000'),
        dbGet('orders?select=id&limit=99999'),
        dbGet('sample_requests?select=id&limit=99999'),
        dbGet('analytics_sessions?select=duration_seconds,screens_visited&started_at=gte.' + daysAgo(30) + '&not.ended_at=is.null&limit=99999'),
      ]);

      const viewCounts = {};
      const fabricMeta = {};
      for (const v of topFabrics) {
        const id = v.fabric_id;
        viewCounts[id] = (viewCounts[id] || 0) + 1;
        if (v.fabrics) fabricMeta[id] = v.fabrics;
      }
      const topList = Object.entries(viewCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, count]) => ({
          fabric_id: Number(id),
          name:      fabricMeta[id]?.name    || `#${id}`,
          article:   fabricMeta[id]?.article || '',
          views:     count,
        }));

      const dayMap = {};
      for (const o of ordersByDay) {
        const day = o.created_at.slice(0, 10);
        dayMap[day] = (dayMap[day] || 0) + 1;
      }
      const ordersChart = Object.entries(dayMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, count]) => ({ date, count }));

      const month30 = daysAgo(30);
      return res.status(200).json({
        topFabrics:    topList,
        ordersByDay:   ordersChart,
        totalUsers:      userStats.length,
        newUsersMonth:   userStats.filter(u => u.first_seen >= month30).length,
        totalOrders:     totalOrders.length,
        totalSamples:    totalSamples.length,
        totalViews30d:   topFabrics.length,
        users:           userStats,
        totalSessions30d: sessionStats.length,
        avgDurationSec:  sessionStats.length
          ? Math.round(sessionStats.reduce((s, x) => s + (x.duration_seconds || 0), 0) / sessionStats.length)
          : 0,
        avgScreens:      sessionStats.length
          ? Math.round(sessionStats.reduce((s, x) => s + (x.screens_visited || 0), 0) / sessionStats.length)
          : 0,
      });
    } catch (err) {
      console.error('[GET /api/analytics]', err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  // ── POST: трекинг (без авторизации) ──────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return res.status(400).json({ error: 'Некорректный JSON' });
    }

    const { type } = req.query;

    // POST ?type=view
    if (type === 'view') {
      const { fabric_id, tg_user_id } = body || {};
      if (!fabric_id) return res.status(400).json({ error: 'fabric_id обязателен' });
      try {
        await dbPost('analytics_views', {
          fabric_id:  Number(fabric_id),
          tg_user_id: tg_user_id ? Number(tg_user_id) : null,
        });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[POST /api/analytics?type=view]', err.message);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
    }

    // POST ?type=user
    if (type === 'user') {
      const { tg_user_id, first_name, username } = body || {};
      if (!tg_user_id) return res.status(400).json({ error: 'tg_user_id обязателен' });
      try {
        const r = await fetch(
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
        if (!r.ok) throw new Error(await r.text());
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[POST /api/analytics?type=user]', err.message);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
    }

    // POST ?type=session_start
    if (type === 'session_start') {
      const { tg_user_id, session_token } = body || {};
      if (!session_token) return res.status(400).json({ error: 'session_token обязателен' });
      try {
        await dbPost('analytics_sessions', {
          tg_user_id:    tg_user_id ? Number(tg_user_id) : null,
          session_token,
        });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[POST session_start]', err.message);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
    }

    // POST ?type=session_end
    if (type === 'session_end') {
      const { session_token, duration_seconds, screens_visited } = body || {};
      if (!session_token) return res.status(400).json({ error: 'session_token обязателен' });
      try {
        await dbPatch(`analytics_sessions?session_token=eq.${encodeURIComponent(session_token)}`, {
          ended_at:        new Date().toISOString(),
          duration_seconds: Math.max(0, Number(duration_seconds) || 0),
          screens_visited:  Math.max(0, Number(screens_visited) || 0),
        });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[POST session_end]', err.message);
        return res.status(500).json({ error: 'Ошибка сервера' });
      }
    }

    return res.status(400).json({ error: 'Укажите ?type=view, ?type=user, ?type=session_start или ?type=session_end' });
  }

  // ── DELETE: сброс счётчика просмотров (с авторизацией) ──────
  if (req.method === 'DELETE') {
    if (!checkAuth(req, res)) return;
    const { type } = req.query;
    const allowedTypes = { views: 'analytics_views', orders: 'orders', samples: 'sample_requests' };
    if (!allowedTypes[type]) return res.status(400).json({ error: 'Укажите ?type=views|orders|samples' });
    try {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/${allowedTypes[type]}?id=gte.0`,
        {
          method:  'DELETE',
          headers: {
            'apikey':        process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
        }
      );
      if (!r.ok) throw new Error(await r.text());
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(`[DELETE /api/analytics?type=${type}]`, err.message);
      return res.status(500).json({ error: 'Ошибка сервера' });
    }
  }

  return res.status(405).end();
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
