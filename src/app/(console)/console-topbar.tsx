import type { ReactNode } from "react";

import { Topbar } from "@/components/Topbar";
import { API_STATUS_LABELS } from "@/lib/api-status";
import { crydenClient } from "@/server/cryden/client";

/**
 * A screen's topbar, with the API's real state in its tag.
 *
 * It is a server component so the health check happens on the server, where the
 * API is reachable and no token ever has to leave it. Every console screen uses
 * this rather than `Topbar` directly, so the tag cannot be forgotten and cannot
 * be a constant: the only way to render one is to have asked.
 *
 * The check costs a round trip per render. That is the price of a truthful tag;
 * a cached one would describe a connection that may already be gone.
 *
 * The way to the Account screen is the sidebar's operator chip, not a control
 * here. That chip already shows who is signed in and what they may do, so
 * making it the way to the screen that manages the session puts the two facts
 * and the place they are acted on together, and keeps the topbar's actions for
 * things that act on the screen in front of you.
 */
export async function ConsoleTopbar({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const health = await crydenClient().health();

  return (
    <Topbar
      title={title}
      subtitle={subtitle}
      actions={actions}
      status={health.state}
      statusLabel={API_STATUS_LABELS[health.state]}
      statusDetail={health.detail}
    />
  );
}
