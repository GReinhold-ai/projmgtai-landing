import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname, // force root to this app folder
  },
}

export default nextConfig
