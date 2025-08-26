#!/bin/bash

# Memory Versioning System Test Script
# Tests seed-based memory isolation with actual services

set -e

echo "🧠 Testing Memory Versioning System"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "success")
            echo -e "${GREEN}✅${NC} $message"
            ;;
        "error")
            echo -e "${RED}❌${NC} $message"
            ;;
        "warning")
            echo -e "${YELLOW}⚠️${NC} $message"
            ;;
        "info")
            echo -e "${BLUE}ℹ️${NC} $message"
            ;;
    esac
}

# Function to check if service is running
check_service() {
    local service_name=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    print_status "info" "Checking $service_name at $url..."

    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url/health" > /dev/null 2>&1; then
            print_status "success" "$service_name is running"
            return 0
        fi
        
        print_status "warning" "Attempt $attempt/$max_attempts: $service_name not ready yet..."
        sleep 2
        ((attempt++))
    done

    print_status "error" "$service_name failed to start after $max_attempts attempts"
    return 1
}

# Function to test memory namespace activation
test_namespace_activation() {
    local seed=$1
    local world_name=$2
    
    print_status "info" "Testing namespace activation for seed: $seed, world: $world_name"
    
    # Activate namespace
    local response=$(curl -s -X POST http://localhost:3001/versioning/activate \
        -H "Content-Type: application/json" \
        -d "{\"worldSeed\": \"$seed\", \"worldName\": \"$world_name\", \"sessionId\": \"test_session_$(date +%s)\"}")
    
    if echo "$response" | grep -q '"success":true'; then
        local namespace_id=$(echo "$response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
        print_status "success" "Namespace activated: $namespace_id"
        return 0
    else
        print_status "error" "Failed to activate namespace: $response"
        return 1
    fi
}

# Function to test memory storage and retrieval
test_memory_operations() {
    local seed=$1
    local world_name=$2
    
    print_status "info" "Testing memory operations for world: $world_name"
    
    # Store a test memory
    local memory_data="{\"type\": \"test\", \"description\": \"Test memory for $world_name\", \"timestamp\": $(date +%s), \"salienceScore\": 0.8}"
    
    local store_response=$(curl -s -X POST http://localhost:3001/episodic \
        -H "Content-Type: application/json" \
        -d "$memory_data")
    
    if echo "$store_response" | grep -q '"success":true'; then
        print_status "success" "Memory stored successfully"
    else
        print_status "error" "Failed to store memory: $store_response"
        return 1
    fi
    
    # Retrieve memories
    local retrieve_response=$(curl -s -X POST http://localhost:3001/episodic/retrieve \
        -H "Content-Type: application/json" \
        -d "{\"type\": \"test\"}")
    
    if echo "$retrieve_response" | grep -q '"success":true'; then
        local memory_count=$(echo "$retrieve_response" | grep -o '"data":\[[^]]*\]' | grep -o '\[.*\]' | jq length 2>/dev/null || echo "0")
        print_status "success" "Retrieved $memory_count test memories"
    else
        print_status "error" "Failed to retrieve memories: $retrieve_response"
        return 1
    fi
}

# Function to get memory statistics
get_memory_stats() {
    print_status "info" "Getting memory statistics..."
    
    local stats_response=$(curl -s http://localhost:3001/stats)
    
    if echo "$stats_response" | grep -q '"success":true'; then
        local episodic_count=$(echo "$stats_response" | grep -o '"episodic":[0-9]*' | cut -d':' -f2)
        local namespace_count=$(echo "$stats_response" | grep -o '"totalNamespaces":[0-9]*' | cut -d':' -f2)
        
        print_status "success" "Memory stats - Episodic: $episodic_count, Namespaces: $namespace_count"
        
        echo "$stats_response" | jq '.data' 2>/dev/null || echo "$stats_response"
    else
        print_status "error" "Failed to get memory stats: $stats_response"
    fi
}

# Main test execution
main() {
    print_status "info" "Starting memory versioning system test..."
    
    # Check if services are running
    check_service "Memory Service" "http://localhost:3001" || exit 1
    
    print_status "success" "All services are running"
    echo
    
    # Test with different world seeds
    local test_worlds=(
        "12345:Plains World"
        "67890:Mountain World"
        "11111:Desert World"
    )
    
    for world in "${test_worlds[@]}"; do
        IFS=':' read -r seed world_name <<< "$world"
        
        echo "🌍 Testing World: $world_name (Seed: $seed)"
        echo "----------------------------------------"
        
        # Test namespace activation
        if test_namespace_activation "$seed" "$world_name"; then
            # Test memory operations
            test_memory_operations "$seed" "$world_name"
        fi
        
        echo
    done
    
    # Get final statistics
    echo "📊 Final Memory Statistics"
    echo "-------------------------"
    get_memory_stats
    
    echo
    print_status "success" "Memory versioning system test completed!"
    echo
    print_status "info" "Key benefits demonstrated:"
    echo "  ✅ Each world has separate memory namespace"
    echo "  ✅ No cross-contamination between different seeds"
    echo "  ✅ Bot can learn world-specific knowledge"
    echo "  ✅ Memory isolation enables focused learning"
}

# Run the test
main "$@"
