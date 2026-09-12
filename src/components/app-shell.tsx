"use client";
import { useActionState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import { navigation } from "@/lib/navigation";
import { Brand } from "./brand";
import { Icon } from "./icon";
export function AppShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(logout, {});
  const current =
    navigation.find((item) => item.href === pathname)?.label ?? "Workspace";
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
          Peak Leads workspace
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
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{current}</strong>
          </div>
          <details className="user-menu">
            <summary aria-label="Open account menu">
              <span className="avatar">{email.slice(0, 1).toUpperCase()}</span>
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
