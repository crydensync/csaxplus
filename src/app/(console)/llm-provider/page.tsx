import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";
import { AIWorkInProgress } from "@/components/AIWorkInProgress";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";

export const metadata: Metadata = { title: "LLM Provider" };

export default async function LLMProviderPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="LLM Provider"
        subtitle="Encrypted provider settings used by CSAG's AI features."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <AIWorkInProgress />
    </>
  );
}
