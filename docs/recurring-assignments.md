# Recurring task assignments

Owners and admins can assign recurring SEO tasks to one person or several teammates using the existing assignee picker in Tasks or the task detail form. Select **This task and future occurrences** to save the selected people as that task series' default. Select **This task only** for a one-off cover arrangement. Choosing Unassigned with future scope clears the saved assignees too.

For assigning whole services across one or several clients in one save, use **Assign service work** on Tasks or a client's detail page. See [bulk service assignments](bulk-service-assignments.md). This leaves the individual task controls available for exceptions.

A service series is scoped to a project and deliverable definition. Two clients using the same SEO template have independent assignees, and different deliverables can have different teams. A manually repeating task uses its original task as the series identity; changes made from a child occurrence can update the default without rewriting the original task's history. Shared assignments use the existing multiple-assignee model; they are selected people, not a new named-team directory.

Generation only copies assignees into newly created occurrences. Historical and already generated occurrences are preserved. Removed workspace members are automatically removed from defaults through the membership foreign key. Stopping recurrence or pausing a service project retains the existing generation behavior.

## Database rollout

Apply `supabase/migrations/20261006010000_recurring_assignments.sql` before deploying the updated app. The migration creates tenant-isolated rules and assignee tables, installs an assignment inheritance trigger, and updates the task RPCs. All current/future assignment changes occur in one transaction. Rule tables cannot be written directly through the authenticated API; their helper validates role, task tenant, and membership. There is no service-role client in the application.

The migration initializes service defaults from the most recently assigned occurrence in each project/deliverable series, so existing SEO assignments carry forward. An already-generated empty occurrence stays empty; assign it explicitly in the picker. For manually repeating tasks it initializes defaults from the original task's assignees. Initial migration values are not guesses from other clients or task titles. Empty rules persist deliberate unassignment. Newly created manual recurrence captures its initial assignees once.

Local application: `npx supabase@2.117.0 migration up --local`, then `npm run test:recurring-assignees`. Do not reset an existing database. Hosted application requires reviewing the migration and selecting the intended project before applying it, followed by deploying the app. No hosted migration or deployment is performed by this change.

## Validation

`npm run test:recurring-assignees` runs the rollback-only SQL checks through the existing local Supabase PostgreSQL container. Fixtures cover group/individual assignments, generation, idempotence, one-off edits, clearing defaults, client/deliverable isolation, historical preservation, forbidden role/tenant access, failed-write rollback and membership removal. Monthly service inheritance is tested by regenerating a missing current occurrence after its predecessor is removed; manual recurrence uses an actual prior-month source. The test does not advance the database clock.

In cloud environments where the full Supabase PostgreSQL image cannot be extracted under Docker's `vfs` driver, the same SQL can be run with `psql -v ON_ERROR_STOP=1` on a disposable PostgreSQL 17 database with the repository migrations and Supabase-compatible auth schema installed. This verifies SQL and RLS behavior; it does not validate live Supabase Auth, PostgREST, or browser interaction. Tests never use hosted credentials and fixtures roll back.

The inline recurring-task picker initially selects future scope. The full task form starts with **This task only**, so editing a title or status does not accidentally replace a previously saved series default. For a new manual repeating task, initial assignees are captured automatically.

The runner defaults to `supabase_db_peak-leads-blueprint`; `RECURRING_TEST_CONTAINER` may select a prepared disposable local PostgreSQL container. It still uses Docker-local `psql` rather than a database URL.
