"use client";
import { useActionState, useRef, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { navigation } from "@/lib/navigation";
import { Brand } from "./brand";
import { ThemeControl } from "./theme-control";
import { Avatar } from "./avatar";
import { Icon } from "./icon";
export function AppShell({
  children,
  email,
  workspaceName,
  fullName,
  avatarUrl,
  avatarUpdatedAt,
  helpCount,
}: {
  children: React.ReactNode;
  email: string;
  workspaceName?: string;
  fullName?: string;
  avatarUrl?: string;
  avatarUpdatedAt?: string;
  helpCount: number | null;
}) {
  const pathname = usePathname();
  const [navigationHelp, setNavigationHelp] = useState<{ pathname: string; initial: number | null; count: number | null }>();
  const unresolvedHelp = navigationHelp?.pathname === pathname && navigationHelp.initial === helpCount ? navigationHelp.count : helpCount;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/help-count", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Count unavailable"); return response.json(); })
      .then((data: { count: number }) => setNavigationHelp({ pathname, initial: helpCount, count: data.count }))
      .catch(() => { if (!controller.signal.aborted) setNavigationHelp({ pathname, initial: helpCount, count: null }); });
    return () => controller.abort();
  }, [pathname, helpCount]);
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(logout, {});
  const current =
    navigation.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )?.label ?? "Workspace";
  const nav = (
    <nav aria-label="Main navigation">
      <p className="nav-label">WORKSPACE</p>
      {navigation.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={`nav-item ${pathname === item.href ? "active" : ""}`}
          onClick={() => dialog.current?.close()}
        >
          <Icon name={item.icon} />
          {item.label}
          {item.href === "/help-requests" && (unresolvedHelp === null ? <span className="help-count-unavailable" title="Help count unavailable">?</span> : unresolvedHelp > 0 ? <span className="help-count" aria-label={`${unresolvedHelp} unresolved help requests`}>{unresolvedHelp}</span> : null)}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/dashboard" aria-label="Peak Leads dashboard">
          <Brand />
        </Link>
        {nav}
        <div className="sidebar-footer">
          <span className="status-dot" />
          {workspaceName ?? "Peak Leads workspace"}
          <small>A little clarity. A lot of progress.</small>
        </div>
      </aside>
      <dialog
        ref={dialog}
        className="mobile-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="mobile-panel">
          <div className="mobile-brand">
            <Brand />
            <button
              className="icon-button"
              onClick={() => dialog.current?.close()}
              aria-label="Close navigation"
            >
              ✕
            </button>
          </div>
          {nav}
        </div>
      </dialog>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              onClick={() => dialog.current?.showModal()}
              aria-label="Open navigation"
            >
              ☰
            </button>
            <span className="workspace-name">
              {workspaceName ?? "Workspace"}
            </span>
            <span className="slash">/</span>
            <strong>{current}</strong>
          </div>
          <div className="header-account-controls">
          <ThemeControl variant="toggle" />
          <details className="user-menu">
            <summary aria-label="Open account menu">
              <Avatar
                key={`${avatarUrl ?? "initials"}:${avatarUpdatedAt ?? ""}`}
                name={fullName || email}
                url={avatarUrl}
              />
              <span className="account-label">My account</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="account-popover">
              <small>SIGNED IN AS</small>
              <p>{email}</p>
              <Link href="/settings">Account settings</Link>
              <form action={action}>
                <button disabled={pending}>
                  {pending ? "Signing out…" : "Sign out"}
                </button>
                {state.error && (
                  <p className="form-error" role="alert">
                    {state.error}
                  </p>
                )}
              </form>
            </div>
          </details>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          Peak Leads <span>Built for focused work.</span>
        </footer>
      </div>
    </div>
  );
}
