-- anon users only need to read table statuses for realtime; updates go through the service-role API
drop policy if exists "anon can update status" on restaurant_tables;
