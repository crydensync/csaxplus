import type { ReactNode } from "react";

export type PillTone = "green" | "red" | "amber" | "neutral";

export type PillProps = {
  tone?: PillTone;
  /** The prototype draws a leading dot; turn it off for a pure label chip. */
  dot?: boolean;
  title?: string;
  children: ReactNode;
};

/** Status chip, the prototype's `.pill`. */
export function Pill({ tone = "neutral", dot = true, title, children }: PillProps) {
  const classes = ["pill", tone, dot ? "" : "no-dot"].filter(Boolean).join(" ");
  return (
    <span className={classes} title={title}>
      {children}
    </span>
  );
}
