create or replace function prevent_table_change_with_active_orders()
returns trigger as $$
begin
  if exists (
    select 1
    from orders
    where table_id = old.id
      and status in ('new', 'preparing', 'ready')
  ) then
    raise exception 'Cannot modify or delete table with active orders';
  end if;

  return old;
end;
$$ language plpgsql;

drop trigger if exists block_update_active_table on restaurant_tables;
drop trigger if exists block_delete_active_table on restaurant_tables;

create trigger block_update_active_table
before update on restaurant_tables
for each row
execute function prevent_table_change_with_active_orders();

create trigger block_delete_active_table
before delete on restaurant_tables
for each row
execute function prevent_table_change_with_active_orders();