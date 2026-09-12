# Peak Leads Operations

Internal task management and operations platform for Peak Leads. Phase 1 provides real Supabase authentication and a protected, responsive workspace. Business data is intentionally not connected yet.

## Stack

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Supabase Auth, `@supabase/supabase-js`, and `@supabase/ssr`. The interface uses semantic components and CSS theme tokens, with automatic system light/dark appearance. No external font requests are required.

## Local setup

Use Node.js 20.9 or newer (a current supported LTS is recommended).

```bash
npm ci
npm run dev
```

Open http://localhost:3000. Keep the same hostname throughout login and password recovery; localhost and 127.0.0.1 have different cookie storage.

Create `.env.local` if needed (already configured in this checkout):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

These two values are public by design. Never add a database password, service-role key, or secret API key to a `NEXT_PUBLIC_` variable. `.env.local` is gitignored. No private Supabase key is needed for Phase 1.

## Commands

- `npm run dev`: local development server.
- `npm run lint`: ESLint checks.
- `npm run build`: production compilation, TypeScript validation, and route generation.
- `npm start`: serve the production build after `npm run build`.

## Supabase configuration

1. Enable email/password authentication under Authentication → Providers.
2. Disable public user signup for this internal application. There is no signup UI; provision approved users through the Supabase dashboard. Phase 1 grants workspace access to any valid user in this Supabase project, so use a dedicated project and approved accounts only.
3. Set Authentication → URL Configuration → Site URL to `http://localhost:3000` for local development. Allow `http://localhost:3000/auth/callback` in Redirect URLs. Only add a 127.0.0.1 callback if you intentionally use that hostname too.
4. Keep the reset-password email template’s link using `{{ .ConfirmationURL }}`. This follows Supabase's PKCE redirect with a code to `/auth/callback`; it is not a token-hash template.
5. Configure custom SMTP for reliable delivery to team members, and review email rate limits. Supabase's default mail service has delivery restrictions.
6. Choose a password policy aligned with the app's minimum of 12 characters for password changes. Provider policy may impose additional requirements.
7. When deployment is explicitly approved later, set the production Site URL and allow `https://tasks.peakleadsblueprint.com/auth/callback`. No deployment or DNS changes have been made.

## Authentication architecture

- `src/lib/supabase/browser.ts` creates the browser SSR client; password recovery starts here so the PKCE verifier is stored in the requesting browser.
- `src/lib/supabase/server.ts` creates a request-scoped SSR client using async Next.js cookies. Server Components read cookies; Server Actions and Route Handlers can write them.
- `src/proxy.ts` refreshes cookies with `getClaims`, preserves refreshed cookies on redirects, and redirects unauthenticated protected requests to `/login`. Auth-dependent responses are marked private/no-store.
- `src/lib/auth.ts` provides request-memoized `requireUser`, using `getUser` to validate against Supabase Auth. The application layout and protected pages use it independently. Future mutations and data access must perform their own authorization.
- `src/app/actions.ts` implements sign-in, validated password updates, and local-session logout. Redirect destinations are allowlisted; forms expose pending and error states. Logout revokes the current session, clears cookies through SSR, and redirects to login.
- `/forgot-password` returns a neutral response for successful email requests. Open the email in the same browser that requested it. `/auth/callback` exchanges the single-use PKCE code; invalid links return to recovery. `/reset-password` requires a server-validated session, and its Server Action rechecks the user before updating the password. An already authenticated user can also change their password there.
- This phase does not implement organizations or authorization roles. Authentication is real; there is no development bypass or mock identity.

Reference: [Supabase SSR client guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Phase 1 scope

- `/login`, `/forgot-password`, `/auth/callback`, `/reset-password`, and logout.
- Protected `/dashboard`, `/tasks`, `/clients`, `/projects`, `/team`, `/activity`, and `/settings`.
- Responsive sidebar, mobile modal navigation, account menu, dashboard, loading/error/not-found states.
- Dashboard metrics are explicitly unavailable, not invented counts. Upcoming tasks and activity use explanatory empty states.
- Six clean placeholder sections. No task/client/project tables, migrations, RLS policies, GitHub push, deployment, or DNS changes.

## Manual acceptance checks

1. Signed out, open each protected route: expect a redirect to login.
2. Sign in using an approved real Supabase account: expect the requested allowlisted page or dashboard; reload and verify the session persists.
3. Use My account → Sign out: expect login; reload a protected route and confirm access is denied. Test browser back and refresh too.
4. Request a reset email and open it in the same browser. Verify expired/reused links show recovery guidance. Verify mismatched or short passwords fail, then update the password and sign in with it.
5. At mobile, tablet, and desktop widths, check navigation, account menu, keyboard focus, and no horizontal overflow. On mobile, verify the dialog closes with Escape, its close control, and route selection.
6. Check OS light/dark appearance. Email delivery and successful authenticated flows require an approved account and the Supabase settings above.

## Recommended Phase 2 (not implemented)

Design organizations/workspaces, profiles, memberships, and roles first. Add clients, projects, tasks and assignees with organization-scoped relationships. Add comments and activity logs. Implement Supabase RLS with membership-based isolation and role-aware policies, then test cross-organization access denial before connecting CRUD screens and live dashboard metrics. Add audit coverage, indexes, migrations, and integration tests alongside the schema.

## Validation performed in this checkout

- `npm run lint`: passed without warnings.
- `npm run build`: passed, including strict TypeScript checking.
- `npm run dev -- --hostname 127.0.0.1`: booted successfully on port 3000.
- HTTP checks: root, all seven application routes, and reset-password redirect signed-out requests to login; login and forgot-password return 200; an invalid callback code redirects to recovery with an error.
- Browser checks: protected dashboard redirect, rejected sign-in error feedback, recovery navigation, and 390px login/recovery layouts with no horizontal overflow.
- `git diff --check`: passed. `.env.local` remains ignored; existing staged files were not restaged or committed.
- Pending: successful sign-in, authenticated dashboard/mobile-navigation visual checks, logout/revocation, and delivered-email password recovery. The credentials present in the browser were rejected by Supabase; an approved account is needed to finish these checks. No mock session or authentication bypass was introduced.
