import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

describe("security middleware", () => {
  it("sets a per-request CSP nonce and baseline browser headers", () => {
    const response = middleware(new NextRequest("http://localhost:3000/dashboard"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("'nonce-");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("uses a distinct nonce for each request", () => {
    const first = middleware(new NextRequest("http://localhost:3000/"));
    const second = middleware(new NextRequest("http://localhost:3000/"));

    const nonce = (response: Response) =>
      response.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce(first)).toBeTruthy();
    expect(nonce(second)).toBeTruthy();
    expect(nonce(first)).not.toBe(nonce(second));
  });
});
