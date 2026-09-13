begin;
alter table public.tasks add constraint delivery_required_values check(deliverable_definition_id is null or (period_end is not null and target_min is not null and target_max is not null));
commit;
