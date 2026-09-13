# Peak Leads Operations

Internal, organization-scoped task and operations platform for Peak Leads. Phase 2 adds the database, access controls, live dashboard, and practical task/client/project workflows to the Phase 1 authentication and visual system. Nothing is deployed or pushed automatically.

## Stack and setup

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Supabase Auth/PostgreSQL, `@supabase/ssr`, `@supabase/supabase-js`, and Zod. Use Node.js 20.9+ and Docker for local Supabase.

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Existing `.env.local` is preserved and gitignored:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

Only the project URL and public publishable key belong in these variables. No private/service-role key is needed by the application. The local-only API test retrieves a **local** service key internally to create/delete synthetic fixtures; that key never enters browser code or test output.

## Commands

| Command             | Purpose                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`       | Run using the existing `.env.local`, port 3000                                  |
| `npm run lint`      | ESLint                                                                          |
| `npm run build`     | Production build and strict TypeScript validation                               |
| `npm start`         | Serve the completed production build                                            |
| `npm run db:start`  | Start local Supabase, with optional services excluded                           |
| `npm run db:test`   | Run transactional pgTAP security tests locally                                  |
| `npm run test:api`  | Real local Auth/PostgREST integration checks; generated fixtures are cleaned up |
| `npm run dev:local` | Run on port 3001 against local Supabase, without editing `.env.local`           |

## Migrations workflow

`supabase/migrations/20260912010000_operations.sql` creates the schema, constraints, triggers, grants, RLS, and atomic task mutation function in one transaction. `supabase/config.toml` configures the local stack; its project ID is a local label, not a hosted project link.

```bash
npm run db:start
# On an existing local database, apply newly added migrations:
npx supabase@2.117.0 migration up --local
npm run db:test
npm run test:api
```

For a fresh, disposable local database only, `npx supabase@2.117.0 db reset --local` recreates local data and reapplies migrations. Do not use reset on a database whose data you need.

For future hosted migrations, authenticate with the CLI, explicitly select the correct project, review the migration, and run:

```bash
npx supabase@2.117.0 login
npx supabase@2.117.0 link --project-ref YOUR_PROJECT_REF
npx supabase@2.117.0 db push --dry-run
npx supabase@2.117.0 db push
```

Do not put database passwords or CLI tokens into committed files. Hosted migration application is separate from Vercel deployment. Database types were generated from the local schema in `src/lib/database.types.ts`; when the schema changes, regenerate them with `npx supabase@2.117.0 gen types typescript --local`. Preserve explicit nullable RPC arguments, which automatic generation may not represent.

## Phase 2 schema

| Table                  | Purpose                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `organizations`        | Workspace identity, slug, creator                                               |
| `profiles`             | Auth user ID, display name, optional HTTPS avatar; no auth emails/passwords     |
| `organization_members` | Unique workspace/user membership and owner/admin/member role                    |
| `clients`              | Organization-scoped client records, contacts, website, status, notes            |
| `projects`             | Work grouped by optional client, status and dates                               |
| `tasks`                | Status, priority, description, due date, optional project/direct client         |
| `task_assignees`       | Unique task/user assignments constrained to membership in the same organization |
| `comments`             | Task discussion with authenticated author                                       |
| `activity_logs`        | Database-generated activity with actor and compact metadata                     |

All tables have UUID primary keys. Mutable records have timestamps and automatic `updated_at` triggers; assignees use `assigned_at`, and memberships/activity use creation time. Enum values follow the Phase 2 specification. Compound foreign keys enforce organization identity even when requests contain manually altered IDs. An optional task client is a direct association, independent of its project's client; the client detail labels those task counts explicitly.

Client/project deletion is restricted while referenced by work. Task deletion cascades to assignments/comments. Membership removal cascades to assignments, preserving historical work and comments. Deleting a profile clears historical creator/author fields; transfer ownership before deleting a sole owner. Organization deletion is an operator-only database operation and should remove tasks/projects/clients in dependency order first. There is no destructive delete UI in Phase 2.

## Roles and security

| Capability                                              | Member | Admin | Owner |
| ------------------------------------------------------- | ------ | ----- | ----- |
| Read own workspace data and team profiles               | Yes    | Yes   | Yes   |
| Create/update projects, tasks, assignments              | Yes    | Yes   | Yes   |
| Create comments; edit own comments                      | Yes    | Yes   | Yes   |
| Manage clients                                          | No     | Yes   | Yes   |
| Delete work or moderate comments through authorized API | No     | Yes   | Yes   |
| Manage non-owner memberships and organization name/slug | No     | Yes   | Yes   |
| Grant/revoke owner role                                 | No     | No    | Yes   |

The last owner cannot be removed or demoted. Membership writes lock the organization to serialize concurrent owner changes. A global profile is editable only by its owner; teammates can read it, and unrelated organizations cannot.

Every table has RLS enabled, including profiles and assignment junctions. Anonymous access is revoked. Policies use small caller-bound `SECURITY DEFINER` helpers in a non-exposed `private` schema with an empty search path; they avoid recursive membership policies. Function execution is explicitly restricted. Do **not** expose `private` through the Data API or make the helper owners subject to recursive membership RLS.

Server Actions revalidate the Supabase user and current membership, validate inputs with Zod, and use the user's cookie-authenticated client. They never use a service-role client. The workspace cookie is a preference, not authorization; its value must match a membership. All queries also specify the selected organization, and RLS independently enforces access. Creator/tenant identities are immutable; comments cannot forge their author. Task saves run through a `SECURITY INVOKER` RPC, so task and assignment writes are transactional and remain subject to RLS.

Activity logs are read-only for clients: private triggers write task/client/project/comment changes and task completion with `auth.uid()` as actor. Log metadata stores labels and related IDs, not comment bodies, contact details, or request-supplied actors. They are an operational activity stream, not a comprehensive security audit; assignment-only changes and deletion auditing remain future work.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PostgreSQL constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).

## Bootstrap Peak Leads

1. Apply the migration.
2. Enable email/password authentication and disable public signup for the hosted internal application.
3. Create the approved first user in Supabase Authentication. The trigger creates their profile automatically; the migration also backfills existing users.
4. In Supabase SQL Editor as the database operator, run the following, replacing the email placeholder. The same script is in `supabase/bootstrap.sql`.

```sql
begin;
do $$
declare owner_id uuid; org_id uuid;
begin
  select id into owner_id from auth.users
  where lower(email) = lower('REPLACE_WITH_OWNER_EMAIL');
  if owner_id is null then
    raise exception 'Create the approved auth user first and replace the email placeholder';
  end if;
  insert into public.organizations(name, slug, created_by)
  values ('Peak Leads', 'peak-leads', owner_id)
  returning id into org_id;
  insert into public.organization_members(organization_id, user_id, role)
  values (org_id, owner_id, 'owner');
end $$;
commit;
```

The script intentionally fails if the slug already exists; it never grants ownership of an existing workspace on a rerun. No real auth UUIDs or real users are committed. Authenticated accounts without membership see a workspace access message.

## Add team members

Create each approved user through Supabase Auth first. Then run this as the trusted database operator, replacing the email. This does not send an invitation or create an Auth user:

```sql
do $$
declare person uuid; org uuid;
begin
  select id into person from auth.users where lower(email)=lower('REPLACE_WITH_TEAM_EMAIL');
  select id into org from public.organizations where slug='peak-leads';
  if person is null or org is null then raise exception 'User or workspace not found'; end if;
  insert into public.organization_members(organization_id,user_id,role)
  values(org,person,'member');
end $$;
```

Use `admin` only when needed. In SQL Editor, the operator bypasses RLS and is responsible for approving access. Ordinary authenticated API membership writes enforce the role rules above. Team invitation/membership-management UI is deferred; the team screen reads memberships and profiles. Names/avatars can be set under Settings. Private auth emails are deliberately omitted rather than introducing a privileged email-directory endpoint.

## Application behavior

- Dashboard: exact live counts, eight earliest-due open assigned tasks, five recent events. My Tasks/Due This Week/Overdue count the current user's open tasks; Active Clients counts the selected workspace. Done/cancelled tasks are excluded. Week is Monday–Sunday in Africa/Johannesburg; overdue means due before today. Undated work sorts last.
- Tasks: paginated table, status/priority/assignee filters, create/edit/details, multiple assignees, client/project links, and paginated comments.
- Clients: paginated directory, admin create/edit, details, first 25 related projects and paginated directly linked tasks.
- Projects: paginated list, create/edit/details, client association, dates, and related tasks.
- Team and Activity: real membership/profile and trigger-generated event data.
- Settings: profile editing and membership-validated workspace switching.
- Tables horizontally scroll within labelled focusable regions on small screens; forms stack; existing mobile dialog navigation and system light/dark colors remain.
- Lists use 25-row pages. Form directories currently support up to 1,000 clients/projects/members and fail explicitly above that size; searchable remote selectors belong in Phase 3.

## Authentication setup retained from Phase 1

Allow `http://localhost:3000/auth/callback` (and `http://localhost:3001/auth/callback` for local-stack testing). Use `{{ .ConfirmationURL }}` in recovery emails and configure reliable SMTP for hosted users. PKCE recovery links must be opened in the requesting browser. `/reset-password` requires a validated session. Only add the future production callback after deployment is authorized; no DNS/deployment changes are included here.

## Tests and acceptance

`supabase/tests/operations.test.sql` runs in a rollback transaction with four synthetic users across two organizations. It covers profile automation, tenant isolation, role escalation, owner protection, foreign keys, comment author forgery, audit write denial, atomic rollback, and anonymous access. `scripts/test-api.mjs` tests real local Auth and PostgREST with generated accounts and removes only those fixtures.

After migrating and bootstrapping, sign in and verify:

1. Create a client as owner/admin, create a linked project, and create a task with multiple assignees.
2. Edit the task, filter by each assignee, mark it done, add a comment, and confirm dashboard/activity changes.
3. Sign in as a member; confirm client creation is unavailable and role/membership changes are denied.
4. Switch between memberships in Settings; verify isolated lists and known foreign IDs return not-found.
5. Check mobile navigation/forms, keyboard access, and logout followed by a protected-route reload.

## Phase 3 recommendations

Add invitation and membership management UI, richer permission controls, searchable selectors, optimistic-concurrency protection for edits, task search/saved views, notifications, attachments, and broader audit coverage. Add archival/deletion workflows with retention rules, automated browser regression tests, and CI migration/RLS/type-drift checks. Review production email, backups, observability, and deployment configuration only when deployment is authorized. Kanban drag-and-drop is intentionally deferred.

## Validation completed

- `npm run lint`, `npm run build` (including TypeScript), and `git diff --check` passed.

- Migration applied successfully on local Supabase PostgreSQL 17, including a fresh local reset and reapplication.
- All **34 pgTAP security assertions passed**, using four synthetic users in two organizations.
- All **35 local integration assertions passed**, covering real Auth, PostgREST joins and permissions, authenticated rendering of ten routes, task/client/project create and edit Server Actions, comments, and logout cookie clearing/redirects.
- To rerun the full integration set, start `npm run dev:local` in one terminal, then run `TEST_APP_URL=http://localhost:3001 npm run test:api` in another. Without that environment variable the script runs the 15 API-only checks.
- Test accounts and generated organization/work records were removed; SQL fixtures rolled back.
- Browser verification confirmed that `/tasks` redirects to login while signed out. Authenticated UI flows were tested over HTTP Server Actions; a full interactive mobile/browser regression suite remains Phase 3 work.
- The Phase 2 migration was subsequently pushed to hosted project `jdkffdfndqgxireommap` with user authorization. All nine hosted tables were verified with RLS enabled. Peak Leads (`peak-leads`) has been bootstrapped with the user-selected existing account as owner; the organization and owner membership were verified in the hosted database. The reusable bootstrap file retains its placeholder; the owner email was substituted only in a temporary execution copy. No production users, Git commits/pushes, deployment, or DNS changes were made.

## Service delivery and real client import

The hosted Peak Leads workspace now contains the real four-client service framework. See [the exact import report](docs/client-import-2026-09-12.md) for inserted counts, service mappings, quantities, responsibilities, dates and validation evidence.

The recurrence extension adds `service_templates`, `service_deliverables` and `managed_responsibilities`. Service projects link to templates; generated tasks snapshot a period and target range. Numerical delivery is tracked through actual completed quantities. Managed responsibilities have a status and note and never contribute to completion totals. Templates and service mappings require owner/admin rights; members can record quantities and responsibility status in their workspace.

Open **Delivery** in the sidebar to check the current month and actionable week. Opening that page calls an authenticated generation Server Action, with an idempotent database function and unique occurrence key. It does not pre-create future years, run as a service-role user, schedule a background job, or backfill missed periods. FIT's LSA setup remains blocked and unmapped. Service-template editing and unattended scheduling are future additions.

```bash
npm run test:delivery
# Generate SQL for review; this command itself does not modify a database:
node scripts/import-peak-leads.mjs APPROVED_OWNER_EMAIL /tmp/peak-import.sql
node scripts/validate-peak-leads.mjs /tmp/peak-validation.sql
```

The import SQL requires an already-bootstrapped Peak Leads workspace and existing owner. It uses `authenticated` with RLS for data writes, checks existing names/aliases and service definitions, refuses ambiguous/conflicting mappings, and preserves existing work on reruns. Do not rerun bootstrap for an existing workspace. Execute reviewed SQL only against the intended project; never paste a database password into a source file or chat.

`npm run build` uses the supported Webpack backend because this environment encountered an internal Turbopack cache failure. `npm run dev:local` uses `.next-local` so its locally compiled public Supabase configuration cannot overwrite hosted development artifacts. Both build directories are ignored by Git and ESLint.
