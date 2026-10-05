-- Two shop owners, A and B. Each assertion raises if it fails; the script
-- prints "ALL TESTS PASSED" only if every one holds. Runs in a transaction
-- and rolls back, so it leaves no data behind.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.com', '{"full_name":"Asha"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.com', '{"full_name":"Bilal"}');

create schema t;
create function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok  %', label;
end $$;
-- Runs a statement and reports whether it was rejected.
create function t.rejected(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt; return false;
exception when others then return true;
end $$;
grant usage on schema t to authenticated, anon;

select t.ok((select count(*) = 2 from public.profiles), 'signup trigger creates a profile per user');
select t.ok((select full_name = 'Asha' from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'profile takes full_name from signup metadata');

-- ---------------------------------------------------------------- user A
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.shops (id, name) values ('a0000000-0000-0000-0000-000000000001', 'Asha General Store');
select t.ok((select owner_id = auth.uid() from public.shops), 'shop owner defaults to the signed-in user');
select t.ok((select count(*) = 4 from public.categories where kind = 'income'), 'new shop gets 4 income categories');
select t.ok((select count(*) = 8 from public.categories where kind = 'expense'), 'new shop gets 8 expense categories');
select t.ok(t.rejected($$insert into public.shops (name) values ('Second shop')$$), 'one shop per owner');

insert into public.entries (shop_id, kind, category_id, amount, note)
select shop_id, 'income', id, 4200, 'Counter sales' from public.categories where kind = 'income' and name = 'Product Sales';
insert into public.entries (shop_id, kind, category_id, amount)
select shop_id, 'expense', id, 1500 from public.categories where kind = 'expense' and name = 'Stock';
insert into public.goals (shop_id, measure, period, target)
values ('a0000000-0000-0000-0000-000000000001', 'income', 'month', 150000);

select t.ok(t.rejected($$insert into public.entries (shop_id, kind, amount) values ('a0000000-0000-0000-0000-000000000001', 'income', 0)$$), 'amount must be more than 0');
select t.ok(t.rejected($$insert into public.entries (shop_id, kind, category_id, amount)
  select shop_id, 'income', id, 10 from public.categories where kind = 'expense' limit 1$$), 'income entry cannot use an expense category');
select t.ok(t.rejected($$insert into public.categories (shop_id, kind, name) values ('a0000000-0000-0000-0000-000000000001', 'expense', 'stock')$$), 'duplicate category name rejected (case-insensitive)');
select t.ok(t.rejected($$insert into public.goals (shop_id, measure, period, target) values ('a0000000-0000-0000-0000-000000000001', 'profit', 'year', 5)$$), 'goal measure and period are restricted');

select set_config('t.a_cat', id::text, true) from public.categories where name = 'Product Sales' \gset _
delete from public.categories where kind = 'expense' and name = 'Stock';
select t.ok((select count(*) = 1 and bool_and(category_id is null) from public.entries where kind = 'expense'), 'deleting a category keeps its entries, uncategorised');

-- ---------------------------------------------------------------- user B
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select t.ok((select count(*) = 1 and bool_and(full_name = 'Bilal') from public.profiles), 'B sees only their own profile');
select t.ok((select count(*) = 0 from public.shops), 'B cannot see A''s shop');
select t.ok((select count(*) = 0 from public.categories), 'B cannot see A''s categories');
select t.ok((select count(*) = 0 from public.entries), 'B cannot see A''s entries');
select t.ok((select count(*) = 0 from public.goals), 'B cannot see A''s goals');

select t.ok(t.rejected($$insert into public.entries (shop_id, kind, amount) values ('a0000000-0000-0000-0000-000000000001', 'income', 99)$$), 'B cannot add an entry to A''s shop');
select t.ok(t.rejected($$insert into public.categories (shop_id, kind, name) values ('a0000000-0000-0000-0000-000000000001', 'income', 'Hack')$$), 'B cannot add a category to A''s shop');
select t.ok(t.rejected($$insert into public.goals (shop_id, measure, period, target) values ('a0000000-0000-0000-0000-000000000001', 'net', 'week', 1)$$), 'B cannot add a goal to A''s shop');
select t.ok(t.rejected($$insert into public.shops (owner_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fake')$$), 'B cannot create a shop owned by A');

update public.entries set amount = 1;
update public.shops set name = 'Taken over';
update public.profiles set full_name = 'Changed' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
delete from public.entries; delete from public.goals; delete from public.categories; delete from public.shops;

insert into public.shops (id, name) values ('b0000000-0000-0000-0000-000000000001', 'Bilal Mobile Point');
select t.ok(t.rejected($$insert into public.entries (shop_id, kind, category_id, amount)
  values ('b0000000-0000-0000-0000-000000000001', 'income', current_setting('t.a_cat')::uuid, 5)$$),
  'B cannot file an entry under A''s category');
select t.ok((select count(*) = 12 from public.categories), 'B sees exactly their own 12 categories');
select t.ok(t.rejected($$update public.shops set owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$), 'B cannot hand their shop to another user');

-- ------------------------------------------------- back to A: untouched?
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select t.ok((select name = 'Asha General Store' from public.shops), 'A''s shop survived B''s update and delete');
select t.ok((select count(*) = 2 and sum(amount) = 5700 from public.entries), 'A''s entries survived B''s update and delete');
select t.ok((select count(*) = 1 from public.goals), 'A''s goal survived');
select t.ok((select count(*) = 11 from public.categories), 'A''s categories survived');
select t.ok((select full_name = 'Asha' from public.profiles), 'A''s profile survived');

-- ------------------------------------------------------------- signed out
set local role anon;
set local request.jwt.claim.sub = '';
select t.ok(t.rejected('select 1 from public.shops'), 'signed-out visitor cannot read shops');
select t.ok(t.rejected('select 1 from public.entries'), 'signed-out visitor cannot read entries');
select t.ok(t.rejected('select 1 from public.profiles'), 'signed-out visitor cannot read profiles');

-- ------------------------------------------------- account deletion cascade
reset role;
delete from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select t.ok((select count(*) = 0 from public.entries e join public.shops s on s.id = e.shop_id where s.owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  and (select count(*) = 1 from public.shops), 'deleting a user removes their shop and data, nobody else''s');

\echo ALL TESTS PASSED
rollback;
