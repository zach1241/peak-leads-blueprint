begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.organization_role as enum ('owner','admin','member');
create type public.client_status as enum ('active','inactive','archived');
create type public.project_status as enum ('planned','active','on_hold','completed','cancelled');
create type public.task_status as enum ('backlog','todo','in_progress','review','done','cancelled');
create type public.task_priority as enum ('low','medium','high','urgent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text check (avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id, organization_id);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  status public.client_status not null default 'active',
  primary_contact_name text check (char_length(primary_contact_name) <= 120),
  primary_contact_email text check (char_length(primary_contact_email) <= 254),
  website text check (website is null or (website ~ '^https?://' and char_length(website) <= 2048)),
  notes text check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, slug)
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text check (char_length(description) <= 10000),
  status public.project_status not null default 'planned',
  start_date date,
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,client_id) references public.clients(organization_id,id) on delete restrict,
  check (start_date is null or due_date is null or due_date >= start_date)
);
create index projects_client_idx on public.projects(organization_id,client_id);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  client_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text check (char_length(description) <= 20000),
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,project_id) references public.projects(organization_id,id) on delete restrict,
  foreign key (organization_id,client_id) references public.clients(organization_id,id) on delete restrict
);
create index tasks_org_due_idx on public.tasks(organization_id,due_date) where status not in ('done','cancelled');
create index tasks_org_status_priority_idx on public.tasks(organization_id,status,priority);
create index tasks_project_idx on public.tasks(organization_id,project_id);
create index tasks_client_idx on public.tasks(organization_id,client_id);
create table public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  user_id uuid not null,
  assigned_at timestamptz not null default now(),
  unique (task_id,user_id),
  foreign key (organization_id,task_id) references public.tasks(organization_id,id) on delete cascade,
  foreign key (organization_id,user_id) references public.organization_members(organization_id,user_id) on delete cascade
);
create index task_assignees_user_idx on public.task_assignees(organization_id,user_id,task_id);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,task_id) references public.tasks(organization_id,id) on delete cascade
);
create index comments_task_idx on public.comments(organization_id,task_id,created_at);
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null check (entity_type in ('task','client','project','comment')),
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_org_created_idx on public.activity_logs(organization_id,created_at desc);

-- Fixed search paths and narrowly scoped, caller-bound helpers avoid recursive RLS.
create function private.is_member(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members where organization_id=org and user_id=(select auth.uid()));
$$;
create function private.has_role(org uuid, roles public.organization_role[]) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members where organization_id=org and user_id=(select auth.uid()) and role=any(roles));
$$;
create function private.shares_workspace(person uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_members mine join public.organization_members theirs using (organization_id) where mine.user_id=(select auth.uid()) and theirs.user_id=person);
$$;
revoke all on function private.is_member(uuid), private.has_role(uuid,public.organization_role[]), private.shares_workspace(uuid) from public;
grant execute on function private.is_member(uuid), private.has_role(uuid,public.organization_role[]), private.shares_workspace(uuid) to authenticated;

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end;
$$;
create function private.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),120)) on conflict(id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();
insert into public.profiles(id,full_name) select id,left(coalesce(raw_user_meta_data->>'full_name',''),120) from auth.users on conflict(id) do nothing;

-- Even direct API calls cannot move records between tenants or forge audit identity.
create function private.guard_record() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id or new.created_at is distinct from old.created_at then
    raise exception 'Record identity is immutable' using errcode='42501';
  end if;
  if tg_table_name in ('tasks','projects') and (to_jsonb(new)->'created_by') is distinct from (to_jsonb(old)->'created_by') and auth.uid() is not null then
    raise exception 'Creator is immutable' using errcode='42501';
  end if;
  if tg_table_name='comments' and ((to_jsonb(new)->'task_id') is distinct from (to_jsonb(old)->'task_id') or ((to_jsonb(new)->'author_id') is distinct from (to_jsonb(old)->'author_id') and auth.uid() is not null)) then
    raise exception 'Comment identity is immutable' using errcode='42501';
  end if;
  return new;
end;
$$;
-- Owner rows can only be changed by owners, and the last owner cannot be removed.
-- A transaction-level organization lock serializes concurrent membership changes.
create function private.guard_membership() returns trigger language plpgsql security definer set search_path = '' as $$
declare org uuid; actor_role public.organization_role;
begin
  org=case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  perform 1 from public.organizations where id=org for update;
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.organization_id is distinct from old.organization_id or new.created_at is distinct from old.created_at) then
    raise exception 'Membership identity is immutable' using errcode='42501';
  end if;
  if auth.uid() is not null then
    select role into actor_role from public.organization_members where organization_id=org and user_id=auth.uid();
    if actor_role is null or actor_role not in ('owner','admin') then raise exception 'Administrator required' using errcode='42501'; end if;
    if ((tg_op<>'INSERT' and old.role='owner') or (tg_op<>'DELETE' and new.role='owner')) and actor_role<>'owner' then
      raise exception 'Only owners can manage owners' using errcode='42501';
    end if;
  end if;
  if tg_op<>'INSERT' and old.role='owner' and (tg_op='DELETE' or new.role<>'owner') and exists(select 1 from public.organizations where id=org) then
    if not exists(select 1 from public.organization_members where organization_id=org and role='owner' and id<>old.id) then
      raise exception 'An organization must retain an owner' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger guard_membership before insert or update or delete on public.organization_members for each row execute function private.guard_membership();

create function private.log_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare kind text; verb text; label text;
begin
  kind=case tg_table_name when 'tasks' then 'task' when 'clients' then 'client' when 'projects' then 'project' else 'comment' end;
  if tg_op='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return new; end if;
  verb=case when tg_op='INSERT' then 'created' else 'updated' end;
  if tg_table_name='tasks' and tg_op='UPDATE' and to_jsonb(new)->>'status'='done' and to_jsonb(old)->>'status'<>'done' then verb='completed'; end if;
  label=coalesce(to_jsonb(new)->>'title',to_jsonb(new)->>'name','Comment added');
  insert into public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,metadata)
    values(new.organization_id,auth.uid(),kind,new.id,verb,jsonb_build_object('label',left(label,240),'task_id',to_jsonb(new)->>'task_id'));
  return new;
end;
$$;
revoke all on function private.touch_updated_at(),private.create_profile(),private.guard_record(),private.guard_membership(),private.log_change() from public;

do $$ declare t text; begin
  foreach t in array array['profiles','organizations','clients','projects','tasks','comments'] loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
  end loop;
  foreach t in array array['clients','projects','tasks','comments'] loop
    execute format('create trigger guard_record before update on public.%I for each row execute function private.guard_record()',t);
    execute format('create trigger log_change after insert or update on public.%I for each row execute function private.log_change()',t);
  end loop;
  foreach t in array array['profiles','organizations','organization_members','clients','projects','tasks','task_assignees','comments','activity_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

grant update(full_name,avatar_url) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (id=(select auth.uid()) or private.shares_workspace(id));
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
grant update(name,slug) on public.organizations to authenticated;
create policy organizations_read on public.organizations for select to authenticated using(private.is_member(id));
create policy organizations_update on public.organizations for update to authenticated using(private.has_role(id,array['owner','admin']::public.organization_role[])) with check(private.has_role(id,array['owner','admin']::public.organization_role[]));
grant insert,delete on public.organization_members to authenticated;
grant update(role) on public.organization_members to authenticated;
create policy memberships_read on public.organization_members for select to authenticated using(private.is_member(organization_id));
create policy memberships_insert on public.organization_members for insert to authenticated with check(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy memberships_update on public.organization_members for update to authenticated using(private.has_role(organization_id,array['owner','admin']::public.organization_role[])) with check(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy memberships_delete on public.organization_members for delete to authenticated using(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));

-- Members collaborate on tasks/projects; clients are core data managed by admins.
grant insert,update,delete on public.clients,public.projects,public.tasks to authenticated;
create policy clients_read on public.clients for select to authenticated using(private.is_member(organization_id));
create policy clients_insert on public.clients for insert to authenticated with check(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy clients_update on public.clients for update to authenticated using(private.has_role(organization_id,array['owner','admin']::public.organization_role[])) with check(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy clients_delete on public.clients for delete to authenticated using(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
do $$ declare t text; begin
  foreach t in array array['projects','tasks'] loop
    execute format('create policy work_read on public.%I for select to authenticated using(private.is_member(organization_id))',t);
    execute format('create policy work_insert on public.%I for insert to authenticated with check(private.is_member(organization_id) and created_by=(select auth.uid()))',t);
    execute format('create policy work_update on public.%I for update to authenticated using(private.is_member(organization_id)) with check(private.is_member(organization_id))',t);
    execute format('create policy work_delete on public.%I for delete to authenticated using(private.has_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',t);
  end loop;
end $$;
grant insert,delete on public.task_assignees to authenticated;
create policy assignments_read on public.task_assignees for select to authenticated using(private.is_member(organization_id));
create policy assignments_insert on public.task_assignees for insert to authenticated with check(private.is_member(organization_id));
create policy assignments_delete on public.task_assignees for delete to authenticated using(private.is_member(organization_id));
grant insert on public.comments to authenticated;
grant update(body) on public.comments to authenticated;
grant delete on public.comments to authenticated;
create policy comments_read on public.comments for select to authenticated using(private.is_member(organization_id));
create policy comments_insert on public.comments for insert to authenticated with check(private.is_member(organization_id) and author_id=(select auth.uid()));
create policy comments_update on public.comments for update to authenticated using(private.is_member(organization_id) and author_id=(select auth.uid())) with check(private.is_member(organization_id) and author_id=(select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated using(private.is_member(organization_id) and (author_id=(select auth.uid()) or private.has_role(organization_id,array['owner','admin']::public.organization_role[])));
create policy activity_read on public.activity_logs for select to authenticated using(private.is_member(organization_id));
-- No client grants/policies for audit writes. Only the fixed trigger writes audit rows.

-- Atomic task + assignment save, SECURITY INVOKER: every statement still enforces RLS.
create function public.save_task(p_organization_id uuid,p_id uuid,p_title text,p_description text,p_status public.task_status,p_priority public.task_priority,p_due_date date,p_project_id uuid,p_client_id uuid,p_assignees uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or not private.is_member(p_organization_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
  if cardinality(p_assignees)>100 then raise exception 'Too many assignees' using errcode='22023'; end if;
  if p_id is null then
    insert into public.tasks(organization_id,title,description,status,priority,due_date,project_id,client_id,created_by)
    values(p_organization_id,p_title,p_description,p_status,p_priority,p_due_date,p_project_id,p_client_id,auth.uid()) returning id into result;
  else
    update public.tasks set title=p_title,description=p_description,status=p_status,priority=p_priority,due_date=p_due_date,project_id=p_project_id,client_id=p_client_id where id=p_id and organization_id=p_organization_id returning id into result;
    if result is null then raise exception 'Task not found' using errcode='42501'; end if;
  end if;
  delete from public.task_assignees where task_id=result and organization_id=p_organization_id and not(user_id=any(coalesce(p_assignees,'{}'::uuid[])));
  insert into public.task_assignees(organization_id,task_id,user_id) select p_organization_id,result,u from unnest(coalesce(p_assignees,'{}'::uuid[])) u on conflict(task_id,user_id) do nothing;
  return result;
end;
$$;
revoke all on function public.save_task(uuid,uuid,text,text,public.task_status,public.task_priority,date,uuid,uuid,uuid[]) from public,anon;
grant execute on function public.save_task(uuid,uuid,text,text,public.task_status,public.task_priority,date,uuid,uuid,uuid[]) to authenticated;

commit;
