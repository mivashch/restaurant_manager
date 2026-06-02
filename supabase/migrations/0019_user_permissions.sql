create table if not exists user_permissions (
  user_id integer not null references users(user_id) on delete cascade,
  role_id integer not null references roles(role_id) on delete cascade,
  primary key (user_id, role_id)
);

-- seed from existing role_id
insert into user_permissions (user_id, role_id)
select user_id, role_id from users
on conflict do nothing;
