import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * `/login`.
 *
 * A server component so that an operator who already has a session is sent
 * straight on rather than being asked to sign in again. It reads the cookie and
 * does nothing else: the form itself talks to the console's own endpoints.
 */
export default async function LoginPage() {
  if ((await readSession()) !== null) redirect("/dashboard");
  return <LoginForm />;
}
