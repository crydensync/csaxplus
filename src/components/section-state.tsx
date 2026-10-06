"use client";

import type { Section } from "@/server/cryden/section";

import { EmptyState, ErrorState } from "./states";

/** A title for a section that answered without data, chosen by why. */
function stateTitle(state: "unavailable" | "forbidden" | "empty"): string {
  if (state === "unavailable") return "Not available on this deployment";
  if (state === "forbidden") return "Refused by the API";
  return "Nothing to report";
}

/**
 * A section that did not answer with data, rendered where it sits.
 *
 * One component for both screens that read the API's admin surface, for the
 * reason `section.ts` gives for sharing the mapping itself: the difference
 * between a refusal and a fault is a fact about the API, and two renderings of
 * it would be two chances to describe it differently.
 *
 * `error` is the only state that is a fault, so it is the only one that gets an
 * alert and a retry. A refusal, an unconfigured report and an empty one were all
 * answered correctly, and announcing those as something going wrong would be the
 * console's mistake rather than the deployment's.
 */
export function SectionState({
  section,
  onRetry,
}: {
  section: Exclude<Section<unknown>, { state: "ok" }>;
  onRetry: () => void;
}) {
  if (section.state === "error") {
    return (
      <ErrorState
        bare
        description={section.detail}
        code={section.code ?? undefined}
        onRetry={onRetry}
      />
    );
  }
  return <EmptyState bare title={stateTitle(section.state)} description={section.detail} />;
}
