"use client";

import type { ReactNode } from "react";

import { apiStatusClass, type ApiStatus } from "@/lib/api-status";

import { IconMenu } from "./icons";
import { useSidebar } from "./shell-context";

export type TopbarProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** The real state of the API connection. Never a constant. */
  status: ApiStatus;
  /** The word shown in the tag. */
  statusLabel: string;
  /** The sentence behind it. Falls back to the label when there is none. */
  statusDetail?: string;
  actions?: ReactNode;
};

export function Topbar({
  title,
  subtitle,
  status,
  statusLabel,
  statusDetail,
  actions,
}: TopbarProps) {
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
        <span className={apiStatusClass(status)} title={statusDetail ?? statusLabel}>
          {statusLabel}
        </span>
      </div>
    </header>
  );
}
