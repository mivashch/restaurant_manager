-- Track when a table session started (set on occupation, cleared on release)
alter table restaurant_tables
  add column if not exists occupied_at timestamptz;
