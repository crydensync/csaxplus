import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { readSession } from "@/server/auth/guard";

/**
 * Everything inside this group needs a signed-in operator.
 *
 * The check is here rather than in each page, so a screen added later cannot be
 * left open by forgetting a line. Reading the session is all this does: a
 * component cannot set a cookie, so a token close to expiry is renewed by the
 * first call the screen makes through a route handler.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  if ((await readSession()) === null) redirect("/login");
  return <>{children}</>;
}
