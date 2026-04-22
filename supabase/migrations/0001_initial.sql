create table roles (
  role_id serial primary key,
  name    varchar not null unique
);

create table users (
  user_id       serial primary key,
  username      varchar not null unique,
  password_hash varchar not null,
  role_id       integer not null references roles(role_id)
);

create table restaurant_tables (
  table_id     serial primary key,
  table_number integer not null unique,
  status       varchar not null default 'available'
);

create table menu_items (
  menu_item_id serial primary key,
  name         varchar not null,
  price        decimal(10,2) not null,
  category     varchar,
  is_available boolean not null default true
);

create table orders (
  order_id   serial primary key,
  table_id   integer not null references restaurant_tables(table_id),
  waiter_id  integer not null references users(user_id),
  status     varchar not null default 'open',
  created_at timestamp not null default now()
);

create table order_items (
  order_item_id serial primary key,
  order_id      integer not null references orders(order_id),
  menu_item_id  integer not null references menu_items(menu_item_id),
  quantity      integer not null,
  unit_price    decimal(10,2) not null
);

-- seed roles
insert into roles (name) values ('admin'), ('waiter'), ('kitchen'), ('runner');

-- seed sample users (private IDs used as usernames)
insert into users (username, password_hash, role_id) values
  ('ADMIN-001',   '', (select role_id from roles where name = 'admin')),
  ('WAITER-001',  '', (select role_id from roles where name = 'waiter')),
  ('KITCHEN-001', '', (select role_id from roles where name = 'kitchen')),
  ('RUNNER-001',  '', (select role_id from roles where name = 'runner'));
