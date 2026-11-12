import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { AssistantView } from "./assistant-view";

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
      <AssistantView csrf={session.csrf} />
    </>
  );
}
