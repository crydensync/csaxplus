import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { AuditView } from "./audit-view";

export const metadata: Metadata = { title: "Audit Log" };

export default async function AuditPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Audit Log"
        subtitle="Search recorded authentication and admin events. Export the filtered history as CSV."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <AuditView />
    </>
  );
}
