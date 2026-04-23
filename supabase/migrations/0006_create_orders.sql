CREATE TABLE orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_number integer NOT NULL,
  items text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on Realtime for the orders table
alter publication supabase_realtime add table orders;