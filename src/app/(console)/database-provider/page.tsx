import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";
import { AIWorkInProgress } from "@/components/AIWorkInProgress";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";

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
      <AIWorkInProgress />
    </>
  );
}
