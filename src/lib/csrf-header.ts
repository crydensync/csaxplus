/**
 * The header a browser echoes the session's CSRF token in.
 *
 * It lives on its own, with no imports, because both halves of the console need
 * the same spelling and neither can reach the other's module: the server's copy
 * sits next to a `node:crypto` import that must not enter a browser bundle, and
 * a client component's copy would be a second literal that could drift. This is
 * the one place it is written down.
 */
export const CSRF_HEADER = "x-csrf-token";
