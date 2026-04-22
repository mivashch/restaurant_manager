-- enable realtime for restaurant_tables
alter publication supabase_realtime add table restaurant_tables;

-- allow anon reads (waiters read table statuses without auth)
alter table restaurant_tables enable row level security;

create policy "anon can read tables"
  on restaurant_tables for select
  to anon using (true);

create policy "anon can update status"
  on restaurant_tables for update
  to anon using (true) with check (true);
