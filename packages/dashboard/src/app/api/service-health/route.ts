import { NextResponse } from 'next/server';

/**
 * Service Health API
 * Pings all services in parallel to check connectivity.
 *
 * @author @darianrosebrook
 */

interface ServiceDef {
  name: string;
  url: string;
}

const SERVICES: ServiceDef[] = [
  { name: 'minecraft', url: process.env.MINECRAFT_ENDPOINT || 'http://localhost:3005' },
  { name: 'cognition', url: process.env.COGNITION_SERVICE_URL || 'http://localhost:3003' },
  { name: 'planning', url: process.env.PLANNING_SERVICE_URL || 'http://localhost:3002' },
  { name: 'memory', url: process.env.MEMORY_SERVICE_URL || 'http://localhost:3001' },
  { name: 'world', url: process.env.WORLD_SERVICE_URL || 'http://localhost:3004' },
];

export async function GET() {
  const timeoutMs = 2000;

  const results = await Promise.all(
    SERVICES.map(async (svc) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(`${svc.url}/health`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        clearTimeout(timeoutId);
        return { name: svc.name, status: res.ok ? ('up' as const) : ('down' as const) };
      } catch {
        return { name: svc.name, status: 'down' as const };
      }
    })
  );

  return NextResponse.json({
    services: results,
    timestamp: Date.now(),
  });
}
