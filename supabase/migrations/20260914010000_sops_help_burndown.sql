begin;
create table public.sops (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null check(char_length(trim(title)) between 1 and 160),
 description text not null default '' check(char_length(description)<=2000),
 resource_url text not null check(char_length(resource_url)<=2048 and (resource_url ~ '^https?://' or resource_url ~ '^/[^/]')),
 resource_type text not null check(resource_type in ('loom','youtube','document','other')),
 image_path text,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(image_path is null or (image_path like organization_id::text || '/sops/%' and image_path ~ '^[0-9a-f-]{36}/sops/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'))
);
create table public.help_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 title text not null check(char_length(trim(title)) between 1 and 160),
 description text not null check(char_length(trim(description)) between 1 and 10000),
 image_path text,
 requester_id uuid not null references public.profiles(id),
 status text not null default 'open' check(status in ('open','in_progress','resolved')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(image_path is null or (image_path like organization_id::text || '/help/%' and image_path ~ '^[0-9a-f-]{36}/help/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'))
);
create index sops_workspace_idx on public.sops(organization_id,created_at desc);
create index help_requests_workspace_status_idx on public.help_requests(organization_id,status,created_at desc);
alter table public.sops enable row level security;
alter table public.help_requests enable row level security;
revoke all on public.sops,public.help_requests from anon,authenticated;
grant select,insert,delete on public.sops,public.help_requests to authenticated;
grant update(title,description,resource_url,resource_type,image_path) on public.sops to authenticated;
grant update(title,description,image_path,status) on public.help_requests to authenticated;
create policy sops_read on public.sops for select to authenticated using(private.is_member(organization_id));
create policy sops_create on public.sops for insert to authenticated with check(private.has_role(organization_id,array['owner','admin']::public.organization_role[]) and created_by=auth.uid());
create policy sops_edit on public.sops for update to authenticated using(private.has_role(organization_id,array['owner','admin']::public.organization_role[])) with check(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy sops_delete on public.sops for delete to authenticated using(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
create policy help_read on public.help_requests for select to authenticated using(private.is_member(organization_id));
create policy help_create on public.help_requests for insert to authenticated with check(private.is_member(organization_id) and requester_id=auth.uid() and status='open');
create policy help_edit on public.help_requests for update to authenticated
 using(private.has_role(organization_id,array['owner','admin']::public.organization_role[]) or (private.is_member(organization_id) and requester_id=auth.uid() and status='open'))
 with check(private.has_role(organization_id,array['owner','admin']::public.organization_role[]) or (private.is_member(organization_id) and requester_id=auth.uid() and status='open'));
create policy help_delete on public.help_requests for delete to authenticated using(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
create trigger sops_updated before update on public.sops for each row execute function private.touch_updated_at();
create trigger help_updated before update on public.help_requests for each row execute function private.touch_updated_at();

-- New image paths must be owned by the caller; retaining an existing attachment is allowed.
create function private.guard_resource_image() returns trigger language plpgsql set search_path='' as $$
declare kind text;
begin
 kind=case tg_table_name when 'sops' then 'sops' else 'help' end;
 if tg_op='UPDATE' and new.image_path is not distinct from old.image_path then return new; end if;
 if new.image_path is not null and new.image_path not like new.organization_id::text || '/' || kind || '/' || auth.uid()::text || '/%' then
  raise exception 'Upload attachments to your own workspace folder' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function private.guard_resource_image() from public;
create trigger sops_image before insert or update on public.sops for each row execute function private.guard_resource_image();
create trigger help_image before insert or update on public.help_requests for each row execute function private.guard_resource_image();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('workspace-images','workspace-images',false,5242880,array['image/png','image/jpeg','image/webp']);
-- Parse paths defensively so malformed input never reaches a UUID cast.
create function private.resource_image_access(path text, writing boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare org uuid; kind text; person uuid;
begin
 if path !~ '^[0-9a-f-]{36}/(sops|help)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$' then return false; end if;
 begin org=split_part(path,'/',1)::uuid; person=split_part(path,'/',3)::uuid;
 exception when invalid_text_representation then return false; end;
 kind=split_part(path,'/',2);
 if not private.is_member(org) then return false; end if;
 if not writing then return true; end if;
 return person=auth.uid() and (kind='help' or private.has_role(org,array['owner','admin']::public.organization_role[]));
end $$;
revoke all on function private.resource_image_access(text,boolean) from public;
grant execute on function private.resource_image_access(text,boolean) to authenticated;
create policy resource_images_read on storage.objects for select to authenticated using(bucket_id='workspace-images' and private.resource_image_access(name,false));
create policy resource_images_insert on storage.objects for insert to authenticated with check(bucket_id='workspace-images' and private.resource_image_access(name,true));
-- Attachments are immutable. Replacement uploads use a new unique path.
-- Retain detached images rather than letting a member break a resolved request's attachment.

-- Existing logs record Done but not reopen transitions. Record a truthful starting
-- snapshot and subsequent transitions in that same audit source, never backdated.
insert into public.activity_logs(organization_id,entity_type,entity_id,action,metadata,created_at)
select organization_id,'task',id,'burndown_baseline',jsonb_build_object('label',title,'status',status),clock_timestamp() from public.tasks;
create function private.record_task_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,metadata,created_at)
  values(new.organization_id,auth.uid(),'task',new.id,'status_changed',jsonb_build_object('label',new.title,'status',new.status),clock_timestamp());
 elsif new.status is distinct from old.status then
  insert into public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,metadata,created_at)
  values(new.organization_id,auth.uid(),'task',new.id,'status_changed',jsonb_build_object('label',new.title,'status',new.status,'previous_status',old.status),clock_timestamp());
 end if;
 return new;
end $$;
revoke all on function private.record_task_status() from public;
create trigger record_task_status after insert or update of status on public.tasks for each row execute function private.record_task_status();
commit;
