import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge sits exactly where the dock does. Demo builds want the
  // screen to themselves; nothing about the build itself changes.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
  turbopack: {
    // Pin the workspace root. A stray package-lock.json in the user's home
    // directory otherwise makes Turbopack infer the wrong root and warn.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
