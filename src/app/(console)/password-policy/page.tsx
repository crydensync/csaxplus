import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { PasswordPolicyView } from "./password-policy-view";

export const metadata: Metadata = {
  title: "Password Policy",
};

export default async function PasswordPolicyPage() {
  const session = await readSession();
  if (session === null) redirect("/login");

  return (
    <>
      <ConsoleTopbar
        title="Password Policy"
        subtitle="Manage the password rules CSAG applies to new and changed passwords."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <PasswordPolicyView csrf={session.csrf} />
    </>
  );
}
