import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { MfaView } from "./mfa-view";

export const metadata: Metadata = {
  title: "MFA & Passkeys",
};

/**
 * The MFA & Passkeys screen.
 *
 * The same thin server component the dashboard's, Users and OAuth pages are:
 * session check, redirect, topbar, and the screen handed to a client component.
 * The read goes through `/api/console/mfa/adoption` rather than here, because
 * the API access token needs renewing when it is close to expiry and only a
 * route handler can write the cookie that renewal sets.
 */
export default async function MfaPage() {
  const session = await readSession();
  if (session === null) redirect("/login");

  return (
    <>
      <ConsoleTopbar
        title="MFA & Passkeys"
        subtitle="Second factors across the deployment, as the engine's own event history reports them."
        actions={<SignOutButton csrf={session.csrf} />}
      />

      <MfaView />
    </>
  );
}
