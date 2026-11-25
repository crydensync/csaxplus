import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { readSession } from "@/server/auth/guard";
import { getConfig } from "@/server/config";

import { ConsoleTopbar } from "../console-topbar";
import { SignOutButton } from "../sign-out-button";
import { WidgetView } from "./widget-view";

export const metadata: Metadata = { title: "Ask-AI Widget" };

export default async function AskAIWidgetPage() {
  const session = await readSession();
  if (session === null) redirect("/login");
  return (
    <>
      <ConsoleTopbar
        title="Ask-AI Widget"
        subtitle="Configure the signed-in user’s AI widget and its allowed embedding sites."
        actions={<SignOutButton csrf={session.csrf} />}
      />
      <WidgetView apiBaseUrl={getConfig().api.url} csrf={session.csrf} />
    </>
  );
}
