import Link from "next/link";
import type { Tables } from "@/lib/database.types";
import type { Directory } from "@/lib/data/queries";
import { EmptyState } from "@/components/empty-state";
export function ActivityList({
  rows,
  members,
}: {
  rows: Tables<"activity_logs">[];
  members: Directory["members"];
}) {
  if (!rows.length)
    return (
      <EmptyState icon="activity" title="No activity yet">
        Your team’s task, client, and project changes will appear here.
      </EmptyState>
    );
  return (
    <ol className="activity-list">
      {rows.map((row) => {
        const metadata =
          row.metadata &&
          typeof row.metadata === "object" &&
          !Array.isArray(row.metadata)
            ? row.metadata
            : {};
        const title =
          typeof metadata.label === "string" ? metadata.label : row.entity_type;
        const taskId =
          typeof metadata.task_id === "string" ? metadata.task_id : null;
        const href =
          row.entity_type === "comment"
            ? taskId
              ? `/tasks/${taskId}`
              : null
            : `/${row.entity_type}s/${row.entity_id}`;
        const actor =
          members.find((m) => m.user_id === row.actor_id)?.profiles
            ?.full_name || (row.actor_id ? "Team member" : "System");
        return (
          <li key={row.id}>
            <span className="activity-dot" />
            <div>
              <p>
                <strong>{actor}</strong> {row.action} {row.entity_type}
              </p>
              {href ? <Link href={href}>{title}</Link> : <span>{title}</span>}
              <time dateTime={row.created_at}>
                {new Date(row.created_at).toLocaleString("en-ZA", {
                  timeZone: "Africa/Johannesburg",
                })}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
