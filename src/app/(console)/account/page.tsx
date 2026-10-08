import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";
import { ROLE_LABELS } from "@/server/auth/roles";
import { sessionRole } from "@/server/auth/session";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { AccountView } from "./account-view";

export const metadata: Metadata = {
  title: "Account",
};

/**
 * The Account screen.
 *
 * Reached from the sidebar's operator chip, and deliberately not in `NAV_GROUPS`.
 * The chip is already the answer to who is signed in and as what, and this is
 * where those two facts are acted on. The sidebar lists the console's 21 screens
 * and the landing page generates its count from that same list, so a screen
 * added to the navigation would change what the marketing page claims. This is
 * not one of those screens: it is about the operator's own session, not about
 * the deployment.
 *
 * A server component that establishes the session and hands over, for the reason
 * the Users page gives: every call this screen makes goes through a console
 * route, because the API access token is renewed there and only a route handler
 * can write the cookie that renewal sets.
 */
export default async function AccountPage() {
  const session = await readSession();
  if (session === null) redirect("/login");

  const role = sessionRole(session);

  return (
    <>
      <ConsoleTopbar
        title="Account"
        subtitle={`Signed in as ${session.operator.label}, as ${ROLE_LABELS[role]}.`}
        actions={<SignOutButton csrf={session.csrf} />}
      />

      <AccountView csrf={session.csrf} />
    </>
  );
}
