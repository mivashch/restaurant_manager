-- The web app currently uses the anon key directly for waiter/kitchen/runner flows.
-- These policies allow the required read/insert/update operations on orders.
alter table public.orders enable row level security;

grant select, insert, update on table public.orders to anon;
grant select, insert, update on table public.orders to authenticated;

drop policy if exists "anon can read orders" on public.orders;
create policy "anon can read orders"
  on public.orders for select
  to anon
  using (true);

drop policy if exists "anon can insert orders" on public.orders;
create policy "anon can insert orders"
  on public.orders for insert
  to anon
  with check (true);

drop policy if exists "anon can update orders" on public.orders;
create policy "anon can update orders"
  on public.orders for update
  to anon
  using (true)
  with check (true);

drop policy if exists "authenticated can read orders" on public.orders;
create policy "authenticated can read orders"
  on public.orders for select
  to authenticated
  using (true);

drop policy if exists "authenticated can insert orders" on public.orders;
create policy "authenticated can insert orders"
  on public.orders for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated can update orders" on public.orders;
create policy "authenticated can update orders"
  on public.orders for update
  to authenticated
  using (true)
  with check (true);