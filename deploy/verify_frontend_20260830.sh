#!/usr/bin/env bash
# 验证 nginx 是否吐出新的前端构建（dist 就地重建，nginx 无需重启）
echo "=== dist/index.html 更新于 ==="
ls -la --time-style=+%Y%m%d-%H%M /opt/bundle/trval-h5/dist/index.html
echo ""
echo "=== nginx 吐首页 ==="
curl -s -o /dev/null -w "root HTTP %{http_code} type=%{content_type}\n" http://127.0.0.1/
echo ""
echo "=== 首页开头 300 字节 ==="
curl -s http://127.0.0.1/ | head -c 300
echo ""
echo ""
echo "=== 首页首个 JS asset 可访问性 ==="
A=$(curl -s http://127.0.0.1/ | grep -oE '/assets/[^"]+\.js' | head -1)
echo "asset=$A"
[ -n "$A" ] && curl -s -o /dev/null -w "asset HTTP %{http_code}\n" "http://127.0.0.1$A"
