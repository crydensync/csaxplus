import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { ConfigAdvisorView } from "./advisor-view";

export const metadata: Metadata = { title: "Config Advisor" };

export default async function ConfigAdvisorPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Config Advisor"
        subtitle="Recommendations grounded in this deployment's recent audit history."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <ConfigAdvisorView />
    </>
  );
}
