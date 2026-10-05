-- Galla Shop Ledger: initial schema for Supabase (Postgres 15+).
-- Five tables: profiles, shops, categories, entries, goals.
-- Auth is Supabase Auth (auth.users). Every table has Row Level Security;
-- a signed-in user can reach only their own profile, shop and that shop's rows.

-- ---------------------------------------------------------------- profiles
-- One row per auth user. Email and password stay in auth.users.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------- shops
create table public.shops (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 80),
  shop_type  text,
  currency   text not null default '₹' check (length(currency) between 1 and 4),
  created_at timestamptz not null default now(),
  unique (owner_id)                       -- one shop per owner for now; drop to allow several
);

-- -------------------------------------------------------------- categories
-- Income and expense categories share one table, told apart by "kind".
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops (id) on delete cascade,
  kind       text not null check (kind in ('income', 'expense')),
  name       text not null check (length(btrim(name)) between 1 and 24),
  created_at timestamptz not null default now(),
  unique (id, shop_id, kind)              -- target for the entries foreign key below
);
create unique index categories_unique_name on public.categories (shop_id, kind, lower(name));

-- ----------------------------------------------------------------- entries
-- Every income or expense line. The composite foreign key guarantees an entry
-- can only use a category of the same shop and the same kind. Deleting a
-- category keeps its entries and clears their category ("Uncategorised").
create table public.entries (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  kind        text not null check (kind in ('income', 'expense')),
  category_id uuid,
  amount      numeric(12,2) not null check (amount > 0),
  note        text not null default '' check (length(note) <= 200),
  entry_date  date not null default current_date,
  created_at  timestamptz not null default now(),
  foreign key (category_id, shop_id, kind)
    references public.categories (id, shop_id, kind)
    on delete set null (category_id)
);
create index entries_shop_date on public.entries (shop_id, entry_date desc);

-- ------------------------------------------------------------------- goals
create table public.goals (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops (id) on delete cascade,
  name       text not null default '' check (length(name) <= 30),
  measure    text not null check (measure in ('income', 'net', 'expense')),
  period     text not null check (period in ('week', 'month')),
  target     numeric(12,2) not null check (target > 0),
  created_at timestamptz not null default now()
);
create index goals_shop on public.goals (shop_id);

-- ---------------------------------------------------------------- triggers
-- Create the profile when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Give every new shop the starter categories.
create function public.seed_shop_categories() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.categories (shop_id, kind, name)
  select new.id, 'income', n
    from unnest(array['Product Sales','Services','Online Orders','Other']) with ordinality as t(n, o) order by o;
  insert into public.categories (shop_id, kind, name)
  select new.id, 'expense', n
    from unnest(array['Stock','Rent','Utilities','Staff','Transport','Marketing','Repairs','Other']) with ordinality as t(n, o) order by o;
  return new;
end $$;

create trigger on_shop_created
  after insert on public.shops
  for each row execute function public.seed_shop_categories();

revoke execute on function public.handle_new_user()      from public, anon, authenticated;
revoke execute on function public.seed_shop_categories() from public, anon, authenticated;

-- ------------------------------------------------------ row level security
alter table public.profiles   enable row level security;
alter table public.shops      enable row level security;
alter table public.categories enable row level security;
alter table public.entries    enable row level security;
alter table public.goals      enable row level security;

-- Signed-out visitors get nothing; signed-in users get table access that the
-- policies below then narrow to their own rows.
revoke all on public.profiles, public.shops, public.categories, public.entries, public.goals from anon;
grant select, update                 on public.profiles   to authenticated;
grant select, insert, update, delete on public.shops      to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.entries    to authenticated;
grant select, insert, update, delete on public.goals      to authenticated;

create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own shop" on public.shops
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- The sub-select on shops is itself filtered by the "own shop" policy.
create policy "own shop categories" on public.categories
  for all to authenticated
  using (shop_id in (select id from public.shops where owner_id = (select auth.uid())))
  with check (shop_id in (select id from public.shops where owner_id = (select auth.uid())));

create policy "own shop entries" on public.entries
  for all to authenticated
  using (shop_id in (select id from public.shops where owner_id = (select auth.uid())))
  with check (shop_id in (select id from public.shops where owner_id = (select auth.uid())));

create policy "own shop goals" on public.goals
  for all to authenticated
  using (shop_id in (select id from public.shops where owner_id = (select auth.uid())))
  with check (shop_id in (select id from public.shops where owner_id = (select auth.uid())));
