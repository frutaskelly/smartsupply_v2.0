import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output → small runtime image; `next build && next start`
  // is the supported production path (v1 regression we are NOT repeating).
  output: "standalone",

  // v2: the build is a REAL gate. TypeScript errors fail the build (the
  // opposite of v1's `ignoreBuildErrors: true`). Next 16 removed `next lint`
  // and the `eslint` config key, so linting is configured separately later.
  allowedDevOrigins: ["localhost:3012", "127.0.0.1"],
};

export default nextConfig;
