"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_GROUPS, isActivePath } from "@/lib/nav";

export type SidebarBadges = {
  /** Real open-session count, or null while it is unknown. */
  sessions: number | null;
  /** Real unreviewed-anomaly count, or null while it is unknown. */
  anomalies: number | null;
};

export type SidebarOperator = {
  /** Single letter pair for the avatar chip, derived from the operator's name. */
  initials: string;
  /** What the operator sees as their own name. Never a placeholder. */
  name: string;
  roleLabel: string;
};

export type SidebarProps = {
  open: boolean;
  onNavigate: () => void;
  badges: SidebarBadges;
  operator: SidebarOperator;
};

/**
 * The prototype's sidebar. Counts come from the caller, and a badge is omitted
 * rather than shown as zero when the count is unknown or empty.
 */
export function Sidebar({ open, onNavigate, badges, operator }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={open ? "sidebar open" : "sidebar"} id="sidebar">
      <Link className="brand" href="/" onClick={onNavigate}>
        <span className="brand-mark">
          <Image src="/cryden-icon.png" alt="" width={32} height={32} priority />
        </span>
        <span className="brand-text">
          <b>csax+</b>
          <span>CRYDENSYNC CONSOLE</span>
        </span>
      </Link>

      <div className="nav-scroll">
        <nav aria-label="Console sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              <div className="primary">
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const count = item.badge === undefined ? null : badges[item.badge];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={active ? "nav-item active" : "nav-item"}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                    >
                      <item.icon />
                      {item.label}
                      {count !== null && count > 0 ? <span className="badge">{count}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="operator-chip">
          <div className="avatar" aria-hidden="true">
            {operator.initials}
          </div>
          <div className="operator-meta">
            <b title={operator.name}>{operator.name}</b>
            <span>{operator.roleLabel}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
