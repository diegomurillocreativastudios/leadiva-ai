import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PDF.js resolves its Node fake-worker relative to its own ESM module. If
  // Turbopack bundles it, that relative worker file is not emitted next to the
  // generated server chunk and every document fails while opening.
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // The standalone file tracer cannot see PDF.js' dynamic fake-worker import.
  // Keep the external package intact so its ESM entrypoint and worker remain
  // siblings in the Node runtime.
  outputFileTracingIncludes: {
    "/*": ["node_modules/pdfjs-dist/**/*"],
  },
};

export default nextConfig;
