#!/bin/bash

# Conscious Bot Development Environment Startup Script
# Starts all necessary services for the conscious bot system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Service ports
DASHBOARD_PORT=3000
MINECRAFT_PORT=3005
MINECRAFT_VIEWER_PORT=3006
COGNITION_PORT=3003
MEMORY_PORT=3001
WORLD_PORT=3004
PLANNING_PORT=3002

echo -e "${BLUE} Conscious Bot Development Environment${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Function to check if a port is available
check_port() {
    local port=$1
    local service=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED} Port $port is already in use by another process${NC}"
        echo -e "${YELLOW}   Please stop the process using port $port and try again${NC}"
        exit 1
    fi
}

# Function to wait for a service to be ready
wait_for_service() {
    local url=$1
    local service=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${YELLOW} Waiting for $service to be ready...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            echo -e "${GREEN} $service is ready!${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}   Attempt $attempt/$max_attempts - $service not ready yet...${NC}"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED} $service failed to start within expected time${NC}"
    return 1
}

# Check if required ports are available
echo -e "${CYAN} Checking port availability...${NC}"
check_port $DASHBOARD_PORT "Dashboard"
check_port $MINECRAFT_PORT "Minecraft Bot"
check_port $MINECRAFT_VIEWER_PORT "Minecraft Viewer"
check_port $COGNITION_PORT "Cognition"
check_port $MEMORY_PORT "Memory"
check_port $WORLD_PORT "World"
check_port $PLANNING_PORT "Planning"
echo -e "${GREEN} All ports are available${NC}"
echo ""

# Install dependencies if needed
echo -e "${CYAN} Installing dependencies...${NC}"
pnpm install
echo -e "${GREEN} Dependencies installed${NC}"
echo ""

# Build packages if needed
echo -e "${CYAN} Building packages...${NC}"
pnpm build
echo -e "${GREEN} Packages built${NC}"
echo ""

# Start all services
echo -e "${CYAN} Starting all services...${NC}"
echo ""

# Start services in background
echo -e "${PURPLE} Starting Dashboard (port $DASHBOARD_PORT)...${NC}"
pnpm --filter @conscious-bot/dashboard dev &
DASHBOARD_PID=$!

echo -e "${PURPLE} Starting Minecraft Bot (port $MINECRAFT_PORT)...${NC}"
pnpm --filter @conscious-bot/minecraft-interface run dev:server &
MINECRAFT_PID=$!

echo -e "${PURPLE} Starting Cognition (port $COGNITION_PORT)...${NC}"
pnpm --filter @conscious-bot/cognition run dev:server &
COGNITION_PID=$!

echo -e "${PURPLE} Starting Memory (port $MEMORY_PORT)...${NC}"
pnpm --filter @conscious-bot/memory run dev:server &
MEMORY_PID=$!

echo -e "${PURPLE} Starting World (port $WORLD_PORT)...${NC}"
pnpm --filter @conscious-bot/world run dev:server &
WORLD_PID=$!

echo -e "${PURPLE} Starting Planning (port $PLANNING_PORT)...${NC}"
pnpm --filter @conscious-bot/planning run dev:server &
PLANNING_PID=$!

# Wait a moment for services to start
sleep 5

# Check if services are ready
echo ""
echo -e "${CYAN} Checking service status...${NC}"

# Wait for services to be ready
wait_for_service "http://localhost:$DASHBOARD_PORT" "Dashboard" &
wait_for_service "http://localhost:$MINECRAFT_PORT/health" "Minecraft Bot" &
wait_for_service "http://localhost:$COGNITION_PORT/health" "Cognition" &
wait_for_service "http://localhost:$MEMORY_PORT/health" "Memory" &
wait_for_service "http://localhost:$WORLD_PORT/health" "World" &
wait_for_service "http://localhost:$PLANNING_PORT/health" "Planning" &

# Wait for all background processes
wait

echo ""
echo -e "${GREEN} All services started successfully!${NC}"
echo ""
echo -e "${BLUE} Service URLs:${NC}"
echo -e "  ${CYAN}Dashboard:${NC}     http://localhost:$DASHBOARD_PORT"
echo -e "  ${CYAN}Minecraft Bot:${NC}  http://localhost:$MINECRAFT_PORT"
echo -e "  ${CYAN}Minecraft Viewer:${NC} http://localhost:$MINECRAFT_VIEWER_PORT"
echo -e "  ${CYAN}Cognition:${NC}      http://localhost:$COGNITION_PORT"
echo -e "  ${CYAN}Memory:${NC}         http://localhost:$MEMORY_PORT"
echo -e "  ${CYAN}World:${NC}          http://localhost:$WORLD_PORT"
echo -e "  ${CYAN}Planning:${NC}       http://localhost:$PLANNING_PORT"
echo ""
echo -e "${YELLOW} To connect the bot to Minecraft:${NC}"
echo -e "  curl -X POST http://localhost:$MINECRAFT_PORT/connect"
echo ""
echo -e "${YELLOW} To stop all services:${NC}"
echo -e "  Press Ctrl+C or run: pkill -f 'conscious-bot'"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW} Stopping all services...${NC}"
    
    # Kill all background processes
    kill $DASHBOARD_PID 2>/dev/null || true
    kill $MINECRAFT_PID 2>/dev/null || true
    kill $COGNITION_PID 2>/dev/null || true
    kill $MEMORY_PID 2>/dev/null || true
    kill $WORLD_PID 2>/dev/null || true
    kill $PLANNING_PID 2>/dev/null || true
    
    echo -e "${GREEN} All services stopped${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Keep the script running
echo -e "${GREEN} Services are running. Press Ctrl+C to stop.${NC}"
while true; do
    sleep 1
done
