"use client";

import type { ReactNode } from "react";

import { IconMenu } from "./icons";
import { useSidebar } from "./shell-context";

/**
 * What the console knows about the backend right now. This is the one place the
 * topbar is allowed to look "healthy", and it is driven by a real health check
 * rather than a constant.
 */
export type ApiStatus = "api-client" | "degraded" | "fixtures" | "offline";

export function apiStatusClass(status: ApiStatus): string {
  return STATUS_CLASS[status];
}

const STATUS_CLASS: Record<ApiStatus, string> = {
  "api-client": "env-tag",
  degraded: "env-tag degraded",
  fixtures: "env-tag fixtures",
  offline: "env-tag offline",
};
export type TopbarProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  status: ApiStatus;
  /** Human wording for the status, so the operator is never left decoding a tag. */
  statusLabel: string;
  actions?: ReactNode;
};

export function Topbar({ title, subtitle, status, statusLabel, actions }: TopbarProps) {
  const { open, toggle } = useSidebar();

  return (
    <header className="topbar">
      <div className="topbar-heading">
        <button
          type="button"
          className="menu-toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="sidebar"
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          <IconMenu />
        </button>
        <div>
          <h1>{title}</h1>
          {subtitle !== undefined ? <div className="sub">{subtitle}</div> : null}
        </div>
      </div>
      <div className="actions-row">
        {actions}
        <span className={STATUS_CLASS[status]} title={statusLabel}>
          {statusLabel}
        </span>
      </div>
    </header>
  );
}
