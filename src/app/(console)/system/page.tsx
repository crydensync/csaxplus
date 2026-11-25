import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { SystemView } from "./system-view";

export const metadata: Metadata = { title: "System Status" };

export default async function SystemPageRoute() {
  const session = await readSession();
  if (session === null) redirect("/login");

  return (
    <>
      <ConsoleTopbar
        title="System Status"
        subtitle="Authentication database counts, read-only diagnostics, and schema migrations."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <SystemView />
    </>
  );
}
