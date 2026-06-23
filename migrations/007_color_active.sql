-- Флаг активности для цвета ткани.
-- false = цвет скрыт в каталоге (например, цвет закончился).
-- Существующие цвета помечаются активными по умолчанию.

alter table fabric_colors
  add column if not exists is_active boolean not null default true;
