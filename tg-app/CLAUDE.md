# CLAUDE.md — Документация проекта tg-app

## Структура файлов

```
tg-app/
├── index.html          — Точка входа. HTML-шаблоны всех экранов
├── css/
│   └── style.css       — Все стили. CSS-переменные темы Telegram,
│                         компоненты, экраны, анимации
└── js/
    ├── data.js         — Данные каталога тканей, менеджер, история заказов
    ├── store.js        — Состояние приложения (корзина, фильтры, избранное)
    └── app.js          — Вся логика: роутер, рендер экранов, события
```

## Порядок загрузки скриптов

```
data.js  →  store.js  →  app.js
(данные)    (состояние)  (логика)
```

Каждый следующий файл зависит от предыдущего — не менять порядок.

---

## Как добавить новую ткань

Открой `js/data.js`, найди массив `FABRICS` и добавь объект:

```javascript
{
  id: 13,                         // уникальный числовой id
  name: 'Сатин хлопок',
  article: '100FF-013',           // уникальный артикул
  category: 'Сорочечные',         // одна из CATEGORIES
  composition: '100% Хлопок',
  width: 140,                     // ширина полотна, см
  density: 130,                   // плотность, г/м²
  basePricePerMeter: 450,         // базовая цена за метр
  minOrder: 10,                   // минимальный заказ, м
  step: 5,                        // кратность, м
  description: 'Описание ткани...',
  colors: [
    { id: 'c1', hex: '#FFFFFF', name: 'Белый', stock: 200, rolls: 4 },
    // stock: 0 — нет в наличии
  ],
  thumb: 'linear-gradient(145deg, #E0E0E0 0%, #B0B0B0 100%)', // CSS-градиент
}
```

---

## Экраны и навигация

### Карта экранов

```
[Каталог] ──→ [Карточка товара] ──→ (вернуться назад)
   ↕
[Поиск] ──→ [Карточка товара]
   ↕
[Корзина] ──→ [Оформление заявки] ──→ [Успех] ──→ [Каталог]
   ↕
[Профиль]

Bottom sheets (поверх любого экрана):
  [Фильтры]
  [Запрос образца]
```

### Навигация в app.js

```javascript
Router.tab('catalog')        // Переключение таба (без анимации)
Router.push('product', fn)   // Навигация вперёд (slide) + вызов fn для рендера
Router.back()                // Назад (BackButton Telegram вызывает это)
```

### Что делает каждый экран

| Экран | id в HTML | Функция рендера |
|---|---|---|
| Каталог | `screen-catalog` | `renderCatalog()` |
| Карточка товара | `screen-product` | `renderProduct(fabricId, colorId)` |
| Поиск | `screen-search` | `renderSearch()` |
| Корзина | `screen-cart` | `renderCart()` |
| Оформление заявки | `screen-checkout` | `renderCheckout()` |
| Успех | `screen-success` | `renderSuccess(orderNum)` |
| Профиль | `screen-profile` | `renderProfile()` |

---

## Где что менять

### Изменить данные менеджера
`js/data.js` → объект `MANAGER`:
```javascript
const MANAGER = {
  name: 'Имя Фамилия',
  since: '2011',
  tgUsername: 'username_без_@',
  phone: '+7 ...',
  initials: 'ИФ',
};
```

### Изменить категории
`js/data.js` → массив `CATEGORIES`.
Убедись что в `FABRICS` есть ткани с таким же значением поля `category`.

### Изменить цвета и тему
`css/style.css` → секция `:root {}`:
```css
--accent: #2AABEE;       /* цвет кнопок — берётся из темы Telegram автоматически */
--price-color: #E53935;  /* цвет цены */
```

### Изменить историю заказов (демо)
`js/data.js` → массив `DEMO_ORDERS`.

### Ценовые скидки по объёму
`js/data.js` → функция `getPriceTiers()`:
```javascript
function getPriceTiers(fabric) {
  const b = fabric.basePricePerMeter;
  return [
    { label: `${fabric.minOrder}–49 м`, price: b },
    { label: '50–99 м',  price: Math.round(b * 0.92) }, // -8%
    { label: '100–299 м', price: Math.round(b * 0.85) }, // -15%
    { label: '300+ м',   price: Math.round(b * 0.78) },  // -22%
  ];
}
```

---

## Telegram SDK — используемые методы

| Метод | Где используется |
|---|---|
| `TG.ready()` | При инициализации |
| `TG.expand()` | При инициализации — разворачивает на весь экран |
| `TG.BackButton.show/hide/onClick` | Роутер |
| `TG.MainButton.setText/show/hide/onClick` | `setMainButton()` в app.js |
| `TG.HapticFeedback.impactOccurred` | На нажатия кнопок |
| `TG.HapticFeedback.notificationOccurred` | На успех/ошибку |
| `TG.HapticFeedback.selectionChanged` | На выбор цвета/категории |
| `TG.showConfirm` | Подтверждение удаления из корзины |
| `TG.showAlert` | Ошибки валидации формы |
| `TG.openTelegramLink` | Переход в чат с менеджером |
| `TG.initDataUnsafe.user` | Данные пользователя для формы |
| `TG.colorScheme` / `TG.themeParams` | Тема оформления |

В браузере (без Telegram) все методы имеют заглушки — приложение работает.

---

## Store API (js/store.js)

```javascript
// Корзина
Store.addToCart(fabricId, colorId, meters)
Store.removeFromCart(fabricId, colorId)
Store.updateCartItem(fabricId, colorId, meters)
Store.getCart()          // → [{fabricId, colorId, colorName, meters}]
Store.getCartCount()     // → число позиций
Store.getCartTotal()     // → сумма в рублях
Store.findCartItem(fabricId, colorId) // → item | undefined
Store.clearCart()

// Фильтры
Store.setCategory('Трикотаж')
Store.setInStock(true)
Store.resetFilters()
Store.getFilteredFabrics(searchQuery?) // → Fabric[]

// История поиска
Store.addSearchHistory(query)
Store.getSearchHistory() // → string[]

// Избранное
Store.toggleFavorite(fabricId) // → boolean (новое состояние)
Store.isFavorite(fabricId)
```

Состояние сохраняется в `localStorage` и восстанавливается при перезапуске.

---

## Как запустить в браузере (для разработки)

1. Открой `tg-app/index.html` напрямую в браузере (Chrome/Firefox)
2. Откроется с заглушкой вместо Telegram SDK
3. Внизу появится синяя кнопка (MainButton fallback)
4. BackButton работает как кнопка в UI (если браузер поддерживает `window._tgBack`)

## Как опубликовать как Telegram Mini App

1. Задеплой папку `tg-app/` на HTTPS-хостинг (Vercel, GitHub Pages, Cloudflare Pages)
2. В BotFather → выбери бота → Bot Settings → Menu Button → задай URL
3. Или: отправь команду `/newapp` в BotFather и следуй инструкциям
4. Mini App открывается по кнопке в меню бота или по ссылке `t.me/ИМЯ_БОТА/app`

---

## Что НЕ реализовано в v1 (запланировано в v2)

- Верификация B2B (показ оптовых цен только авторизованным)
- Реальная отправка заявки на сервер (сейчас — имитация setTimeout)
- Онлайн-оплата через Telegram Payments
- Сравнение товаров
- Реальная синхронизация остатков со складом
- Уведомления о поступлении товара
- Сертификаты в карточке товара
- Pinch-to-zoom в галерее
- Виртуализация длинного каталога (react-window аналог)
