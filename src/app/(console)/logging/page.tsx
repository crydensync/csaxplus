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
        subtitle="Recent redacted events recorded by CSAG's configured shipping sink."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <LoggingView />
    </>
  );
}
