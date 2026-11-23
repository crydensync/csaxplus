import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/Card";
import { readSession } from "@/server/auth/guard";

import { AcceptInvite } from "./invite-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accept console invitation" };

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, session] = await Promise.all([searchParams, readSession()]);
  const inviteToken = token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  const returnTo = inviteToken ? `/invite?token=${encodeURIComponent(inviteToken)}` : "/invite";

  return (
    <main className="view anim" style={{ maxWidth: 720, margin: "48px auto", padding: 16 }}>
      <Card title="Console invitation" hint="A secure, single-use operator invitation.">
        {!inviteToken ? (
          <p>This invitation link is missing or invalid. Ask the console owner for a fresh link.</p>
        ) : !session ? (
          <div>
            <p>Sign in to the CrydenSync account whose email address was invited.</p>
            <Link className="btn primary" href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
              Sign in to continue
            </Link>
            <p className="hint" style={{ marginTop: 16 }}>
              If you do not have an account yet, create one in the consuming application first, then
              return to this link.
            </p>
          </div>
        ) : (
          <AcceptInvite token={inviteToken} email={session.operator.label} csrf={session.csrf} />
        )}
      </Card>
    </main>
  );
}
