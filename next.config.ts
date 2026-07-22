import type { NextConfig } from "next";

const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  // Standalone is for Docker/Cloud Run. On Vercel it packages dependency trees
  // into Serverless Functions and can fail when native modules are present.
  ...(isVercel ? {} : { output: "standalone" as const }),
  // Keep PDF.js external so its Node entry and worker stay siblings at runtime.
  // With pnpm, use node-linker=hoisted so NFT does not copy broken .pnpm symlinks.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/jobs/search-private-web": [
      "node_modules/pdfjs-dist/**/*",
      "node_modules/@napi-rs/canvas/**/*",
    ],
    "/api/jobs/search-grounding": [
      "node_modules/pdfjs-dist/**/*",
      "node_modules/@napi-rs/canvas/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@napi-rs/canvas-android-*/**",
      "node_modules/@napi-rs/canvas-darwin-*/**",
      "node_modules/@napi-rs/canvas-win32-*/**",
      "node_modules/@napi-rs/canvas-linux-arm*/**",
      "node_modules/@napi-rs/canvas-linux-riscv64*/**",
      "node_modules/@napi-rs+canvas-android-*/**",
      "node_modules/@napi-rs+canvas-darwin-*/**",
      "node_modules/@napi-rs+canvas-win32-*/**",
      "node_modules/@napi-rs+canvas-linux-arm*/**",
      "node_modules/@napi-rs+canvas-linux-riscv64*/**",
    ],
  },
};

export default nextConfig;
