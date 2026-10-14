-- Portable BEGIN/DO/ROLLBACK checks. No test extensions, tables, or functions are
-- created. Every inserted user/workspace and every tested write is rolled back.
-- Run as postgres after guard_workspace_integrity has been installed.
begin;
do $$
declare
  owner_id uuid = gen_random_uuid();
  admin_id uuid = gen_random_uuid();
  member_id uuid = gen_random_uuid();
  outsider_id uuid = gen_random_uuid();
  org_id uuid = gen_random_uuid();
  other_org_id uuid = gen_random_uuid();
  primary_client uuid = gen_random_uuid();
  second_client_id uuid = gen_random_uuid();
  insertion_client uuid = gen_random_uuid();
  standard_id uuid = gen_random_uuid();
  dominate_id uuid = gen_random_uuid();
  care_id uuid = gen_random_uuid();
  standard_project uuid = gen_random_uuid();
  dominate_project uuid = gen_random_uuid();
  care_project uuid = gen_random_uuid();
  used_definition uuid = gen_random_uuid();
  deleted_definition uuid = gen_random_uuid();
  unused_definition uuid = gen_random_uuid();
  delivery_task uuid;
  marker_task uuid;
  unassigned_task uuid = gen_random_uuid();
  foreign_task uuid = gen_random_uuid();
  help_id uuid = gen_random_uuid();
  deletable_help_id uuid = gen_random_uuid();
  owner_help_id uuid = gen_random_uuid();
  before_task jsonb;
  before_marker jsonb;
  stamp timestamptz;
  actual_state text;
  actual_constraint text;
  affected integer;
  generated integer;
  result boolean;
  checks text[] = '{}';
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_id, 'integrity-owner-' || owner_id || '@example.test', '{}'),
    (admin_id, 'integrity-admin-' || admin_id || '@example.test', '{}'),
    (member_id, 'integrity-member-' || member_id || '@example.test', '{}'),
    (outsider_id, 'integrity-outsider-' || outsider_id || '@example.test', '{}');
  insert into public.organizations(id, name, slug) values
    (org_id, 'Workspace integrity test', 'integrity-' || org_id),
    (other_org_id, 'Workspace integrity outsider', 'integrity-' || other_org_id);
  insert into public.organization_members(organization_id, user_id, role) values
    (org_id, owner_id, 'owner'), (org_id, admin_id, 'admin'), (org_id, member_id, 'member'),
    (other_org_id, outsider_id, 'owner');
  insert into public.tasks(id, organization_id, title, created_by)
    values(foreign_task, other_org_id, 'Foreign task', outsider_id);
  insert into public.help_requests(id, organization_id, title, description, requester_id) values
    (help_id, org_id, 'Member request', 'Original member content', member_id),
    (deletable_help_id, org_id, 'Member request to delete', 'Temporary fixture', member_id),
    (owner_help_id, org_id, 'Owner request', 'Temporary fixture', owner_id);

  -- Switch roles inside the anonymous invoker block; RESET ROLE restores the
  -- original postgres session for fixture setup/inspection without leaking state.
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  insert into public.clients(id, organization_id, name, slug) values
    (primary_client, org_id, 'Integrity client', 'integrity-client'),
    (second_client_id, org_id, 'Integrity second client', 'integrity-second-client'),
    (insertion_client, org_id, 'Integrity insertion client', 'integrity-insertion-client');
  insert into public.service_templates(id, organization_id, code, name) values
    (standard_id, org_id, 'standard-seo', 'Renamed Standard Package'),
    (dominate_id, org_id, 'dominate-seo', 'Renamed Dominate Package'),
    (care_id, org_id, 'care', 'Website Care');
  insert into public.service_deliverables(id, organization_id, service_template_id, code, name, cadence, target_min, target_max, unit, active) values
    (used_definition, org_id, standard_id, 'monthly-work', 'Monthly work', 'monthly', 2, 3, 'pages', true),
    (deleted_definition, org_id, standard_id, 'deleted-work', 'Deleted monthly work', 'monthly', 1, 1, 'report', true),
    (unused_definition, org_id, standard_id, 'unused-work', 'Unused work', 'monthly', 1, 1, 'report', false);
  insert into public.projects(id, organization_id, client_id, service_template_id, name, status, created_by) values
    (standard_project, org_id, primary_client, standard_id, 'Renamed Standard Project', 'active', owner_id),
    (dominate_project, org_id, primary_client, dominate_id, 'Renamed Dominate Project', 'on_hold', owner_id),
    (care_project, org_id, primary_client, care_id, 'Care Project', 'active', owner_id);
  if (select count(*) from public.projects p where p.client_id = primary_client and p.organization_id = org_id and p.status = 'active') <> 2 then
    raise exception 'FAIL: unrelated service remains active with an SEO package';
  end if;
  checks = array_append(checks, 'unrelated services may coexist with SEO');

  update public.projects set exclusive_service_group = null where id = standard_project;
  update public.projects set exclusive_service_group = 'seo' where id = care_project;
  if (select exclusive_service_group from public.projects where id = standard_project) is distinct from 'seo'
    or (select exclusive_service_group from public.projects where id = care_project) is not null then
    raise exception 'FAIL: submitted exclusive groups must be recomputed from canonical package identity';
  end if;
  checks = array_append(checks, 'direct writes cannot forge the exclusive service group');

  actual_state = null;
  begin
    update public.projects set status = 'active' where id = dominate_project;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate, actual_constraint = constraint_name;
  end;
  if actual_state is distinct from '23505' or actual_constraint is distinct from 'one_active_seo_package'
    or (select status from public.projects where id = dominate_project) <> 'on_hold' then
    raise exception 'FAIL: activation of renamed conflicting SEO package must fail atomically';
  end if;
  checks = array_append(checks, 'direct activation rejects renamed SEO conflict');

  insert into public.projects(organization_id, client_id, service_template_id, name, status, created_by)
    values(org_id, insertion_client, standard_id, 'Insertion Standard package', 'active', owner_id);
  actual_state = null;
  begin
    insert into public.projects(organization_id, client_id, service_template_id, name, status, created_by, exclusive_service_group)
      values(org_id, insertion_client, dominate_id, 'Conflicting SEO insertion', 'active', owner_id, null);
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate, actual_constraint = constraint_name;
  end;
  if actual_state is distinct from '23505' or actual_constraint is distinct from 'one_active_seo_package' then
    raise exception 'FAIL: direct conflicting insert with a forged group must fail';
  end if;
  checks = array_append(checks, 'direct insert rejects SEO conflict');

  -- The existing public connect RPC is also subject to the project trigger.
  perform public.connect_client_service(org_id, second_client_id, standard_id, '{}'::uuid[]);
  perform public.connect_client_service(org_id, second_client_id, standard_id, '{}'::uuid[]);
  if (select count(*) from public.projects p where p.client_id = second_client_id and p.service_template_id = standard_id) <> 1
    or (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where p.client_id = second_client_id) <> 2 then
    raise exception 'FAIL: reconnecting the same active package must remain idempotent';
  end if;
  checks = array_append(checks, 'same-package reconnect remains idempotent');
  actual_state = null;
  begin
    perform public.connect_client_service(org_id, second_client_id, dominate_id, '{}'::uuid[]);
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '23505' or exists(
    select 1 from public.projects p where p.client_id = second_client_id and p.service_template_id = dominate_id
  ) then raise exception 'FAIL: connect RPC must not persist a conflicting package'; end if;
  checks = array_append(checks, 'legacy connect RPC rejects conflicting package without partial writes');

  actual_state = null;
  begin
    update public.service_templates set code = 'renamed-seo' where id = standard_id;
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '42501' then raise exception 'FAIL: canonical package code must be immutable'; end if;
  update public.service_templates set name = 'Another Standard Display Name' where id = standard_id;
  checks = array_append(checks, 'package names remain editable while canonical codes remain fixed');

  update public.projects set status = 'on_hold' where id = standard_project;
  update public.projects set status = 'active' where id = dominate_project;
  if (select status from public.projects where id = dominate_project) <> 'active' then raise exception 'FAIL: SEO switch after pause must succeed'; end if;
  update public.projects set status = 'on_hold' where id = dominate_project;
  update public.projects set status = 'active' where id = standard_project;
  checks = array_append(checks, 'pausing one SEO package allows activating the other');

  -- An unused cadence may change, while used snapshots and deletion markers
  -- block a change that would relabel history or generate overlapping quotas.
  update public.service_deliverables set cadence = 'weekly' where id = unused_definition;
  if (select cadence from public.service_deliverables where id = unused_definition) <> 'weekly' then raise exception 'FAIL: unused cadence remains editable'; end if;
  checks = array_append(checks, 'unused deliverable cadence remains editable');
  generated = public.generate_service_deliverables(org_id, standard_project);
  if generated <> 2 then raise exception 'FAIL: expected two initial current occurrences, got %', generated; end if;
  select id, updated_at, to_jsonb(t) into delivery_task, stamp, before_task from public.tasks t
    where t.project_id = standard_project and t.deliverable_definition_id = used_definition;
  select id into marker_task from public.tasks t
    where t.project_id = standard_project and t.deliverable_definition_id = deleted_definition;
  actual_state = null;
  begin
    update public.service_deliverables set cadence = 'weekly' where id = used_definition;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate, actual_constraint = constraint_name;
  end;
  if actual_state is distinct from '23514' or actual_constraint is distinct from 'deliverable_cadence_history'
    or (select cadence from public.service_deliverables where id = used_definition) <> 'monthly'
    or (select to_jsonb(t) from public.tasks t where t.id = delivery_task) is distinct from before_task then
    raise exception 'FAIL: used cadence must be rejected without rewriting the occurrence';
  end if;
  if public.generate_service_deliverables(org_id, standard_project) <> 0 then raise exception 'FAIL: cadence rejection must leave generator idempotent'; end if;
  checks = array_append(checks, 'used cadence is rejected with unchanged occurrence and no extra quotas');

  update public.service_deliverables set target_min = 4, target_max = 5, instructions = 'Updated future instructions' where id = used_definition;
  if (select to_jsonb(t) from public.tasks t where t.id = delivery_task) is distinct from before_task then
    raise exception 'FAIL: changing future targets must preserve existing task snapshots';
  end if;
  checks = array_append(checks, 'future quantity and instruction edits preserve current targets');

  delete from public.tasks where id = marker_task;
  -- Keep only this fixture's deletion marker so the cadence guard is tested with
  -- no remaining tasks for its definition, using the hidden-marker branch.
  delete from public.tasks where organization_id = org_id and deliverable_definition_id = deleted_definition;
  execute 'reset role';
  select to_jsonb(d) into before_marker from private.deleted_task_occurrences d
    where d.organization_id = org_id and d.project_id = standard_project and d.deliverable_definition_id = deleted_definition;
  if before_marker is null then raise exception 'FAIL: fixture deletion marker must exist'; end if;
  execute 'set local role authenticated';
  actual_state = null;
  begin
    update public.service_deliverables set cadence = 'weekly' where id = deleted_definition;
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '23514' then raise exception 'FAIL: deleted occurrence history must lock cadence'; end if;
  if public.generate_service_deliverables(org_id, standard_project) <> 0 then raise exception 'FAIL: explicitly deleted occurrence must stay deleted'; end if;
  execute 'reset role';
  if (select to_jsonb(d) from private.deleted_task_occurrences d
    where d.organization_id = org_id and d.project_id = standard_project and d.deliverable_definition_id = deleted_definition) is distinct from before_marker then
    raise exception 'FAIL: failed cadence edit must preserve deletion marker';
  end if;
  checks = array_append(checks, 'deleted occurrence markers lock cadence and remain intact');
  execute 'set local role authenticated';

  insert into public.tasks(id, organization_id, title, created_by) values
    (unassigned_task, org_id, 'Unassigned member-status fixture', owner_id);
  insert into public.task_assignees(organization_id, task_id, user_id) values(org_id, delivery_task, member_id);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  update public.help_requests set status = 'resolved' where id = help_id;
  if (select status from public.help_requests where id = help_id) <> 'resolved' then raise exception 'FAIL: admin status update must remain available'; end if;
  checks = array_append(checks, 'admins can manage help-request status');

  perform set_config('request.jwt.claim.sub', member_id::text, true);
  update public.help_requests set title = 'Edited resolved request', description = 'Member edits remain available' where id = help_id;
  if (select title from public.help_requests where id = help_id) <> 'Edited resolved request' then raise exception 'FAIL: member must retain own content editing after resolution'; end if;
  checks = array_append(checks, 'members may edit their own resolved request content');
  actual_state = null;
  begin
    update public.help_requests set status = 'open' where id = help_id;
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '42501' or (select status from public.help_requests where id = help_id) <> 'resolved' then
    raise exception 'FAIL: member Data API status update must fail';
  end if;
  checks = array_append(checks, 'members cannot change their own help-request status through direct writes');
  update public.help_requests set title = 'Forged owner request' where id = owner_help_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: member cannot edit another requester content'; end if;
  delete from public.help_requests where id = owner_help_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: member cannot delete another requester help request'; end if;
  delete from public.help_requests where id = deletable_help_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: member own help deletion must remain available'; end if;
  checks = array_append(checks, 'own help deletion remains available while other requests stay protected');

  update public.tasks set status = 'in_progress' where id = delivery_task;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: members must not regain direct task UPDATE privileges'; end if;
  checks = array_append(checks, 'assigned members cannot perform direct task updates');

  select updated_at, to_jsonb(t) into stamp, before_task from public.tasks t where t.id = delivery_task;
  result = public.change_task_status_for_member(org_id, delivery_task, null, 'in_progress', null);
  if result or (select to_jsonb(t) from public.tasks t where t.id = delivery_task) is distinct from before_task then
    raise exception 'FAIL: NULL expected timestamp must reject without any task mutation';
  end if;
  result = public.change_task_status_for_member(org_id, delivery_task, stamp - interval '1 microsecond', 'in_progress', null);
  if result or (select to_jsonb(t) from public.tasks t where t.id = delivery_task) is distinct from before_task then
    raise exception 'FAIL: stale expected timestamp must reject without any task mutation';
  end if;
  checks = array_append(checks, 'NULL and stale timestamps return false and preserve every task field');
  result = public.change_task_status_for_member(org_id, delivery_task, stamp, 'in_progress', null);
  if not result
    or (select status from public.tasks where id = delivery_task) <> 'in_progress' then raise exception 'FAIL: valid member status update must succeed'; end if;
  checks = array_append(checks, 'valid assigned member status update succeeds');
  select updated_at into stamp from public.tasks where id = unassigned_task;
  result = public.change_task_status_for_member(org_id, unassigned_task, stamp, 'review', null);
  if not result
    or (select status from public.tasks where id = unassigned_task) <> 'review' then raise exception 'FAIL: status access must remain available for unassigned workspace tasks'; end if;
  checks = array_append(checks, 'all workspace members retain status access to unassigned tasks');

  select updated_at into stamp from public.tasks where id = delivery_task;
  actual_state = null;
  begin
    perform public.change_task_status_for_member(org_id, delivery_task, stamp, 'done', 1);
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '22023' then raise exception 'FAIL: member cannot complete an invalid quantity'; end if;
  actual_state = null;
  begin
    perform public.change_task_status_for_member(org_id, delivery_task, stamp, 'done', null);
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '22023' then raise exception 'FAIL: completion requires recorded delivery'; end if;
  result = public.change_task_status_for_member(org_id, delivery_task, stamp, 'done', 2);
  if not result
    or not exists(select 1 from public.tasks where id = delivery_task and status = 'done' and completed_quantity = 2 and target_min = 2) then
    raise exception 'FAIL: valid completion must use the occurrence snapshot, not edited future targets';
  end if;
  checks = array_append(checks, 'completion validates recorded quantity against immutable task targets');

  actual_state = null;
  begin
    perform public.change_task_status_for_member(other_org_id, foreign_task, now(), 'in_progress', null);
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '42501' then raise exception 'FAIL: member RPC must reject a foreign organization'; end if;
  if public.change_task_status_for_member(org_id, foreign_task, now(), 'in_progress', null) then raise exception 'FAIL: foreign task must not be updated through this workspace'; end if;
  checks = array_append(checks, 'member status RPC enforces organization and task tenant boundaries');
  actual_state = null;
  begin
    perform private.guard_deliverable_cadence();
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '42501' then raise exception 'FAIL: authenticated callers must not invoke private cadence guard'; end if;
  checks = array_append(checks, 'private guard functions are not directly callable');

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  actual_state = null;
  begin
    perform public.change_task_status_for_member(org_id, delivery_task, now(), 'todo', null);
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '42501' then raise exception 'FAIL: outsider cannot update workspace status'; end if;
  checks = array_append(checks, 'outsiders cannot invoke status updates for the workspace');
  perform set_config('request.jwt.claim.sub', '', true);
  actual_state = null;
  begin
    perform public.change_task_status_for_member(org_id, delivery_task, now(), 'todo', null);
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '42501' then raise exception 'FAIL: authenticated role without JWT must be denied'; end if;
  checks = array_append(checks, 'authenticated callers need an actual member identity');
  execute 'reset role';
  execute 'set local role anon';
  actual_state = null;
  begin
    perform public.change_task_status_for_member(org_id, delivery_task, now(), 'todo', null);
  exception when others then get stacked diagnostics actual_state = returned_sqlstate; end;
  if actual_state is distinct from '42501' then raise exception 'FAIL: anonymous role must not execute member RPC'; end if;
  execute 'reset role';
  checks = array_append(checks, 'anonymous status RPC execution remains revoked');

  if (select status from public.tasks where id = foreign_task) <> 'todo' then raise exception 'FAIL: foreign fixture must remain unchanged'; end if;
  perform set_config('peak.integrity_test_results', jsonb_build_object(
    'passed_checks', cardinality(checks), 'all_passed', true, 'checks', to_jsonb(checks)
  )::text, true);
end $$;
select passed_checks, all_passed, checks
  from jsonb_to_record(current_setting('peak.integrity_test_results')::jsonb)
    as results(passed_checks integer, all_passed boolean, checks jsonb);
rollback;
