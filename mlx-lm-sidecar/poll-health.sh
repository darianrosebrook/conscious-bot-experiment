#!/usr/bin/env bash
# Poll GET /health until 200. Run in a second terminal while the sidecar starts in another.
# Usage: ./poll-health.sh [port]
# Example: ./poll-health.sh 5002

set -euo pipefail
PORT="${1:-5002}"
URL="http://localhost:${PORT}/health"
echo "Polling ${URL} until 200..."
while true; do
  if res=$(curl -sS -w "\n%{http_code}" "$URL" 2>/dev/null); then
    code=$(echo "$res" | tail -n1)
    body=$(echo "$res" | sed '$d')
    echo "$(date +%H:%M:%S) HTTP ${code} ${body}"
    if [[ "$code" == "200" ]]; then
      echo "Ready."
      exit 0
    fi
  else
    echo "$(date +%H:%M:%S) connection refused"
  fi
  sleep 2
done
