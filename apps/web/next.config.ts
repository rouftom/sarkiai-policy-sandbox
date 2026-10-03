import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Workspace packages ship TypeScript sources (main → src/index.ts).
  transpilePackages: ['@sps/ui', '@sps/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@sps/ui'],
  },
}

export default nextConfig
