#!/usr/bin/env bash
# 在服务器就地重建 trval-h5 前端（dist 为 bind-mount 路径，nginx 直接读取，无需重启 nginx）
set -e
cd /opt/bundle/trval-h5
node -v
echo "== 开始构建 =="
npm run build 2>&1 | tail -40
echo "== 构建结束 exit=$? =="
