export const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: "overview", group: "Work" },
  { href: "/tasks", label: "Tasks", icon: "tasks", group: "Work" },
  { href: "/clients", label: "Clients", icon: "clients", group: "Work" },
  { href: "/projects", label: "Projects", icon: "projects", group: "Work" },
  {
    href: "/delivery",
    label: "Service delivery",
    icon: "calendar",
    group: "Work",
  },
  { href: "/sops", label: "SOPs", icon: "projects", group: "Resources" },
  {
    href: "/help-requests",
    label: "Help requests",
    icon: "team",
    group: "Resources",
  },
  { href: "/packages", label: "Services & Packages", icon: "projects", group: "Workspace", adminOnly: true },
  { href: "/team", label: "Team", icon: "team", group: "Workspace" },
  {
    href: "/activity",
    label: "Activity",
    icon: "activity",
    group: "Workspace",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "settings",
    group: "Workspace",
  },
] as const;
export function safeDestination(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value) ||
    value.length > 2048
  )
    return "/dashboard";
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (
      url.origin !== "https://workspace.invalid" ||
      !navigation.some(
        (item) =>
          url.pathname === item.href ||
          url.pathname.startsWith(`${item.href}/`),
      )
    )
      return "/dashboard";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}
