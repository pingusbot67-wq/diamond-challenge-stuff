import type { NextConfig } from "next";

// A static site: `npm run build` writes plain files that the Pi (app.py) and
// the PC hub (hub.py) serve. No Node server is needed to run it.
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default config;
