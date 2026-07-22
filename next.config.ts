import type { NextConfig } from "next";

const isVercel = process.env.VERCEL === "1";

const pdfTracingGlobs = [
  "node_modules/pdfjs-dist/**/*",
  "node_modules/@napi-rs/canvas/**/*",
];

const nextConfig: NextConfig = {
  // Standalone is for Docker/Cloud Run. On Vercel it packages pnpm symlinks into
  // Serverless Functions and can fail with an invalid deployment package.
  ...(isVercel ? {} : { output: "standalone" as const }),
  // PDF.js resolves its Node fake-worker relative to its own ESM module. If
  // Turbopack bundles it, that relative worker file is not emitted next to the
  // generated server chunk and every document fails while opening.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // Only the private-web job routes need the full PDF.js package tree.
  outputFileTracingIncludes: {
    "/api/jobs/search-private-web": pdfTracingGlobs,
    "/api/jobs/search-grounding": pdfTracingGlobs,
  },
  // Drop unused native canvas binaries from the function package.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@napi-rs/canvas-android-*/**",
      "node_modules/@napi-rs/canvas-darwin-*/**",
      "node_modules/@napi-rs/canvas-win32-*/**",
      "node_modules/@napi-rs/canvas-linux-arm*/**",
      "node_modules/@napi-rs/canvas-linux-riscv64*/**",
    ],
  },
};

export default nextConfig;
