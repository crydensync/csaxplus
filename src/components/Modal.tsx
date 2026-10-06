"use client";

import type { ReactNode } from "react";
import { useId, useRef } from "react";

import { useFocusTrap } from "./focus-trap";
import { OverlayPortal } from "./overlay-portal";

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
 * whatever opened it. The behaviour itself lives in `useFocusTrap`, which the
 * drawer shares.
 *
 * The overlay is rendered into the document body rather than here; see
 * `overlay-portal.tsx` for why that is load-bearing.
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
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap({ open, onClose, dismissible, containerRef: cardRef });

  if (!open) return null;

  return (
    <OverlayPortal>
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
    </OverlayPortal>
  );
}
