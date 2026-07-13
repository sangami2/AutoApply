/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true,
  },
  webpack: (config) => {
    config.externals.push('canvas', 'jsdom');
    return config;
  },
};

export default nextConfig;
