import type { NextConfig } from "next";

// Static export on purpose: the whole client is a SPA, so PocketBase can serve the
// built files from pb_public and the app and the API share one origin (no CORS).
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default config;
