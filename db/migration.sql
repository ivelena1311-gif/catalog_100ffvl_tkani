-- =============================================================
-- MIGRATION: 100FF VL Fabric Catalog
-- Запускать один раз в Supabase → SQL Editor
-- =============================================================


-- =============================================================
-- 1. СЧЁТЧИКИ ДЛЯ НОМЕРОВ ЗАЯВОК
--    Как кассовый аппарат: каждый чек получает следующий номер.
--    Даже если два клиента нажали "Отправить" одновременно —
--    дублей не будет, PostgreSQL гарантирует уникальность.
-- =============================================================

CREATE SEQUENCE IF NOT EXISTS order_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS sample_seq START 1;


-- =============================================================
-- 2. КАТЕГОРИИ ТКАНЕЙ
--    Простой справочник: Костюмные, Трикотаж, Подкладочные...
-- =============================================================

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INT  NOT NULL DEFAULT 0
);

COMMENT ON TABLE  categories            IS 'Категории тканей';
COMMENT ON COLUMN categories.sort_order IS 'Порядок отображения в каталоге';


-- =============================================================
-- 3. ТКАНИ — главная таблица каталога
--    Каждая строка = одна позиция из прайса.
--    Две цены: base_price (опт, от 50м) и cut_price (отрез, до 50м).
-- =============================================================

CREATE TABLE IF NOT EXISTS fabrics (
  id          SERIAL PRIMARY KEY,
  name        TEXT          NOT NULL,
  article     TEXT          NOT NULL UNIQUE,
  category_id INT           REFERENCES categories(id),

  -- Характеристики
  composition TEXT,                      -- '25% Вис, 6% Шерсть, 69% ПЭ'
  width       INT,                       -- ширина рулона, см
  density     INT,                       -- плотность, г/м²
  description TEXT,

  -- Цены (USD за метр)
  base_price  NUMERIC(10,2) NOT NULL,    -- оптовая: заказ >= 50 м
  cut_price   NUMERIC(10,2),             -- на отрез: заказ < 50 м (NULL = не задана)

  -- Условия заказа
  min_order   INT NOT NULL DEFAULT 10,   -- минимум, м
  step        INT NOT NULL DEFAULT 5,    -- кратность заказа, м

  -- Изображение: либо URL ('images/fabrics/...'), либо CSS-градиент
  thumb       TEXT,

  -- Управление видимостью (не удаляем — скрываем)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  fabrics            IS 'Каталог тканей';
COMMENT ON COLUMN fabrics.base_price IS 'Оптовая цена USD/м — при заказе от 50 м';
COMMENT ON COLUMN fabrics.cut_price  IS 'Цена на отрез USD/м — при заказе до 50 м. NULL = блок не показывается';
COMMENT ON COLUMN fabrics.thumb      IS 'URL фото или CSS linear-gradient(...)';
COMMENT ON COLUMN fabrics.is_active  IS 'FALSE = скрыта из каталога, но не удалена';

-- Автообновление updated_at при изменении строки
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER fabrics_updated_at
  BEFORE UPDATE ON fabrics
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- =============================================================
-- 4. ЦВЕТА ТКАНИ
--    У одной ткани может быть несколько цветов, у каждого — свой остаток.
-- =============================================================

CREATE TABLE IF NOT EXISTS fabric_colors (
  id        SERIAL PRIMARY KEY,
  fabric_id INT  NOT NULL REFERENCES fabrics(id) ON DELETE CASCADE,
  hex       TEXT NOT NULL,              -- '#C41E3A'
  name      TEXT NOT NULL,              -- 'Бордо'
  stock     INT  NOT NULL DEFAULT 0,    -- метры в наличии
  rolls     INT  NOT NULL DEFAULT 0     -- рулонов в наличии
);

COMMENT ON TABLE fabric_colors IS 'Цвета и остатки для каждой ткани';


-- =============================================================
-- 5. ФОТОГРАФИИ ТКАНИ
--    Отдельная таблица, чтобы у одной ткани было несколько фото
--    (галерея с листанием в карточке).
-- =============================================================

CREATE TABLE IF NOT EXISTS fabric_photos (
  id         SERIAL PRIMARY KEY,
  fabric_id  INT  NOT NULL REFERENCES fabrics(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,             -- путь в Supabase Storage
  sort_order INT  NOT NULL DEFAULT 0    -- порядок в галерее
);

COMMENT ON TABLE fabric_photos IS 'Фотографии тканей (Supabase Storage URLs)';


-- =============================================================
-- 6. ЗАЯВКИ НА ПОКУПКУ
--    Клиент выбрал ткани, ввёл телефон, нажал "Отправить заявку".
--    Здесь хранится заголовок заявки (кто, когда, сумма).
-- =============================================================

CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE
                 DEFAULT ('100FF-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('order_seq')::TEXT, 4, '0')),

  -- Кто заказал (из Telegram)
  tg_user_id   BIGINT,
  tg_username  TEXT,                    -- @username (может отсутствовать)
  first_name   TEXT,

  -- Контакт
  phone        TEXT NOT NULL,

  -- Итог
  total_meters INT,
  total_usd    NUMERIC(10,2),

  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Отправлено ли уведомление в Telegram-группу
  notified     BOOLEAN NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  orders              IS 'Заявки на оптовую покупку тканей';
COMMENT ON COLUMN orders.order_number IS 'Формат: 100FF-2026-0001';
COMMENT ON COLUMN orders.notified     IS 'FALSE = уведомление в группу ещё не отправлено';


-- =============================================================
-- 7. ПОЗИЦИИ ЗАЯВКИ (что именно заказали)
--    Каждая строка = одна ткань в заявке.
--    Цена и название сохраняются как "снимок" — даже если потом
--    изменишь прайс, старая заявка покажет ту цену, что была.
-- =============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id              SERIAL PRIMARY KEY,
  order_id        INT           NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Ссылки на каталог (для аналитики)
  fabric_id       INT           REFERENCES fabrics(id),
  color_id        INT           REFERENCES fabric_colors(id),

  -- Снимок на момент заявки (защита от изменения прайса задним числом)
  fabric_name     TEXT          NOT NULL,
  color_name      TEXT,
  meters          INT           NOT NULL,
  price_per_meter NUMERIC(10,2) NOT NULL,
  price_type      TEXT          NOT NULL CHECK (price_type IN ('base', 'cut'))
                                         -- 'base' = оптовая, 'cut' = на отрез
);

COMMENT ON TABLE  order_items            IS 'Позиции заявки на покупку';
COMMENT ON COLUMN order_items.price_type IS 'base = оптовая (≥50м), cut = на отрез (<50м)';


-- =============================================================
-- 8. ЗАПРОСЫ НА ОБРАЗЦЫ
--    Клиент выбрал ткани, которые хочет потрогать,
--    и указал адрес ПВЗ СДЭК для доставки образцов.
-- =============================================================

CREATE TABLE IF NOT EXISTS sample_requests (
  id             SERIAL PRIMARY KEY,
  request_number TEXT NOT NULL UNIQUE
                   DEFAULT ('SAMPLE-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('sample_seq')::TEXT, 4, '0')),

  -- Кто запрашивает (из Telegram)
  tg_user_id     BIGINT,
  tg_username    TEXT,
  first_name     TEXT,

  -- Получатель посылки
  recipient_name TEXT NOT NULL,          -- ФИО
  phone          TEXT NOT NULL,
  cdek_address   TEXT NOT NULL,          -- адрес ПВЗ СДЭК

  comment        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified       BOOLEAN     NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE  sample_requests              IS 'Запросы на физические образцы тканей';
COMMENT ON COLUMN sample_requests.cdek_address IS 'Адрес ближайшего ПВЗ СДЭК для доставки образцов';


-- =============================================================
-- 9. СОСТАВ ЗАПРОСА НА ОБРАЗЦЫ (какие ткани хочет клиент)
-- =============================================================

CREATE TABLE IF NOT EXISTS sample_request_items (
  id                SERIAL PRIMARY KEY,
  sample_request_id INT  NOT NULL REFERENCES sample_requests(id) ON DELETE CASCADE,
  fabric_id         INT  NOT NULL REFERENCES fabrics(id),
  fabric_name       TEXT NOT NULL,       -- снимок
  color_id          INT  REFERENCES fabric_colors(id),
  color_name        TEXT                 -- снимок
);

COMMENT ON TABLE sample_request_items IS 'Ткани в запросе на образцы';


-- =============================================================
-- 10. АНАЛИТИКА: ПРОСМОТРЫ ТКАНЕЙ
--     Каждый раз когда клиент открывает карточку ткани — пишем сюда.
--     Потом видим: "Севилья смотрели 200 раз за месяц".
-- =============================================================

CREATE TABLE IF NOT EXISTS analytics_views (
  id         BIGSERIAL PRIMARY KEY,
  tg_user_id BIGINT,
  fabric_id  INT         NOT NULL REFERENCES fabrics(id),
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_views_fabric  ON analytics_views(fabric_id);
CREATE INDEX IF NOT EXISTS idx_analytics_views_user    ON analytics_views(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_views_date    ON analytics_views(viewed_at);

COMMENT ON TABLE analytics_views IS 'Лог просмотров карточек тканей';


-- =============================================================
-- 11. АНАЛИТИКА: ПОЛЬЗОВАТЕЛИ
--     Кто пользуется приложением. Строка создаётся при первом
--     входе, last_seen обновляется при каждом запуске.
-- =============================================================

CREATE TABLE IF NOT EXISTS analytics_users (
  tg_user_id BIGINT      PRIMARY KEY,
  first_name TEXT,
  username   TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE analytics_users IS 'Уникальные пользователи Telegram Mini App';


-- =============================================================
-- 12. ИНДЕКСЫ ДЛЯ СКОРОСТИ
--     Как закладки в книге — без них база читала бы каждую строку
--     с начала. С ними находит нужное мгновенно.
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_fabrics_category  ON fabrics(category_id);
CREATE INDEX IF NOT EXISTS idx_fabrics_active     ON fabrics(is_active);
CREATE INDEX IF NOT EXISTS idx_fabric_colors_fab  ON fabric_colors(fabric_id);
CREATE INDEX IF NOT EXISTS idx_fabric_photos_fab  ON fabric_photos(fabric_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_orders_user        ON orders(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created     ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_samples_user       ON sample_requests(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_samples_created    ON sample_requests(created_at DESC);


-- =============================================================
-- 13. БЕЗОПАСНОСТЬ (Row Level Security)
--
--     Метафора: представь, что у Supabase есть два ключа.
--     • anon key    — публичный ключ, который знают все (в TMA)
--     • service key — секретный ключ, только у твоего сервера
--
--     RLS — это охранник на входе. Он проверяет:
--     с каким ключом пришёл запрос → что ему разрешено делать.
--
--     service_role (наш backend) обходит RLS автоматически.
--     Политики ниже — для надёжности, на случай утечки anon key.
-- =============================================================

-- Включаем RLS на всех таблицах
ALTER TABLE categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrics              ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_colors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_photos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_views      ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_users      ENABLE ROW LEVEL SECURITY;

-- Публичный ключ может только ЧИТАТЬ активные ткани и категории
CREATE POLICY "public_read_categories"
  ON categories FOR SELECT TO anon USING (true);

CREATE POLICY "public_read_fabrics"
  ON fabrics FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "public_read_fabric_colors"
  ON fabric_colors FOR SELECT TO anon USING (true);

CREATE POLICY "public_read_fabric_photos"
  ON fabric_photos FOR SELECT TO anon USING (true);

-- Публичный ключ НЕ может читать заявки, образцы и аналитику
-- (никаких политик = запрещено по умолчанию)

-- =============================================================
-- ГОТОВО. Таблицы и права созданы.
-- Следующий шаг: scripts/seed.js — залить ткани из data.js в БД.
-- =============================================================
