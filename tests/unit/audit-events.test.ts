import { describe, expect, it } from "vitest";

import { auditEventTone } from "@/lib/audit-events";

describe("audit event colors", () => {
  it("colors console authentication and vault actions as successful events", () => {
    for (const action of [
      "operator_login",
      "operator_logout",
      "secret_reveal",
      "secret_copy",
      "secret_create",
      "secret_update",
      "secret_delete",
      "secret_key_rotation",
    ]) {
      expect(auditEventTone(action)).toBe("ok");
    }
  });

  it("leaves unknown console activity types neutral", () => {
    expect(auditEventTone("custom_host_action")).toBe("neutral");
  });
});
