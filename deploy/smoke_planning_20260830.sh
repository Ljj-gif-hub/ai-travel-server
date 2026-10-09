#!/bin/bash
set -euo pipefail
echo "=== dist mtime ==="
ls -la --time-style=+%Y%m%d-%H%M /opt/bundle/trval-h5/dist/index.html

echo "=== nginx home ==="
curl -s -o /dev/null -w "root HTTP %{http_code} type=%{content_type}\n" http://127.0.0.1/

echo "=== public IP home ==="
curl -s -o /dev/null -w "public HTTP %{http_code}\n" http://8.148.223.54/

echo "=== app health ==="
curl -sf http://127.0.0.1/actuator/health
echo

echo "=== index js assets ==="
curl -s http://127.0.0.1/ | grep -oE '/assets/[^"]+\.js' | head -8

echo "=== zh copy in dist ==="
grep -l '正在查询' /opt/bundle/trval-h5/dist/assets/*.js | head || true

echo "=== AgentMapView via nginx ==="
B=$(basename "$(ls /opt/bundle/trval-h5/dist/assets/AgentMapView-*.js | head -1)")
curl -s -o /dev/null -w "${B} HTTP %{http_code} size=%{size_download}\n" "http://127.0.0.1/assets/${B}"

echo "=== agent container healthy ==="
docker inspect travel-java-agent-service-1 --format 'Status={{.State.Status}} Health={{.State.Health.Status}}'
echo SMOKE_OK
