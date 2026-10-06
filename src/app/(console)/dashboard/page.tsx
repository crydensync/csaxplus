import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { DashboardOverview } from "./overview";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * The dashboard.
 *
 * A server component that does nothing but establish that there is a session and
 * hand the screen to the client one. The reports themselves are read through
 * `/api/console/dashboard` rather than here, because the API access token needs
 * renewing when it is close to expiry and only a route handler can write the
 * cookie that renewal sets. Reading them here would work right up until the
 * first token aged out, and then fail in a way that looks like a bad password.
 *
 * The subtitle claims nothing about the numbers below it, because the numbers
 * come from the API and this component has not seen them.
 */
export default async function DashboardPage() {
  const session = await readSession();
  if (session === null) redirect("/login");

  return (
    <>
      <ConsoleTopbar
        title="Dashboard"
        subtitle="Accounts, second factors and the stored digest, as the API reports them."
        actions={<SignOutButton csrf={session.csrf} />}
      />

      <DashboardOverview />
    </>
  );
}
