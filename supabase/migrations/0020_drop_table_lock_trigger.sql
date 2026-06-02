drop trigger if exists block_update_active_table on restaurant_tables;
drop trigger if exists block_delete_active_table on restaurant_tables;
drop function if exists prevent_table_change_if_not_available();
