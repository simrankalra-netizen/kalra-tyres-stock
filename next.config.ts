import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The local database runs from files on disk, so Next.js must not bundle it.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
