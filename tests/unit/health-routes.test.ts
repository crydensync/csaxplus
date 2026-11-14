import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/server/db", () => ({
  getConsoleStore: () => ({ driver: { query } }),
}));

import { GET as health } from "@/app/healthz/route";
import { GET as ready } from "@/app/readyz/route";

describe("health probes", () => {
  beforeEach(() => query.mockReset());

  it("reports process liveness without reading the database", async () => {
    const response = health();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(query).not.toHaveBeenCalled();
  });

  it("reports readiness only after the console store answers", async () => {
    query.mockResolvedValueOnce([{ ready: 1 }]);

    const response = await ready();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    expect(query).toHaveBeenCalledWith("select 1 as ready");
  });

  it("returns a non-sensitive 503 when the store cannot answer", async () => {
    query.mockRejectedValueOnce(new Error("private connection detail"));

    const response = await ready();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not_ready" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
