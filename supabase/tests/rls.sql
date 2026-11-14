-- Row level security checks. Runs in one transaction and rolls back, so it leaves nothing
-- behind. Any failed check raises an exception and aborts the run.
--
-- Run it with psql against a local or hosted project:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql

begin;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rls-b@example.invalid');

create temporary table results (name text primary key, ok boolean not null);
grant all on results to authenticated, anon;

create function pg_temp.check(name text, ok boolean) returns void
language plpgsql as $$
begin
  if ok is not true then raise exception 'RLS check failed: %', name; end if;
  insert into results values (name, true);
end;
$$;
grant execute on function pg_temp.check(text, boolean) to authenticated, anon;

create function pg_temp.act_as(user_id uuid) returns void
language plpgsql as $$
begin
  if user_id is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
end;
$$;

-- A creates a design, a version and a share link.
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
insert into public.designs (id, name, shell_id, schema_version, doc)
values ('00000000-0000-4000-8000-0000000000d1', 'A van', 'sprinter-144-high', 2, '{"name":"A van"}');
insert into public.design_versions (design_id, label, revision, doc)
values ('00000000-0000-4000-8000-0000000000d1', 'First', 1, '{"name":"A van"}');
-- The token is "a" repeated 43 times.
insert into public.share_links (design_id, token_hash)
values ('00000000-0000-4000-8000-0000000000d1',
        encode(sha256(convert_to(repeat('a', 43), 'UTF8')), 'hex'));
select pg_temp.check('owner sees own design', (select count(*) = 1 from public.designs));
select pg_temp.check('owner id defaults to the user',
  (select owner_id = '00000000-0000-4000-8000-00000000000a' from public.designs));

-- Saves must name the revision they are based on.
update public.designs set doc = '{"name":"A van 2"}', revision = 2
  where id = '00000000-0000-4000-8000-0000000000d1' and revision = 1;
select pg_temp.check('save bumps the revision', (select revision = 2 from public.designs));
update public.designs set doc = '{"name":"stale"}', revision = 2
  where id = '00000000-0000-4000-8000-0000000000d1' and revision = 1;
select pg_temp.check('a stale save changes nothing',
  (select doc->>'name' = 'A van 2' from public.designs));
do $$
begin
  update public.designs set revision = 7 where id = '00000000-0000-4000-8000-0000000000d1';
  raise exception 'skipping revisions was allowed';
exception when serialization_failure then
  perform pg_temp.check('revisions move one step at a time', true);
end;
$$;
do $$
begin
  update public.designs set owner_id = '00000000-0000-4000-8000-00000000000b', revision = 3;
  raise exception 'changing the owner was allowed';
exception when insufficient_privilege then
  perform pg_temp.check('the owner cannot be changed', true);
end;
$$;

-- B sees none of it and cannot touch it.
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
select pg_temp.check('other user sees no designs', (select count(*) = 0 from public.designs));
select pg_temp.check('other user sees no versions',
  (select count(*) = 0 from public.design_versions));
select pg_temp.check('other user sees no links', (select count(*) = 0 from public.share_links));
update public.designs set name = 'stolen', revision = 3;
delete from public.designs;
reset role;
select pg_temp.check('other user changed nothing',
  (select name = 'A van' and revision = 2 from public.designs));
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
do $$
begin
  insert into public.design_versions (design_id, label, revision, doc)
  values ('00000000-0000-4000-8000-0000000000d1', 'sneaky', 1, '{}');
  raise exception 'snapshotting another user''s design was allowed';
exception when insufficient_privilege then
  perform pg_temp.check('other user cannot snapshot the design', true);
end;
$$;
do $$
begin
  insert into public.share_links (design_id, token_hash)
  values ('00000000-0000-4000-8000-0000000000d1', repeat('0', 64));
  raise exception 'sharing another user''s design was allowed';
exception when insufficient_privilege then
  perform pg_temp.check('other user cannot share the design', true);
end;
$$;
do $$
begin
  insert into public.designs (owner_id, name, shell_id, schema_version, doc)
  values ('00000000-0000-4000-8000-00000000000a', 'planted', 'x', 2, '{}');
  raise exception 'creating a design for someone else was allowed';
exception when insufficient_privilege then
  perform pg_temp.check('cannot create a design owned by someone else', true);
end;
$$;

-- Signed out: no table access at all, only the share function.
reset role;
select pg_temp.act_as(null);
do $$
begin
  perform 1 from public.designs;
  raise exception 'anon could read designs';
exception when insufficient_privilege then
  perform pg_temp.check('anon cannot read the table', true);
end;
$$;
select pg_temp.check('the share token opens the design',
  (select count(*) = 1 and min(name) = 'A van' from public.get_shared_design(repeat('a', 43))));
select pg_temp.check('a wrong token opens nothing',
  (select count(*) = 0 from public.get_shared_design(repeat('b', 43))));
select pg_temp.check('a short token opens nothing',
  (select count(*) = 0 from public.get_shared_design('a')));

-- A revokes the link; B cannot un-revoke it.
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
update public.share_links set revoked_at = null;
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
update public.share_links set revoked_at = now();
do $$
begin
  update public.share_links set token_hash = repeat('1', 64);
  raise exception 'changing a token hash was allowed';
exception when insufficient_privilege then
  perform pg_temp.check('the token hash cannot change', true);
end;
$$;
reset role;
select pg_temp.act_as(null);
select pg_temp.check('a revoked link opens nothing',
  (select count(*) = 0 from public.get_shared_design(repeat('a', 43))));

-- Soft-deleted designs are not shared either.
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
insert into public.share_links (design_id, token_hash)
values ('00000000-0000-4000-8000-0000000000d1',
        encode(sha256(convert_to(repeat('c', 43), 'UTF8')), 'hex'));
update public.designs set deleted_at = now(), revision = 3;
reset role;
select pg_temp.act_as(null);
select pg_temp.check('a deleted design is not shared',
  (select count(*) = 0 from public.get_shared_design(repeat('c', 43))));

reset role;
select count(*) as checks_passed from results;

rollback;
