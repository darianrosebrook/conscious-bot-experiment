#!/bin/bash

# Cleanup script for minecraft-interface package
# Removes unnecessary test, demo, and build artifact files
# @author @darianrosebrook

set -e

echo "🧹 Starting cleanup of minecraft-interface package..."

# Create backup directory
BACKUP_DIR="backup-$(date +%Y%m%d-%H%M%S)"
echo "📦 Creating backup in $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Function to backup and remove files
backup_and_remove() {
    local file="$1"
    if [ -e "$file" ]; then
        echo "🗑️  Removing: $file"
        mkdir -p "$BACKUP_DIR/$(dirname "$file")"
        mv "$file" "$BACKUP_DIR/$file"
    fi
}

# Function to backup and remove directories
backup_and_remove_dir() {
    local dir="$1"
    if [ -d "$dir" ]; then
        echo "🗑️  Removing directory: $dir"
        mkdir -p "$BACKUP_DIR/$(dirname "$dir")"
        mv "$dir" "$BACKUP_DIR/$dir"
    fi
}

# 1. Remove root-level test files
echo "📋 Removing root-level test files..."
backup_and_remove "test-comprehensive-e2e.ts"
backup_and_remove "test-e2e.ts"
backup_and_remove "test-integration-verification.ts"
backup_and_remove "test-minecraft-integration-readiness.ts"
backup_and_remove "test-pathfinder-import.ts"
backup_and_remove "test-real-leaves.ts"
backup_and_remove "test-real-minecraft-readiness.ts"
backup_and_remove "test-registration-fix.ts"
backup_and_remove "test-comprehensive-fixes.ts"
backup_and_remove "test-core-integration.ts"

# 2. Remove unnecessary bin test files (keep main CLI tools)
echo "📋 Removing unnecessary bin test files..."
backup_and_remove "bin/test-manual.ts"
backup_and_remove "bin/test-crafting-grid-simple.ts"
backup_and_remove "bin/test-crafting-grid.ts"
backup_and_remove "bin/test-crafting-grid-advanced.ts"
backup_and_remove "bin/demo-crafting-grid.ts"
backup_and_remove "bin/memory-versioning-demo.ts"
backup_and_remove "bin/test-connection-simple.ts"
backup_and_remove "bin/test-bot.ts"
backup_and_remove "bin/test-crafting-comprehensive.ts"
backup_and_remove "bin/mc-integration-test.ts"
backup_and_remove "bin/test-curl.sh"
backup_and_remove "bin/enhanced-viewer-demo.html"

# 3. Remove demo and example directories
echo "📋 Removing demo and example directories..."
backup_and_remove_dir "demo"
backup_and_remove_dir "src/demo"
backup_and_remove_dir "src/examples"

# 4. Remove build artifacts and redundant configs
echo "📋 Removing build artifacts and redundant configs..."
backup_and_remove_dir "dist-simple"
backup_and_remove "package-simple.json"

# 5. Remove world and bluemap directories (unless actively used)
echo "📋 Removing world and bluemap directories..."
backup_and_remove_dir "world"
backup_and_remove_dir "bluemap"

# 6. Remove scenarios directory (appears to be test scenarios)
echo "📋 Removing scenarios directory..."
backup_and_remove_dir "scenarios"

# 7. Remove docs directory (documentation can be moved to main docs)
echo "📋 Removing docs directory..."
backup_and_remove_dir "docs"

# Summary
echo ""
echo "✅ Cleanup completed!"
echo "📦 Backup created in: $BACKUP_DIR"
echo ""
echo "📊 Files removed:"
echo "   - 10 root-level test files"
echo "   - 12 bin test files"
echo "   - 3 demo/example directories"
echo "   - 1 build artifact directory"
echo "   - 1 redundant config file"
echo "   - 2 world/bluemap directories"
echo "   - 1 scenarios directory"
echo "   - 1 docs directory"
echo ""
echo "🔍 Remaining core files:"
echo "   - src/ (core source files)"
echo "   - bin/mc-*.ts (main CLI tools)"
echo "   - package.json, tsconfig.json, vitest.config.mjs"
echo "   - __tests__/ (proper test suite)"
echo ""
echo "💡 To restore files if needed: mv $BACKUP_DIR/* ."
