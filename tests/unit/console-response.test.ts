import { describe, expect, it } from "vitest";

import { failureFrom } from "@/lib/console-response";

describe("console API failures", () => {
  it("explains a CSAG step-up lockout in operator language", () => {
    expect(
      failureFrom(
        {
          error: {
            code: "step_up_locked",
            message:
              "too many failed passkey confirmations; operator step-up is locked for 15 minutes",
          },
        },
        429,
      ),
    ).toEqual({
      code: "step_up_locked",
      message:
        "Repeated failed passkey confirmations temporarily locked sensitive actions. Try again in 15 minutes.",
    });
  });

  it("preserves other API failure codes and messages", () => {
    expect(
      failureFrom({ error: { code: "step_up_required", message: "confirm your passkey" } }, 403),
    ).toEqual({ code: "step_up_required", message: "confirm your passkey" });
  });
});
