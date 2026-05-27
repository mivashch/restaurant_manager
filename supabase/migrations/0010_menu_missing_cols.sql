alter table menu_items
  add column if not exists available  boolean not null default true,
  add column if not exists sort_order integer not null default 0;
