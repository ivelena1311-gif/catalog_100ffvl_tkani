'use strict';

/**
 * Проверяет Authorization: Bearer <ADMIN_SECRET>.
 * Возвращает true если авторизован, иначе отвечает 401 и возвращает false.
 */
function checkAuth(req, res) {
  const header = req.headers['authorization'] || '';
  const token  = header.replace(/^Bearer\s+/i, '').trim();

  if (!process.env.ADMIN_SECRET || token !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { checkAuth };
