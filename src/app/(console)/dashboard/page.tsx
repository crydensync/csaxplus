import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { readSession } from "@/server/auth/guard";
import { ROLE_LABELS } from "@/server/auth/roles";
import { sessionRole } from "@/server/auth/session";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Still not the dashboard.
 *
 * Tier 1 replaces this with the real one: counts from `GET /v1/admin/users`, the
 * digest, and recent activity, each with its own loading, empty and error state.
 * Until those calls exist, a page of zeroed stat cards would be a mock wearing a
 * dashboard's clothes, so this screen says what it can prove instead: who the
 * API says the operator is, what the console is allowed to show them, and the
 * real state of the connection.
 */
export default async function DashboardPage() {
  const session = await readSession();
  if (session === null) redirect("/login");

  const role = sessionRole(session);

  return (
    <>
      <ConsoleTopbar
        title="Dashboard"
        subtitle="Nothing on this screen is a stand-in for a number the console has not read."
      />

      <div className="view anim">
        <Card
          title="Signed in"
          hint="The console's own screens begin in tier 1. This one confirms the session behind them."
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

          <p className="hint" style={{ marginTop: 16 }}>
            The API decided this account&apos;s role from the token it issued. Everything the
            console shows from here is what that token can actually reach.
          </p>

          <SignOutButton csrf={session.csrf} />
        </Card>
      </div>
    </>
  );
}
