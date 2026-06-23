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

let _sessionToken = null;
let _sessionStart = null;
let _screenCount  = 0;

const Router = (() => {
  // Стек навигации — массив id экранов
  let history = ['catalog'];
  // Экраны, относящиеся к Tab Bar (при переключении между ними — без анимации)
  const TAB_SCREENS = ['catalog', 'search', 'cart', 'profile'];
  // Экраны без Tab Bar
  const NO_TAB_SCREENS = ['checkout', 'checkout-samples', 'success'];

  /** Текущий активный экран */
  function current() {
    return history[history.length - 1];
  }

  /** Переход на новый экран вперёд */
  function push(screenId, renderFn) {
    if (current() === screenId) return;
    _screenCount++;
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
    _screenCount++;
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

    // In-app кнопки «Назад» (галерея + заголовки)
    const canGoBack = history.length > 1 && screenId !== 'success';
    document.querySelectorAll('.back-btn').forEach(btn => {
      btn.classList.toggle('hidden', !canGoBack);
    });

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
    if (screenId === 'catalog')   renderCatalog();
    if (screenId === 'cart')      renderCart();
    if (screenId === 'profile')   renderProfile();
    if (screenId === 'favorites') renderFavorites();
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
   3b. СЕССИОННЫЙ ТРЕКИНГ
   ================================================================ */

function _startSession() {
  _sessionToken = Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  _sessionStart = Date.now();
  _screenCount  = 1;
  const user = TG.initDataUnsafe?.user;
  fetch('/api/analytics?type=session_start', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tg_user_id: user?.id || null, session_token: _sessionToken }),
  }).catch(() => {});
}

function _endSession() {
  if (!_sessionToken || !_sessionStart) return;
  const payload = JSON.stringify({
    session_token:    _sessionToken,
    duration_seconds: Math.round((Date.now() - _sessionStart) / 1000),
    screens_visited:  _screenCount,
  });
  _sessionToken = null;
  _sessionStart = null;
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics?type=session_end',
      new Blob([payload], { type: 'application/json' }));
  } else {
    fetch('/api/analytics?type=session_end', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: payload, keepalive: true,
    }).catch(() => {});
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    _endSession();
  } else if (document.visibilityState === 'visible' && !_sessionToken) {
    _startSession();
  }
});

/* ================================================================
   4. РЕНДЕР ЭКРАНОВ
   ================================================================ */

// ---- 4.1 КАТАЛОГ ----

/** Баннер-слайдер: инициализируется один раз, повторный вызов игнорируется */
let _bannersInited = false;

function renderBanners() {
  const wrap = document.getElementById('catalog-banners');
  if (!wrap || !BANNERS.length) return;

  // Если баннер один — скрываем точки, не нужен слайдер
  if (BANNERS.length === 1) {
    wrap.innerHTML = _bannerSlideHTML(BANNERS[0]);
    return;
  }

  wrap.innerHTML = `
    <div class="banners-track" id="banners-track">
      ${BANNERS.map(b => _bannerSlideHTML(b)).join('')}
    </div>
    <div class="banners-dots" id="banners-dots">
      ${BANNERS.map((_, i) => `<div class="banner-dot ${i === 0 ? 'active' : ''}" data-banner-i="${i}"></div>`).join('')}
    </div>
  `;

  if (_bannersInited) return;
  _bannersInited = true;
  _initBannerSlider();
}

function _bannerSlideHTML(banner) {
  const bg = banner.image
    ? `<img class="banner-bg" src="${banner.image}" alt="${banner.title}" loading="lazy">`
    : `<div class="banner-bg" style="background:${banner.gradient}"></div>`;
  return `
    <div class="banner-slide"${banner.action ? ` data-banner-action='${JSON.stringify(banner.action)}'` : ''}>
      ${bg}
      <div class="banner-overlay"></div>
      <div class="banner-content">
        ${banner.label ? `<p class="banner-label">${banner.label}</p>` : ''}
        <h2 class="banner-title">${banner.title}</h2>
        ${banner.subtitle ? `<p class="banner-subtitle">${banner.subtitle}</p>` : ''}
      </div>
    </div>
  `;
}

function _initBannerSlider() {
  const wrap  = document.getElementById('catalog-banners');
  if (!wrap) return;

  let current = 0;
  let timer   = null;
  let touchX  = null;

  function goTo(i) {
    const track = document.getElementById('banners-track');
    const dots  = document.querySelectorAll('.banner-dot');
    if (!track) return;
    current = (i + BANNERS.length) % BANNERS.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, idx) => d.classList.toggle('active', idx === current));
  }

  function next() { goTo(current + 1); }

  function startAuto() {
    clearInterval(timer);
    timer = setInterval(next, BANNER_SETTINGS.interval_ms || 4000);
  }

  startAuto();

  // Нажатие на точку
  wrap.addEventListener('click', e => {
    const dot = e.target.closest('.banner-dot');
    if (dot) { goTo(parseInt(dot.dataset.bannerI)); startAuto(); return; }

    // Нажатие на баннер с action
    const slide = e.target.closest('[data-banner-action]');
    if (slide) {
      try {
        const action = JSON.parse(slide.dataset.bannerAction);
        if (action.type === 'category') {
          Store.setCategory(action.value);
          renderCatalog();
          TG.HapticFeedback.selectionChanged();
        } else if (action.type === 'fabric') {
          Router.push('product', () => renderProduct(action.value));
          TG.HapticFeedback.selectionChanged();
        }
      } catch (_) {}
    }
  });

  // Touch-свайп
  wrap.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 30) return;
    goTo(dx < 0 ? current + 1 : current - 1);
    startAuto();
  }, { passive: true });
}

function renderCatalog() {
  const filters    = Store.getFilters();
  const fabrics    = Store.getFilteredFabrics();
  const grid       = document.getElementById('catalog-grid');
  const countEl    = document.getElementById('catalog-count');
  const catsBar    = document.getElementById('categories-bar');
  const badgeBar   = document.getElementById('badge-filter-bar');

  // Баннеры (рендерятся один раз независимо от фильтров)
  renderBanners();

  // Пока данные не загружены — ничего не рендерим
  if (!FABRICS.length && !fabrics.length) return;

  // Категории
  catsBar.innerHTML = CATEGORIES.map(cat => `
    <button
      class="chip ${filters.category === cat ? 'active' : ''}"
      data-category="${cat}"
      role="tab"
      aria-selected="${filters.category === cat}"
    >${cat}</button>
  `).join('');

  // Метки-фильтры
  if (badgeBar) {
    badgeBar.innerHTML = `
      <button class="chip ${filters.filterHit ? 'active' : ''}" data-badge="hit">ХИТ</button>
      <button class="chip ${filters.filterNew ? 'active' : ''}" data-badge="new">НОВИНКА</button>
    `;
  }

  // Прокручиваем активный чип в центр видимой области
  requestAnimationFrame(() => {
    const activeChip = catsBar.querySelector('.chip.active');
    if (activeChip) {
      const barW = catsBar.offsetWidth;
      const chipL = activeChip.offsetLeft;
      const chipW = activeChip.offsetWidth;
      catsBar.scrollLeft = chipL - barW / 2 + chipW / 2;
    }
  });

  // Редакционный заголовок
  const isAllCategory = !filters.category || filters.category === 'Все';
  const countText = fabrics.length
    ? `${fabrics.length} ${_pluralize(fabrics.length, 'позиция', 'позиции', 'позиций')}`
    : '';

  if (isAllCategory) {
    countEl.innerHTML = `
      <div class="catalog-hero-block">
        <h2 class="catalog-hero-title">Ткань — это основа.</h2>
        <p class="catalog-hero-sub">Всё начинается с прикосновения.</p>
        <button class="catalog-hero-link" id="catalog-hero-cta">Смотреть все ткани</button>
      </div>
    `;
    document.getElementById('catalog-hero-cta')?.addEventListener('click', () => {
      document.getElementById('catalog-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      TG.HapticFeedback.selectionChanged();
    });
  } else {
    countEl.innerHTML = `
      <div class="catalog-cat-header">
        <p class="catalog-cat-label">${filters.category}</p>
        ${countText ? `<span class="catalog-cat-count">${countText}</span>` : ''}
      </div>
    `;
  }

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

/** Возвращает style или img-тег для миниатюры ткани (используется в поиске и корзине) */
function _thumbHTML(thumb, cssClass) {
  if (thumb && !thumb.startsWith('linear-gradient') && !thumb.startsWith('radial-gradient')) {
    return `<div class="${cssClass}" style="background:#f0f0f0;overflow:hidden">` +
           `<img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>`;
  }
  return `<div class="${cssClass}" style="background:${thumb || '#ccc'}"></div>`;
}

/** Медиа-слой для карточки каталога: фото или градиент на весь блок */
function _fabricCardMediaHTML(thumb, name) {
  if (thumb && !thumb.startsWith('linear-gradient') && !thumb.startsWith('radial-gradient')) {
    return `<img class="fabric-card-img" src="${thumb}" alt="${name}" loading="lazy">`;
  }
  return `<div class="fabric-card-img" style="background:${thumb || '#333'}"></div>`;
}

/** HTML одной карточки ткани — photo-dominant, overlay text */
function _fabricCardHTML(fabric) {
  const badges = [
    fabric.isHit ? '<span class="fabric-badge fabric-badge--hit">ХИТ</span>' : '',
    fabric.isNew ? '<span class="fabric-badge fabric-badge--new">НОВИНКА</span>' : '',
  ].filter(Boolean).join('');

  return `
    <div class="fabric-card" data-fabric-id="${fabric.id}" role="button" tabindex="0">
      <div class="fabric-card-media">
        ${_fabricCardMediaHTML(fabric.thumb, fabric.name)}
        <div class="fabric-card-overlay"></div>
        ${badges ? `<div class="fabric-badges">${badges}</div>` : ''}
        <div class="fabric-card-caption">
          <p class="fabric-card-category">${fabric.category}</p>
          <h3 class="fabric-card-name">${fabric.name}</h3>
          <p class="fabric-card-price">${formatPrice(fabric.basePricePerMeter, fabric.unit)}</p>
        </div>
      </div>
    </div>
  `;
}

// ---- 4.2 КАРТОЧКА ТОВАРА ----

/** Текущее состояние экрана продукта */
let _product = { fabric: null, colorId: null, meters: 0 };

/** Фиксируем просмотр ткани (fire-and-forget) */
function _trackView(fabricId) {
  const user = TG.initDataUnsafe?.user;
  fetch('/api/analytics?type=view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fabric_id: fabricId, tg_user_id: user?.id || null }),
  }).catch(() => {});
}

function renderProduct(fabricId, colorId) {
  // Показываем скелетон пока грузится детальная карточка
  document.getElementById('product-info').innerHTML =
    '<div style="padding:24px;text-align:center;color:var(--tg-hint)">Загрузка...</div>';

  // Фиксируем просмотр
  _trackView(fabricId);

  Catalog.fetchDetail(fabricId)
    .then(fabric => {
      // Обновляем кэш в FABRICS (цвета и фото из API)
      const idx = FABRICS.findIndex(f => f.id === fabricId);
      if (idx >= 0) FABRICS[idx] = fabric;

      _doRenderProduct(fabric, colorId);
    })
    .catch(() => {
      // Fallback на кэшированные данные без детального фото/цветов
      const fabric = getFabricById(fabricId);
      if (fabric) _doRenderProduct(fabric, colorId);
    });
}

function _doRenderProduct(fabric, colorId) {
  // Восстанавливаем последний выбранный цвет или берём первый доступный
  const savedColor = colorId || Store.getLastColor(fabric.id);
  const initColor  = fabric.colors.find(c => c.id === savedColor) || getFirstAvailableColor(fabric);

  _product.fabric  = fabric;
  _product.colorId = initColor.id;
  _product.meters  = snapToStep(fabric.minOrder, fabric.minOrder, fabric.step);

  _renderGallery(fabric, initColor);
  _renderProductInfo(fabric, initColor);
  _updateFavBtn(fabric.id);
  _updateProductMainButton();
  _updateSampleBtn();
}

function _renderGallery(fabric, color) {
  const slidesEl  = document.getElementById('gallery-slides');
  const dotsEl    = document.getElementById('gallery-dots');
  const galleryEl = document.getElementById('product-gallery');

  let slidesHTML;
  let count;

  if (fabric.photos && fabric.photos.length) {
    count = fabric.photos.length;
    slidesHTML = fabric.photos.map((src, i) => `
      <div class="gallery-slide" data-index="${i}">
        <img src="${src}" alt="${fabric.name}" class="gallery-slide-img ${i === 0 ? 'hero-zoom' : ''}">
      </div>
    `).join('');
  } else {
    const styles = [
      `background:${color.hex}`,
      `background:linear-gradient(160deg,${_lighten(color.hex,20)} 0%,${color.hex} 50%,${_darken(color.hex,15)} 100%)`,
      `background:${color.hex};background-image:repeating-linear-gradient(-30deg,transparent,transparent 8px,rgba(255,255,255,0.06) 8px,rgba(255,255,255,0.06) 9px)`,
    ];
    count = styles.length;
    slidesHTML = styles.map((style, i) => `
      <div class="gallery-slide" style="${style}" data-index="${i}"></div>
    `).join('');
  }

  slidesEl.innerHTML = slidesHTML;

  // Pill-точки
  dotsEl.innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="gallery-dot ${i === 0 ? 'active' : ''}"></div>
  `).join('');

  // Overlay с названием ткани (поверх галереи, снизу)
  let overlay = document.getElementById('gallery-hero-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'gallery-hero-overlay';
    overlay.className = 'gallery-hero-overlay';
    galleryEl.insertBefore(overlay, dotsEl);
  }
  overlay.innerHTML = `
    <p class="gallery-hero-label">${fabric.category}</p>
    <h1 class="gallery-hero-name">${fabric.name}</h1>
  `;

  slidesEl.style.transform = 'translateX(0)';
  _initGallerySwipe(slidesEl, dotsEl, count);
}

let _galleryIndex = 0;
let _galleryCount = 0;

function _initGallerySwipe(slidesEl, dotsEl, count) {
  _galleryIndex = 0;
  _galleryCount = count;
  let startX = 0;

  const gallery = document.getElementById('product-gallery');
  const btnPrev = document.getElementById('gallery-arrow-prev');
  const btnNext = document.getElementById('gallery-arrow-next');

  if (btnPrev) btnPrev.onclick = () => {
    if (_galleryIndex > 0) { _galleryIndex--; _updateGallery(slidesEl, dotsEl); }
  };
  if (btnNext) btnNext.onclick = () => {
    if (_galleryIndex < count - 1) { _galleryIndex++; _updateGallery(slidesEl, dotsEl); }
  };

  gallery.ontouchstart = e => { startX = e.touches[0].clientX; };
  gallery.ontouchend   = e => {
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) < 40) return;
    if (diff > 0 && _galleryIndex < count - 1) _galleryIndex++;
    if (diff < 0 && _galleryIndex > 0)         _galleryIndex--;
    _updateGallery(slidesEl, dotsEl);
  };

  _updateGallery(slidesEl, dotsEl);
}

function _updateGallery(slidesEl, dotsEl) {
  slidesEl.style.transition = 'transform 0.3s ease';
  slidesEl.style.transform  = `translateX(${-_galleryIndex * 100}%)`;
  dotsEl.querySelectorAll('.gallery-dot').forEach((d, i) => {
    d.classList.toggle('active', i === _galleryIndex);
  });
  const btnPrev = document.getElementById('gallery-arrow-prev');
  const btnNext = document.getElementById('gallery-arrow-next');
  if (btnPrev) btnPrev.classList.toggle('hidden', _galleryCount <= 1 || _galleryIndex === 0);
  if (btnNext) btnNext.classList.toggle('hidden', _galleryCount <= 1 || _galleryIndex === _galleryCount - 1);
}

function _renderProductInfo(fabric, color) {
  const infoEl    = document.getElementById('product-info');
  const tiers     = getPriceTiers(fabric);
  const cartItem  = Store.findCartItem(fabric.id, color.id);
  const initMeters = cartItem ? cartItem.meters : _product.meters;
  const price     = getPriceForMeters(fabric, initMeters);
  const total     = price * initMeters;

  infoEl.innerHTML = `

    <!-- Артикул -->
    <p class="product-article">Арт.&nbsp;${fabric.article}</p>

    <!-- Разделитель -->
    <div class="product-divider"></div>

    <!-- Характеристики -->
    <dl class="product-specs">
      <div class="spec-row">
        <dt>Состав</dt><dd>${fabric.composition}</dd>
      </div>
      <div class="spec-row">
        <dt>Ширина</dt><dd>${fabric.width}&nbsp;см</dd>
      </div>
      <div class="spec-row">
        <dt>Плотность</dt><dd>${fabric.density}&nbsp;г/м²</dd>
      </div>
    </dl>

    <!-- Разделитель -->
    <div class="product-divider"></div>

    <!-- Цвета -->
    <div class="product-colors-section">
      <p class="product-section-label">Цвет</p>
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
      <p class="color-name" id="color-name-label">${color.name}</p>
    </div>

    <!-- Разделитель -->
    <div class="product-divider"></div>

    <!-- Цена -->
    <div class="price-block">
      <p class="price-label">от 50&nbsp;${fabric.unit} · оптовая</p>
      <div class="price-main" id="price-main">${formatPrice(fabric.basePricePerMeter, fabric.unit)}</div>
      ${fabric.cutPrice ? `
      <div class="price-secondary">
        <span>на отрез</span>
        <span>${formatPrice(fabric.cutPrice, fabric.unit)}</span>
      </div>` : ''}
    </div>

    <!-- Счётчик -->
    <div class="product-counter-section">
      <p class="product-section-label">${fabric.unit === 'кг' ? 'Количество, кг' : 'Метраж'}</p>
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
      <div class="counter-hint" id="counter-hint">${formatPrice(price, fabric.unit)} · ${initMeters}&nbsp;${fabric.unit}</div>
    </div>

    <!-- Кнопки действий -->
    <div class="product-action-btns">
      <button class="btn-oval btn-oval-primary" id="add-to-cart-btn">Добавить в заявку</button>
      <button class="btn-oval btn-oval-primary" id="sample-oval-btn">Запросить образец бесплатно</button>
    </div>

    <!-- Описание -->
    ${fabric.description ? `<div class="product-divider"></div><p class="product-description">${fabric.description}</p>` : ''}
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
      if (label) label.textContent = color.name;

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

    document.getElementById('counter-total').textContent = formatPrice(total, fabric.unit);
    document.getElementById('counter-hint').textContent  =
      `${formatPrice(price, fabric.unit)} · ${snapped}\u00A0${fabric.unit}`;


    _updateProductMainButton();
  }

  minusBtn?.addEventListener('click', () => {
    const cur = parseFloat(meterInput.value) || fabric.minOrder;
    updateMeters(cur - fabric.step);
    TG.HapticFeedback.impactOccurred('light');
  });

  plusBtn?.addEventListener('click', () => {
    const cur = parseFloat(meterInput.value) || fabric.minOrder;
    updateMeters(cur + fabric.step);
    TG.HapticFeedback.impactOccurred('light');
  });

  meterInput?.addEventListener('change', () => {
    updateMeters(parseFloat(meterInput.value) || fabric.minOrder);
  });

  // Добавить в заявку
  document.getElementById('add-to-cart-btn')?.addEventListener('click', () => {
    const { colorId, meters } = _product;
    const inCart = Store.findCartItem(fabric.id, colorId);
    if (inCart) {
      Router.tab('cart');
    } else {
      Store.addToCart(fabric.id, colorId, meters);
      updateCartBadge();
      TG.HapticFeedback.notificationOccurred('success');
      showToast('Добавлено к заявке');
      _updateProductMainButton();
    }
  });

  // Запрос образца — добавляем в корзину
  document.getElementById('sample-oval-btn')?.addEventListener('click', () => {
    if (Store.hasSample(fabric.id)) {
      Router.tab('cart');
    } else {
      Store.addSample(fabric.id);
      updateCartBadge();
      TG.HapticFeedback.notificationOccurred('success');
      showToast('Образец добавлен в заявку');
      _updateSampleBtn();
    }
  });
}

/** Обновляет состояние инлайн-кнопки "Добавить в заявку" */
function _updateProductMainButton() {
  const { fabric, colorId } = _product;
  if (!fabric) return;

  // Синяя кнопка Telegram не используется
  setMainButton(null);

  const btn    = document.getElementById('add-to-cart-btn');
  if (!btn) return;
  const inCart = Store.findCartItem(fabric.id, colorId);

  if (inCart) {
    btn.textContent = 'В заявке ✓ · Перейти';
    btn.classList.add('in-cart');
  } else {
    btn.textContent = 'Добавить в заявку';
    btn.classList.remove('in-cart');
  }
}

/** Обновляет состояние кнопки "Запросить образец" */
function _updateSampleBtn() {
  const { fabric } = _product;
  if (!fabric) return;
  const btn = document.getElementById('sample-oval-btn');
  if (!btn) return;
  if (Store.hasSample(fabric.id)) {
    btn.textContent = 'Образец в заявке ✓ · Перейти';
    btn.classList.add('in-cart');
  } else {
    btn.textContent = 'Запросить образец бесплатно';
    btn.classList.remove('in-cart');
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
        return `
          <div class="search-result-item" data-fabric-id="${f.id}">
            ${_thumbHTML(f.thumb, 'search-result-thumb')}
            <div class="search-result-info">
              <div class="search-result-name">${f.name}</div>
              <div class="search-result-sub">${f.composition} · ${f.width}&nbsp;см</div>
            </div>
            <div class="search-result-price">${formatPrice(f.basePricePerMeter, f.unit)}</div>
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

/** Активная вкладка корзины: 'fabrics' | 'samples' */
let _cartTab = 'fabrics';

function renderCart() {
  const cart    = Store.getCart();
  const samples = Store.getSamples();
  const cartEl  = document.getElementById('cart-content');
  const countEl = document.getElementById('cart-header-count');

  const totalItems = cart.length + samples.length;

  if (countEl) {
    countEl.textContent = totalItems
      ? `(${totalItems} ${_pluralize(totalItems, 'позиция', 'позиции', 'позиций')})`
      : '';
  }

  const total       = Store.getCartTotal();
  const totalMeters = cart.reduce((s, i) => s + i.meters, 0);

  const isFabrics = _cartTab === 'fabrics';
  const isSamples = _cartTab === 'samples';

  cartEl.innerHTML = `

    <!-- Таб-переключатель -->
    <div class="cart-tab-bar">
      <button class="btn-oval btn-oval-primary ${isSamples ? 'in-cart' : ''}" id="cart-tab-fabrics">
        Метраж${cart.length ? ` · ${cart.length}` : ''}
      </button>
      <button class="btn-oval btn-oval-primary ${isFabrics ? 'in-cart' : ''}" id="cart-tab-samples">
        Образцы${samples.length ? ` · ${samples.length}` : ''}
      </button>
    </div>

    <!-- Контент активной вкладки -->
    ${isFabrics ? (cart.length ? `
      <div class="cart-list" id="cart-list">
        ${cart.map(item => _cartItemHTML(item)).join('')}
      </div>
      <button class="cart-add-more" id="cart-add-more">&#43; Добавить ещё ткани</button>
    ` : `
      <div class="favorites-empty">
        <div class="favorites-empty-icon">&#129525;</div>
        <p class="favorites-empty-title">Добавьте ткань в заявку</p>
        <p class="favorites-empty-hint">чтобы оформить первый заказ на метраж</p>
        <button class="btn-oval btn-oval-primary" id="go-catalog-btn">Перейти в каталог</button>
      </div>
    `) : ''}

    ${isSamples ? (samples.length ? `
      <div class="cart-sample-list" id="cart-sample-list">
        ${samples.map(s => _sampleItemHTML(s)).join('')}
      </div>
      <button class="cart-add-more" id="cart-add-more">&#43; Добавить образцы из каталога</button>
    ` : `
      <div class="favorites-empty">
        <div class="favorites-empty-icon">&#10024;</div>
        <p class="favorites-empty-title">Выберите понравившиеся ткани</p>
        <p class="favorites-empty-hint">а мы бесплатно подготовим образцы, чтобы вы могли оценить цвет и фактуру</p>
        <button class="btn-oval btn-oval-primary" id="go-catalog-btn">Перейти в каталог</button>
      </div>
    `) : ''}

    <!-- Итоги (только когда в активной вкладке есть контент) -->
    ${isFabrics && cart.length ? `
    <div class="cart-total-block">
      <div class="cart-total-row">
        <span>Позиций ткани</span><span>${cart.length}</span>
      </div>
      <div class="cart-total-row">
        <span>Общий объём</span><span>${totalMeters}&nbsp;м</span>
      </div>
      <div class="cart-total-row main">
        <span>Итого</span>
        <span class="cart-total-price">${formatPrice(total)}</span>
      </div>
      <div class="cart-disclaimer">
        * Финальная стоимость согласуется с менеджером после отправки заявки
      </div>
      <button class="btn-oval btn-oval-primary cart-submit-btn" id="cart-submit-btn">
        Оформить заявку на метраж
      </button>
    </div>` : ''}

    ${isSamples && samples.length ? `
    <div class="cart-total-block">
      <div class="cart-total-row">
        <span>Образцов</span><span>${samples.length}</span>
      </div>
      <button class="btn-oval btn-oval-primary cart-submit-btn" id="cart-submit-btn">
        Оформить заявку на образцы
      </button>
    </div>` : ''}
  `;

  // Переключение вкладок
  document.getElementById('cart-tab-fabrics')?.addEventListener('click', () => {
    if (_cartTab === 'fabrics') return;
    _cartTab = 'fabrics';
    TG.HapticFeedback.selectionChanged();
    renderCart();
  });
  document.getElementById('cart-tab-samples')?.addEventListener('click', () => {
    if (_cartTab === 'samples') return;
    _cartTab = 'samples';
    TG.HapticFeedback.selectionChanged();
    renderCart();
  });

  // Удаление позиции ткани
  document.getElementById('cart-list')?.addEventListener('click', e => {
    const item = e.target.closest('[data-cart-item]');
    if (!item) return;
    const fabricId = parseInt(item.dataset.fabricId);
    const colorId  = item.dataset.colorId;
    const fabric   = getFabricById(fabricId);

    if (e.target.closest('.cart-item-thumb')) {
      TG.HapticFeedback.impactOccurred('light');
      Router.push('product', () => renderProduct(fabricId));
      return;
    }

    if (e.target.closest('.cart-item-delete')) {
      TG.showConfirm('Удалить позицию из заявки?', confirmed => {
        if (!confirmed) return;
        Store.removeFromCart(fabricId, colorId);
        updateCartBadge();
        TG.HapticFeedback.notificationOccurred('warning');
        renderCart();
        showToast('Позиция удалена');
      });
      return;
    }

    if (e.target.closest('.cart-counter-btn')) {
      const btn   = e.target.closest('.cart-counter-btn');
      const valEl = item.querySelector('.cart-counter-val');
      const cur   = parseInt(valEl.textContent) || fabric.minOrder;
      const delta = btn.dataset.dir === 'plus' ? fabric.step : -fabric.step;
      const newVal = snapToStep(cur + delta, fabric.minOrder, fabric.step);
      Store.updateCartItem(fabricId, colorId, newVal);
      renderCart();
      TG.HapticFeedback.impactOccurred('light');
    }
  });

  // Удаление образца
  document.getElementById('cart-sample-list')?.addEventListener('click', e => {
    const item = e.target.closest('[data-sample-item]');
    if (!item) return;
    const fabricId = parseInt(item.dataset.fabricId);

    if (e.target.closest('.cart-item-thumb')) {
      TG.HapticFeedback.impactOccurred('light');
      Router.push('product', () => renderProduct(fabricId));
      return;
    }

    if (e.target.closest('.cart-item-delete')) {
      TG.showConfirm('Убрать образец из заявки?', confirmed => {
        if (!confirmed) return;
        Store.removeSample(fabricId);
        updateCartBadge();
        TG.HapticFeedback.notificationOccurred('warning');
        renderCart();
        showToast('Образец удалён');
      });
    }
  });

  document.getElementById('cart-add-more')?.addEventListener('click', () => Router.tab('catalog'));
  document.getElementById('go-catalog-btn')?.addEventListener('click', () => Router.tab('catalog'));

  TG.MainButton.hide();

  document.getElementById('cart-submit-btn')?.addEventListener('click', () => {
    TG.HapticFeedback.impactOccurred('medium');
    if (_cartTab === 'samples') {
      Router.push('checkout-samples', () => renderCheckoutSamples());
    } else {
      Router.push('checkout', () => renderCheckout());
    }
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
      ${_thumbHTML(fabric.thumb, 'cart-item-thumb')}
      <div class="cart-item-info">
        <div class="cart-item-name">${fabric.name}</div>
        <div class="cart-item-sub">Арт. ${fabric.article}</div>
        <div class="cart-item-color-chip">
          <span class="cart-item-color-dot" style="background:${color.hex}"></span>
          ${color.name}
        </div>
        <div class="cart-counter">
          <button class="cart-counter-btn" data-dir="minus">&#8722;</button>
          <span class="cart-counter-val">${item.meters}</span>
          <span style="font-size:12px;color:var(--tg-hint)">${fabric.unit}</span>
          <button class="cart-counter-btn" data-dir="plus">&#43;</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
        <div class="cart-item-price">${formatPrice(total, fabric.unit)}</div>
        <button class="cart-item-delete" aria-label="Удалить">&#128465;</button>
      </div>
    </div>
  `;
}

function _sampleItemHTML(sample) {
  const fabric = getFabricById(sample.fabricId);
  if (!fabric) return '';
  return `
    <div class="cart-item" data-sample-item data-fabric-id="${fabric.id}">
      ${_thumbHTML(fabric.thumb, 'cart-item-thumb')}
      <div class="cart-item-info">
        <div class="cart-item-name">${fabric.name}</div>
        <div class="cart-item-sub">Арт. ${fabric.article}</div>
        <div class="cart-sample-tag">все цвета</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0">
        <div class="cart-sample-free">бесплатно</div>
        <button class="cart-item-delete" aria-label="Удалить">&#128465;</button>
      </div>
    </div>
  `;
}

// ---- 4.5 ОФОРМЛЕНИЕ ЗАЯВКИ ----

function _formatPhone(raw) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('8') || d.startsWith('7')) d = d.slice(1);
  d = d.slice(0, 10);
  if (!d.length) return '';
  let r = '+7 (' + d.slice(0, 3);
  if (d.length <= 3) return r;
  r += ') ' + d.slice(3, 6);
  if (d.length <= 6) return r;
  r += '-' + d.slice(6, 8);
  if (d.length <= 8) return r;
  r += '-' + d.slice(8, 10);
  return r;
}

function renderCheckout() {
  const cart    = Store.getCart();
  const samples = Store.getSamples();
  const total   = Store.getCartTotal();
  const user    = TG.initDataUnsafe?.user;

  // Сбрасываем инлайн-высоту textarea к исходной (CSS-правило)
  const commentEl = document.getElementById('field-comment');
  if (commentEl) commentEl.style.height = '';

  // Предзаполнение из Telegram-профиля
  const nameField     = document.getElementById('field-name');
  const usernameField = document.getElementById('field-username');
  const usernameRow   = document.getElementById('field-username-row');
  if (nameField && user) {
    nameField.value = [user.first_name, user.last_name].filter(Boolean).join(' ');
  }
  if (usernameField && usernameRow && user?.username) {
    usernameField.value = '@' + user.username;
    usernameRow.style.display = '';
  }

  // Сводка
  const summaryEl = document.getElementById('checkout-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      ${cart.length ? `
      <div class="checkout-summary-row">
        <span>Позиций ткани</span><span>${cart.length}</span>
      </div>
      <div class="checkout-summary-row">
        <span>Общий метраж</span><span>${cart.reduce((s, i) => s + i.meters, 0)}&nbsp;м</span>
      </div>
      <div class="checkout-summary-row checkout-summary-total">
        <span>Примерная сумма</span>
        <span style="color:var(--price-color)">${formatPrice(total)}</span>
      </div>` : ''}
    `;
  }

  TG.MainButton.hide();

  document.getElementById('checkout-submit-btn')?.addEventListener('click', () => {
    TG.HapticFeedback.impactOccurred('medium');
    _submitOrder();
  });
  document.getElementById('checkout-manager-btn')?.addEventListener('click', () => {
    TG.HapticFeedback.impactOccurred('light');
    TG.openTelegramLink('https://t.me/Opt_100ffvl');
  });

  // Маска и валидация телефона
  const phoneEl = document.getElementById('field-phone');
  if (phoneEl) {
    phoneEl.addEventListener('focus', () => {
      if (!phoneEl.value) phoneEl.value = '+7 (';
    });
    phoneEl.addEventListener('blur', () => {
      if (phoneEl.value === '+7 (') phoneEl.value = '';
    });
    phoneEl.addEventListener('input', () => {
      const formatted = _formatPhone(phoneEl.value);
      phoneEl.value = formatted || (phoneEl.value.length ? '+7 (' : '');
      phoneEl.closest('.form-field')?.classList.remove('form-field--error');
    });
  }

  // Скрываем hint при вводе; авто-расширение textarea
  ['field-company', 'field-city', 'field-comment'].forEach(id => {
    const el   = document.getElementById(id);
    const hint = el?.parentElement?.querySelector('.form-field-hint');
    if (!el) return;
    el.addEventListener('input', () => {
      if (hint) hint.style.display = el.value ? 'none' : '';
      if (el.tagName === 'TEXTAREA') {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }
    });
  });
}

function renderCheckoutSamples() {
  const samples = Store.getSamples();
  const user    = TG.initDataUnsafe?.user;

  const commentEl = document.getElementById('s-field-comment');
  if (commentEl) commentEl.style.height = '';

  const nameField     = document.getElementById('s-field-name');
  const usernameField = document.getElementById('s-field-username');
  const usernameRow   = document.getElementById('s-field-username-row');

  if (nameField && user) {
    nameField.value = [user.first_name, user.last_name].filter(Boolean).join(' ');
  }
  if (usernameField && usernameRow && user?.username) {
    usernameField.value = '@' + user.username;
    usernameRow.style.display = '';
  }

  const summaryEl = document.getElementById('checkout-samples-summary');
  if (summaryEl) {
    summaryEl.innerHTML = samples.map(s => {
      const fabric = getFabricById(s.fabricId);
      if (!fabric) return '';
      return `<div class="checkout-summary-row"><span>${fabric.name}</span><span>все цвета</span></div>`;
    }).join('') + `
      <div class="checkout-summary-row checkout-summary-total">
        <span>Образцов</span><span>${samples.length}</span>
      </div>`;
  }

  TG.MainButton.hide();

  document.getElementById('checkout-samples-submit-btn')?.addEventListener('click', () => {
    TG.HapticFeedback.impactOccurred('medium');
    _submitSamplesOrder();
  });
  document.getElementById('checkout-samples-manager-btn')?.addEventListener('click', () => {
    TG.HapticFeedback.impactOccurred('light');
    TG.openTelegramLink('https://t.me/Opt_100ffvl');
  });

  const phoneEl = document.getElementById('s-field-phone');
  if (phoneEl) {
    phoneEl.addEventListener('focus', () => {
      if (!phoneEl.value) phoneEl.value = '+7 (';
    });
    phoneEl.addEventListener('blur', () => {
      if (phoneEl.value === '+7 (') phoneEl.value = '';
    });
    phoneEl.addEventListener('input', () => {
      const formatted = _formatPhone(phoneEl.value);
      phoneEl.value = formatted || (phoneEl.value.length ? '+7 (' : '');
      phoneEl.closest('.form-field')?.classList.remove('form-field--error');
    });
  }

  document.getElementById('s-field-recipient')?.addEventListener('input', function () {
    this.closest('.form-field')?.classList.remove('form-field--error');
  });

  ['s-field-company', 's-field-city', 's-field-sdek', 's-field-comment'].forEach(id => {
    const el   = document.getElementById(id);
    const hint = el?.parentElement?.querySelector('.form-field-hint');
    if (!el) return;
    el.addEventListener('input', () => {
      if (hint) hint.style.display = el.value ? 'none' : '';
      el.closest('.form-field')?.classList.remove('form-field--error');
      if (el.tagName === 'TEXTAREA') {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }
    });
  });
}

async function _submitSamplesOrder() {
  const recipientEl = document.getElementById('s-field-recipient');
  const phoneEl     = document.getElementById('s-field-phone');
  const sdekEl      = document.getElementById('s-field-sdek');
  const phone       = phoneEl?.value     || '';
  const recipient   = recipientEl?.value || '';
  const sdek        = sdekEl?.value      || '';
  const comment     = document.getElementById('s-field-comment')?.value || '';

  document.querySelectorAll('#checkout-samples-form .form-field--error')
    .forEach(el => el.classList.remove('form-field--error'));

  if (!recipient.trim()) {
    _setFieldError(recipientEl, 'Пожалуйста, укажите фамилию и имя получателя');
    return;
  }
  if (!sdek.trim()) {
    _setFieldError(sdekEl, 'Пожалуйста, укажите пункт выдачи СДЭК');
    return;
  }
  if (phone.replace(/\D/g, '').length < 11) {
    _setFieldError(phoneEl, 'Пожалуйста, введите телефон получателя');
    return;
  }

  TG.MainButton.showProgress();
  TG.MainButton.disable();

  const user    = TG.initDataUnsafe?.user || {};
  const samples = Store.getSamples();

  const items = samples.map(s => {
    const fabric = getFabricById(s.fabricId);
    return {
      fabric_id:   s.fabricId,
      fabric_name: fabric?.name || `Ткань #${s.fabricId}`,
      color_id:    null,
      color_name:  'все цвета',
    };
  });

  try {
    const res = await fetch('/api/samples', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        recipient_name: recipient,
        cdek_address:   sdek,
        comment:        comment || null,
        tg_user_id:     user.id         || null,
        tg_username:    user.username   || null,
        first_name:     user.first_name || null,
        items,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      TG.MainButton.hideProgress();
      TG.MainButton.enable();
      TG.showAlert(data.error || 'Ошибка отправки заявки. Попробуйте ещё раз.');
      return;
    }

    const snapshot = Store.getSamples().map(s => {
      const fabric = getFabricById(s.fabricId);
      return { name: fabric?.name || `Ткань #${s.fabricId}` };
    });
    Store.clearSamples();
    updateCartBadge();
    TG.MainButton.hideProgress();
    Router.push('success', () => renderSuccess(data.request_number, { type: 'samples', items: snapshot }));
    TG.HapticFeedback.notificationOccurred('success');

  } catch (err) {
    console.error('[_submitSamplesOrder]', err);
    TG.MainButton.hideProgress();
    TG.MainButton.enable();
    TG.showAlert('Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
}

function _setFieldError(el, message) {
  const field = el?.closest('.form-field');
  if (field) field.classList.add('form-field--error');
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  TG.showAlert(message);
}

async function _submitOrder() {
  const phoneEl = document.getElementById('field-phone');
  const phone   = phoneEl?.value  || '';
  const name    = document.getElementById('field-name')?.value   || '';
  const city    = document.getElementById('field-city')?.value   || '';
  const comment = document.getElementById('field-comment')?.value || '';

  document.querySelectorAll('#checkout-form .form-field--error')
    .forEach(el => el.classList.remove('form-field--error'));

  if (phone.replace(/\D/g, '').length < 11) {
    _setFieldError(phoneEl, 'Пожалуйста, введите номер телефона для связи');
    return;
  }

  TG.MainButton.showProgress();
  TG.MainButton.disable();

  const user = TG.initDataUnsafe?.user || {};
  const cart = Store.getCart();

  const items = cart.map(item => {
    const fabric = getFabricById(item.fabricId);
    const price  = fabric ? getPriceForMeters(fabric, item.meters) : 0;
    const type   = (fabric?.cutPrice && item.meters < 50) ? 'cut' : 'base';
    return {
      fabric_id:       item.fabricId,
      fabric_name:     fabric?.name   || `Ткань #${item.fabricId}`,
      color_id:        null,
      color_name:      item.colorName || 'Уточнить у менеджера',
      meters:          item.meters,
      price_per_meter: price,
      price_type:      type,
    };
  });

  try {
    const res = await fetch('/api/orders', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        name,
        city:        city || null,
        comment,
        tg_user_id:  user.id         || null,
        tg_username: user.username   || null,
        first_name:  user.first_name || name || null,
        items,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      TG.MainButton.hideProgress();
      TG.MainButton.enable();
      TG.showAlert(data.error || 'Ошибка отправки заявки. Попробуйте ещё раз.');
      return;
    }

    const snapshot = Store.getCart().map(item => {
      const fabric = getFabricById(item.fabricId);
      return { name: fabric?.name || `Ткань #${item.fabricId}`, meters: item.meters, colorName: item.colorName };
    });
    Store.clearCart();
    updateCartBadge();
    TG.MainButton.hideProgress();
    Router.push('success', () => renderSuccess(data.order_number, { type: 'fabrics', items: snapshot }));
    TG.HapticFeedback.notificationOccurred('success');

  } catch (err) {
    console.error('[_submitOrder]', err);
    TG.MainButton.hideProgress();
    TG.MainButton.enable();
    TG.showAlert('Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
}

// ---- 4.6 ЭКРАН УСПЕХА ----

function renderSuccess(orderNum, meta = {}) {
  const el = document.getElementById('success-content');
  const { type = 'fabrics', items = [] } = meta;
  const isSamples = type === 'samples';

  const itemsHTML = items.length ? `
    <div class="success-items">
      ${items.map(it => `
        <div class="success-item">
          <span class="success-item-name">${it.name}</span>
          ${isSamples
            ? `<span class="success-item-tag">образец</span>`
            : `<span class="success-item-meta">${it.meters}&nbsp;м · ${it.colorName || 'уточнить'}</span>`
          }
        </div>
      `).join('')}
    </div>
  ` : '';

  const nextText = isSamples
    ? `${MANAGER.name} подтвердит наличие образцов и уточнит детали отправки по СДЭК.`
    : `${MANAGER.name} свяжется с вами до&nbsp;18:00 по московскому времени и подтвердит наличие тканей и условия поставки.`;

  el.innerHTML = `
    <div class="success-icon">&#10003;</div>
    <div class="success-line"></div>
    <div class="success-title">${isSamples ? 'Запрос принят' : 'Заявка принята'}</div>
    <div class="success-order-num">${isSamples ? 'Запрос' : 'Заявка'}&nbsp;№&nbsp;${orderNum}</div>
    ${itemsHTML}
    <div class="success-next">
      <div class="success-next-title">Что дальше</div>
      <p class="success-text">${nextText}</p>
    </div>
    <button type="button" class="btn-oval btn-oval-primary" id="success-catalog-btn">
      Вернуться в каталог
    </button>
  `;

  TG.MainButton.hide();

  document.getElementById('success-catalog-btn')?.addEventListener('click', () => {
    TG.HapticFeedback.impactOccurred('light');
    Router.tab('catalog');
  });
}

// ---- 4.7 ПРОФИЛЬ ----

async function renderProfile() {
  const user = TG.initDataUnsafe?.user;
  const initials = user
    ? ((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || '?'
    : '??';
  const fullName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : 'Гость';

  const profileEl = document.getElementById('profile-content');
  profileEl.innerHTML = `
    <div class="profile-user-card">
      <div class="profile-avatar">
        ${user?.photo_url
          ? `<img src="${user.photo_url}" alt="${fullName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
          : initials}
      </div>
      <div class="profile-user-info">
        <div class="profile-user-name">${fullName}</div>
        ${user?.username ? `<div class="profile-user-sub">@${user.username}</div>` : ''}
      </div>
    </div>

    <div class="manager-card">
      <div class="manager-card-header">Ваш менеджер</div>
      <div class="manager-info">
        <div class="manager-avatar">${MANAGER.initials}</div>
        <div>
          <div class="manager-name">${MANAGER.name}</div>
        </div>
      </div>
      <button class="manager-contact-btn" id="manager-contact-btn">
        &#128172; Написать в Telegram
      </button>
    </div>

    <button class="share-btn" id="share-btn">
      &#128257; Поделиться каталогом
    </button>

    <div id="profile-orders-section">
      <div class="orders-section-title">История заявок</div>
      <div class="loading">Загрузка...</div>
    </div>
  `;

  document.getElementById('manager-contact-btn')?.addEventListener('click', () => {
    TG.openTelegramLink(MANAGER.tgUsername);
    TG.HapticFeedback.impactOccurred('medium');
  });

  document.getElementById('share-btn')?.addEventListener('click', () => {
    const shareText = 'Посмотри каталог тканей 100FF VL';
    const shareUrl  = `https://t.me/share/url?url=${encodeURIComponent('https://t.me/' + MANAGER.tgUsername)}&text=${encodeURIComponent(shareText)}`;
    if (navigator.share) {
      navigator.share({ title: shareText, url: shareUrl }).catch(() => {});
    } else {
      TG.openTelegramLink(shareUrl);
    }
    TG.HapticFeedback.impactOccurred('light');
  });

  TG.MainButton.hide();

  const ordersSection = document.getElementById('profile-orders-section');

  if (!user?.id) {
    ordersSection.innerHTML = '<div class="orders-section-title">История заявок</div><div class="empty">Откройте приложение через Telegram</div>';
    return;
  }

  try {
    const res = await fetch(`/api/orders?tg_user_id=${user.id}`);
    if (!res.ok) throw new Error(res.status);
    const orders = await res.json();

    if (orders.length === 0) {
      ordersSection.innerHTML = '<div class="orders-section-title">История заявок</div><div class="empty">Заявок пока нет</div>';
      return;
    }

    ordersSection.innerHTML = `
      <div class="orders-section-title">История заявок</div>
      ${orders.map(order => {
        const st      = getOrderStatusLabel(order.status || 'processing');
        const date    = new Date(order.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const items   = order.items || [];
        const meters  = items.reduce((s, i) => s + Number(i.meters), 0);
        const total   = Number(order.total_usd);
        const totalStr = Number.isInteger(total) ? String(total) : total.toFixed(2).replace('.', ',');
        return `
          <div class="order-card">
            <div class="order-card-header">
              <div>
                <div class="order-id">#${order.order_number || order.id}</div>
                <div class="order-date">${date}</div>
              </div>
              <span class="order-status ${st.cls}">${st.label}</span>
            </div>
            <div class="order-meta">
              ${items.length} ${_pluralize(items.length, 'позиция', 'позиции', 'позиций')}
              · ${meters}&nbsp;м
            </div>
            <div class="order-total">${totalStr}&nbsp;уе.</div>
            <button class="order-repeat-btn" data-order-id="${order.id}">
              &#8635; Повторить заявку
            </button>
          </div>
        `;
      }).join('')}
    `;

    document.querySelectorAll('.order-repeat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = parseInt(btn.dataset.orderId);
        const order   = orders.find(o => o.id === orderId);
        if (!order) return;
        (order.items || []).forEach(item => {
          Store.addToCart(item.fabric_id, String(item.color_id), item.meters);
        });
        updateCartBadge();
        TG.HapticFeedback.notificationOccurred('success');
        showToast('Позиции добавлены в заявку');
        Router.tab('cart');
      });
    });

  } catch (e) {
    ordersSection.innerHTML = '<div class="orders-section-title">История заявок</div><div class="empty">Не удалось загрузить историю</div>';
  }
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
    <div style="margin-bottom:16px">
      <span style="font-weight:600">${fabric.name}</span>
      · Арт. ${fabric.article}
    </div>

    <!-- Контактные данные -->
    <div class="form-group" style="margin-bottom:12px">
      <div class="form-field">
        <div class="form-field-label">ФИО получателя *</div>
        <input type="text" id="sample-recipient" placeholder="Иванова Мария Петровна"
          value="${TG.initDataUnsafe?.user ? [TG.initDataUnsafe.user.first_name, TG.initDataUnsafe.user.last_name].filter(Boolean).join(' ') : ''}">
      </div>
      <div class="form-field">
        <div class="form-field-label">Телефон *</div>
        <input type="tel" id="sample-phone" placeholder="+7 (___) ___-__-__">
      </div>
      <div class="form-field">
        <div class="form-field-label">Адрес ПВЗ СДЭК *</div>
        <input type="text" id="sample-address" placeholder="г. Москва, ул. Примерная, 1">
      </div>
    </div>

    <div style="font-size:12px;color:var(--tg-hint);margin-bottom:16px">
      &#9432; Размер образца 15–20&nbsp;см. Бесплатно при заказе от ${fabric.minOrder}&nbsp;м
    </div>

    <button class="btn-primary" id="sample-submit-btn">Запросить образец</button>
  `;

  document.getElementById('sample-submit-btn')?.addEventListener('click', async () => {
    const recipient = document.getElementById('sample-recipient')?.value || '';
    const phone     = document.getElementById('sample-phone')?.value    || '';
    const addr      = document.getElementById('sample-address')?.value  || '';

    if (!recipient.trim()) {
      TG.showAlert('Введите ФИО получателя');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      TG.showAlert('Введите корректный номер телефона');
      return;
    }
    if (!addr.trim()) {
      TG.showAlert('Введите адрес ПВЗ СДЭК');
      return;
    }

    const btn = document.getElementById('sample-submit-btn');
    btn.disabled = true;
    btn.textContent = '...';

    const activeColor = color; // цвет из карточки товара, выбор не нужен

    const user = TG.initDataUnsafe?.user || {};

    try {
      const res = await fetch('/api/samples', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          recipient_name: recipient.trim(),
          cdek_address:   addr.trim(),
          tg_user_id:     user.id         || null,
          tg_username:    user.username   || null,
          first_name:     user.first_name || null,
          items: [{
            fabric_id:   fabric.id,
            fabric_name: fabric.name,
            color_id:    null,
            color_name:  activeColor.name,
          }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = 'Запросить образец';
        TG.showAlert(data.error || 'Ошибка отправки. Попробуйте ещё раз.');
        return;
      }

      closeSheet('sample');
      TG.HapticFeedback.notificationOccurred('success');
      showToast(`Запрос образца #${data.request_number} отправлен!`);

    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Запросить образец';
      TG.showAlert('Нет соединения с сервером. Попробуйте ещё раз.');
    }
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
   5б. ИЗБРАННОЕ
   ================================================================ */

function renderFavorites() {
  const content = document.getElementById('favorites-content');
  if (!content) return;

  const favIds  = Store.getFavorites();
  const fabrics = FABRICS.filter(f => favIds.has(f.id));

  if (!fabrics.length) {
    content.innerHTML = `
      <div class="favorites-empty">
        <div class="favorites-empty-icon">&#9825;</div>
        <p class="favorites-empty-title">Список пуст</p>
        <p class="favorites-empty-hint">Нажмите ♡ в карточке товара,<br>чтобы добавить ткань</p>
      </div>
    `;
    setMainButton(null);
    return;
  }

  content.innerHTML = `
    <div class="catalog-grid" id="favorites-grid">
      ${fabrics.map(f => _fabricCardHTML(f)).join('')}
    </div>
  `;

  document.getElementById('favorites-grid')?.addEventListener('click', e => {
    const card = e.target.closest('.fabric-card');
    if (!card) return;
    const fabricId = parseInt(card.dataset.fabricId);
    TG.HapticFeedback.impactOccurred('light');
    Router.push('product', () => renderProduct(fabricId));
  });

  setMainButton(null);
}

/** Обновляет бейдж избранного в Tab Bar */
function updateFavBadge() {
  const count = Store.getFavorites().size;
  const badge = document.getElementById('fav-badge');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
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
  const count = Store.getCartCount() + Store.getSamples().length;
  const badge = document.getElementById('cart-badge');
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
    if (chip.dataset.category === 'Все') Store.resetFilters();
    else Store.setCategory(chip.dataset.category);
    renderCatalog();
    TG.HapticFeedback.selectionChanged();
  });

  // --- Фильтры по меткам (Хит / Новинка) ---
  document.getElementById('badge-filter-bar')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-badge]');
    if (!chip) return;
    if (chip.dataset.badge === 'hit') Store.toggleFilterHit();
    else Store.toggleFilterNew();
    renderCatalog();
    TG.HapticFeedback.selectionChanged();
  });

  // --- Кнопка фильтров ---
  document.getElementById('catalog-filter-btn')?.addEventListener('click', () => {
    openFiltersSheet();
  });

  // --- BackButton Telegram + in-app кнопки «Назад» ---
  function _goBack() {
    const openSheet = document.querySelector('.bottom-sheet.open');
    if (openSheet) {
      closeSheet(openSheet.id.replace('sheet-', ''));
      return;
    }
    Router.back();
    TG.HapticFeedback.impactOccurred('light');
  }

  TG.BackButton.onClick(_goBack);

  // Делегирование для всех .back-btn в DOM
  document.addEventListener('click', e => {
    if (e.target.closest('.back-btn')) _goBack();
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
    updateFavBadge();
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

  // Персональное приветствие по имени из Telegram
  const firstName = TG.initDataUnsafe?.user?.first_name;
  const greetingEl = document.getElementById('welcome-greeting');
  if (greetingEl && firstName) {
    greetingEl.textContent = `Привет, ${firstName}!`;
  }

  setTimeout(() => {
    modal.classList.add('visible');
  }, 50);

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

document.addEventListener('DOMContentLoaded', async () => {

  // 1. Запускаем Telegram SDK
  TG.ready();
  TG.expand();

  // 2. Применяем тему
  applyTheme();

  // 3. Навешиваем события
  setupEventListeners();

  // 4. Показываем скелетон в каталоге пока данные грузятся
  const grid = document.getElementById('catalog-grid');
  if (grid) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--tg-hint)">
        Загрузка каталога...
      </div>`;
  }

  // 5. Загружаем каталог из API (Supabase)
  try {
    await Catalog.load();
  } catch (err) {
    console.error('[init] Ошибка загрузки каталога:', err);
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;padding:40px;text-align:center">
          <div style="font-size:32px;margin-bottom:12px">&#9888;</div>
          <div style="font-weight:600;margin-bottom:8px">Не удалось загрузить каталог</div>
          <div style="color:var(--tg-hint);margin-bottom:16px;font-size:14px">Проверьте подключение к интернету</div>
          <button class="btn-secondary" onclick="location.reload()">Обновить</button>
        </div>`;
    }
    return;
  }

  // 6. Рендерим начальный экран с данными
  renderCatalog();
  renderProfile();

  // 7. Welcome-экран (только при первом открытии)
  showWelcome();

  // 7b. Регистрируем/обновляем пользователя в аналитике (fire-and-forget)
  const _tgUser = TG.initDataUnsafe?.user;
  if (_tgUser?.id) {
    fetch('/api/analytics?type=user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tg_user_id: _tgUser.id,
        first_name: _tgUser.first_name || null,
        username:   _tgUser.username   || null,
      }),
    }).catch(() => {});

    // Синхронизируем корзину и избранное с сервером (cross-device)
    Store.initSync(_tgUser.id, () => {
      updateCartBadge();
      updateFavBadge();
      // Обновляем текущий экран если пользователь уже на корзине или каталоге
      const cur = Router.current();
      if (cur === 'cart')    renderCart();
      if (cur === 'catalog') renderCatalog();
    });
  }

  // 7c. Старт сессии
  _startSession();

  // 8. Обновляем бейджи
  updateCartBadge();
  updateFavBadge();

  // 9. Обработчик изменения темы в рантайме
  window.addEventListener('themeChanged', applyTheme);

});
