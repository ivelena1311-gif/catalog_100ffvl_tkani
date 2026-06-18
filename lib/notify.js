'use strict';

/**
 * lib/notify.js — Отправка уведомлений через Telegram Bot API
 */

const BOT_TOKEN    = process.env.BOT_TOKEN;
const NOTIFY_CHAT  = process.env.NOTIFY_CHAT_ID;

/**
 * Отправляет сообщение в Telegram.
 * @param {string} text    — HTML-текст сообщения
 * @param {string|number} [chatId] — chat_id получателя; если не указан, берёт NOTIFY_CHAT_ID
 * Возвращает true если успешно, false если ошибка (не бросает).
 */
async function sendNotification(text, chatId) {
  const target = chatId || NOTIFY_CHAT;
  if (!BOT_TOKEN || !target) {
    console.warn('[notify] BOT_TOKEN или chat_id не заданы');
    return false;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    target,
          text,
          parse_mode: 'HTML',
        }),
      }
    );
    const data = await res.json();
    if (!data.ok) {
      console.error('[notify] Telegram error:', data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notify] fetch error:', err.message);
    return false;
  }
}

/**
 * Форматирует уведомление о новой заявке на покупку.
 */
function formatOrderNotification(order, items) {
  const dt = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const user = order.tg_username
    ? `${order.first_name} (@${order.tg_username})`
    : order.first_name || 'Аноним';

  const itemLines = items.map(i => {
    const type = i.price_type === 'cut' ? 'отрез' : 'опт';
    return `• ${i.fabric_name} (${i.color_name}) \u00D7 ${i.meters}\u00A0м — ${_fmt(i.price_per_meter)}\u00A0уе/м [${type}]`;
  }).join('\n');

  const totalMeters = items.reduce((s, i) => s + i.meters, 0);
  const totalUsd    = items.reduce((s, i) => s + i.price_per_meter * i.meters, 0);

  return [
    `\uD83D\uDED2 <b>Новая заявка #${order.order_number}</b>`,
    '',
    `\uD83D\uDC64 ${_esc(user)}`,
    `\uD83D\uDCDE ${_esc(order.phone)}`,
    '',
    `\uD83D\uDCE6 <b>Состав:</b>`,
    itemLines,
    '',
    `\uD83D\uDCB5 Итого: ~${_fmt(totalUsd)}\u00A0уе (${totalMeters}\u00A0м)`,
    order.comment ? `\uD83D\uDCAC Комментарий: ${_esc(order.comment)}` : '',
    '',
    `\u23F0 ${dt} (МСК)`,
  ].filter(l => l !== '').join('\n');
}

/**
 * Форматирует уведомление о запросе образцов.
 */
function formatSampleNotification(req, items) {
  const dt = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const user = req.tg_username
    ? `${req.first_name} (@${req.tg_username})`
    : req.first_name || 'Аноним';

  const fabricList = items.map(i => `${i.fabric_name} (${i.color_name})`).join(', ');

  return [
    `\uD83D\uDCEC <b>Запрос образцов #${req.request_number}</b>`,
    '',
    `\uD83D\uDC64 ${_esc(user)}`,
    `\uD83D\uDCE6 Ткани: ${_esc(fabricList)}`,
    '',
    `\uD83C\uDFE0 Получатель: ${_esc(req.recipient_name)}`,
    `\uD83D\uDCDE ${_esc(req.phone)}`,
    `\uD83D\uDCCD ПВЗ СДЭК: ${_esc(req.cdek_address)}`,
    '',
    `\u23F0 ${dt} (МСК)`,
  ].join('\n');
}

/** Экранирует HTML-спецсимволы */
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Форматирует число с двумя знаками */
function _fmt(n) {
  return parseFloat(n).toFixed(2).replace('.', ',');
}

/**
 * Подтверждение для клиента: заявка на ткани принята.
 */
function formatOrderConfirmation(order, items) {
  const itemLines = items.map(i =>
    `• ${_esc(i.fabric_name)} (${_esc(i.color_name)}) × ${i.meters} м`
  ).join('\n');

  return [
    `✅ <b>Ваша заявка #${order.order_number} принята!</b>`,
    '',
    `📦 <b>Состав:</b>`,
    itemLines,
    '',
    `💬 Менеджер свяжется с вами в ближайшее время для подтверждения деталей заявки и условий оплаты.`,
    '',
    `❓ Если есть вопросы — напишите нам: @Opt_100ffvl`,
  ].join('\n');
}

/**
 * Подтверждение для клиента: запрос образцов принят.
 */
function formatSampleConfirmation(req, items) {
  const fabricList = items.map(i => `• ${_esc(i.fabric_name)}`).join('\n');

  return [
    `✅ <b>Запрос образцов #${req.request_number} принят!</b>`,
    '',
    `🧵 <b>Запрошенные образцы:</b>`,
    fabricList,
    '',
    `📍 ПВЗ СДЭК: ${_esc(req.cdek_address)}`,
    `👤 Получатель: ${_esc(req.recipient_name)}`,
    '',
    `💬 Менеджер свяжется с вами в ближайшее время для подтверждения образцов и деталей отправки.`,
    '',
    `❓ Если есть вопросы — напишите нам: @Opt_100ffvl`,
  ].join('\n');
}

module.exports = {
  sendNotification,
  formatOrderNotification,
  formatSampleNotification,
  formatOrderConfirmation,
  formatSampleConfirmation,
};
