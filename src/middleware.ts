import { NextResponse, type NextRequest } from "next/server";

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes));
}

function contentSecurityPolicy(value: string): string {
  const development = process.env.NODE_ENV !== "production";
  const scripts = ["'self'", `'nonce-${value}'`, "'strict-dynamic'"];
  const connections = ["'self'"];
  const apiUrl = process.env.CSAX_API_URL;
  if (apiUrl !== undefined) {
    try {
      connections.push(new URL(apiUrl).origin);
    } catch {
      // Configuration validation reports an invalid API URL during boot. Do
      // not broaden connect-src while that deployment is being corrected.
    }
  }
  if (development) {
    scripts.push("'unsafe-eval'");
    connections.push("ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*");
  }

  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connections.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const requestNonce = nonce();
  const csp = contentSecurityPolicy(requestNonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", requestNonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self)",
  );
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
