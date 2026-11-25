import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";
import { sessionRole } from "@/server/auth/session";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { OperatorsView } from "./operators-view";

export const metadata: Metadata = { title: "Operators" };

export default async function OperatorsPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Operators"
        subtitle="Console access and roles reported by the authentication API."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <OperatorsView owner={sessionRole(session) === "owner"} csrf={session.csrf} />
    </>
  );
}
