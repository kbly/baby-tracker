-- Baby Tracker: Datenbank für den gemeinsamen Abgleich
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und "Run" drücken.

-- Eine "Familie" teilt sich ein Baby und alle Einträge.
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  baby jsonb not null default '{}'::jsonb,
  meds jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists public.entries (
  id text primary key,
  family_id uuid not null references public.families on delete cascade,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists entries_family_updated on public.entries (family_id, updated_at);

-- updated_at bei jeder Änderung automatisch setzen
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before insert or update on public.entries
  for each row execute function public.touch_updated_at();
drop trigger if exists families_touch on public.families;
create trigger families_touch before update on public.families
  for each row execute function public.touch_updated_at();

-- Hilfsfunktion: Ist der angemeldete Nutzer Mitglied der Familie?
create or replace function public.is_member(f uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from family_members where family_id = f and user_id = auth.uid())
$$;

-- Zugriffsregeln: Jeder sieht und ändert nur die Daten seiner eigenen Familie.
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.entries enable row level security;

drop policy if exists families_select on public.families;
create policy families_select on public.families for select to authenticated using (public.is_member(id));
drop policy if exists families_update on public.families;
create policy families_update on public.families for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists members_select on public.family_members;
create policy members_select on public.family_members for select to authenticated
  using (user_id = auth.uid() or public.is_member(family_id));

drop policy if exists entries_all on public.entries;
create policy entries_all on public.entries for all to authenticated
  using (public.is_member(family_id)) with check (public.is_member(family_id));

-- Neue Familie anlegen (der Ersteller wird automatisch Mitglied)
create or replace function public.create_family() returns public.families
language plpgsql security definer set search_path = public as $$
declare f families;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into families default values returning * into f;
  insert into family_members (family_id, user_id) values (f.id, auth.uid());
  return f;
end $$;

-- Mit Einladungscode einer Familie beitreten
create or replace function public.join_family(code text) returns public.families
language plpgsql security definer set search_path = public as $$
declare f families;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into f from families where invite_code = upper(trim(code));
  if f.id is null then raise exception 'invalid invite code'; end if;
  insert into family_members (family_id, user_id) values (f.id, auth.uid())
    on conflict do nothing;
  return f;
end $$;

revoke all on function public.create_family() from public, anon;
revoke all on function public.join_family(text) from public, anon;
grant execute on function public.create_family() to authenticated;
grant execute on function public.join_family(text) to authenticated;

-- Echtzeit-Updates aktivieren
do $$ begin
  alter publication supabase_realtime add table public.entries;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.families;
exception when duplicate_object then null; end $$;
