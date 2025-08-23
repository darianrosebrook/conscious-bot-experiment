/** @type {import('next').NextConfig} */
const nextConfig = {
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
