export const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: "overview" },
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/clients", label: "Clients", icon: "clients" },
  { href: "/projects", label: "Projects", icon: "projects" },
  { href: "/team", label: "Team", icon: "team" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;
export function safeDestination(value: unknown) {
  return typeof value === "string" &&
    navigation.some((item) => item.href === value)
    ? value
    : "/dashboard";
}
