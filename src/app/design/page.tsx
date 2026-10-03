import { notFound } from "next/navigation";

import { DesignGallery } from "./gallery";

/**
 * Dev-only preview of the design system. It exists so every component can be
 * looked at in every state, and so the e2e suite has a stable page to check
 * keyboard behaviour against. It is not shipped: in a production build the
 * route answers 404.
 */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignGallery />;
}
