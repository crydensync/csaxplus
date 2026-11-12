import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { DatabaseProviderView } from "./provider-view";

export const metadata: Metadata = { title: "Database Provider" };

export default async function DatabaseProviderPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Database Provider"
        subtitle="Read-only database settings for AI-assisted queries."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <DatabaseProviderView />
    </>
  );
}
