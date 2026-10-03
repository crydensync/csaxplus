import type { ComponentType } from "react";

import {
  IconAlertTriangle,
  IconChip,
  IconCloud,
  IconDatabase,
  IconFileText,
  IconGrid,
  IconKey,
  IconLink,
  IconLock,
  IconLogLines,
  IconMail,
  IconMonitor,
  IconNodes,
  IconSettings,
  IconShieldCheck,
  IconSliders,
  IconSparkle,
  IconSupport,
  IconTemplate,
  IconUsers,
  type IconProps,
} from "@/components/icons";

export type NavItem = {
  /** Route path. */
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** Which real count feeds the trailing badge, once that screen exists. */
  badge?: "sessions" | "anomalies";
};

export type NavGroup = {
  label: string;
  items: ReadonlyArray<NavItem>;
};

/**
 * The console's navigation, taken from the prototype's sidebar. Every entry is
 * a real route; a screen that is not built yet renders an explicit
 * "not built yet" state rather than disappearing from the sidebar, so the gap
 * is visible instead of hidden.
 */
export const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: IconGrid }],
  },
  {
    label: "Identity",
    items: [
      { href: "/users", label: "Users", icon: IconUsers },
      { href: "/oauth", label: "OAuth Providers", icon: IconLink },
      { href: "/mfa", label: "MFA & Passkeys", icon: IconShieldCheck },
      { href: "/email", label: "Email & Magic Link", icon: IconMail },
      { href: "/password-policy", label: "Password Policy", icon: IconLock },
    ],
  },
  {
    label: "Security",
    items: [
      { href: "/sessions", label: "Sessions", icon: IconLock, badge: "sessions" },
      { href: "/anomalies", label: "Anomalies", icon: IconAlertTriangle, badge: "anomalies" },
      { href: "/audit", label: "Audit Log", icon: IconFileText },
      { href: "/ai", label: "AI Assistant", icon: IconSparkle },
    ],
  },
  {
    label: "Developer",
    items: [
      { href: "/api-keys", label: "API Keys", icon: IconKey },
      { href: "/webhooks", label: "Webhooks", icon: IconNodes },
      { href: "/jwt-claims", label: "JWT Claims", icon: IconLogLines },
      { href: "/logging", label: "Cloud Logging", icon: IconCloud },
    ],
  },
  {
    label: "AI Admin",
    items: [
      { href: "/digest", label: "Weekly Digest", icon: IconTemplate },
      { href: "/support", label: "Support Assistant", icon: IconSupport },
      { href: "/config-advisor", label: "Config Advisor", icon: IconSliders },
      { href: "/ai-widget", label: "Ask-AI Widget", icon: IconMonitor },
    ],
  },
  {
    label: "Configuration",
    items: [
      { href: "/llm-provider", label: "LLM Provider", icon: IconChip },
      { href: "/database-provider", label: "Database Provider", icon: IconDatabase },
      { href: "/settings", label: "Settings & Secrets", icon: IconSettings },
    ],
  },
];

/** True when `href` is the section the operator is currently in. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav item whose route contains `pathname`, used for the topbar title. */
export function findNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!isActivePath(pathname, item.href)) continue;
      if (best === undefined || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}
