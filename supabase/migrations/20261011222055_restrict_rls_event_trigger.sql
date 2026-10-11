-- This event trigger is an internal database guard, not an application RPC.
-- Revoking API roles keeps automatic RLS enabled for newly created tables.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
