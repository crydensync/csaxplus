import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { JWTClaimsView } from "./jwt-claims-view";

export const metadata: Metadata = { title: "JWT Claims" };

export default async function JWTClaimsPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="JWT Claims"
        subtitle="Map CSAG user data into additional claims on newly issued access tokens."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <JWTClaimsView csrf={session.csrf} />
    </>
  );
}
