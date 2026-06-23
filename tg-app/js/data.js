/**
 * data.js — Статические данные и вспомогательные функции
 *
 * Каталог тканей (FABRICS) и категории (CATEGORIES) теперь загружаются
 * динамически из API через api.js → Supabase.
 * Здесь объявлены пустые массивы, которые api.js заполняет при старте.
 */

'use strict';

// ================================================================
// КАТАЛОГ ТКАНЕЙ — заполняется через Catalog.load() из api.js
// ================================================================
const FABRICS = [];

// ================================================================
// КАТЕГОРИИ — заполняется через Catalog.load() из api.js
// Первый элемент 'Все' добавляется api.js автоматически.
// ================================================================
const CATEGORIES = ['Все'];

// ================================================================
// БАННЕРЫ — заполняется динамически из /api/banners через api.js
// Управление: Админ-панель → вкладка «Баннеры»
// ================================================================
const BANNERS = [];

// ================================================================
// НАСТРОЙКИ БАННЕРОВ — заполняется из /api/banners через api.js
// ================================================================
const BANNER_SETTINGS = {
  max_visible:  3,
  interval_ms:  4000,
};

// ================================================================
// ДАННЫЕ МЕНЕДЖЕРА
// ================================================================
const MANAGER = {
  name:       'Менеджер 100FF VL',
  since:      '2006',
  tgUsername: 'tkani_100ffVL',   // без @, только username
  phone:      '+7 (812) 408-08-28',
  initials:   'VL',
};

// ================================================================
// ДЕМОНСТРАЦИОННАЯ ИСТОРИЯ ЗАКАЗОВ
// ================================================================
const DEMO_ORDERS = [
  {
    id: 2847,
    date: '14 марта 2025',
    status: 'processing',
    items: [
      { fabricId: 1,  colorId: 'c1', colorName: 'Уточнить у менеджера', meters: 50 },
      { fabricId: 13, colorId: 'c1', colorName: 'Уточнить у менеджера', meters: 80 },
      { fabricId: 65, colorId: 'c1', colorName: 'Уточнить у менеджера', meters: 60 },
    ],
    total: 1100,
  },
  {
    id: 2811,
    date: '2 марта 2025',
    status: 'done',
    items: [
      { fabricId: 34, colorId: 'c1', colorName: 'Уточнить у менеджера', meters: 100 },
      { fabricId: 49, colorId: 'c1', colorName: 'Уточнить у менеджера', meters: 80  },
      { fabricId: 61, colorId: 'c1', colorName: 'Уточнить у менеджера', meters: 50  },
    ],
    total: 2080,
  },
];

// ================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ================================================================

/**
 * Возвращает блоки цен для карточки товара.
 * Если у ткани задана cutPrice — показываем две цены (Вариант А).
 * Если cutPrice null — только оптовая цена.
 */
function getPriceTiers(fabric) {
  const tiers = [{ label: `от 50\u00A0м · оптовая`, price: fabric.basePricePerMeter }];
  if (fabric.cutPrice) {
    tiers.unshift({ label: `до 50\u00A0м · на отрез`, price: fabric.cutPrice });
  }
  return tiers;
}

/**
 * Цена для конкретного метража.
 * Если метров < 50 и задана cutPrice — возвращаем cutPrice.
 * Иначе — basePricePerMeter (оптовая).
 */
function getPriceForMeters(fabric, meters) {
  if (fabric.cutPrice && meters < 50) return fabric.cutPrice;
  return fabric.basePricePerMeter;
}

/** Форматирует цену: «4,95 уе./м» или «4,95 уе./кг» */
function formatPrice(num, unit) {
  const n = parseFloat(num);
  const str = Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
  return str + '\u00A0уе./' + (unit || 'м');
}

/** Округление до кратного, не меньше minOrder (поддерживает дроби, напр. 0.5) */
function snapToStep(value, minOrder, step) {
  const s = parseFloat(step) || 1;
  const m = parseFloat(minOrder) || s;
  const snapped = Math.round(value / s) * s;
  // Убираем floating-point артефакты (0.1+0.2=0.30000000004)
  const precision = (s.toString().split('.')[1] || '').length;
  return Math.max(m, parseFloat(snapped.toFixed(precision)));
}

/** Получить ткань по id */
function getFabricById(id) {
  return FABRICS.find(f => f.id === id) || null;
}

/** Получить цвет ткани по id цвета */
function getColorById(fabric, colorId) {
  return fabric.colors.find(c => String(c.id) === String(colorId)) || fabric.colors[0];
}

/** Первый цвет */
function getFirstAvailableColor(fabric) {
  return fabric.colors[0];
}

/** Метка статуса заказа */
function getOrderStatusLabel(status) {
  const map = {
    processing: { label: 'В обработке',  cls: 'status-processing' },
    confirmed:  { label: 'Подтверждена', cls: 'status-confirmed'  },
    done:       { label: 'Выполнена',    cls: 'status-done'       },
    cancelled:  { label: 'Отменена',     cls: 'status-cancelled'  },
  };
  return map[status] || map.processing;
}
