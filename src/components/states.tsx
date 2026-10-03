import type { ReactNode } from "react";

import { IconAlertTriangle, IconRefresh } from "./icons";

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  /** Use the borderless variant when the block sits inside a card already. */
  bare?: boolean;
};

/** Shown when a real query returned nothing. Never used as a stand-in for data. */
export function EmptyState({ title, description, icon, action, bare = false }: EmptyStateProps) {
  return (
    <div className={bare ? "state-block bare" : "state-block"} role="status">
      {icon}
      <b>{title}</b>
      {description !== undefined ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export type ErrorStateProps = {
  title?: ReactNode;
  /** The message the caller already turned into plain language. */
  description: ReactNode;
  /** Provider error code, shown in mono so it can be matched against logs. */
  code?: string;
  onRetry?: () => void;
  retryLabel?: string;
  bare?: boolean;
};

/** Shown when a call failed. Always states what failed and offers a retry when one exists. */
export function ErrorState({
  title = "That did not load",
  description,
  code,
  onRetry,
  retryLabel = "Try again",
  bare = false,
}: ErrorStateProps) {
  return (
    <div className={bare ? "state-block error bare" : "state-block error"} role="alert">
      <IconAlertTriangle />
      <b>{title}</b>
      <p>{description}</p>
      {code !== undefined ? <p className="mono dim">{code}</p> : null}
      {onRetry !== undefined ? (
        <button type="button" className="btn" onClick={onRetry}>
          <IconRefresh />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export type SkeletonProps = {
  /** `text` is a line, `value` a stat number, `row` a table row. */
  variant?: "text" | "value" | "row";
  width?: string;
  className?: string;
};

/**
 * Loading placeholder. Marked `aria-hidden` and paired with a live region by
 * the caller, so a screen reader hears "Loading" once rather than a wall of
 * meaningless boxes.
 */
export function Skeleton({ variant = "text", width, className }: SkeletonProps) {
  const classes = ["skeleton", variant, className ?? ""].filter(Boolean).join(" ");
  return (
    <div
      className={classes}
      style={width === undefined ? undefined : { width }}
      aria-hidden="true"
    />
  );
}

export type SkeletonRowsProps = {
  rows?: number;
  /** Column count, so the placeholder rows line up with the real header. */
  columns: number;
};

/** Body-only placeholder rows, used inside a real table so the header stays put. */
export function SkeletonRows({ rows = 6, columns }: SkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} aria-hidden="true">
          {Array.from({ length: columns }, (_, cellIndex) => (
            <td key={cellIndex}>
              <Skeleton variant="text" width={cellIndex === 0 ? "70%" : "45%"} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A single polite announcement for a region that is loading. */
export function LoadingAnnouncement({ children }: { children: ReactNode }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {children}
    </span>
  );
}
