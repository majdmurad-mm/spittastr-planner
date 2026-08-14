-- Spittastr planner — one-time database setup.
--
-- Paste this whole file into the Supabase SQL Editor and run it.
--
-- Access model, stated plainly: there are no user accounts. Anyone holding the
-- publishable key (which ships in the page, by design) can read or write any
-- room whose id they know. Room ids are 128-bit random UUIDs, so in practice
-- the room link IS the credential — treat it like a password and don't post it
-- publicly. RLS below scopes the anon role to this one table and nothing else.

create table if not exists public.layouts (
  room        uuid primary key,
  instances   jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Since 2026-05-30, new projects do NOT expose public tables to the Data API
-- automatically. Without these grants every request fails with a permission
-- error even though RLS looks correct.
grant select, insert, update on table public.layouts to anon;

-- Required whenever anon can reach the table.
alter table public.layouts enable row level security;

-- Policies are re-runnable.
drop policy if exists "rooms are readable"   on public.layouts;
drop policy if exists "rooms are creatable"  on public.layouts;
drop policy if exists "rooms are updatable"  on public.layouts;

-- Knowing the room id is the authorisation check; the predicate cannot verify
-- more than that without accounts.
create policy "rooms are readable"
  on public.layouts for select
  to anon
  using (true);

create policy "rooms are creatable"
  on public.layouts for insert
  to anon
  with check (true);

-- An UPDATE must also be able to SELECT the row, and needs both USING and
-- WITH CHECK — with only USING, the row's room could be reassigned.
create policy "rooms are updatable"
  on public.layouts for update
  to anon
  using (true)
  with check (true);

-- Housekeeping: keep updated_at honest even if a client forgets to set it.
create or replace function public.touch_layouts_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists layouts_touch_updated_at on public.layouts;
create trigger layouts_touch_updated_at
  before update on public.layouts
  for each row execute function public.touch_layouts_updated_at();
