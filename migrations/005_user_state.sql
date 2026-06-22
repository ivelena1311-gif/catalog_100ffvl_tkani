-- Синхронизация корзины, образцов и избранного между устройствами

create table if not exists user_state (
  tg_user_id  bigint       primary key,
  cart        jsonb        not null default '[]'::jsonb,
  samples     jsonb        not null default '[]'::jsonb,
  favorites   jsonb        not null default '[]'::jsonb,
  updated_at  timestamptz  not null default now()
);

alter table user_state enable row level security;
