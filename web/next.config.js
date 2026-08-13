/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Verification builds set NEXT_DIST_DIR (e.g. ".next-verify") so they never
  // overwrite the production .next directory that systemd serves.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

module.exports = nextConfig;
