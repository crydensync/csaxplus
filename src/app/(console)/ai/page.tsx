import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";
import { AIWorkInProgress } from "@/components/AIWorkInProgress";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function AssistantPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="AI Assistant"
        subtitle="Ask about your own account or run a read-only query across admin data."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <AIWorkInProgress />
    </>
  );
}
