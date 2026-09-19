/** @type {import('next').NextConfig} */
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now().toString(36)}`;

const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  // PGlite loads its WASM and data files from its own package directory.
  serverExternalPackages: ["@electric-sql/pglite"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
