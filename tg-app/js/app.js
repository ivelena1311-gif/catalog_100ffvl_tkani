/**
 * app.js — Основная логика Telegram Mini App
 *
 * Содержит:
 *  1. Настройка Telegram WebApp SDK (с заглушкой для браузера)
 *  2. Роутер (навигация между экранами, анимации)
 *  3. MainButton / BackButton менеджер
 *  4. Рендер каждого экрана
 *  5. Bottom sheet (фильтры, запрос образца)
 *  6. Вспомогательные функции (toast, haptic)
 *  7. Инициализация
 */

'use strict';

/* ================================================================
   1. TELEGRAM WEBAPP SDK
   ================================================================ */

/**
 * Возвращает объект Telegram.WebApp или заглушку для работы в браузере.
 * В продакшене всегда будет настоящий SDK.
 */
const TG = window.Telegram?.WebApp || {
  ready:          () => {},
  expand:         () => {},
  colorScheme:    'light',
  themeParams:    {},
  initDataUnsafe: { user: { first_name: 'Иван', last_name: 'Петров', username: 'ivan_petrov' } },
  BackButton: {
    show: () => {}, hide: () => {},
    onClick: (fn) => { window._tgBack = fn; },
    offClick: () => {},
  },
  MainButton: {
    text: '',
    isVisible: false,
    setText(t)     { this.text = t; this._updateEl(); },
    show()         { this.isVisible = true;  this._updateEl(); },
    hide()         { this.isVisible = false; this._updateEl(); },
    enable()       { this._disabled = false; this._updateEl(); },
    disable()      { this._disabled = true;  this._updateEl(); },
    showProgress() { this._loading = true;   this._updateEl(); },
    hideProgress() { this._loading = false;  this._updateEl(); },
    onClick(fn)    { this._handler = fn; },
    offClick()     { this._handler = null; },
    _handler: null, _disabled: false, _loading: false,
    // Рендерим fallback-кнопку в браузере
    _updateEl() {
      let el = document.getElementById('_tg_main_btn');
      if (!el) {
        el = document.createElement('button');
        el.id = '_tg_main_btn';
        el.style.cssText = `
          position:fixed;bottom:0;left:0;right:0;height:52px;z-index:9999;
          background:#2AABEE;color:#fff;font-size:16px;font-weight:600;
          border:none;cursor:pointer;display:none;
          padding-bottom:env(safe-area-inset-bottom,0);
        `;
        el.addEventListener('click', () => this._handler?.());
        document.body.appendChild(el);
        // Поднимаем таб-бар чтобы не перекрывался
        const tabBar = document.getElementById('tab-bar');
        if (tabBar) tabBar.style.bottom = '52px';
        // Поднимаем экраны
        document.querySelectorAll('.screen:not(.no-tabbar)').forEach(s => {
          s.style.bottom = 'calc(60px + 52px)';
        });
      }
      el.textContent = this._loading ? '...' : this.text;
      el.style.display = this.isVisible ? 'block' : 'none';
      el.disabled = !!this._disabled;
    },
  },
  HapticFeedback: {
    impactOccurred:       () => {},
    notificationOccurred: () => {},
    selectionChanged:     () => {},
  },
  showPopup:         ({ message }) => alert(message),
  showAlert:         (msg, cb)    => { alert(msg); cb?.(); },
  showConfirm:       (msg, cb)    => cb(confirm(msg)),
  openTelegramLink:  (url)        => window.open('https://t.me/' + url, '_blank'),
  openLink:          (url)        => window.open(url, '_blank'),
  sendData:          (data)       => console.log('sendData:', data),
};

/* ================================================================
   2. РОУТЕР
   ================================================================ */

const Router = (() => {
  // Стек навигации — массив id экранов
  let history = ['catalog'];
  // Экраны, относящиеся к Tab Bar (при переключении между ними — без анимации)
  const TAB_SCREENS = ['catalog', 'search', 'cart', 'profile'];
  // Экраны без Tab Bar
  const NO_TAB_SCREENS = ['checkout', 'success'];

  /** Текущий активный экран */
  function current() {
    return history[history.length - 1];
  }

  /** Переход на новый экран вперёд */
  function push(screenId, renderFn) {
    if (current() === screenId) return;
    renderFn?.();

    const fromEl = document.getElementById('screen-' + current());
    const toEl   = document.getElementById('screen-' + screenId);
    if (!fromEl || !toEl) return;

    history.push(screenId);
    _animateForward(fromEl, toEl);
    _updateUI(screenId);
  }

  /** Переключение вкладки Tab Bar (без анимации slide) */
  function tab(screenId) {
    if (current() === screenId && history.length === 1) return;

    // Рендерим экран перед показом
    _renderScreen(screenId);

    const fromEl = document.getElementById('screen-' + current());
    const toEl   = document.getElementById('screen-' + screenId);
    if (!fromEl || !toEl) return;

    history = [screenId];

    // Мгновенное переключение без slide-анимации
    fromEl.classList.remove('active');
    fromEl.style.transform = '';
    fromEl.style.visibility = 'hidden';

    toEl.style.transition = 'none';
    toEl.style.transform = 'translateX(0)';
    toEl.style.visibility = 'visible';
    toEl.classList.add('active');
    // Принудительный reflow, потом убираем transition
    toEl.getBoundingClientRect();
    toEl.style.transition = '';

    _updateUI(screenId);
  }

  /** Навигация назад */
  function back() {
    if (history.length <= 1) return;

    const fromId = history.pop();
    const toId   = current();

    const fromEl = document.getElementById('screen-' + fromId);
    const toEl   = document.getElementById('screen-' + toId);
    if (!fromEl || !toEl) return;

    _animateBack(fromEl, toEl);
    _updateUI(toId);
  }

  // --- Анимации ---

  function _animateForward(fromEl, toEl) {
    // toEl приходит справа
    toEl.style.transition = 'none';
    toEl.style.transform  = 'translateX(100%)';
    toEl.style.visibility = 'visible';
    toEl.classList.add('active');

    // Принудительный reflow
    toEl.getBoundingClientRect();

    const dur = '0.28s cubic-bezier(0.4,0,0.2,1)';
    fromEl.style.transition = `transform ${dur}`;
    toEl.style.transition   = `transform ${dur}`;

    requestAnimationFrame(() => {
      toEl.style.transform   = 'translateX(0)';
      fromEl.style.transform = 'translateX(-25%)';
    });

    setTimeout(() => {
      fromEl.classList.remove('active');
      fromEl.style.transform  = '';
      fromEl.style.visibility = 'hidden';
      fromEl.style.transition = '';
      toEl.style.transition   = '';
    }, 290);
  }

  function _animateBack(fromEl, toEl) {
    // toEl был сдвинут влево
    toEl.style.transition = 'none';
    toEl.style.transform  = 'translateX(-25%)';
    toEl.style.visibility = 'visible';
    toEl.classList.add('active');

    // Принудительный reflow
    toEl.getBoundingClientRect();

    const dur = '0.28s cubic-bezier(0.4,0,0.2,1)';
    fromEl.style.transition = `transform ${dur}`;
    toEl.style.transition   = `transform ${dur}`;

    requestAnimationFrame(() => {
      fromEl.style.transform = 'translateX(100%)';
      toEl.style.transform   = 'translateX(0)';
    });

    setTimeout(() => {
      fromEl.classList.remove('active');
      fromEl.style.transform  = '';
      fromEl.style.visibility = 'hidden';
      fromEl.style.transition = '';
      toEl.style.transition   = '';
    }, 290);
  }

  // --- Обновление UI ---

  function _updateUI(screenId) {
    // BackButton Telegram
    if (history.length > 1) {
      TG.BackButton.show();
    } else {
      TG.BackButton.hide();
    }

    // Tab Bar: подсветка активного таба, скрытие на checkout/success
    const tabBar = document.getElementById('tab-bar');
    if (NO_TAB_SCREENS.includes(screenId)) {
      tabBar.style.display = 'none';
    } else {
      tabBar.style.display = 'flex';
    }

    document.querySelectorAll('.tab-item').forEach(item => {
      item.classList.toggle('active', item.dataset.screen === screenId);
    });

    // MainButton: скрываем по умолчанию, каждый экран настраивает сам
    TG.MainButton.hide();
  }

  /** Рендер экрана при переключении таба */
  function _renderScreen(screenId) {
    if (screenId === 'catalog') renderCatalog();
    if (screenId === 'cart')    renderCart();
    if (screenId === 'profile') renderProfile();
    // search и product рендерятся при открытии
  }

  return { current, push, tab, back, history: () => [...history] };
})();

/* ================================================================
   3. MAINBUTTON МЕНЕДЖЕР
   ================================================================ */

/** Устанавливает MainButton (текст, обработчик) или скрывает */
function setMainButton(text, handler, options = {}) {
  TG.MainButton.offClick(TG.MainButton._handler);
  if (!text) {
    TG.MainButton.hide();
    return;
  }
  TG.MainButton.setText(text);
  TG.MainButton.onClick(handler);
  options.disabled ? TG.MainButton.disable() : TG.MainButton.enable();
  TG.MainButton.show();
}

/* ================================================================
   4. РЕНДЕР ЭКРАНОВ
   ================================================================ */

// ---- 4.1 КАТАЛОГ ----

function renderCatalog() {
  const filters    = Store.getFilters();
  const fabrics    = Store.getFilteredFabrics();
  const grid       = document.getElementById('catalog-grid');
  const countEl    = document.getElementById('catalog-count');
  const catsBar    = document.getElementById('categories-bar');

  // Категории
  catsBar.innerHTML = CATEGORIES.map(cat => `
    <button
      class="chip ${filters.category === cat ? 'active' : ''}"
      data-category="${cat}"
      role="tab"
      aria-selected="${filters.category === cat}"
    >${cat}</button>
  `).join('');

  // Счётчик
  countEl.textContent = fabrics.length
    ? `Показано: ${fabrics.length} ${_pluralize(fabrics.length, 'позиция', 'позиции', 'позиций')}`
    : '';

  // Сетка
  if (!fabrics.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon">&#129717;</div>
        <div class="empty-state-title">Ничего не найдено</div>
        <div class="empty-state-text">Попробуйте изменить категорию или сбросить фильтры</div>
        <button class="btn-secondary" style="max-width:200px" id="reset-filters-inline">Сбросить фильтры</button>
      </div>
    `;
    document.getElementById('reset-filters-inline')?.addEventListener('click', () => {
      Store.resetFilters();
      renderCatalog();
    });
    return;
  }

  grid.innerHTML = fabrics.map(fabric => _fabricCardHTML(fabric)).join('');

  // Скрываем MainButton на каталоге
  TG.MainButton.hide();
}

/** HTML одной карточки ткани */
function _fabricCardHTML(fabric) {
  const firstColor  = getFirstAvailableColor(fabric);
  const stockInfo   = getStockStatus(firstColor.stock);
  const thumbStyle  = `background:${fabric.thumb}`;

  return `
    <div class="fabric-card" data-fabric-id="${fabric.id}" role="button" tabindex="0">
      <div class="fabric-thumb" style="${thumbStyle}"></div>
      <div class="fabric-card-body">
        <div class="fabric-card-name">${fabric.name}</div>
        <div class="fabric-card-composition">${fabric.composition}</div>
        <div class="fabric-card-params">${fabric.width}&nbsp;см · ${fabric.density}&nbsp;г/м²</div>
        <div class="fabric-card-price">${formatPrice(fabric.basePricePerMeter)}/м</div>
        <div class="fabric-card-stock ${stockInfo.cls}">${stockInfo.label}</div>
      </div>
    </div>
  `;
}

// ---- 4.2 КАРТОЧКА ТОВАРА ----

/** Текущее состояние экрана продукта */
let _product = { fabric: null, colorId: null, meters: 0 };

function renderProduct(fabricId, colorId) {
  const fabric = getFabricById(fabricId);
  if (!fabric) return;

  // Восстанавливаем последний выбранный цвет или берём первый доступный
  const savedColor = colorId || Store.getLastColor(fabricId);
  const initColor  = fabric.colors.find(c => c.id === savedColor) || getFirstAvailableColor(fabric);

  _product.fabric  = fabric;
  _product.colorId = initColor.id;
  _product.meters  = snapToStep(fabric.minOrder, fabric.minOrder, fabric.step);

  _renderGallery(fabric, initColor);
  _renderProductInfo(fabric, initColor);
  _updateFavBtn(fabric.id);
  _updateProductMainButton();
}

function _renderGallery(fabric, color) {
  const slidesEl = document.getElementById('gallery-slides');
  const dotsEl   = document.getElementById('gallery-dots');

  // Создаём 3 слайда: три вариации одного цвета
  const slides = [
    `background:${color.hex}`,
    `background: linear-gradient(160deg, ${_lighten(color.hex, 20)} 0%, ${color.hex} 50%, ${_darken(color.hex, 15)} 100%)`,
    `background: ${color.hex}; background-image: repeating-linear-gradient(-30deg, transparent, transparent 8px, rgba(255,255,255,0.06) 8px, rgba(255,255,255,0.06) 9px)`,
  ];

  slidesEl.innerHTML = slides.map((style, i) => `
    <div class="gallery-slide" style="${style}" data-index="${i}"></div>
  `).join('');

  dotsEl.innerHTML = slides.map((_, i) => `
    <div class="gallery-dot ${i === 0 ? 'active' : ''}"></div>
  `).join('');

  slidesEl.style.transform = 'translateX(0)';

  // Touch-навигация по слайдам
  _initGallerySwipe(slidesEl, dotsEl, slides.length);
}

let _galleryIndex = 0;

function _initGallerySwipe(slidesEl, dotsEl, count) {
  _galleryIndex = 0;
  let startX = 0;

  const gallery = document.getElementById('product-gallery');
  gallery.ontouchstart = e => { startX = e.touches[0].clientX; };
  gallery.ontouchend   = e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) < 40) return;
    if (diff > 0 && _galleryIndex < count - 1) _galleryIndex++;
    if (diff < 0 && _galleryIndex > 0)         _galleryIndex--;
    _updateGallery(slidesEl, dotsEl);
  };
}

function _updateGallery(slidesEl, dotsEl) {
  slidesEl.style.transition = 'transform 0.3s ease';
  slidesEl.style.transform  = `translateX(${-_galleryIndex * 100}%)`;
  dotsEl.querySelectorAll('.gallery-dot').forEach((d, i) => {
    d.classList.toggle('active', i === _galleryIndex);
  });
}

function _renderProductInfo(fabric, color) {
  const infoEl    = document.getElementById('product-info');
  const tiers     = getPriceTiers(fabric);
  const cartItem  = Store.findCartItem(fabric.id, color.id);
  const initMeters = cartItem ? cartItem.meters : _product.meters;
  const price     = getPriceForMeters(fabric, initMeters);
  const total     = price * initMeters;
  const stock     = getStockStatus(color.stock);

  infoEl.innerHTML = `
    <!-- Название и артикул -->
    <div>
      <div class="product-name">${fabric.name}</div>
      <div class="product-article">Арт. ${fabric.article}</div>
    </div>

    <!-- Параметры -->
    <div class="product-params">
      <span class="param-chip">${fabric.composition}</span>
      <span class="param-chip">&#8596; ${fabric.width}&nbsp;см</span>
      <span class="param-chip">${fabric.density}&nbsp;г/м²</span>
    </div>

    <!-- Цвета -->
    <div>
      <div class="color-section-title">Цвет</div>
      <div class="color-swatches">
        ${fabric.colors.map(c => `
          <div
            class="color-swatch ${c.id === color.id ? 'active' : ''} ${c.stock === 0 ? 'out-of-stock' : ''}"
            data-color-id="${c.id}"
            style="background:${c.hex}"
            title="${c.name}"
          ></div>
        `).join('')}
      </div>
      <div class="color-name" id="color-name-label">${color.name}${color.stock === 0 ? ' — нет в наличии' : ''}</div>
    </div>

    <!-- Цена -->
    <div class="price-block">
      <div class="price-main" id="price-main">${formatPrice(price)}<span style="font-size:16px;font-weight:400">/м</span></div>
      <div class="price-meta">от ${fabric.minOrder}&nbsp;м · кратно ${fabric.step}&nbsp;м</div>
      <div class="price-tiers-toggle" id="tiers-toggle">
        &#9660; Скидки по объёму
      </div>
      <div class="price-tiers-table" id="tiers-table">
        ${tiers.map(t => `
          <div class="tier-row">
            <span>${t.label}</span>
            <span>${formatPrice(t.price)}/м</span>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Остаток -->
    <div class="stock-block ${stock.cls}">
      ${color.stock > 0
        ? `&#9989; ${color.stock}&nbsp;м в наличии / ${getColorById(fabric, color.id).rolls || 0}&nbsp;рул.`
        : '&#10060; Нет в наличии'}
    </div>

    <!-- Счётчик метража -->
    <div>
      <div class="color-section-title">Метраж</div>
      <div class="meter-counter">
        <button class="counter-btn" id="meter-minus">&#8722;</button>
        <input
          type="number"
          class="counter-input"
          id="meter-input"
          value="${initMeters}"
          min="${fabric.minOrder}"
          step="${fabric.step}"
          inputmode="numeric"
        >
        <button class="counter-btn" id="meter-plus">&#43;</button>
      </div>
      <div class="counter-total" id="counter-total">${formatPrice(total)}</div>
      <div class="counter-hint" id="counter-hint">
        ${formatPrice(price)}/м · ${initMeters}&nbsp;м
      </div>
    </div>

    <!-- Запрос образца -->
    <button class="sample-btn" id="sample-btn">
      &#128196; Запросить образец бесплатно
    </button>

    <!-- Описание -->
    <div class="product-description">${fabric.description}</div>
  `;

  // Слушатели событий
  _bindProductEvents(fabric);
}

function _bindProductEvents(fabric) {
  // Переключение цветовых свотчей
  document.querySelectorAll('#product-info .color-swatch').forEach(el => {
    el.addEventListener('click', () => {
      const colorId = el.dataset.colorId;
      _product.colorId = colorId;
      Store.setLastColor(fabric.id, colorId);

      const color = getColorById(fabric, colorId);

      // Обновляем галерею
      _renderGallery(fabric, color);
      _galleryIndex = 0;

      // Обновляем активный свотч
      document.querySelectorAll('#product-info .color-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.colorId === colorId);
      });

      // Обновляем название цвета
      const label = document.getElementById('color-name-label');
      if (label) label.textContent = color.name + (color.stock === 0 ? ' — нет в наличии' : '');

      // Обновляем остаток
      const stockBlock = document.querySelector('#product-info .stock-block');
      if (stockBlock) {
        const s = getStockStatus(color.stock);
        stockBlock.className = `stock-block ${s.cls}`;
        stockBlock.innerHTML = color.stock > 0
          ? `&#9989; ${color.stock}&nbsp;м в наличии / ${color.rolls || 0}&nbsp;рул.`
          : '&#10060; Нет в наличии';
      }

      _updateProductMainButton();
      TG.HapticFeedback.selectionChanged();
    });
  });

  // Счётчик метража
  const minusBtn  = document.getElementById('meter-minus');
  const plusBtn   = document.getElementById('meter-plus');
  const meterInput = document.getElementById('meter-input');

  function updateMeters(newVal) {
    const snapped        = snapToStep(newVal, fabric.minOrder, fabric.step);
    _product.meters      = snapped;
    meterInput.value     = snapped;

    const color = getColorById(fabric, _product.colorId);
    const price = getPriceForMeters(fabric, snapped);
    const total = price * snapped;

    document.getElementById('price-main').innerHTML =
      `${formatPrice(price)}<span style="font-size:16px;font-weight:400">/м</span>`;
    document.getElementById('counter-total').textContent = formatPrice(total);
    document.getElementById('counter-hint').textContent  =
      `${formatPrice(price)}/м · ${snapped}\u00A0м`;

    // Подсвечиваем активный тариф
    const tiers = getPriceTiers(fabric);
    document.querySelectorAll('#tiers-table .tier-row').forEach((row, i) => {
      const tier  = tiers[i];
      const active = price === tier.price;
      row.classList.toggle('current', active);
    });

    _updateProductMainButton();
  }

  minusBtn?.addEventListener('click', () => {
    const cur = parseInt(meterInput.value) || fabric.minOrder;
    updateMeters(cur - fabric.step);
    TG.HapticFeedback.impactOccurred('light');
  });

  plusBtn?.addEventListener('click', () => {
    const cur = parseInt(meterInput.value) || fabric.minOrder;
    updateMeters(cur + fabric.step);
    TG.HapticFeedback.impactOccurred('light');
  });

  meterInput?.addEventListener('change', () => {
    updateMeters(parseInt(meterInput.value) || fabric.minOrder);
  });

  // Раскрытие тарифов
  document.getElementById('tiers-toggle')?.addEventListener('click', () => {
    const table = document.getElementById('tiers-table');
    table?.classList.toggle('visible');
    TG.HapticFeedback.selectionChanged();
  });

  // Запрос образца
  document.getElementById('sample-btn')?.addEventListener('click', () => {
    openSampleSheet(fabric);
  });
}

/** Обновляет текст MainButton на экране продукта */
function _updateProductMainButton() {
  const { fabric, colorId, meters } = _product;
  if (!fabric) return;

  const color   = getColorById(fabric, colorId);
  const inCart  = Store.findCartItem(fabric.id, colorId);
  const noStock = color.stock === 0;

  if (noStock) {
    setMainButton('Нет в наличии', null, { disabled: true });
    return;
  }

  if (inCart) {
    setMainButton(`В заявке ✓ · Перейти`, () => {
      Router.tab('cart');
    });
  } else {
    setMainButton(`+ Добавить к заявке · ${meters}\u00A0м`, () => {
      Store.addToCart(fabric.id, colorId, meters);
      updateCartBadge();
      TG.HapticFeedback.notificationOccurred('success');
      showToast('Добавлено к заявке');
      _updateProductMainButton();
    });
  }
}

/** Обновляет кнопку избранного */
function _updateFavBtn(fabricId) {
  const btn = document.getElementById('fav-btn');
  if (!btn) return;
  const isFav = Store.isFavorite(fabricId);
  btn.innerHTML = isFav ? '&#9829;' : '&#9825;';
  btn.classList.toggle('active', isFav);
}

// ---- 4.3 ПОИСК ----

let _searchTimer = null;

function renderSearch() {
  renderSearchContent('');
  const input = document.getElementById('search-input');
  input?.focus();
}

function renderSearchContent(query) {
  const contentEl = document.getElementById('search-content');

  if (!query.trim()) {
    // Показываем историю
    const history = Store.getSearchHistory();
    if (!history.length) {
      contentEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#128269;</div>
          <div class="empty-state-text">Введите название ткани, артикул или состав</div>
        </div>
      `;
      return;
    }

    contentEl.innerHTML = `
      <div class="search-history">
        <div class="search-section-title">Недавние поиски</div>
        ${history.map(h => `
          <div class="search-history-item" data-query="${h}">
            <span class="history-icon">&#128336;</span>
            <span>${h}</span>
          </div>
        `).join('')}
      </div>
    `;

    contentEl.querySelectorAll('.search-history-item').forEach(el => {
      el.addEventListener('click', () => {
        const input = document.getElementById('search-input');
        if (input) { input.value = el.dataset.query; }
        renderSearchContent(el.dataset.query);
      });
    });
    return;
  }

  // Ищем
  const results = Store.getFilteredFabrics(query);
  Store.addSearchHistory(query);

  if (!results.length) {
    contentEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#129717;</div>
        <div class="empty-state-title">Ничего не найдено</div>
        <div class="empty-state-text">Попробуйте другой запрос</div>
      </div>
    `;
    return;
  }

  contentEl.innerHTML = `
    <div class="search-results">
      <div class="search-section-title">Найдено: ${results.length}</div>
      ${results.map(f => {
        const color = getFirstAvailableColor(f);
        const stock = getStockStatus(color.stock);
        return `
          <div class="search-result-item" data-fabric-id="${f.id}">
            <div class="search-result-thumb" style="background:${f.thumb}"></div>
            <div class="search-result-info">
              <div class="search-result-name">${f.name}</div>
              <div class="search-result-sub">${f.composition} · ${f.width}&nbsp;см</div>
              <div class="search-result-sub ${stock.cls}">${stock.label}</div>
            </div>
            <div class="search-result-price">${formatPrice(f.basePricePerMeter)}/м</div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  contentEl.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const fabricId = parseInt(el.dataset.fabricId);
      Router.push('product', () => renderProduct(fabricId));
    });
  });
}

// ---- 4.4 КОРЗИНА ----

function renderCart() {
  const cart    = Store.getCart();
  const cartEl  = document.getElementById('cart-content');
  const countEl = document.getElementById('cart-header-count');

  if (countEl) {
    countEl.textContent = cart.length
      ? `(${cart.length} ${_pluralize(cart.length, 'позиция', 'позиции', 'позиций')})`
      : '';
  }

  if (!cart.length) {
    cartEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128203;</div>
        <div class="empty-state-title">Заявка пуста</div>
        <div class="empty-state-text">Добавьте ткани из каталога</div>
        <button class="btn-primary" style="max-width:220px;margin-top:8px" id="go-catalog-btn">
          Перейти в каталог
        </button>
      </div>
    `;
    document.getElementById('go-catalog-btn')?.addEventListener('click', () => Router.tab('catalog'));
    TG.MainButton.hide();
    return;
  }

  const total    = Store.getCartTotal();
  const totalMeters = cart.reduce((s, i) => s + i.meters, 0);

  cartEl.innerHTML = `
    <div class="cart-list" id="cart-list">
      ${cart.map(item => _cartItemHTML(item)).join('')}
    </div>

    <button class="cart-add-more" id="cart-add-more">
      &#43; Добавить ещё ткани
    </button>

    <div class="cart-total-block">
      <div class="cart-total-row">
        <span>Позиций</span><span>${cart.length}</span>
      </div>
      <div class="cart-total-row">
        <span>Общий метраж</span><span>${totalMeters}&nbsp;м</span>
      </div>
      <div class="cart-total-row main">
        <span>Итого</span>
        <span class="cart-total-price">${formatPrice(total)}</span>
      </div>
      <div class="cart-disclaimer">
        * Финальная стоимость согласуется с менеджером после отправки заявки
      </div>
    </div>
  `;

  // Делегирование событий
  document.getElementById('cart-list')?.addEventListener('click', e => {
    const item   = e.target.closest('[data-cart-item]');
    if (!item) return;
    const fabricId = parseInt(item.dataset.fabricId);
    const colorId  = item.dataset.colorId;
    const fabric   = getFabricById(fabricId);

    if (e.target.closest('.cart-item-delete')) {
      TG.showConfirm('Убрать позицию из заявки?', confirmed => {
        if (!confirmed) return;
        Store.removeFromCart(fabricId, colorId);
        updateCartBadge();
        renderCart();
        TG.HapticFeedback.notificationOccurred('warning');
      });
      return;
    }

    if (e.target.closest('.cart-counter-btn')) {
      const btn = e.target.closest('.cart-counter-btn');
      const valEl = item.querySelector('.cart-counter-val');
      const cur = parseInt(valEl.textContent) || fabric.minOrder;
      const delta = btn.dataset.dir === 'plus' ? fabric.step : -fabric.step;
      const newVal = snapToStep(cur + delta, fabric.minOrder, fabric.step);
      Store.updateCartItem(fabricId, colorId, newVal);
      renderCart();
      TG.HapticFeedback.impactOccurred('light');
    }
  });

  document.getElementById('cart-add-more')?.addEventListener('click', () => Router.tab('catalog'));

  // MainButton
  setMainButton(`Оформить заявку (${cart.length})`, () => {
    Router.push('checkout', () => renderCheckout());
  });
}

function _cartItemHTML(item) {
  const fabric = getFabricById(item.fabricId);
  if (!fabric) return '';
  const color = getColorById(fabric, item.colorId);
  const price = getPriceForMeters(fabric, item.meters);
  const total = price * item.meters;

  return `
    <div class="cart-item" data-cart-item data-fabric-id="${fabric.id}" data-color-id="${item.colorId}">
      <div class="cart-item-thumb" style="background:${fabric.thumb}"></div>
      <div class="cart-item-info">
        <div class="cart-item-name">${fabric.name}</div>
        <div class="cart-item-sub">
          Арт. ${fabric.article} ·
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color.hex};vertical-align:middle"></span>
          ${color.name}
        </div>
        <div class="cart-counter">
          <button class="cart-counter-btn" data-dir="minus">&#8722;</button>
          <span class="cart-counter-val">${item.meters}</span>
          <span style="font-size:12px;color:var(--tg-hint)">м</span>
          <button class="cart-counter-btn" data-dir="plus">&#43;</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
        <div class="cart-item-price">${formatPrice(total)}</div>
        <button class="cart-item-delete" aria-label="Удалить">&#128465;</button>
      </div>
    </div>
  `;
}

// ---- 4.5 ОФОРМЛЕНИЕ ЗАЯВКИ ----

function renderCheckout() {
  const cart    = Store.getCart();
  const total   = Store.getCartTotal();
  const user    = TG.initDataUnsafe?.user;

  // Предзаполнение из Telegram-профиля
  const nameField  = document.getElementById('field-name');
  const phoneField = document.getElementById('field-phone');
  if (nameField && user) {
    nameField.value = [user.first_name, user.last_name].filter(Boolean).join(' ');
  }

  // Сводка
  const summaryEl = document.getElementById('checkout-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="checkout-summary-row">
        <span>Позиций</span><span>${cart.length}</span>
      </div>
      <div class="checkout-summary-row">
        <span>Общий метраж</span><span>${cart.reduce((s, i) => s + i.meters, 0)}&nbsp;м</span>
      </div>
      <div class="checkout-summary-row checkout-summary-total">
        <span>Примерная сумма</span>
        <span style="color:var(--price-color)">${formatPrice(total)}</span>
      </div>
    `;
  }

  // MainButton
  setMainButton('Отправить заявку', _submitOrder);

  // Валидация в реальном времени
  const phoneEl = document.getElementById('field-phone');
  phoneEl?.addEventListener('input', () => {
    const valid = phoneEl.value.replace(/\D/g, '').length >= 10;
    valid ? TG.MainButton.enable() : TG.MainButton.disable();
  });
  TG.MainButton.disable(); // Пока телефон не введён
}

function _submitOrder() {
  const phone = document.getElementById('field-phone')?.value || '';
  if (phone.replace(/\D/g, '').length < 10) {
    TG.showAlert('Введите корректный номер телефона');
    return;
  }

  TG.MainButton.showProgress();
  TG.MainButton.disable();

  // Имитируем отправку (в реальном проекте — fetch к API)
  setTimeout(() => {
    const orderNum = Math.floor(2850 + Math.random() * 100);
    Store.clearCart();
    updateCartBadge();
    TG.MainButton.hideProgress();
    Router.push('success', () => renderSuccess(orderNum));
    TG.HapticFeedback.notificationOccurred('success');
  }, 1200);
}

// ---- 4.6 ЭКРАН УСПЕХА ----

function renderSuccess(orderNum) {
  const el = document.getElementById('success-content');
  el.innerHTML = `
    <div class="success-icon">&#9989;</div>
    <div class="success-title">Заявка отправлена!</div>
    <div class="success-text">
      ${MANAGER.name} свяжется с вами до&nbsp;18:00 по московскому времени
    </div>
    <div class="success-order-num">Номер заявки: #${orderNum}</div>
    <button class="success-manager-btn" id="contact-manager-btn">
      &#128172; Написать менеджеру сейчас
    </button>
  `;

  document.getElementById('contact-manager-btn')?.addEventListener('click', () => {
    TG.openTelegramLink(MANAGER.tgUsername);
  });

  setMainButton('Вернуться в каталог', () => {
    Router.tab('catalog');
  });
}

// ---- 4.7 ПРОФИЛЬ ----

function renderProfile() {
  const user    = TG.initDataUnsafe?.user;
  const orders  = DEMO_ORDERS;
  const initials = user
    ? ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase()
    : '??';
  const fullName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : 'Гость';

  const profileEl = document.getElementById('profile-content');
  profileEl.innerHTML = `

    <!-- Блок пользователя -->
    <div class="profile-user-card">
      <div class="profile-avatar">${initials}</div>
      <div class="profile-user-info">
        <div class="profile-user-name">${fullName}</div>
        ${user?.username ? `<div class="profile-user-sub">@${user.username}</div>` : ''}
      </div>
    </div>

    <!-- Менеджер -->
    <div class="manager-card">
      <div class="manager-card-header">Ваш менеджер</div>
      <div class="manager-info">
        <div class="manager-avatar">${MANAGER.initials}</div>
        <div>
          <div class="manager-name">${MANAGER.name}</div>
          <div class="manager-since">В тканях с ${MANAGER.since} года</div>
        </div>
      </div>
      <button class="manager-contact-btn" id="manager-contact-btn">
        &#128172; Написать в Telegram
      </button>
    </div>

    <!-- История заказов -->
    <div>
      <div class="orders-section-title">История заявок</div>
      ${orders.map(order => {
        const st = getOrderStatusLabel(order.status);
        return `
          <div class="order-card">
            <div class="order-card-header">
              <div>
                <div class="order-id">#${order.id}</div>
                <div class="order-date">${order.date}</div>
              </div>
              <span class="order-status ${st.cls}">${st.label}</span>
            </div>
            <div class="order-meta">
              ${order.items.length} ${_pluralize(order.items.length, 'позиция', 'позиции', 'позиций')}
              · ${order.items.reduce((s, i) => s + i.meters, 0)}&nbsp;м
            </div>
            <div class="order-total">${formatPrice(order.total)}</div>
            <button class="order-repeat-btn" data-order-id="${order.id}">
              &#8635; Повторить заявку
            </button>
          </div>
        `;
      }).join('')}
    </div>

  `;

  document.getElementById('manager-contact-btn')?.addEventListener('click', () => {
    TG.openTelegramLink(MANAGER.tgUsername);
    TG.HapticFeedback.impactOccurred('medium');
  });

  document.querySelectorAll('.order-repeat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = parseInt(btn.dataset.orderId);
      const order   = DEMO_ORDERS.find(o => o.id === orderId);
      if (!order) return;

      order.items.forEach(item => {
        Store.addToCart(item.fabricId, item.colorId, item.meters);
      });
      updateCartBadge();
      TG.HapticFeedback.notificationOccurred('success');
      showToast('Позиции добавлены в заявку');
      Router.tab('cart');
    });
  });

  // Скрываем MainButton
  TG.MainButton.hide();
}

/* ================================================================
   5. BOTTOM SHEETS
   ================================================================ */

// ---- 5.1 ФИЛЬТРЫ ----

function openFiltersSheet() {
  const contentEl = document.getElementById('filters-content');
  const filters   = Store.getFilters();

  contentEl.innerHTML = `
    <!-- Тип ткани -->
    <div class="filter-section">
      <div class="filter-section-title">Тип ткани</div>
      <div class="filter-chips">
        ${CATEGORIES.slice(1).map(cat => `
          <button
            class="chip ${filters.category === cat ? 'active' : ''}"
            data-filter-cat="${cat}"
          >${cat}</button>
        `).join('')}
      </div>
    </div>

    <!-- Только в наличии -->
    <div class="filter-section">
      <div class="filter-toggle" id="stock-toggle">
        <span class="filter-toggle-label">Только в наличии</span>
        <div class="toggle-switch ${filters.inStock ? 'on' : ''}" id="stock-toggle-switch"></div>
      </div>
    </div>
  `;

  // Слушатели фильтров
  contentEl.querySelectorAll('[data-filter-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      contentEl.querySelectorAll('[data-filter-cat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Store.setCategory(btn.dataset.filterCat);
      TG.HapticFeedback.selectionChanged();
      _updateFiltersApplyBtn();
    });
  });

  document.getElementById('stock-toggle')?.addEventListener('click', () => {
    const sw = document.getElementById('stock-toggle-switch');
    const newVal = !Store.getFilters().inStock;
    Store.setInStock(newVal);
    sw?.classList.toggle('on', newVal);
    TG.HapticFeedback.selectionChanged();
    _updateFiltersApplyBtn();
  });

  document.getElementById('filters-reset-btn')?.addEventListener('click', () => {
    Store.resetFilters();
    openFiltersSheet(); // Перерисовываем панель
    TG.HapticFeedback.impactOccurred('light');
  });

  // Fallback-кнопка (для браузера) или MainButton
  _updateFiltersApplyBtn();

  showSheet('filters');
}

function _updateFiltersApplyBtn() {
  const filtered = Store.getFilteredFabrics();
  const text     = `Показать ${filtered.length} ${_pluralize(filtered.length, 'позицию', 'позиции', 'позиций')}`;

  const wrapEl = document.getElementById('filters-apply-wrap');
  wrapEl.innerHTML = `<button class="btn-primary" id="filters-apply-btn">${text}</button>`;
  document.getElementById('filters-apply-btn')?.addEventListener('click', () => {
    closeSheet('filters');
    renderCatalog();
    TG.HapticFeedback.impactOccurred('medium');
  });
}

// ---- 5.2 ЗАПРОС ОБРАЗЦА ----

function openSampleSheet(fabric) {
  const contentEl = document.getElementById('sheet-sample-content');
  const color     = getColorById(fabric, _product.colorId);

  contentEl.innerHTML = `
    <div style="margin-bottom:12px">
      <span style="font-weight:600">${fabric.name}</span>
      · Арт. ${fabric.article}
    </div>

    <!-- Выбор цвета образца -->
    <div style="margin-bottom:16px">
      <div class="color-section-title">Цвет образца</div>
      <div class="color-swatches" id="sample-colors">
        ${fabric.colors.filter(c => c.stock > 0).map(c => `
          <div
            class="color-swatch ${c.id === color.id ? 'active' : ''}"
            data-sample-color="${c.id}"
            style="background:${c.hex}"
            title="${c.name}"
          ></div>
        `).join('')}
      </div>
    </div>

    <!-- Телефон -->
    <div class="form-group" style="margin-bottom:12px">
      <div class="form-field">
        <div class="form-field-label">Телефон *</div>
        <input type="tel" id="sample-phone" placeholder="+7 (___) ___-__-__">
      </div>
      <div class="form-field">
        <div class="form-field-label">Адрес доставки *</div>
        <input type="text" id="sample-address" placeholder="Москва, ул. Примерная, 1">
      </div>
    </div>

    <div style="font-size:12px;color:var(--tg-hint);margin-bottom:16px">
      &#9432; Размер образца 15–20&nbsp;см. Бесплатно при заказе от ${fabric.minOrder}&nbsp;м
    </div>

    <button class="btn-primary" id="sample-submit-btn">Запросить образец</button>
  `;

  // Выбор цвета образца
  contentEl.querySelectorAll('[data-sample-color]').forEach(el => {
    el.addEventListener('click', () => {
      contentEl.querySelectorAll('[data-sample-color]').forEach(s => s.classList.remove('active'));
      el.classList.add('active');
      TG.HapticFeedback.selectionChanged();
    });
  });

  document.getElementById('sample-submit-btn')?.addEventListener('click', () => {
    const phone = document.getElementById('sample-phone')?.value || '';
    const addr  = document.getElementById('sample-address')?.value || '';
    if (phone.replace(/\D/g, '').length < 10) {
      TG.showAlert('Введите корректный номер телефона');
      return;
    }
    if (!addr.trim()) {
      TG.showAlert('Введите адрес доставки');
      return;
    }
    closeSheet('sample');
    TG.HapticFeedback.notificationOccurred('success');
    showToast('Запрос образца отправлен!');
  });

  showSheet('sample');
}

// ---- Общие функции bottom sheet ----

function showSheet(id) {
  document.getElementById('sheet-' + id)?.classList.add('open');
  document.getElementById('overlay')?.classList.add('visible');
  TG.HapticFeedback.impactOccurred('light');
}

function closeSheet(id) {
  document.getElementById('sheet-' + id)?.classList.remove('open');
  // Скрываем overlay только если нет других открытых шитов
  const anyOpen = document.querySelectorAll('.bottom-sheet.open').length > 0;
  if (!anyOpen) {
    document.getElementById('overlay')?.classList.remove('visible');
  }
}

/* ================================================================
   6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ================================================================ */

/** Показывает toast-уведомление */
function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), duration);
}

/** Обновляет бейдж корзины в Tab Bar */
function updateCartBadge() {
  const count   = Store.getCartCount();
  const badge   = document.getElementById('cart-badge');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

/** Склонение числительных */
function _pluralize(n, one, few, many) {
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Осветляет hex-цвет (простая реализация) */
function _lighten(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r   = Math.min(255, (num >> 16) + amount);
  const g   = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b   = Math.min(255, (num & 0xff) + amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Затемняет hex-цвет */
function _darken(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r   = Math.max(0, (num >> 16) - amount);
  const g   = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b   = Math.max(0, (num & 0xff) - amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ================================================================
   7. ДЕЛЕГИРОВАНИЕ СОБЫТИЙ
   ================================================================ */

function setupEventListeners() {

  // --- Tab Bar ---
  document.getElementById('tab-bar')?.addEventListener('click', e => {
    const item = e.target.closest('.tab-item');
    if (!item) return;
    const screen = item.dataset.screen;
    Router.tab(screen);
    TG.HapticFeedback.selectionChanged();
  });

  // --- Карточки каталога ---
  document.getElementById('catalog-grid')?.addEventListener('click', e => {
    const card = e.target.closest('.fabric-card');
    if (!card) return;
    const fabricId = parseInt(card.dataset.fabricId);
    Router.push('product', () => renderProduct(fabricId));
    TG.HapticFeedback.impactOccurred('light');
  });

  // --- Категории в каталоге ---
  document.getElementById('categories-bar')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-category]');
    if (!chip) return;
    Store.setCategory(chip.dataset.category);
    renderCatalog();
    TG.HapticFeedback.selectionChanged();
  });

  // --- Кнопка фильтров ---
  document.getElementById('catalog-filter-btn')?.addEventListener('click', () => {
    openFiltersSheet();
  });

  // --- BackButton Telegram ---
  TG.BackButton.onClick(() => {
    // Если открыт bottom sheet — закрываем его
    const openSheet = document.querySelector('.bottom-sheet.open');
    if (openSheet) {
      closeSheet(openSheet.id.replace('sheet-', ''));
      return;
    }
    Router.back();
    TG.HapticFeedback.impactOccurred('light');
  });

  // --- Overlay — закрывает bottom sheet ---
  document.getElementById('overlay')?.addEventListener('click', () => {
    document.querySelectorAll('.bottom-sheet.open').forEach(s => {
      closeSheet(s.id.replace('sheet-', ''));
    });
  });

  // --- Поиск ---
  const searchInput   = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');

  searchInput?.addEventListener('input', () => {
    const q = searchInput.value;
    searchClearBtn?.classList.toggle('hidden', !q);
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => renderSearchContent(q), 300);
  });

  searchInput?.addEventListener('focus', () => {
    if (!searchInput.value) renderSearchContent('');
  });

  searchClearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.classList.add('hidden');
    renderSearchContent('');
    searchInput.focus();
  });

  // --- Избранное (экран продукта) ---
  document.getElementById('fav-btn')?.addEventListener('click', () => {
    const { fabric } = _product;
    if (!fabric) return;
    const isFav = Store.toggleFavorite(fabric.id);
    _updateFavBtn(fabric.id);
    TG.HapticFeedback.impactOccurred(isFav ? 'medium' : 'light');
    showToast(isFav ? 'Добавлено в избранное' : 'Убрано из избранного');
  });
}

/* ================================================================
   8. WELCOME-ЭКРАН
   ================================================================ */

const WELCOME_KEY = '100ff_welcome_shown';

function showWelcome() {
  if (localStorage.getItem(WELCOME_KEY)) return;

  const modal = document.getElementById('welcome-modal');
  if (!modal) return;

  // Показываем с небольшой задержкой, чтобы CSS-анимация сработала
  requestAnimationFrame(() => {
    modal.classList.add('visible');
  });

  document.getElementById('welcome-open-btn')?.addEventListener('click', () => {
    _closeWelcome(modal);
    TG.HapticFeedback.impactOccurred('medium');
  });

  document.getElementById('welcome-skip-btn')?.addEventListener('click', () => {
    _closeWelcome(modal);
    TG.HapticFeedback.impactOccurred('light');
  });
}

function _closeWelcome(modal) {
  modal.classList.remove('visible');
  localStorage.setItem(WELCOME_KEY, '1');
  // Удаляем из DOM после завершения анимации
  setTimeout(() => modal.remove(), 350);
}

/* ================================================================
   8b. ПРИМЕНЕНИЕ ТЕМЫ TELEGRAM
   ================================================================ */

function applyTheme() {
  const params = TG.themeParams;
  const scheme = TG.colorScheme;

  if (scheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', params.bg_color || '#212121');
  }

  // Переопределяем CSS-переменные из темы Telegram
  const root = document.documentElement;
  if (params.bg_color)          root.style.setProperty('--tg-bg', params.bg_color);
  if (params.text_color)        root.style.setProperty('--tg-text', params.text_color);
  if (params.hint_color)        root.style.setProperty('--tg-hint', params.hint_color);
  if (params.link_color)        root.style.setProperty('--tg-link', params.link_color);
  if (params.button_color)      root.style.setProperty('--tg-button', params.button_color);
  if (params.button_text_color) root.style.setProperty('--tg-button-txt', params.button_text_color);
  if (params.secondary_bg_color) root.style.setProperty('--tg-secondary', params.secondary_bg_color);
  if (params.button_color)      root.style.setProperty('--accent', params.button_color);
}

/* ================================================================
   9. ИНИЦИАЛИЗАЦИЯ
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // 1. Запускаем Telegram SDK
  TG.ready();
  TG.expand();

  // 2. Применяем тему
  applyTheme();

  // 3. Навешиваем события
  setupEventListeners();

  // 4. Рендерим начальный экран
  renderCatalog();
  renderProfile();

  // 5. Welcome-экран (только при первом открытии)
  showWelcome();

  // 6. Обновляем бейдж корзины
  updateCartBadge();

  // 7. Обработчик изменения темы в рантайме
  window.addEventListener('themeChanged', applyTheme);

});
