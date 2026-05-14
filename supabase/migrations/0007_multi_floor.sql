alter table floor_plans
  add column if not exists floor_number integer not null default 1;
