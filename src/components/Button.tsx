import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "default" | "primary" | "danger-ghost";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "default" | "small";
  children: ReactNode;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: "",
  primary: "primary",
  "danger-ghost": "danger-ghost",
};

/**
 * Matches the prototype's `.btn` family. `type` defaults to "button" so a
 * button inside a form never submits by accident.
 */
export function Button({
  variant = "default",
  size = "default",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const classes = ["btn", VARIANT_CLASS[variant], size === "small" ? "small" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
