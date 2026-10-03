"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Always rendered, so the dialog always has an accessible name. */
  title: ReactNode;
  description?: ReactNode;
  /** Centred and narrow like the prototype's step-up prompt; `wide` for forms. */
  variant?: "prompt" | "wide";
  /** Hides the close affordances, for a step the operator must finish or cancel. */
  dismissible?: boolean;
  /** Artwork above the title, such as the prototype's scan rings. */
  media?: ReactNode;
  /** Buttons below the description. */
  actions?: ReactNode;
};

/**
 * The prototype's `.modal-overlay` with the keyboard behaviour it was missing:
 * focus moves in on open, Tab stays inside, Escape closes, and focus returns to
 * whatever opened it.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  variant = "prompt",
  dismissible = true,
  media,
  actions,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const card = cardRef.current;
      if (card === null) return;
      const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        card.focus();
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === card)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose],
  );

  useEffect(() => {
    if (!open) return;

    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const card = cardRef.current;
    const initial = card?.querySelector<HTMLElement>(FOCUSABLE);
    (initial ?? card)?.focus();

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className={variant === "wide" ? "modal-card wide" : "modal-card"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
      >
        {media}
        <h4 id={titleId}>{title}</h4>
        {description !== undefined ? <p id={descriptionId}>{description}</p> : null}
        {actions}
        {dismissible ? (
          <button type="button" className="modal-cancel" onClick={onClose}>
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
