import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { LoggingView } from "./logging-view";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = { title: "Logs & Activity" };

export default async function LoggingPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Logs & Activity"
        subtitle="Inspect CSAG logs and the actions recorded by this console."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <ActivityView />
      <LoggingView csrf={session.csrf} />
    </>
  );
}
