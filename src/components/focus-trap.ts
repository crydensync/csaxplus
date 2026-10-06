"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The keyboard contract every overlay in this console shares.
 *
 * Extracted from `Modal` when the Users screen's drawer needed the same four
 * behaviours, because they are the parts of a dialog that are easy to get almost
 * right and hard to notice missing: focus moves in on open, Tab stays inside,
 * Escape closes, and focus returns to whatever opened it. A second hand-written
 * copy would be a second chance to lose one of them.
 *
 * The two effects are separate on purpose. The open/close one depends only on
 * `open`, so it runs once per opening and its cleanup is what puts focus back.
 * Keeping it off the key handler's dependency list is what stops a caller that
 * passes a fresh `onClose` each render from re-capturing "what to focus on
 * close" while the overlay is already open, which would restore focus to an
 * element inside the thing being closed.
 */
export function useFocusTrap(options: {
  open: boolean;
  onClose: () => void;
  /** Whether Escape and a click on the backdrop may close it. */
  dismissible: boolean;
  /** The element Tab is kept inside, which must be focusable itself. */
  containerRef: RefObject<HTMLElement | null>;
}) {
  const { open, onClose, dismissible, containerRef } = options;
  const restoreRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (container === null) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        container.focus();
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose, containerRef],
  );

  useEffect(() => {
    if (!open) return;

    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const container = containerRef.current;
    const initial = container?.querySelector<HTMLElement>(FOCUSABLE);
    (initial ?? container)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus();
    };
  }, [open, containerRef]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);
}
