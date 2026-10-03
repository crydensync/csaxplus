import type { SVGProps } from "react";

/**
 * Line icons ported from the prototype's inline SVGs, so the console keeps the
 * same visual language. Every icon draws with `currentColor` and `fill: none`
 * unless the artwork needs a solid mark, matching the prototype.
 *
 * Sizing is left to CSS (`.nav-item svg`, `.btn svg`, and so on) the same way
 * the prototype did it. Pass `size` only where an icon sits outside a rule that
 * already sets its box.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill"> & {
  size?: number;
};

function line({ size, ...props }: IconProps) {
  return {
    ...props,
    ...(size === undefined ? {} : { width: size, height: size }),
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true,
    focusable: false,
  };
}

export function IconGrid(props: IconProps) {
  return (
    <svg {...line(props)}>
      <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="12" width="8" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="15" width="8" height="6" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...line(props)}>
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconLink(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M9 15 15 9M8.5 8.5 6 6a3.5 3.5 0 1 0 0 5l1-1M15.5 15.5 18 18a3.5 3.5 0 1 0 0-5l-1 1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconShieldCheck(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M12 3 5 6v5c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 12.3 11 14.3 15.3 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <svg {...line(props)}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...line(props)}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function IconLockSmall(props: IconProps) {
  return (
    <svg {...line(props)}>
      <rect
        x="4.5"
        y="10"
        width="15"
        height="10"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M12 3 3 20h18L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r=".9" fill="currentColor" />
    </svg>
  );
}

export function IconFileText(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path d="M5 4h11l3 3v13H5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M8.5 10h7M8.5 13.5h7M8.5 17h4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSparkle(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M12 3.5 13.6 8.4 18.5 10 13.6 11.6 12 16.5 10.4 11.6 5.5 10 10.4 8.4 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 15.5 19.3 17.7 21.5 18.5 19.3 19.3 18.5 21.5 17.7 19.3 15.5 18.5 17.7 17.7 18.5 15.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <svg {...line(props)}>
      <circle cx="8" cy="15" r="3.3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10.3 12.7 19 4M19 4h-3.2M19 4v3.2M15.5 7.5l2 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconNodes(props: IconProps) {
  return (
    <svg {...line(props)}>
      <circle cx="6" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="18" r="2.3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 8.2 10.3 16M16 8.2 13.7 16M8.3 7h7.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconLogLines(props: IconProps) {
  return (
    <svg {...line(props)}>
      <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10h8M8 13.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconCloud(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M5 18c-1.7 0-3-1.3-3-2.9 0-1.5 1.1-2.7 2.6-2.9a4.5 4.5 0 0 1 8.7-1.7 3.7 3.7 0 0 1 4.7 3.6c0 2.1-1.7 3.9-3.9 3.9H5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconTemplate(props: IconProps) {
  return (
    <svg {...line(props)}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 8h8M8 11.5h8M8 15h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSupport(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M4 12a8 8 0 0 1 16 0v4.5a2.5 2.5 0 0 1-2.5 2.5H16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4 12v3a2 2 0 0 0 2 2h.5a1.5 1.5 0 0 0 1.5-1.5v-3A1.5 1.5 0 0 0 6.5 11H4Zm16 0v3a2 2 0 0 1-2 2h-.5a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5H20Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 19a1.5 1.5 0 0 1-1.5 1.5h-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSliders(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M5 6h14M5 12h14M5 18h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="9" cy="6" r="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="12" r="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="10" cy="18" r="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconMonitor(props: IconProps) {
  return (
    <svg {...line(props)}>
      <rect x="3.5" y="5" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 20h8M12 17v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconChip(props: IconProps) {
  return (
    <svg {...line(props)}>
      <rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9.5 3.5v3.2M14.5 3.5v3.2M9.5 17.3v3.2M14.5 17.3v3.2M3.5 9.5h3.2M3.5 14.5h3.2M17.3 9.5h3.2M17.3 14.5h3.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconDatabase(props: IconProps) {
  return (
    <svg {...line(props)}>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...line(props)}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.9-1.3-2-3.4-2.2.7a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.2-.7-2 3.4L4.6 10.5a7.6 7.6 0 0 0 0 3l-1.9 1.3 2 3.4 2.2-.7a7.6 7.6 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.2.7 2-3.4-1.9-1.3Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...line({ size: 18, ...props })}>
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...line(props)}>
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconPencil(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M4 20l1-4L16.5 4.5a1.5 1.5 0 0 1 2 0l1 1a1.5 1.5 0 0 1 0 2L8 19l-4 1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M5 12.5 10 17.5 19 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M20 12a8 8 0 1 1-2.3-5.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M20 4v4.5h-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <svg {...line(props)}>
      <path
        d="M3.5 13.5 6 5.5h12l2.5 8v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 13.5H9l1 2.5h4l1-2.5h5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
