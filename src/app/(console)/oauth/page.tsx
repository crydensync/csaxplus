import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { OAuthProvidersView } from "./providers-view";

export const metadata: Metadata = {
  title: "OAuth Providers",
};

/**
 * The OAuth Providers screen.
 *
 * The same thin server component the dashboard's and Users screen's pages
 * are: session check, redirect, topbar, and the screen handed to a client
 * component. The reads go through `/api/console/oauth/providers` rather than
 * here, because the API access token needs renewing when it is close to
 * expiry and only a route handler can write the cookie that renewal sets.
 */
export default async function OAuthPage() {
  const session = await readSession();
  if (session === null) redirect("/login");

  return (
    <>
      <ConsoleTopbar
        title="OAuth Providers"
        subtitle="The providers sign-in and linking can use, and whether each answers."
        actions={<SignOutButton csrf={session.csrf} />}
      />

      <OAuthProvidersView csrf={session.csrf} />
    </>
  );
}
