import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { readSession } from "@/server/auth/guard";
import { ROLE_LABELS } from "@/server/auth/roles";
import { sessionRole } from "@/server/auth/session";

import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * A placeholder that is not pretending to be a dashboard.
 *
 * It exists so that signing in can be checked end to end: it reads the session
 * through the guard, shows the operator the API said they are, and can sign out.
 * Tier 1 replaces it with the real dashboard, the shell, and counts that come
 * from the API. Until the health check exists there is no honest value for the
 * topbar's status tag, which is why this screen has no topbar.
 */
export default async function DashboardPage() {
  const session = await readSession();
  if (session === null) redirect("/login");

  const role = sessionRole(session);

  return (
    <div className="auth-screen">
      <main className="auth-card">
        <Card
          title="Signed in"
          hint="This screen only confirms the session. The console's own screens begin in tier 1."
        >
          <dl className="detail-list">
            <div className="detail-row">
              <dt>Operator</dt>
              <dd>{session.operator.label}</dd>
            </div>
            <div className="detail-row">
              <dt>User id</dt>
              <dd className="mono">{session.operator.id}</dd>
            </div>
            <div className="detail-row">
              <dt>Console role</dt>
              <dd>
                <Pill tone={role === "viewer" ? "neutral" : "green"}>{ROLE_LABELS[role]}</Pill>
              </dd>
            </div>
            <div className="detail-row">
              <dt>API session</dt>
              <dd className="mono">
                {session.apiSessionId === null ? "not resolved" : session.apiSessionId}
              </dd>
            </div>
          </dl>

          <div className="auth-lede" style={{ marginTop: 16 }}>
            The API decided this account&apos;s role from the token it issued. Everything the console
            shows from here is what that token can actually reach.
          </div>

          <SignOutButton csrf={session.csrf} />
        </Card>
      </main>
    </div>
  );
}
