import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { DatabaseView } from "./database-view";

export const metadata: Metadata = { title: "Database Inspector" };

export default async function DatabasePage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Database Inspector"
        subtitle="Read-only schema, migration history, and reviewed auth-table data."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <DatabaseView />
    </>
  );
}
