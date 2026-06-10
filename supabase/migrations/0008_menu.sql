-- Amend the table created in 0001_initial.sql
alter table menu_items
  alter column category set not null,
  alter column category set default 'Main';
