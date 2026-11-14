/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorState } from "@/components/states";
import { NOT_IMPLEMENTED_ON_SQLITE } from "@/lib/dashboard";

describe("SQLite admin failures", () => {
  it("render as a deployment state without a retry action", () => {
    const markup = renderToStaticMarkup(
      <ErrorState
        title="Users did not load"
        description="raw API failure"
        code={NOT_IMPLEMENTED_ON_SQLITE}
        onRetry={() => undefined}
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("This console section requires PostgreSQL");
    expect(markup).toContain("Postgres-only");
    expect(markup).not.toContain('role="alert"');
    expect(markup).not.toContain("Try again");
    expect(markup).not.toContain("raw API failure");
  });
});
