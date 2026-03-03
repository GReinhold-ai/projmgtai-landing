/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase serverless function timeout for large PDF processing
  // Works on Vercel Pro tier and self-hosted
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // API route timeout: 5 minutes for large plan sets
  serverRuntimeConfig: {
    maxDuration: 300,
  },
};

module.exports = nextConfig;
