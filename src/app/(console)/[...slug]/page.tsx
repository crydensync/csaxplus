import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Card } from "@/components/Card";
import { EmptyState } from "@/components/states";
import { IconTemplate } from "@/components/icons";
import { NAV_GROUPS } from "@/lib/nav";

import { ConsoleTopbar } from "../console-topbar";

export const metadata: Metadata = {
  title: "Not built yet",
};

/** The label for every route the sidebar links to, so a gap can be named. */
const NAV_LABELS = new Map(
  NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.href, item.label] as const)),
);

/**
 * A sidebar link is a promise that the route exists. This keeps the console
 * honest about the ones that are still coming: the entry stays in the
 * navigation, and following it says plainly that the screen is not built yet
 * rather than dropping the operator on a 404 that looks like a broken console.
 *
 * A path that is not one of the navigation's routes is a real 404. Without that
 * check this catch-all would answer "not built yet" to a typo, which would be a
 * different and worse kind of untrue.
 *
 * Each tier deletes nothing here: the first page that adds its own route under
 * `(console)` takes precedence over this one automatically.
 */
export default async function NotBuiltYetPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = `/${slug.join("/")}`;
  const label = NAV_LABELS.get(path);
  if (label === undefined) notFound();

  return (
    <>
      <ConsoleTopbar
        title={label}
        subtitle="Listed in the navigation because the route is real. The screen arrives in a later tier."
      />

      <div className="view anim">
        <Card>
          <EmptyState
            icon={<IconTemplate />}
            title={`${label} is not built yet`}
            description={`The route ${path} is reserved for this screen. Nothing is shown here rather than sample data, so that what the console does show can be trusted.`}
          />
        </Card>
      </div>
    </>
  );
}
