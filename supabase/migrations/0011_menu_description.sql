alter table menu_items
  add column if not exists description text not null default '';
