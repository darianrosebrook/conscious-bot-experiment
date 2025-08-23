# Conscious Minecraft Bot - Dashboard

**Real-time monitoring interface for the conscious Minecraft bot**

A Next.js 15 dashboard that provides a media-style interface for monitoring the conscious bot's cognitive processes, environment, and activities in real-time.

## Features

- **Real-time Cognitive Stream**: Live feed of the bot's thoughts, reflections, and intrusive thoughts
- **HUD (Heads-Up Display)**: Vital statistics including health, hunger, stamina, sleep, stress, focus, and curiosity
- **Task Management**: Current objectives with progress tracking and step-by-step breakdowns
- **Environment Monitoring**: World state including biome, weather, time, and nearby entities
- **Intrusive Thought Injection**: Ability to inject thoughts that appear as the bot's own
- **Memory Browser**: Episodic, semantic, and reflective memory display
- **Event Logging**: Real-time events from the Minecraft world
- **WebSocket Integration**: Live data streaming from backend services

## Architecture

The dashboard follows a microservices architecture with the following components:

- **Dashboard (Port 3000)**: Next.js 15 frontend with real-time UI
- **Cognition System (Port 3003)**: Inner loop processing and thought generation
- **World System (Port 3004)**: Environment and world state management
- **Minecraft Bot (Port 3005)**: Mineflayer agent with screenshot capture
- **Memory System (Port 3001)**: Vector/graph store for memories
- **Planning System (Port 3002)**: Task graph and hierarchical planning

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **State Management**: Zustand
- **Real-time**: WebSocket connections
- **Icons**: Lucide React
- **Build Tool**: Vite (via Next.js)

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm
- Access to the conscious-bot workspace

### Installation

```bash
# Navigate to the dashboard package
cd packages/dashboard

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The dashboard will be available at `http://localhost:3000`

### Development

```bash
# Type checking
pnpm type-check

# Linting
pnpm lint

# Build for production
pnpm build

# Start production server
pnpm start
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API route handlers
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main dashboard page
├── components/            # React components
│   ├── ui/               # shadcn/ui base components
│   ├── hud-meter.tsx     # HUD meter component
│   ├── section.tsx       # Section wrapper component
│   └── pill.tsx          # Pill/tag component
├── hooks/                # Custom React hooks
│   └── use-websocket.ts  # WebSocket connection hook
├── lib/                  # Utility functions
│   ├── api.ts           # API service functions
│   └── utils.ts         # General utilities
├── stores/              # State management
│   └── dashboard-store.ts # Zustand store
└── types/               # TypeScript type definitions
    └── index.ts         # All dashboard types
```

## Key Components

### Dashboard Layout

The dashboard uses a 3-column layout:
- **Left**: Task queue and planning information
- **Center**: Live stream and cognitive thought feed
- **Right**: Environment data, events, and memories

### HUD System

The HUD displays vital statistics with color-coded meters:
- **Green**: Optimal levels (80-100%)
- **Blue**: Good levels (60-79%)
- **Yellow**: Warning levels (40-59%)
- **Red**: Critical levels (0-39%)

### Intrusive Thoughts

Users can inject thoughts that appear seamlessly in the cognitive stream. These thoughts are not attributed as external, allowing the bot to process them as its own internal thoughts.

## API Endpoints

### Internal Services (Proxied)

- `POST /api/intrusive` → Cognition System (3003)
- `GET /api/world` → World System (3004)
- `GET /api/screenshots` → Minecraft Bot (3005)

### WebSocket Connections

- `ws://localhost:3000/api/ws/hud` → HUD updates
- `ws://localhost:3000/api/ws/cot` → Chain of Thought messages

## Configuration

### Environment Variables

Create a `.env.local` file for local development:

```env
# Development settings
NEXT_PUBLIC_WS_URL=ws://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Tailwind Configuration

Custom HUD colors are defined in `tailwind.config.ts`:

```typescript
hud: {
  health: "hsl(142, 76%, 36%)",    // emerald-600
  danger: "hsl(0, 84%, 60%)",      // red-500
  warning: "hsl(38, 92%, 50%)",    // amber-500
  safe: "hsl(199, 89%, 48%)",      // sky-500
  neutral: "hsl(240, 5%, 34%)",    // zinc-600
}
```

## Development Guidelines

### Code Style

- Use TypeScript for all components and functions
- Follow the established component patterns
- Use JSDoc comments for complex functions
- Prefer functional components with hooks

### State Management

- Use Zustand for global state
- Keep component state local when possible
- Use React Query for server state (if needed)

### Styling

- Use Tailwind CSS classes
- Leverage shadcn/ui components
- Follow the established design system
- Use CSS variables for theming

### Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Deployment

### Production Build

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

### Docker Deployment

```dockerfile
FROM node:18-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Production image
FROM base AS runner
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failed**
   - Ensure backend services are running
   - Check firewall settings
   - Verify WebSocket URLs in configuration

2. **API Routes Not Working**
   - Check if internal services are accessible
   - Verify port configurations
   - Check network connectivity

3. **Build Errors**
   - Clear `.next` directory: `rm -rf .next`
   - Reinstall dependencies: `pnpm install`
   - Check TypeScript errors: `pnpm type-check`

### Debug Mode

Enable debug logging by setting the environment variable:

```env
DEBUG=dashboard:*
```

## Contributing

1. Follow the established code patterns
2. Add tests for new features
3. Update documentation as needed
4. Use conventional commit messages

## License

Part of the Conscious Minecraft Bot project.

---

**Author**: @darianrosebrook
