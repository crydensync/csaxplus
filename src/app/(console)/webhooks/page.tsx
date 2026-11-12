import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { WebhooksView } from "./webhooks-view";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Webhooks"
        subtitle="Manage the runtime destination and inspect CSAG delivery attempts."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <WebhooksView />
    </>
  );
}
