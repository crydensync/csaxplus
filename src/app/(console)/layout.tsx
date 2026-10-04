import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/Shell";
import { SidebarProvider } from "@/components/shell-context";
import { initialsFromLabel } from "@/lib/operator";
import { readSession } from "@/server/auth/guard";
import { ROLE_LABELS } from "@/server/auth/roles";
import { sessionRole } from "@/server/auth/session";

/**
 * Everything inside this group needs a signed-in operator, and gets the console
 * frame around it.
 *
 * The session check is here rather than in each page, so a screen added later
 * cannot be left open by forgetting a line. Reading the session is all this
 * does: a component cannot set a cookie, so a token close to expiry is renewed
 * by the first call the screen makes through a route handler.
 *
 * Both sidebar badges are null, which the sidebar renders as no badge at all.
 * The counts behind them are real endpoints that the console does not call yet
 * (`GET /v1/admin/sessions`, the anomaly list), and a badge reading zero would
 * be a claim the console has not earned.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await readSession();
  if (session === null) redirect("/login");

  const role = sessionRole(session);

  return (
    <SidebarProvider>
      <AppShell
        badges={{ sessions: null, anomalies: null }}
        operator={{
          initials: initialsFromLabel(session.operator.label),
          name: session.operator.label,
          roleLabel: ROLE_LABELS[role],
        }}
      >
        {children}
      </AppShell>
    </SidebarProvider>
  );
}
