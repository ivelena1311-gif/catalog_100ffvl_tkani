'use strict';

/**
 * api.js — Клиент каталога (загрузка из /api/*)
 *
 * Загружает ткани и категории из Vercel Functions → Supabase,
 * нормализует формат API к формату, ожидаемому data.js / store.js / app.js,
 * и заполняет глобальные массивы FABRICS и CATEGORIES.
 *
 * Порядок загрузки скриптов: data.js → api.js → store.js → app.js
 */

const Catalog = (() => {

  const DEFAULT_COLOR = {
    id: 'c1',
    hex: '#888888',
    name: 'Уточнить у менеджера',
    stock: 100,
    rolls: 2,
  };

  /**
   * Преобразует объект ткани из формата REST API в формат,
   * совместимый с data.js (basePricePerMeter, minOrder, colors[], photos[]).
   */
  function _normalize(f) {
    return {
      id:                f.id,
      name:              f.name,
      article:           f.article,
      category:          f.categories?.name || '',
      composition:       f.composition,
      width:             f.width,
      density:           f.density,
      basePricePerMeter: parseFloat(f.base_price),
      cutPrice:          f.cut_price ? parseFloat(f.cut_price) : null,
      minOrder:          f.min_order,
      step:              f.step,
      unit:              f.unit || 'м',
      thumb:             f.thumb || 'linear-gradient(145deg,#ccc,#999)',
      description:       f.description || '',
      // colors и photos — только в ответе детального запроса (?id=N)
      colors:  (f.colors  && f.colors.length)  ? f.colors  : [DEFAULT_COLOR],
      photos:  (f.photos  && f.photos.length)  ? f.photos  : [],
    };
  }

  /**
   * Загружает список тканей и категорий,
   * мутирует глобальные массивы FABRICS и CATEGORIES.
   * @returns {Promise<void>}
   */
  async function load() {
    const [fabricsRaw, categoriesRaw, bannersData] = await Promise.all([
      fetch('/api/fabrics').then(r => {
        if (!r.ok) throw new Error(`/api/fabrics: ${r.status}`);
        return r.json();
      }),
      fetch('/api/categories').then(r => {
        if (!r.ok) throw new Error(`/api/categories: ${r.status}`);
        return r.json();
      }),
      fetch('/api/banners').then(r => r.ok ? r.json() : { banners: [], interval_ms: 4000 }),
    ]);

    // Заполняем глобальный FABRICS (определён в data.js)
    FABRICS.length = 0;
    fabricsRaw.forEach(f => FABRICS.push(_normalize(f)));

    // Заполняем глобальный CATEGORIES
    CATEGORIES.length = 0;
    CATEGORIES.push('Все');
    categoriesRaw.forEach(c => CATEGORIES.push(c.name));

    // Заполняем BANNERS и BANNER_SETTINGS (определены в data.js)
    BANNERS.length = 0;
    (bannersData.banners || []).forEach(b => BANNERS.push({
      id:       b.id,
      image:    b.image_url || null,
      gradient: b.gradient  || 'linear-gradient(135deg,#1a1108,#2d1f0a)',
      label:    b.label     || null,
      title:    b.title,
      subtitle: b.subtitle  || null,
      action:   b.action_type === 'category' ? { type: 'category', value: b.action_value }
              : b.action_type === 'fabric'   ? { type: 'fabric',   value: Number(b.action_value) }
              : null,
    }));
    BANNER_SETTINGS.interval_ms = bannersData.interval_ms || 4000;
  }

  /**
   * Загружает детальную карточку одной ткани
   * (с реальными colors[] и photos[]).
   * @param {number} id
   * @returns {Promise<object>} нормализованный объект ткани
   */
  async function fetchDetail(id) {
    const r = await fetch(`/api/fabrics?id=${id}`);
    if (!r.ok) throw new Error(`/api/fabrics?id=${id}: ${r.status}`);
    return _normalize(await r.json());
  }

  return { load, fetchDetail };
})();
