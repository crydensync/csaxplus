import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { UsersView } from "./users-view";

export const metadata: Metadata = {
  title: "Users",
};

/**
 * The Users screen.
 *
 * A server component that establishes the session and then hands over, for the
 * reason the dashboard's page gives: the accounts are read through
 * `/api/console/users` rather than here, because the API access token is renewed
 * when it is close to expiry and only a route handler can write the cookie that
 * renewal sets.
 *
 * The subtitle names what the screen is, not what it found. Whether there are
 * accounts, and how many, is in the list below and comes from the API.
 */
export default async function UsersPage() {
  const session = await readSession();
  if (session === null) redirect("/login");

  return (
    <>
      <ConsoleTopbar
        title="Users"
        subtitle="Every account the API knows, and the state each one is in."
        actions={<SignOutButton csrf={session.csrf} />}
      />

      <UsersView />
    </>
  );
}
