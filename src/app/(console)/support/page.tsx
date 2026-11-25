import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { SupportView } from "./support-view";

export const metadata: Metadata = { title: "Support Assistant" };

export default async function SupportPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Support Assistant"
        subtitle="Read-only login diagnosis from the account's recorded state and recent events."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <SupportView />
    </>
  );
}
