"use client";

import type { ReactNode } from "react";

import { Sidebar, type SidebarBadges, type SidebarOperator } from "./Sidebar";
import { useSidebar } from "./shell-context";

export type AppShellProps = {
  badges: SidebarBadges;
  operator: SidebarOperator;
  children: ReactNode;
};

/**
 * The console frame: fixed sidebar, content column, and the scrim that closes
 * the sidebar on a narrow screen. Pages render their own `Topbar` inside so
 * each screen owns its title and actions.
 */
export function AppShell({ badges, operator, children }: AppShellProps) {
  const { open, close } = useSidebar();

  return (
    <div className="app">
      <Sidebar open={open} onNavigate={close} badges={badges} operator={operator} />
      {open ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={close}
        />
      ) : null}
      <div className="main">{children}</div>
    </div>
  );
}
