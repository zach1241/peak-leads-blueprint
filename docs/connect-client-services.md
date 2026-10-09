# Connect an existing service to a client

Owners and admins can connect an existing service template such as SEO, LSA, or Google Ads to a client and choose its teammates in one save. The connection creates that client's active service project, stores its independent future assignment team, and generates its current defined deliverables with those teammates immediately. This workflow uses existing templates; it does not define new service templates or deliverables.

Reconnecting the same client and service reuses the existing project and preserves its name, status, historical tasks, and historical assignments. Eligible existing work receives the selected team and its future defaults are saved. Paused, planned, completed, and cancelled service projects retain their status and do not generate new tasks. Empty teams deliberately leave work unassigned. A template without deliverables can still be connected and retain a future team without inventing tasks.

Only the selected client service generates work during this operation. Another client's missing tasks are left untouched, even when that client uses the same template. Current monthly/weekly contractual periods, targets, and task uniqueness follow the established generation behavior. Per-deliverable and per-task overrides remain available afterward through the existing assignment controls.

## APIs

Open **Clients**, choose the client, and use **Connect a service to this client**. Select an existing service, choose its teammates, and click **Connect service and assign work**. For a client with linked work, expand **Connect another service** to add an existing service. The linked-service checkboxes below let you assign one specific service or several services together. The same workflow is available on Tasks after choosing a client in **Assign service work**; clients with no projects are included.

`public.connect_client_service(p_organization_id uuid, p_client_id uuid, p_service_template_id uuid, p_assignees uuid[])` returns one row with `project_id uuid`, `tasks_assigned integer`, and `tasks_generated integer`. `tasks_assigned` counts eligible existing tasks plus newly generated tasks; it can include tasks already assigned to the selected people. Every client, template, and teammate must belong to the caller's workspace. An owner/admin role and an authenticated user ID are required. Null teammate lists/elements and lists over 100 are rejected; an empty teammate list is supported. The function is SECURITY INVOKER with an empty search path.

The function locks the client first and then the service project, uses the existing tenant/client/service unique index to reuse links, and calls the validated bulk assignment RPC before generating occurrences. This sequence ensures new tasks inherit the stored team immediately. Any failed validation or generation rolls back the entire connection transaction.

`public.generate_service_deliverables(p_organization_id uuid, p_project_id uuid)` is an owner/admin-only, SECURITY INVOKER helper returning the number of new occurrences. It checks the project tenant, requires a service mapping, locks the project, and inserts current deliverables only for that active project. It never invokes the workspace-wide generator or generates manual recurrence. Existing complete contractual occurrences and unique occurrence keys prevent duplicates.

## Migration and checks

Apply only `supabase/migrations/20261009134735_connect_client_services.sql` after the already deployed bulk assignment migration. The local bulk source `20261009132621_bulk_service_assignments.sql` corresponds to hosted `20261009133724_bulk_service_assignments`; the prior local recurring source `20261006010000_recurring_assignments.sql` corresponds to hosted `20261009130346_recurring_assignments`. Preserve those installed migrations; do not rerun them, reset the database, or rerun client imports. This extension creates functions only and asks PostgREST to reload its schema.

The 9 October 2026 hosted rollout installed this source once through the migration connector, recorded as `20261009135534_connect_client_services`. Reconcile the known local/hosted timestamp mappings before any future CLI migration push; do not reapply the already-installed source.

`supabase/tests/connect-client-services.sql` is pure BEGIN/ROLLBACK SQL. It covers new connections, immediate group inheritance, saved defaults, scoped weekly/monthly generation, uniqueness/idempotence, missing work on an unrelated client, paused link name/status/history preservation, empty templates, deliberate unassignment, invalid tenant/client/template/member inputs, missing identity, ordinary members, and anonymous callers. It aggregates `passed_checks` and `all_passed` before rolling back all synthetic fixtures.
