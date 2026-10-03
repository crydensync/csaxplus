"use client";

import type { ReactNode } from "react";
import { useId } from "react";

export type ToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Required: a bare switch with no label is unusable. */
  label: string;
  /** Renders the label next to the switch instead of only for screen readers. */
  visibleLabel?: ReactNode;
  disabled?: boolean;
  /** Shown as a tooltip and read out, for switches the console locks on purpose. */
  disabledReason?: string;
};

/**
 * The prototype's `.toggle`. A locked switch stays visible with a reason rather
 * than disappearing, which is what the read-only AI screens rely on.
 */
export function Toggle({
  checked,
  onChange,
  label,
  visibleLabel,
  disabled = false,
  disabledReason,
}: ToggleProps) {
  const id = useId();

  return (
    <span className="toggle-wrap">
      {visibleLabel !== undefined ? (
        <label className="toggle-label" htmlFor={id}>
          {visibleLabel}
        </label>
      ) : null}
      <span className="toggle" title={disabled ? disabledReason : undefined}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-label={visibleLabel === undefined ? label : undefined}
          aria-describedby={disabled && disabledReason ? `${id}-reason` : undefined}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span className="toggle-track" aria-hidden="true" />
      </span>
      {disabled && disabledReason ? (
        <span id={`${id}-reason`} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
