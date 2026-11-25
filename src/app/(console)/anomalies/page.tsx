import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { AnomaliesView } from "./anomalies-view";

export const metadata: Metadata = { title: "Anomalies" };

export default async function AnomaliesPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Anomalies"
        subtitle="Review flagged logins and credential-stuffing events. Reviews record your judgement; they do not block sign-ins."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <AnomaliesView csrf={session.csrf} />
    </>
  );
}
