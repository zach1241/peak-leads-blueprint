import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep local-stack development artifacts separate from hosted development.
  distDir: process.env.PEAK_LOCAL_STACK === "1" ? ".next-local" : ".next",
};

export default nextConfig;
