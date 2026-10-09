# Task deletion

Owners and admins can open a task from Tasks, expand **Delete task**, check the permanent-deletion confirmation, and select **Delete task permanently**. Members do not see this control and cannot invoke the deletion action, even for tasks assigned to them. These permissions use the existing workspace administration role check and task DELETE policy.

Deletion removes the selected task, its comments and its task assignments. It does not delete other tasks, the client or the project. After successful deletion the app returns to Tasks with refreshed work data.

For a generated service or manual recurrence occurrence, the occurrence-deletion database migration records its series and period privately so generation keeps that occurrence deleted. Other existing occurrences and the future schedule remain. Apply that migration before deploying the deletion UI.

A manual repeating source with existing occurrences cannot be deleted because its history still depends on that source. Choose **Does not repeat** or change **Repeat until** in the task settings to stop future generation while keeping that history. Deleting a source that has no generated occurrences removes the source and stops its future recurrence.

The Server Action validates authentication, owner/admin role, task and organization UUIDs, the active workspace and an explicit `confirm=yes`. Its cookie-authenticated database client deletes only the matching tenant and task, with RLS still enforced. It reports missing or inaccessible tasks and protects linked recurrence history through the existing foreign key. No service-role credentials or privileged deletion RPC are used.

## Migration and verification

Local source `supabase/migrations/20261009153208_preserve_deleted_task_occurrences.sql` was applied once on 9 October 2026 to `jdkffdfndqgxireommap`, recorded as hosted migration `20261009154103_preserve_deleted_task_occurrences`. The connector assigned its application timestamp. Reconcile that mapping before a future CLI migration push; do not reapply the installed source.

`private.deleted_task_occurrences` is outside the Data API, has RLS enabled with no policies, and grants no access to public, anonymous or authenticated roles. Only internal trigger helpers access it. This intentional deny-all setup can produce an informational RLS-without-policy advisor notice. Trigger helpers have an empty search path and no direct execution grants. No existing task deletion permissions were broadened.

Matching period inserts and deletes use a transaction advisory lock. Concurrent operations can report a retryable transaction error instead of restoring a successfully deleted occurrence. Deleting a project, deliverable or childless manual source cleans its markers through tenant-scoped foreign keys. Moving a manual source between projects preserves its deleted periods.

`supabase/tests/task-deletion.sql` checks deletion roles, tenant boundaries, dependent-record cleanup, protected source history, private marker access and permanent period suppression with future assignment inheritance. All fixtures run inside BEGIN/ROLLBACK. The existing assignment suites clear only their synthetic workspace's markers when simulating missing occurrences for inheritance checks; actual deletion persistence is covered separately by the deletion suite.
