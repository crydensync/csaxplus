import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AIWorkInProgress } from "@/components/AIWorkInProgress";

describe("AI maintenance notice", () => {
  it("explains the temporary lock without exposing any AI controls", () => {
    const markup = renderToStaticMarkup(<AIWorkInProgress />);

    expect(markup).toContain("AI features are being worked on");
    expect(markup).toContain("temporarily locked");
    expect(markup).toContain("Existing CSAG settings have not been changed");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<form");
  });
});
