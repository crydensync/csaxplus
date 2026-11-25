import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";
import { sessionRole } from "@/server/auth/session";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { SettingsSecretsView } from "./settings-secrets-view";

export const metadata: Metadata = { title: "Settings & Secrets" };

export default async function SettingsPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Settings & Secrets"
        subtitle="See where deployment secrets come from and manage encrypted vault entries."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <SettingsSecretsView csrf={session.csrf} role={sessionRole(session)} />
    </>
  );
}
