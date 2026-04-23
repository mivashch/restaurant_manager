ALTER TABLE orders ADD COLUMN IF NOT EXISTS items text;
alter publication supabase_realtime add table orders;