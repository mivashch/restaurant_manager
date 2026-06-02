create or replace function prevent_table_change_if_not_available()
returns trigger as $$
begin
  if old.status <> 'available' then
    raise exception 'Only available tables can be modified or deleted';
  end if;

  return old;
end;
$$ language plpgsql;

drop trigger if exists block_update_active_table on restaurant_tables;
drop trigger if exists block_delete_active_table on restaurant_tables;

create trigger block_update_active_table
before update on restaurant_tables
for each row
execute function prevent_table_change_if_not_available();

create trigger block_delete_active_table
before delete on restaurant_tables
for each row
execute function prevent_table_change_if_not_available();