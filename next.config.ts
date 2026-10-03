import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  // The e2e suite reaches the dev server over 127.0.0.1 rather than localhost.
  // Development only; it has no effect on a production build.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
