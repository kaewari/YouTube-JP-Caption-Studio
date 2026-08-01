import type { NextConfig } from "next";

const isExt = process.env.EXTENSION_BUILD === "1";

const nextConfig: NextConfig = {
  // Extension popup needs a static `out/` tree; localhost uses `next dev` / standalone.
  output: isExt ? "export" : "standalone",
  assetPrefix: isExt ? "." : undefined,
  images: { unoptimized: true },
  // Avoid picking up parent lockfiles outside this app
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
