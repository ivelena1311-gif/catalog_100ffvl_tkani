-- ================================================================
-- Миграция 003: Баннеры и настройки
-- Выполнить в Supabase → SQL Editor
-- ================================================================

-- Таблица баннеров
create table if not exists banners (
  id           serial primary key,
  title        text        not null,
  subtitle     text,
  label        text,
  image_url    text,
  gradient     text        not null default 'linear-gradient(135deg, #1a1108 0%, #2d1f0a 100%)',
  action_type  text,       -- 'category' | null
  action_value text,
  is_active    boolean     not null default true,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now()
);

-- Таблица настроек (общих для приложения)
create table if not exists settings (
  key   text primary key,
  value text not null
);

-- Начальные настройки баннеров
insert into settings (key, value) values
  ('banner_max_visible', '3'),
  ('banner_interval_ms', '4000')
on conflict (key) do nothing;

-- Начальные баннеры (перенесены из захардкоженного data.js)
insert into banners (title, subtitle, label, gradient, sort_order, is_active) values
  ('Весенняя коллекция',      'Лёгкие ткани для нового сезона',  'Новинки',
   'linear-gradient(135deg, #1a1108 0%, #2d1f0a 40%, #1a1108 100%)', 1, true),
  ('Скидка на оптовые заказы','При заказе от 300 м — минус 22%', 'Специальное предложение',
   'linear-gradient(135deg, #0d1a0d 0%, #1a2e1a 40%, #0d1a0d 100%)', 2, true),
  ('Итальянские ткани',       'Шерсть, шёлк, жаккард',           'Коллекция',
   'linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 40%, #0d0d1a 100%)', 3, true)
on conflict do nothing;
