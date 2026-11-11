import type { NextConfig } from "next";

// The UI is exported as plain static files (web/out) that the local Python server hosts.
// The finished app is therefore one local process: no Node.js and no network at runtime.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
