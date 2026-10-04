import type { SVGProps } from "react";

/**
 * Line icons for the landing page, drawn in the prototype's language: 24px
 * box, `currentColor`, fill none, 1.5 to 1.8 stroke.
 *
 * They live apart from `@/components/icons` because they are marketing art,
 * not console chrome. Where the landing page needs a mark the console already
 * has (the shield with a check in the AI callout, the sparkle in the console
 * mock) the page imports that one instead of drawing a second copy.
 *
 * Every icon here is decorative: it sits beside a heading or a label that
 * already says the same thing, so each one is hidden from assistive
 * technology. An icon that ever carries meaning on its own needs a label, not
 * this helper.
 */

export type IconProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "fill"> & {
  size?: number;
};

function decorative({ size, ...props }: IconProps) {
  return {
    ...props,
    ...(size === undefined ? {} : { width: size, height: size }),
    viewBox: "0 0 24 24",
    fill: "none" as const,
    "aria-hidden": true,
    focusable: false,
  };
}

/** The trust badge's "Secure". */
export function IconShield(props: IconProps) {
  return (
    <svg {...decorative(props)}>
      <path
        d="M12 3 5 6v5c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "Self-hosted": two stacked servers. */
export function IconServer(props: IconProps) {
  return (
    <svg {...decorative(props)}>
      <rect x="3" y="4" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 7.5h.01M7 16.5h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "Open source": angle brackets. */
export function IconCode(props: IconProps) {
  return (
    <svg {...decorative(props)}>
      <path
        d="m9 8-4 4 4 4M15 8l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "No vendor lock-in": a globe that has been struck through. */
export function IconGlobeOff(props: IconProps) {
  return (
    <svg {...decorative(props)}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m6 6 12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** The arrow on a primary call to action. */
export function IconArrowRight(props: IconProps) {
  return (
    <svg {...decorative(props)}>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "Own your users". */
export function IconUser(props: IconProps) {
  return (
    <svg {...decorative(props)}>
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

/** "No vendor lock-in" card: a plain table, not a proprietary store. */
export function IconStack(props: IconProps) {
  return (
    <svg {...decorative(props)}>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** "Zero telemetry": a palette with no line out of it. */
export function IconTelemetry(props: IconProps) {
  return (
    <svg {...decorative(props)}>
      <path
        d="M12 3.5c-4.7 0-8.5 3.8-8.5 8.5s3.8 8.5 8.5 8.5c1.4 0 2.3-.9 2.3-2 0-.6-.2-1-.6-1.4-.4-.4-.6-.9-.6-1.4 0-1.1.9-2 2-2h2.4c2 0 3.5-1.6 3.5-3.6C20.5 6.5 16.6 3.5 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="11" r="1.2" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
    </svg>
  );
}
