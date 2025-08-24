/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Minecraft Wiki CDN (primary sprite source)
      {
        protocol: 'https',
        hostname: 'static.wikia.nocookie.net',
        port: '',
        pathname: '/minecraft_gamepedia/images/**',
      },
      // PrismarineJS Minecraft Data (fallback)
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        port: '',
        pathname: '/PrismarineJS/minecraft-data/**',
      },
      // Mojang Assets CDN (official Minecraft assets)
      {
        protocol: 'https',
        hostname: 'assets.mojang.com',
        port: '',
        pathname: '/content-assets/**',
      },
    ],
  },
  async rewrites() {
    return [
      // Proxy WebSocket connections to internal services
      {
        source: '/api/ws/:path*',
        destination: 'http://localhost:3003/ws/:path*',
      },
      // Proxy API routes to internal services
      {
        source: '/api/intrusive',
        destination: 'http://localhost:3003/intrusive',
      },
      {
        source: '/api/world',
        destination: 'http://localhost:3004/snapshot',
      },
      {
        source: '/api/screenshots',
        destination: 'http://localhost:3005/screenshots',
      },
    ];
  },
};

module.exports = nextConfig;
