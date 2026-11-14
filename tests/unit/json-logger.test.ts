import { describe, expect, it } from "vitest";

import { serializeLog } from "@/server/logging/json";

describe("structured process logs", () => {
  it("serializes one JSON object per line with stable fields", () => {
    const line = serializeLog("info", "console store ready", { dialect: "sqlite" }, new Date(0));

    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual({
      dialect: "sqlite",
      timestamp: "1970-01-01T00:00:00.000Z",
      level: "info",
      message: "console store ready",
    });
  });
});
