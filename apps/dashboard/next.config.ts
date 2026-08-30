import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@billbistro/ui", "@billbistro/sdk"],
  reactStrictMode: true,
};
export default config;
