/**
 * Cookie reading and writing without a dependency.
 *
 * Route handlers here take a `Request` and return a `Response`, so cookies are
 * read from the header and written as `Set-Cookie` values. That keeps every
 * handler a plain function of its arguments: a test can call one with a
 * constructed `Request` and assert on the `Response`, with no request context to
 * stand up and no framework module to mock.
 *
 * No value here is ever a secret in plaintext: what these carry is already
 * sealed by `sealed.ts`.
 */

/**
 * The cookies a request presented, by name.
 *
 * A name that appears more than once is dropped rather than resolved. Browsers
 * are supposed to send the first, but a host that accepts a cookie set by a
 * subdomain can be made to send two, and the one that wins differs between
 * implementations. Since the only cookies this console trusts name a session or
 * a paused login, refusing an ambiguous request is the safe reading of it: the
 * caller simply looks signed out.
 */
export function parseCookieHeader(header: string | null | undefined): Map<string, string> {
  const jar = new Map<string, string>();
  if (header === null || header === undefined) return jar;

  const duplicated = new Set<string>();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    const name = part.slice(0, separator).trim();
    if (name === "") continue;

    if (jar.has(name)) {
      duplicated.add(name);
      continue;
    }
    jar.set(name, part.slice(separator + 1).trim());
  }

  for (const name of duplicated) jar.delete(name);
  return jar;
}

export type CookieAttributes = {
  path: string;
  maxAge: number;
  httpOnly: boolean;
  /** Only "lax" is supported. The console has no cross-site cookie flow. */
  sameSite: "lax";
  secure: boolean;
};

/** One `Set-Cookie` value. Values here are base64url and dots, so nothing is quoted or escaped. */
export function serializeCookie(name: string, value: string, attributes: CookieAttributes): string {
  const parts = [
    `${name}=${value}`,
    `Path=${attributes.path}`,
    `Max-Age=${attributes.maxAge}`,
    "SameSite=Lax",
  ];
  if (attributes.httpOnly) parts.push("HttpOnly");
  if (attributes.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Removes a cookie: same attributes, empty value, already expired. */
export function clearCookie(name: string, attributes: CookieAttributes): string {
  return serializeCookie(name, "", { ...attributes, maxAge: 0 });
}
