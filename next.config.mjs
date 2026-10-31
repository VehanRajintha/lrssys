/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['sharp', 'exceljs'],
  experimental: {
    cpus: 1,
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
};

export default nextConfig;
