"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Where a dialog is rendered: into the document body, never inside the screen.
 *
 * This is not a stylistic choice, and it is not about stacking. `position:
 * fixed` is resolved against the nearest ancestor with a transform, a filter or
 * a `will-change`, and a console screen is full of animation classes that hold
 * one: `.view.anim` fills a `translateY` keyframe, which measures as
 * `matrix(1, 0, 0, 1, 0, 0)` on the element once the animation is over. Under
 * that ancestor a fixed overlay is sized to the content column rather than to
 * the window, which is what the Users drawer did: it stopped at the bottom of
 * the card it was opened from instead of the bottom of the screen.
 *
 * Rendering into the body takes an overlay out from under every such ancestor at
 * once, rather than leaving each screen to know which of its wrappers is
 * transformed today.
 *
 * It renders nothing on the server, so an overlay must not be open in the first
 * paint. Neither can be: the modal and the drawer both take `open`, and every
 * screen starts them closed and opens them from a click.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
