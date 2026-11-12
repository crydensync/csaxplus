import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { SessionsView } from "./sessions-view";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Sessions"
        subtitle="Active sessions across every account on this deployment."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <SessionsView csrf={session.csrf} />
    </>
  );
}
