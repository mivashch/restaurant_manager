-- Remove runner role and all users assigned to it
delete from users where role_id = (select role_id from roles where name = 'runner');
delete from roles where name = 'runner';
