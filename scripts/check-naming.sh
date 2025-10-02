#!/usr/bin/env bash
set -euo pipefail

# Disallow in filenames:
if find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.mjs" -o -name "*.cjs" -o -name "*.mts" -o -name "*.cts" | grep -v node_modules | grep -v dist | grep -v stryker-tmp | grep -E '(?i)(enhanced|unified|better|new|next|final|copy|revamp|improved)'; then
  echo "❌ Disallowed token found in filenames."
  exit 2
fi

echo "✅ File naming passes."
