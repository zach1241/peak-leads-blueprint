# Workspace polish and task visibility

The Tasks page previously showed only the current recurring period. On 12 October 2026 this hid 65 unfinished earlier occurrences, while dashboard overdue totals still included them.

Current work now includes undated tasks, the current work period, and unfinished past periods. History includes every period. My tasks and Overdue exclude done/cancelled work. Dashboard counts and the linked task views use the same scope and the Africa/Johannesburg Monday–Sunday calendar. Client progress uses current work, with a link to full history.

The task workspace adds title search, service/project and due-date filters, sorting, focused views, filter-preserving pagination and recovery from out-of-range pages. Invalid IDs and repeated query values fall back to usable filters. Literal SQL wildcard searches are escaped. Filters and service management can be collapsed, leaving work in view. Mobile task rows render as readable cards.

Task details now show deadlines, owners, linked clients/projects, descriptions and delivery before optional editing controls. Project task creation preselects its project/client. Project choices include client names. Navigation is grouped, remains active on details pages, and offers parent breadcrumbs. Sign-in preserves supported deep links and query strings while rejecting external destinations.

Inline status changes support all six statuses. Status and quantity writes compare the displayed updated_at with the database value; stale writes fail instead of overwriting newer work. Confirmation of Done records the current minimum target and still respects database constraints and membership/assignment permissions. Comment forms reset after a successful submission. Automatic recurring generation shares one initial request per workspace/day within a browser tab; manual refresh remains available.

Next.js and its ESLint configuration are patched to 16.3.8. Compatible transitive dependency updates remove the reported production vulnerabilities. The database migration restricts the internal rls_auto_enable event-trigger function; it keeps the existing RLS event trigger intact and changes no application records.

Validation:

- npm run lint, production build including TypeScript, and git diff --check.
- npm run test:workspace: 19 calendar, filter, escaping and safe-navigation checks.
- scripts/test-workspace-database.sql: authenticated RLS, full statuses, stale status/quantity protection and quantity completion, inside a rollback transaction. Verified no test task remains.
- npm audit --omit=dev: zero known runtime vulnerabilities. The full audit still flags the ESLint development dependency chain through braces, for which npm suggests an incompatible framework downgrade. No forced downgrade was applied.
- Hosted Supabase scan: API execute warnings for rls_auto_enable resolved. The private deletion ledger intentionally has no API policies. Leaked-password protection remains an account configuration finding; credentials and authentication settings were not changed.

The Docker-only integration suites could not run on this Windows host because Docker is unavailable. The focused rollback tests ran against the connected Peak Leads database instead. Live browser verification is recorded after release below.
