/** @type {import('next').NextConfig} */
export default {
  transpilePackages: [
    "@buildapps/core",
    "@buildapps/lessons",
    "@buildapps/server",
    "@buildapps/api-client",
  ],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true }, // linting runs at the repo root (pnpm lint)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
