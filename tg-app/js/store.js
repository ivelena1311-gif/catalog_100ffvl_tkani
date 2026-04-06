/**
 * store.js — Состояние приложения
 * Хранит корзину, историю поиска, избранное и активные фильтры.
 * Все изменения проходят через методы Store — не менять state напрямую.
 *
 * Данные сохраняются в localStorage и восстанавливаются при перезапуске.
 */

'use strict';

const Store = (() => {

  // ================================================================
  // ВНУТРЕННЕЕ СОСТОЯНИЕ
  // ================================================================
  const state = {
    // Корзина: массив объектов {fabricId, colorId, colorName, meters}
    cart: [],
    // История поиска (последние 5 запросов)
    searchHistory: [],
    // Избранное: Set из fabricId
    favorites: new Set(),
    // Активные фильтры каталога
    filters: {
      category: 'Все',   // активная категория
    },
    // Последний активный цвет на экране товара {fabricId: colorId}
    lastSelectedColor: {},
  };

  // ================================================================
  // ПЕРСИСТЕНТНОСТЬ (localStorage)
  // ================================================================

  /** Загружает состояние из localStorage */
  function load() {
    try {
      const raw = localStorage.getItem('tg_fabric_store');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.cart)           state.cart = saved.cart;
      if (saved.searchHistory)  state.searchHistory = saved.searchHistory;
      if (saved.favorites)      state.favorites = new Set(saved.favorites);
      if (saved.filters)        state.filters = { ...state.filters, ...saved.filters };
    } catch (e) {
      // Если localStorage сломан — игнорируем, начинаем с чистого состояния
    }
  }

  /** Сохраняет состояние в localStorage */
  function save() {
    try {
      localStorage.setItem('tg_fabric_store', JSON.stringify({
        cart:          state.cart,
        searchHistory: state.searchHistory,
        favorites:     Array.from(state.favorites),
        filters:       state.filters,
      }));
    } catch (e) { /* ignore */ }
  }

  // ================================================================
  // КОРЗИНА
  // ================================================================

  /** Возвращает копию корзины */
  function getCart() {
    return [...state.cart];
  }

  /** Количество позиций в корзине */
  function getCartCount() {
    return state.cart.length;
  }

  /** Итоговая сумма заявки */
  function getCartTotal() {
    return state.cart.reduce((sum, item) => {
      const fabric = getFabricById(item.fabricId);
      if (!fabric) return sum;
      const price = getPriceForMeters(fabric, item.meters);
      return sum + price * item.meters;
    }, 0);
  }

  /** Ищет позицию в корзине по fabricId + colorId */
  function findCartItem(fabricId, colorId) {
    return state.cart.find(i => i.fabricId === fabricId && i.colorId === colorId);
  }

  /**
   * Добавляет позицию в корзину или обновляет метраж если уже есть.
   * @param {number} fabricId
   * @param {string} colorId
   * @param {number} meters
   */
  function addToCart(fabricId, colorId, meters) {
    const fabric = getFabricById(fabricId);
    if (!fabric) return;
    const color = getColorById(fabric, colorId);
    const snapped = snapToStep(meters, fabric.minOrder, fabric.step);

    const existing = findCartItem(fabricId, colorId);
    if (existing) {
      existing.meters = snapped;
    } else {
      state.cart.push({
        fabricId,
        colorId,
        colorName: color.name,
        meters: snapped,
      });
    }
    save();
  }

  /**
   * Обновляет метраж позиции в корзине.
   * @param {number} fabricId
   * @param {string} colorId
   * @param {number} meters
   */
  function updateCartItem(fabricId, colorId, meters) {
    const item = findCartItem(fabricId, colorId);
    if (!item) return;
    const fabric = getFabricById(fabricId);
    item.meters = snapToStep(meters, fabric.minOrder, fabric.step);
    save();
  }

  /**
   * Удаляет позицию из корзины.
   */
  function removeFromCart(fabricId, colorId) {
    state.cart = state.cart.filter(
      i => !(i.fabricId === fabricId && i.colorId === colorId)
    );
    save();
  }

  /** Очищает корзину */
  function clearCart() {
    state.cart = [];
    save();
  }

  // ================================================================
  // ИСТОРИЯ ПОИСКА
  // ================================================================

  function getSearchHistory() {
    return [...state.searchHistory];
  }

  /** Добавляет запрос в историю (дубликаты не добавляются, лимит 5) */
  function addSearchHistory(query) {
    const q = query.trim();
    if (!q) return;
    state.searchHistory = [q, ...state.searchHistory.filter(h => h !== q)].slice(0, 5);
    save();
  }

  function clearSearchHistory() {
    state.searchHistory = [];
    save();
  }

  // ================================================================
  // ИЗБРАННОЕ
  // ================================================================

  function getFavorites() {
    return new Set(state.favorites);
  }

  function isFavorite(fabricId) {
    return state.favorites.has(fabricId);
  }

  function toggleFavorite(fabricId) {
    if (state.favorites.has(fabricId)) {
      state.favorites.delete(fabricId);
    } else {
      state.favorites.add(fabricId);
    }
    save();
    return state.favorites.has(fabricId);
  }

  // ================================================================
  // ФИЛЬТРЫ КАТАЛОГА
  // ================================================================

  function getFilters() {
    return { ...state.filters };
  }

  function setCategory(category) {
    state.filters.category = category;
    save();
  }

  function resetFilters() {
    state.filters = { category: 'Все' };
    save();
  }

  // ================================================================
  // ПОСЛЕДНИЙ ВЫБРАННЫЙ ЦВЕТ (не персистируется)
  // ================================================================

  function getLastColor(fabricId) {
    return state.lastSelectedColor[fabricId] || null;
  }

  function setLastColor(fabricId, colorId) {
    state.lastSelectedColor[fabricId] = colorId;
  }

  // ================================================================
  // ФИЛЬТРАЦИЯ КАТАЛОГА (по текущим фильтрам)
  // ================================================================

  /**
   * Возвращает отфильтрованный список тканей.
   * @param {string} [searchQuery] — строка поиска (опционально)
   */
  function getFilteredFabrics(searchQuery) {
    let result = [...FABRICS];
    const { category } = state.filters;

    // Фильтр по категории
    if (category && category !== 'Все') {
      result = result.filter(f => f.category === category);
    }

    // Поиск (по названию, артикулу, составу)
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.article.toLowerCase().includes(q) ||
        f.composition.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
      );
    }

    return result;
  }

  // ================================================================
  // ИНИЦИАЛИЗАЦИЯ
  // ================================================================
  load();

  // ================================================================
  // ПУБЛИЧНОЕ API
  // ================================================================
  return {
    // Корзина
    getCart,
    getCartCount,
    getCartTotal,
    findCartItem,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,

    // История поиска
    getSearchHistory,
    addSearchHistory,
    clearSearchHistory,

    // Избранное
    getFavorites,
    isFavorite,
    toggleFavorite,

    // Фильтры
    getFilters,
    setCategory,
    resetFilters,
    getFilteredFabrics,

    // Последний цвет
    getLastColor,
    setLastColor,
  };
})();
