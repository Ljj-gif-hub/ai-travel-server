#!/bin/bash
# 2026-08-30: extract uploaded tarball, overwrite /opt/bundle sources, launch deploy.sh
set -euo pipefail

echo "=== tarball ==="
ls -lh /tmp/bundle_20260830.tgz

echo "=== server env must already exist ==="
# Agent 密钥由 travel-java/.env 注入 compose，服务器上没有 agent-service/.env
test -f /opt/bundle/travel-java/.env
ls -l /opt/bundle/travel-java/.env

echo "=== extract nested bundle ==="
rm -rf /opt/bundle/bundle
mkdir -p /opt/bundle
tar -xzf /tmp/bundle_20260830.tgz -C /opt/bundle
ls /opt/bundle/bundle
test -f /opt/bundle/bundle/trval-h5/src/components/AgentPlanningProgress.vue
test -f /opt/bundle/bundle/agent-service/agent/planner.py

if [ -f /opt/bundle/bundle/agent-service/.env ] || [ -f /opt/bundle/bundle/travel-java/.env ]; then
  echo "REFUSE: package contains .env"
  exit 1
fi

echo "=== overwrite sources; keep uploads and .env ==="
cd /opt/bundle
cp -a bundle/travel-java/. travel-java/
cp -a bundle/agent-service/. agent-service/
cp -a bundle/trval-h5/. trval-h5/
cp -a bundle/deploy.sh deploy.sh

test -f travel-java/.env
test -f trval-h5/src/components/AgentPlanningProgress.vue
grep -q "spot_count" agent-service/agent/planner.py

rm -rf /opt/bundle/bundle /tmp/bundle_20260830.tgz

echo "=== uploads count ==="
ls /opt/bundle/travel-java/uploads | wc -l

echo "=== launch deploy.sh in background ==="
cd /opt/bundle
rm -f deploy_20260830_v2.log
setsid nohup bash deploy.sh > deploy_20260830_v2.log 2>&1 &
echo "started deploy pid: $!"
sleep 2
ls -la /opt/bundle/deploy_20260830_v2.log
ps aux | grep '[d]eploy.sh' | head
echo DONE
