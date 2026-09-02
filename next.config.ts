import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No remote images are ever loaded: rows are text only, and the ingestion
  // layer never extracts media from feeds. Nothing to configure here.
};

export default nextConfig;
