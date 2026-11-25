import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { APIKeysView } from "./api-keys-view";

export const metadata: Metadata = { title: "API Keys" };

export default async function APIKeysPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="API Keys"
        subtitle="Manage machine credentials for your operator account. New keys are shown once."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <APIKeysView csrf={session.csrf} />
    </>
  );
}
