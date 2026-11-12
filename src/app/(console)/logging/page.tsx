import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { LoggingView } from "./logging-view";

export const metadata: Metadata = { title: "Cloud Logging" };

export default async function LoggingPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Cloud Logging"
        subtitle="Configure CSAG's redacted log archive and inspect shipped events."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <LoggingView csrf={session.csrf} />
    </>
  );
}
