/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@dental-crm/shared'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
