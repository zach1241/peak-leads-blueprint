# Workspace permission and service integrity fixes

`20261014121621_guard_workspace_integrity.sql` adds database enforcement without
rewriting or removing existing tasks, service links, assignments, or history.

Members can continue editing the content of their own help requests at any
status, and deleting their own requests. A trigger reserves status changes for
owners and admins, including calls made directly through the Data API.

An active client may have one package with canonical code `standard-seo` or
`dominate-seo`. A project trigger derives `exclusive_service_group` from that
identity on every insert and update; submitted values cannot override it. A
partial unique index named `one_active_seo_package` enforces the rule atomically,
covering direct writes, client-management actions, and the older service RPC
without adding client locks to project updates. Editable display names do not
identify packages; template codes remain fixed after creation. A conflict raises
SQLSTATE `23505` naming `one_active_seo_package`. Other services can coexist with SEO.
Pausing one SEO package allows the other to be activated. The migration does not
silently repair conflicts; the hosted read-only preflight found none. The new
derived group is backfilled by canonical code while existing timestamps and
project audit entries stay unchanged. The service connection RPC first finds
an existing link before attempting insertion, preserving same-package reconnects,
inactive status, assignments, history, and its original signature.

A deliverable with task history or an explicit deleted-occurrence marker cannot
change cadence. Archive that definition and add another for the new cadence.
Cadence on unused definitions remains editable, and target/instruction changes
still affect future generation. The rejection uses SQLSTATE `23514`, constraint
and hint `deliverable_cadence_history`. A task-insert trigger holds the definition
row `FOR SHARE` before delivery validation; concurrent cadence updates must wait,
so insertion and cadence editing cannot both pass an unused-definition check.
Existing contractual snapshots and deleted-occurrence markers remain intact.

`change_task_status_for_member` retains its signature and allows status changes
for all members of that task's workspace. NULL or stale expected timestamps
return false before any mutation. A member must still record the occurrence's
minimum quantity to complete a generated deliverable. Anonymous execution stays
revoked. Private trigger functions are not exposed or directly executable.

The portable regression suite is `supabase/tests/workspace-integrity.sql`.
Execute it as postgres after installing the migration. It creates random fixture
users and workspaces within `BEGIN`, exercises real authenticated/anonymous
roles, reports its completed assertions, and ends with `ROLLBACK`. It needs no
pgTap or other extension and creates no test tables/functions. Every mutation
targets those random fixtures. It checks direct/RPC SEO conflicts after renaming,
legal package switching, cadence locks including deleted occurrences, quantity
snapshot preservation, help-request permissions, NULL/stale timestamps, valid
member completion, tenant isolation, and anonymous/private-function grants.

The single-transaction suite checks the conflict results sequentially. A separate
two-session test on a disposable database can verify waiting behavior: start two
transactions activating the held Standard and Dominate projects for one fixture
client. The second waits on the unique-index conflict; after the first commits,
the second must fail with `one_active_seo_package`. Similarly, hold an inserted occurrence
uncommitted while another session changes its definition's cadence; the edit must
wait, then fail after the occurrence commits. Do not use production clients for
these concurrency fixtures.
