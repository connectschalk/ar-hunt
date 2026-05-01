import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/ar-diagnostic",
        destination: "/dev/ar-diagnostic",
        permanent: false,
      },
      {
        source: "/ar-test",
        destination: "/dev/astronaut-test",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
