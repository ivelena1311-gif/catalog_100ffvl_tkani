/**
 * lib/db.js — Клиент Supabase через REST API (нативный fetch, без npm)
 * Используется только в серверных функциях Vercel (api/).
 */

'use strict';

const URL  = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!URL || !KEY) {
  throw new Error('SUPABASE_URL и SUPABASE_SERVICE_KEY должны быть заданы в env');
}

const BASE_HEADERS = {
  'apikey':        KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type':  'application/json',
};

/**
 * GET-запрос к Supabase REST API
 * @param {string} path  — путь вида 'fabrics?select=*&is_active=eq.true'
 * @returns {Promise<any>}
 */
async function dbGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: BASE_HEADERS,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase GET error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * POST-запрос к Supabase REST API
 * @param {string} path   — путь вида 'orders'
 * @param {object|object[]} body — данные для вставки
 * @returns {Promise<any>}
 */
async function dbPost(path, body) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method:  'POST',
    headers: { ...BASE_HEADERS, 'Prefer': 'return=representation' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase POST error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * PATCH-запрос к Supabase REST API
 * @param {string} path   — путь с фильтром вида 'orders?id=eq.5'
 * @param {object} body   — поля для обновления
 * @returns {Promise<any>}
 */
async function dbPatch(path, body) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method:  'PATCH',
    headers: { ...BASE_HEADERS, 'Prefer': 'return=representation' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase PATCH error ${res.status}: ${text}`);
  }
  return res.json();
}

module.exports = { dbGet, dbPost, dbPatch };
