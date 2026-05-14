import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',   // Produces a self-contained build for Docker
};

export default nextConfig;
