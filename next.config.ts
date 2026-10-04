import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  // Next refuses a dev-server request whose Host is not this list, which is what
  // makes `next dev` reachable from another device on the network. Development
  // only; it has no effect on a production build. The e2e suite itself uses
  // localhost, because the route handlers accept only WEBAUTHN_ORIGIN.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
