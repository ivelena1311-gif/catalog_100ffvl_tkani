-- Флаги «Хит» и «Новинка» на карточках тканей
alter table fabrics
  add column if not exists is_hit  boolean not null default false,
  add column if not exists is_new  boolean not null default false;
