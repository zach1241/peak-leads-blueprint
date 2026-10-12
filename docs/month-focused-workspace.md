# Month-focused workspace

The default Tasks view now groups this month's generated work by client, then service. Client groups show exact totals and open/done counts; the first client opens automatically. Filtering a client/service/search opens all matching groups. Task controls remain available inside each service and preserve owner/admin versus assigned-member permissions. A separate Table layout preserves the paginated flat list.

The shared month scope uses the Africa/Johannesburg calendar:

- Work periods overlapping the month are included, including weeks crossing the first or last day.
- Without a work period, the due date determines the month.
- Without a work period or deadline, creation during this month includes the task, using local midnight boundaries.
- A historical period/deadline takes precedence over a recent import or creation date.

Tasks, dashboard totals and linked task views, client summaries, team workload and burndown use this scope. Delivery includes contractual periods overlapping the month. The dashboard recent activity is limited to events recorded this month; the Activity page retains the full audit log. History retains every existing task. The month changes automatically with the workspace calendar.

Grouping fetches all matching rows in batches instead of grouping only the current 25-row page. This keeps client/service groups and counts complete. The grouped view has no flat pagination; switching to Table resets to the first page and retains filters. The unassigned view includes only unfinished work. Team totals include closed statuses and subtract cancelled tasks from remaining work.

This is a view and navigation change. Existing quantities, statuses, assignments, clients, projects, recurring definitions and historical records were preserved. No database migration or destructive cleanup was needed.

Validation: 36 calendar, filter, navigation and month-scope checks passed. Boundary fixtures cover September exclusions, late imports of historical work, cross-month weeks, wholly future work, old and new undated tasks, Johannesburg midnight, leap February and year rollover. The hosted read-only query counted 84 October tasks across four clients and ten service groups at verification time. Build, lint, TypeScript and release browser checks are recorded after implementation.
