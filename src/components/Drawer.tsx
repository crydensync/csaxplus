"use client";

import type { ReactNode } from "react";
import { useId, useRef } from "react";

import { useFocusTrap } from "./focus-trap";
import { IconClose } from "./icons";
import { OverlayPortal } from "./overlay-portal";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Always rendered, so the panel always has an accessible name. */
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
};

/**
 * A panel that arrives from the right edge, for the detail behind one list row.
 *
 * The keyboard contract is the modal's, from the same hook: focus moves in on
 * open, Tab stays inside, Escape closes, and focus returns to the row that
 * opened it. What differs is the shape. A modal interrupts; a drawer sits beside
 * the list it came from, which is why it can be this wide and why the table
 * stays visible behind the overlay.
 *
 * The close control is the first focusable element in the panel, so it is what
 * takes focus on open. That is deliberate: a panel whose first stop is a
 * destructive action is one an operator can trigger by pressing Enter twice.
 *
 * The overlay is rendered into the document body rather than here; see
 * `overlay-portal.tsx` for why that is load-bearing.
 */
export function Drawer({ open, onClose, title, subtitle, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  useFocusTrap({ open, onClose, dismissible: true, containerRef: panelRef });

  if (!open) return null;

  return (
    <OverlayPortal>
      <div
        className="drawer-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          className="drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={subtitle === undefined ? undefined : subtitleId}
          tabIndex={-1}
        >
          <div className="drawer-head">
            <div>
              <h2 id={titleId}>{title}</h2>
              {subtitle !== undefined ? (
                <div className="sub" id={subtitleId}>
                  {subtitle}
                </div>
              ) : null}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
              <IconClose />
            </button>
          </div>

          <div className="drawer-body">{children}</div>
        </div>
      </div>
    </OverlayPortal>
  );
}
