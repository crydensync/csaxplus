import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

describe("security middleware", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sets a per-request CSP nonce and baseline browser headers", () => {
    const response = middleware(new NextRequest("http://localhost:3000/dashboard"));
    const csp = response.headers.get("content-security-policy") ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("'nonce-");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("allows the configured API origin for the embedded Ask-AI client", () => {
    vi.stubEnv("CSAX_API_URL", "https://auth.example.test:8443");
    const response = middleware(new NextRequest("http://localhost:3000/"));

    expect(response.headers.get("content-security-policy")).toContain(
      "https://auth.example.test:8443",
    );
    expect(response.headers.get("content-security-policy")).toContain("http://localhost:*");
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
