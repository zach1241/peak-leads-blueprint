export const taskStatuses = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "cancelled",
] as const;
export const priorities = ["low", "medium", "high", "urgent"] as const;
export const projectStatuses = [
  "planned",
  "active",
  "on_hold",
  "completed",
  "cancelled",
] as const;
export const clientStatuses = ["active", "inactive", "archived"] as const;
export function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}
export function displayDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T12:00:00Z`))
    : "No due date";
}
