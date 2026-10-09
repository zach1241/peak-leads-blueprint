begin;

-- Remember explicit occurrence deletions without exposing deleted work in the
-- Data API. A marker owns one period only, never an entire repeating series.
create table private.deleted_task_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  deliverable_definition_id uuid,
  source_task_id uuid,
  period_start date not null,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now(),
  constraint deleted_occurrence_anchor check (
    (project_id is not null and deliverable_definition_id is not null and source_task_id is null)
    or (project_id is null and deliverable_definition_id is null and source_task_id is not null)
  ),
  constraint deleted_occurrence_project_fkey foreign key (organization_id, project_id)
    references public.projects(organization_id, id) on delete cascade,
  constraint deleted_occurrence_deliverable_fkey foreign key (organization_id, deliverable_definition_id)
    references public.service_deliverables(organization_id, id) on delete cascade,
  constraint deleted_occurrence_source_fkey foreign key (organization_id, source_task_id)
    references public.tasks(organization_id, id) on delete cascade
);
create unique index deleted_service_occurrence_unique
  on private.deleted_task_occurrences(organization_id, project_id, deliverable_definition_id, period_start)
  where source_task_id is null;
create unique index deleted_manual_occurrence_unique
  on private.deleted_task_occurrences(organization_id, source_task_id, period_start)
  where source_task_id is not null;
create index deleted_occurrence_project_idx
  on private.deleted_task_occurrences(organization_id, project_id) where project_id is not null;
create index deleted_occurrence_deliverable_idx
  on private.deleted_task_occurrences(organization_id, deliverable_definition_id) where deliverable_definition_id is not null;
alter table private.deleted_task_occurrences enable row level security;
revoke all on private.deleted_task_occurrences from public, anon, authenticated;

-- A delete and a concurrent insertion of the same period serialize. Hash
-- collisions only serialize unrelated periods; they cannot change their keys.
create function private.lock_task_occurrence_key(
  p_organization_id uuid, p_project_id uuid, p_deliverable_id uuid, p_source_id uuid, p_period_start date
) returns void language plpgsql security invoker set search_path = '' as $$
declare occurrence_key text;
begin
  if p_period_start is null then return; end if;
  if p_deliverable_id is not null then
    occurrence_key = p_organization_id::text || '|service|' || p_project_id::text || '|' || p_deliverable_id::text || '|' || p_period_start::text;
  elsif p_source_id is not null then
    occurrence_key = p_organization_id::text || '|manual|' || p_source_id::text || '|' || p_period_start::text;
  else return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(occurrence_key, 0));
end $$;
create function private.lock_deleted_task_occurrence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (auth.uid() is null and pg_catalog.current_setting('role', true) in ('authenticated','anon'))
    or (auth.uid() is not null and not private.has_role(old.organization_id, array['owner','admin']::public.organization_role[])) then return old; end if;
  perform private.lock_task_occurrence_key(old.organization_id, old.project_id, old.deliverable_definition_id, old.recurrence_parent_id, old.period_start);
  return old;
end $$;

create function private.record_deleted_task_occurrence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.period_start is null then return old; end if;
  -- Anchor cleanup must not create fresh markers pointing at deleted parents.
  if not exists(select 1 from public.organizations o where o.id = old.organization_id) then return old; end if;
  if old.deliverable_definition_id is not null then
    if not exists(select 1 from public.projects p where p.organization_id = old.organization_id and p.id = old.project_id)
      or not exists(select 1 from public.service_deliverables d where d.organization_id = old.organization_id and d.id = old.deliverable_definition_id) then return old; end if;
    insert into private.deleted_task_occurrences(organization_id, project_id, deliverable_definition_id, period_start, deleted_by)
      values(old.organization_id, old.project_id, old.deliverable_definition_id, old.period_start, auth.uid())
      on conflict do nothing;
  elsif old.recurrence_parent_id is not null then
    if not exists(select 1 from public.tasks source where source.organization_id = old.organization_id and source.id = old.recurrence_parent_id) then return old; end if;
    insert into private.deleted_task_occurrences(organization_id, source_task_id, period_start, deleted_by)
      values(old.organization_id, old.recurrence_parent_id, old.period_start, auth.uid())
      on conflict do nothing;
  end if;
  return old;
end $$;

create function private.skip_deleted_task_occurrence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Do not let a hidden deletion marker bypass authorization or reveal whether
  -- another workspace has deleted a period. Existing guards/RLS reject the row.
  if (auth.uid() is null and pg_catalog.current_setting('role', true) in ('authenticated','anon'))
    or (auth.uid() is not null and not private.has_role(new.organization_id, array['owner','admin']::public.organization_role[])) then return new; end if;
  if new.period_start is null then return new; end if;
  perform private.lock_task_occurrence_key(new.organization_id, new.project_id, new.deliverable_definition_id, new.recurrence_parent_id, new.period_start);
  if new.deliverable_definition_id is not null and exists(
    select 1 from private.deleted_task_occurrences d
    where d.organization_id = new.organization_id and d.project_id = new.project_id
      and d.deliverable_definition_id = new.deliverable_definition_id
      and d.source_task_id is null and d.period_start = new.period_start
  ) then return null; end if;
  if new.recurrence_parent_id is not null and exists(
    select 1 from private.deleted_task_occurrences d
    where d.organization_id = new.organization_id and d.source_task_id = new.recurrence_parent_id
      and d.period_start = new.period_start
  ) then return null; end if;
  return new;
end $$;
revoke all on function private.lock_task_occurrence_key(uuid, uuid, uuid, uuid, date), private.lock_deleted_task_occurrence(), private.record_deleted_task_occurrence(), private.skip_deleted_task_occurrence() from public, anon, authenticated;
create trigger lock_deleted_task_occurrence before delete on public.tasks
  for each row execute function private.lock_deleted_task_occurrence();
create trigger record_deleted_task_occurrence after delete on public.tasks
  for each row execute function private.record_deleted_task_occurrence();
-- Existing BEFORE guards populate/validate periods first; assignment inheritance
-- is AFTER INSERT and therefore never runs for a skipped deleted occurrence.
create trigger skip_deleted_task_occurrence before insert on public.tasks
  for each row execute function private.skip_deleted_task_occurrence();

commit;
