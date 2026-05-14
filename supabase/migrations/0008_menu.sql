create table menu_items (
  id          serial primary key,
  name        varchar not null,
  category    varchar not null default 'Main',
  price       numeric(10, 2) not null default 0,
  description text not null default '',
  available   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamp not null default now()
);
