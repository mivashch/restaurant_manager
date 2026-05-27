-- Remove duplicate column added by mistake (original table already has is_available)
alter table menu_items drop column if exists available;
