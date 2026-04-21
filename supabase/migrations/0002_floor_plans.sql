create table floor_plans (
  id         serial primary key,
  name       varchar not null default 'Main Floor',
  data       jsonb   not null default '{"rooms":[],"tables":[]}',
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);
