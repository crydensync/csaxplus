import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  hint?: ReactNode;
  /** Rendered right-aligned on the title row, for a count or a small action. */
  action?: ReactNode;
  children?: ReactNode;
};

/** The prototype's `.card`: surface, soft border, optional title and hint. */
export function Card({ title, hint, action, className, children, ...rest }: CardProps) {
  const classes = ["card", className ?? ""].filter(Boolean).join(" ");
  const hasHead = title !== undefined || action !== undefined;

  return (
    <div className={classes} {...rest}>
      {hasHead ? (
        <div className="row-between">
          <div>
            {title !== undefined ? <h3>{title}</h3> : null}
            {hint !== undefined ? <p className="hint">{hint}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  /** Small line under the value. `tone` colours it the way the prototype does. */
  delta?: ReactNode;
  tone?: "neutral" | "up" | "warn";
  loading?: boolean;
};

/** The dashboard's `.stat-value` tile. */
export function StatCard({
  label,
  value,
  delta,
  tone = "neutral",
  loading = false,
}: StatCardProps) {
  const deltaClass = ["stat-delta", tone === "up" ? "up" : "", tone === "warn" ? "warn" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <Card>
      <p className="hint">{label}</p>
      {loading ? (
        <div className="skeleton value" aria-hidden="true" />
      ) : (
        <div className="stat-value">{value}</div>
      )}
      {delta !== undefined ? <div className={deltaClass}>{delta}</div> : null}
    </Card>
  );
}
