import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { LLMProviderView } from "./provider-view";

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
      <LLMProviderView />
    </>
  );
}
