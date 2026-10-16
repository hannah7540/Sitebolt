import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-pdf", "pdfjs-dist"],
  serverExternalPackages: ["canvas", "@napi-rs/canvas", "xlsx"],
  outputFileTracingIncludes: {
    "/api/chat": ["./src/lib/ai/knowledge/system-guide.md"],
  },
  turbopack: {
    resolveAlias: {
      canvas: "./src/lib/empty-module.ts",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
