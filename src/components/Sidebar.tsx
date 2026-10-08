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
      {/* The prototype's console linked its own brand back to the landing
          page, and `/` is that page: this leaves the console on purpose. */}
      <Link className="brand" href="/" title="Back to the landing page" onClick={onNavigate}>
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
        {/* The way to the Account screen. It is the chip rather than a nav item
            because it is already the answer to "who is signed in, and as what",
            and the Account screen is where those two facts are acted on. It is
            not in `NAV_GROUPS` for the reason the Account page gives: the
            sidebar's length is what the landing page reports as the console's
            screen count, and this is not one of the deployment's screens. */}
        <Link
          className={isActivePath(pathname, "/account") ? "operator-chip active" : "operator-chip"}
          href="/account"
          aria-current={isActivePath(pathname, "/account") ? "page" : undefined}
          title="Your account and passkeys"
          onClick={onNavigate}
        >
          <div className="avatar" aria-hidden="true">
            {operator.initials}
          </div>
          <div className="operator-meta">
            <b title={operator.name}>{operator.name}</b>
            <span>{operator.roleLabel}</span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
