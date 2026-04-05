'use strict';

/**
 * GET /api/admin/analytics
 * Сводная аналитика:
 * - topFabrics: топ-10 тканей за 30 дней
 * - ordersByDay: заявки по дням за 30 дней
 * - totalUsers: всего пользователей
 * - newUsersMonth: новых за 30 дней
 * - totalOrders: всего заявок
 * - totalSamples: всего запросов образцов
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
    const [topFabrics, ordersByDay, userStats, totalOrders, totalSamples] = await Promise.all([
      // Топ-10 тканей за 30 дней (группировка через select count)
      dbGet(
        'analytics_views?select=fabric_id,fabrics(name,article)' +
        '&viewed_at=gte.' + daysAgo(30) +
        '&order=fabric_id&limit=1000'
      ),
      // Заявки по дням за 30 дней
      dbGet(
        'orders?select=created_at' +
        '&created_at=gte.' + daysAgo(30) +
        '&order=created_at.desc&limit=1000'
      ),
      // Пользователи
      dbGet('analytics_users?select=tg_user_id,first_seen&limit=10000'),
      // Всего заявок
      dbGet('orders?select=id&limit=1'),
      // Всего образцов
      dbGet('sample_requests?select=id&limit=1'),
    ]);

    // Топ-10 через ручную группировку
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

    // Заявки по дням
    const dayMap = {};
    for (const o of ordersByDay) {
      const day = o.created_at.slice(0, 10); // 'YYYY-MM-DD'
      dayMap[day] = (dayMap[day] || 0) + 1;
    }
    const ordersChart = Object.entries(dayMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    // Статистика пользователей
    const month30 = daysAgo(30);
    const totalUsers   = userStats.length;
    const newUsersMonth = userStats.filter(u => u.first_seen >= month30).length;

    return res.status(200).json({
      topFabrics:    topList,
      ordersByDay:   ordersChart,
      totalUsers,
      newUsersMonth,
      totalOrders:   totalOrders.length,
      totalSamples:  totalSamples.length,
      totalViews30d: topFabrics.length,
    });
  } catch (err) {
    console.error('[GET /api/admin/analytics]', err.message);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
};

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
