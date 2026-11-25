import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { EmailView } from "./email-view";

export const metadata: Metadata = {
  title: "Email & Magic Link",
};

export default async function EmailPageRoute() {
  const session = await readSession();
  if (session === null) redirect("/login");

  return (
    <>
      <ConsoleTopbar
        title="Email & Magic Link"
        subtitle="Email events and CSAG API template samples; product delivery belongs to the host application."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <EmailView />
    </>
  );
}
