-- Designs saved to an account, immutable version snapshots, and read-only share links.
--
-- Every table is owner-only under row level security. The one way to read someone else's
-- design is public.get_shared_design(token), which takes the secret token from a share link
-- and returns that design only while the link is not revoked. Tokens are never stored, only
-- their SHA-256 hash.

-- ---------------------------------------------------------------- designs

create table public.designs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  shell_id text not null check (char_length(shell_id) between 1 and 80),
  schema_version integer not null check (schema_version >= 1),
  doc jsonb not null check (octet_length(doc::text) <= 2000000),
  -- Optimistic concurrency: a save names the revision it is based on and bumps it by one.
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index designs_owner_recent on public.designs (owner_id, updated_at desc)
  where deleted_at is null;

-- Keeps revisions moving one step at a time and stamps every change, whatever the client sends.
create function public.designs_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id <> old.owner_id or new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'id, owner and creation time cannot change' using errcode = '42501';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'revision conflict: expected %, got %', old.revision + 1, new.revision
      using errcode = '40001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger designs_before_update
  before update on public.designs
  for each row execute function public.designs_before_update();

alter table public.designs enable row level security;

create policy "owners read their designs" on public.designs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners create designs" on public.designs
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners change their designs" on public.designs
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners delete their designs" on public.designs
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------- versions

create table public.design_versions (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  revision integer not null,
  doc jsonb not null check (octet_length(doc::text) <= 2000000),
  created_at timestamptz not null default now()
);

create index design_versions_design_recent on public.design_versions (design_id, created_at desc);
create index design_versions_owner on public.design_versions (owner_id);

alter table public.design_versions enable row level security;

create policy "owners read their versions" on public.design_versions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners snapshot their designs" on public.design_versions
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.designs d
      where d.id = design_id and d.owner_id = (select auth.uid())
    )
  );
create policy "owners delete their versions" on public.design_versions
  for delete to authenticated using (owner_id = (select auth.uid()));
-- No update policy: a version never changes once written.

-- ---------------------------------------------------------------- share links

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index share_links_design on public.share_links (design_id);
create index share_links_owner on public.share_links (owner_id);

alter table public.share_links enable row level security;

create policy "owners read their links" on public.share_links
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners share their designs" on public.share_links
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.designs d
      where d.id = design_id and d.owner_id = (select auth.uid())
    )
  );
create policy "owners revoke their links" on public.share_links
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------- privileges

-- Signed-out visitors get nothing from the tables; they only read through the function below.
revoke all on public.designs, public.design_versions, public.share_links from anon;
revoke all on public.designs, public.design_versions, public.share_links from authenticated;
grant select, insert, delete on public.designs to authenticated;
grant update (name, shell_id, schema_version, doc, revision, deleted_at) on public.designs
  to authenticated;
grant select, insert, delete on public.design_versions to authenticated;
grant select, insert on public.share_links to authenticated;
grant update (revoked_at) on public.share_links to authenticated;

-- ---------------------------------------------------------------- reading a shared design

create function public.get_shared_design(token text)
returns table (name text, shell_id text, doc jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.name, d.shell_id, d.doc, d.updated_at
  from public.share_links s
  join public.designs d on d.id = s.design_id
  where char_length(token) between 32 and 128
    and s.token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
    and s.revoked_at is null
    and d.deleted_at is null;
$$;

revoke all on function public.get_shared_design(text) from public;
grant execute on function public.get_shared_design(text) to anon, authenticated;
revoke all on function public.designs_before_update() from public, anon, authenticated;
