# BACKEND-PLAN.md — Backend для каталога 100FF VL

## Контекст и цели

Сейчас каталог — статичный TMA (HTML + JS). Данные захардкожены в `data.js`.
Цель backend: принимать заявки, хранить каталог в БД, дать веб-панель для редактирования,
слать уведомления в Telegram-канал, собирать аналитику.

---

## Стек (бюджет до $10/мес)

| Слой | Технология | Стоимость |
|---|---|---|
| Frontend (TMA) | Vercel (уже есть) | $0 |
| API | Vercel Serverless Functions | $0 |
| База данных | Supabase (PostgreSQL, free tier) | $0 |
| Файлы / фото | Supabase Storage (free 1 GB) | $0 |
| Бот (webhook) | Vercel Function `/api/bot` | $0 |
| Admin-панель | Отдельная HTML-страница на Vercel | $0 |
| **Итого** | | **$0/мес** |

> При превышении лимитов Supabase (маловероятно на старте) — переход на Railway ~$5/мес.

---

## Система цен

У каждой ткани **две цены**, которые ты устанавливаешь самостоятельно в admin-панели:

| Поле | Смысл | Пример |
|---|---|---|
| `base_price` | Оптовая цена — при заказе **от 50 м** | 4,95 $/м |
| `cut_price` | Цена на отрез/купон — при заказе **до 50 м** | 6,50 $/м |

Порог переключения — **50 м** — фиксированный, не настраивается.

### UX в карточке товара (Вариант A)

```
┌──────────────────────────────────────────┐
│  [●] от 50 м — оптовая    4,95 $/м       │  ← активный блок (по умолчанию)
│  [ ] до 50 м — на отрез   6,50 $/м       │  ← тускло, не активен
└──────────────────────────────────────────┘
  Количество: [──────●──────] 60 м
```

Клиент двигает слайдер / вводит метраж:
- Ввёл **≥ 50 м** → верхний блок активен (оптовая цена), нижний тускнеет
- Ввёл **< 50 м** → нижний блок активен (цена на отрез), верхний тускнеет
- Под блоками живой итог: `Итого: 195 $`

Если `cut_price` не задана — нижний блок не показывается (только оптовая цена).

---

## Схема базы данных

### `categories`
```sql
id          SERIAL PRIMARY KEY
name        TEXT NOT NULL          -- 'Костюмные', 'Трикотаж', ...
sort_order  INT DEFAULT 0
```

### `fabrics`
```sql
id                  SERIAL PRIMARY KEY
name                TEXT NOT NULL
article             TEXT UNIQUE NOT NULL
category_id         INT REFERENCES categories(id)
composition         TEXT                    -- '25% Вис, 6% Шерсть, 69% ПЭ'
width               INT                     -- ширина, см
density             INT                     -- плотность, г/м²
base_price          NUMERIC(10,2) NOT NULL  -- оптовая цена (от 50 м), USD
cut_price           NUMERIC(10,2)           -- цена на отрез (до 50 м), NULL = не задана
min_order           INT DEFAULT 10          -- минимальный заказ, м
step                INT DEFAULT 5           -- кратность, м
description         TEXT
thumb               TEXT                    -- URL фото или CSS-градиент
is_active           BOOLEAN DEFAULT TRUE    -- скрыть без удаления
created_at          TIMESTAMP DEFAULT NOW()
updated_at          TIMESTAMP DEFAULT NOW()
```

### `fabric_colors`
```sql
id          SERIAL PRIMARY KEY
fabric_id   INT REFERENCES fabrics(id) ON DELETE CASCADE
hex         TEXT                -- '#C41E3A'
name        TEXT                -- 'Бордо'
stock       INT DEFAULT 0       -- метры в наличии
rolls       INT DEFAULT 0       -- рулонов
```

### `fabric_photos`
```sql
id          SERIAL PRIMARY KEY
fabric_id   INT REFERENCES fabrics(id) ON DELETE CASCADE
url         TEXT NOT NULL       -- путь в Supabase Storage
sort_order  INT DEFAULT 0
```

### `orders`
```sql
id              SERIAL PRIMARY KEY
order_number    TEXT UNIQUE DEFAULT ('100FF-' || to_char(NOW(),'YYYY') || '-' || nextval('order_seq')::TEXT)
tg_user_id      BIGINT
tg_username     TEXT            -- @username (может не быть)
first_name      TEXT
phone           TEXT NOT NULL
comment         TEXT
total_meters    INT
total_usd       NUMERIC(10,2)
created_at      TIMESTAMP DEFAULT NOW()
notified        BOOLEAN DEFAULT FALSE
```

> Номер заявки генерируется через PostgreSQL `SEQUENCE` — race condition исключён.
> `CREATE SEQUENCE order_seq START 1;` выполняется в миграции.

### `order_items`
```sql
id              SERIAL PRIMARY KEY
order_id        INT REFERENCES orders(id) ON DELETE CASCADE
fabric_id       INT REFERENCES fabrics(id)
fabric_name     TEXT            -- snapshot на момент заявки
color_id        INT REFERENCES fabric_colors(id)
color_name      TEXT            -- snapshot
meters          INT
price_per_meter NUMERIC(10,2)  -- snapshot (base или cut — зависит от метража)
price_type      TEXT            -- 'base' | 'cut' — для аналитики
```

### `sample_requests`
```sql
id              SERIAL PRIMARY KEY
request_number  TEXT UNIQUE DEFAULT ('SAMPLE-' || to_char(NOW(),'YYYY') || '-' || nextval('sample_seq')::TEXT)
tg_user_id      BIGINT
tg_username     TEXT
first_name      TEXT
recipient_name  TEXT NOT NULL   -- ФИО получателя
phone           TEXT NOT NULL
cdek_address    TEXT NOT NULL   -- адрес ПВЗ СДЭК
comment         TEXT
created_at      TIMESTAMP DEFAULT NOW()
notified        BOOLEAN DEFAULT FALSE
```

### `sample_request_items`
```sql
id                  SERIAL PRIMARY KEY
sample_request_id   INT REFERENCES sample_requests(id) ON DELETE CASCADE
fabric_id           INT REFERENCES fabrics(id)
fabric_name         TEXT
color_id            INT REFERENCES fabric_colors(id)   -- ← внешний ключ (исправлено)
color_name          TEXT
```

### `analytics_views`
```sql
id          BIGSERIAL PRIMARY KEY
tg_user_id  BIGINT
fabric_id   INT REFERENCES fabrics(id)
viewed_at   TIMESTAMP DEFAULT NOW()
```

### `analytics_users`
```sql
tg_user_id  BIGINT PRIMARY KEY
first_name  TEXT
username    TEXT
first_seen  TIMESTAMP DEFAULT NOW()
last_seen   TIMESTAMP DEFAULT NOW()
```

---

## API-эндпоинты

Все функции лежат в `api/` (Vercel Serverless Functions).
CORS-заголовки: `Access-Control-Allow-Origin: https://<vercel-домен>` на всех эндпоинтах.

### Публичные (вызывает TMA)

| Метод | URL | Что делает |
|---|---|---|
| `GET` | `/api/fabrics` | Список тканей (`?category=&inStock=&search=`) |
| `GET` | `/api/fabrics/:id` | Карточка ткани с цветами, фото и ценами |
| `GET` | `/api/categories` | Список категорий |
| `POST` | `/api/orders` | Создать заявку на покупку |
| `POST` | `/api/samples` | Создать запрос на образцы |
| `POST` | `/api/analytics/view` | Записать просмотр ткани |
| `POST` | `/api/analytics/user` | Зарегистрировать/обновить пользователя |

> `GET /api/fabrics?search=сатин` — поиск через PostgreSQL `ILIKE '%сатин%'` по полям `name`, `article`, `composition`.

### Webhook бота

| Метод | URL | Что делает |
|---|---|---|
| `POST` | `/api/bot` | Принимает обновления от Telegram |

Бот нужен только для отправки уведомлений в группу. Входящие команды клиентов не обрабатываются.

### Admin (защищены токеном)

Запросы идут с заголовком `Authorization: Bearer ADMIN_SECRET`.

На `/api/admin/*` настроен rate limit: не более 20 запросов в минуту с одного IP (через Vercel Edge Config или простой счётчик в памяти функции).

| Метод | URL | Что делает |
|---|---|---|
| `GET` | `/api/admin/fabrics` | Все ткани (включая скрытые) |
| `POST` | `/api/admin/fabrics` | Добавить ткань |
| `PUT` | `/api/admin/fabrics/:id` | Обновить ткань (включая обе цены) |
| `DELETE` | `/api/admin/fabrics/:id` | Скрыть ткань (`is_active=false`) |
| `POST` | `/api/admin/fabrics/:id/photos` | Загрузить фото в Supabase Storage |
| `DELETE` | `/api/admin/photos/:id` | Удалить фото |
| `GET` | `/api/admin/orders` | Список заявок |
| `POST` | `/api/admin/orders/:id/notify` | Повторить уведомление в группу |
| `GET` | `/api/admin/samples` | Список запросов на образцы |
| `POST` | `/api/admin/samples/:id/notify` | Повторить уведомление в группу |
| `GET` | `/api/admin/analytics` | Сводка: топ тканей, заявки, пользователи |

---

## Уведомления в Telegram

При создании заявки и запроса образца backend отправляет сообщение в группу.
Если отправка провалилась — `notified` остаётся `false`. В admin-панели такие строки
помечаются красным, есть кнопка **"Повторить уведомление"**.

**Формат уведомления о заявке:**
```
🛍 Новая заявка #100FF-2026-0001

👤 Иван (@username)
📞 +7 999 123-45-67

📦 Состав:
• Севилья (Бордо) × 30 м — 6,50 $/м [отрез]
• Прага (Серый) × 60 м — 4,95 $/м [опт]

💵 Итого: ~492 $ (90 м)
💬 Комментарий: нужно срочно

⏰ 01.04.2026 21:48
```

**Формат уведомления об образцах:**
```
📬 Запрос образцов #SAMPLE-2026-0001

👤 Елена (@elena_ff)
📦 Ткани: Севилья (Бордо), Прага (Серый)

🏠 Получатель: Петрова Елена Ивановна
📞 +7 999 000-11-22
📍 ПВЗ СДЭК: г. Москва, ул. Ленина 5

⏰ 01.04.2026 21:48
```

---

## Веб-панель администратора

Отдельная страница `/admin/index.html` на Vercel.

**Вход**: при открытии — поле для ввода `ADMIN_SECRET`. Хранится в `sessionStorage`
(очищается при закрытии вкладки, не в `localStorage`).

**Защита от перебора**: после 5 неверных попыток — блокировка на 10 минут (на стороне сервера в `/api/admin/_auth.js`).

### Разделы панели:

**1. Каталог**
- Таблица всех тканей с поиском
- Кнопки: добавить, редактировать, скрыть/показать
- Форма редактирования: все поля + **оба поля цен** (`base_price` и `cut_price`) + загрузка фото + цвета/остатки

**2. Заявки**
- Список заявок (новые сверху)
- Красный индикатор у заявок с `notified=false` + кнопка "Повторить"
- Детали: клиент, товары, какая цена применялась (опт/отрез), сумма, дата

**3. Образцы**
- Список запросов на образцы
- Красный индикатор + кнопка "Повторить"
- ФИО, телефон, адрес СДЭК, ткани

**4. Аналитика**
- Топ-10 просматриваемых тканей (за неделю / месяц)
- Количество заявок по дням
- Всего уникальных пользователей / новые за месяц

---

## Структура файлов (после реализации)

```
catalog_100ffvl_tkani/
├── tg-app/                     — существующий фронтенд (TMA)
│   └── js/
│       └── data.js             — заменяется на запросы к API
├── api/                        — Vercel Serverless Functions
│   ├── fabrics.js              — GET /api/fabrics?search=&category=&inStock=
│   ├── fabrics/
│   │   └── [id].js             — GET /api/fabrics/:id
│   ├── categories.js
│   ├── orders.js               — POST /api/orders
│   ├── samples.js              — POST /api/samples
│   ├── bot.js                  — POST /api/bot (webhook)
│   ├── analytics/
│   │   ├── view.js
│   │   └── user.js
│   └── admin/
│       ├── _auth.js            — проверка токена + rate limit
│       ├── fabrics.js
│       ├── orders.js
│       ├── samples.js
│       └── analytics.js
├── admin/                      — веб-панель
│   ├── index.html
│   ├── css/admin.css
│   └── js/admin.js
├── lib/
│   ├── db.js                   — клиент Supabase
│   ├── bot.js                  — отправка сообщений через Bot API
│   └── validate.js             — валидация телефона, метража (общая)
├── scripts/
│   └── seed.js                 — перенос FABRICS из data.js в БД (одноразово)
└── vercel.json                 — уже настроен
```

---

## Переменные окружения (`.env`)

```
# Уже есть
BOT_TOKEN=...

# Добавить
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=...          # service_role ключ (только на сервере)
ADMIN_SECRET=...                  # пароль для веб-панели
NOTIFY_CHAT_ID=-100xxxxxxxxxx     # id Telegram-группы/канала для уведомлений
```

---

## Валидация на сервере

Проверяется в каждом `POST`-эндпоинте (не только на клиенте):

| Поле | Правило |
|---|---|
| `phone` | соответствует `/^\+?[0-9\s\-\(\)]{7,20}$/` |
| `meters` | целое число, кратное `step`, не меньше `min_order` |
| `recipient_name` | не пустое, не длиннее 200 символов |
| `cdek_address` | не пустое, не длиннее 500 символов |
| `initData` (Telegram) | HMAC-SHA256 подпись проверяется по `BOT_TOKEN` |

---

## Этапы разработки

### Этап 1 — База и каталог
1. Создать проект в Supabase, выполнить SQL миграцию (включая `order_seq`, `sample_seq`)
2. Написать `scripts/seed.js` — залить `FABRICS` из `data.js` в БД
3. Реализовать `/api/fabrics`, `/api/fabrics/:id`, `/api/categories`
4. Переключить `app.js` с `FABRICS[]` на `fetch('/api/fabrics')`

### Этап 2 — Заявки и образцы
1. Реализовать `/api/orders` и `/api/samples` с валидацией и initData-проверкой
2. Заменить `setTimeout`-имитацию в `renderCheckout()` на реальный `fetch`
3. Добавить форму образцов (ФИО, телефон, адрес СДЭК) в bottom sheet
4. Реализовать отправку уведомлений в Telegram-группу

### Этап 3 — Admin-панель
1. Создать `/admin/index.html` с формой входа и rate limit
2. Реализовать `/api/admin/*`
3. Загрузка фото через Supabase Storage (drag & drop)
4. Таблицы заявок и образцов с кнопкой "Повторить уведомление"

### Этап 4 — Аналитика
1. Реализовать `/api/analytics/view` и `/api/analytics/user`
2. Добавить вызовы в `app.js`
3. Раздел аналитики в admin-панели

---

## Важные детали реализации

- **Две цены**: `base_price` (≥50 м) и `cut_price` (<50 м). В `order_items` фиксируется какая цена применялась (`price_type: 'base' | 'cut'`)
- **Snapshot**: при сохранении заявки цена и название ткани копируются в `order_items` — защита от изменения прайса задним числом
- **Номера заявок**: генерируются через PostgreSQL `SEQUENCE` — дублей быть не может
- **Soft delete**: ткани не удаляются физически (`is_active=false`), чтобы не сломать старые заявки
- **Retry уведомлений**: в admin-панели видны строки с `notified=false`, кнопка "Повторить" вызывает `/api/admin/orders/:id/notify`
- **Безопасность admin**: пароль в `sessionStorage` (не localStorage), блокировка после 5 неверных попыток
- **CORS**: все `/api/*` отвечают с `Access-Control-Allow-Origin` только для домена Vercel-проекта
- **Поиск**: `GET /api/fabrics?search=` работает через `ILIKE` в PostgreSQL
