alter publication supabase_realtime add table menu_items;
alter table menu_items replica identity full;

alter table menu_items enable row level security;

create policy "anon can read menu"
  on menu_items for select
  to anon using (true);
