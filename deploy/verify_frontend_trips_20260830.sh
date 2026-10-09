#!/usr/bin/env bash
# 验证 /trips 改版 + /my-routes 新页的构建已上线
echo "=== dist/index.html 更新于 ==="
ls -la --time-style=+%Y%m%d-%H%M /opt/bundle/trval-h5/dist/index.html
echo ""
echo "=== nginx 吐首页 ==="
curl -s -o /dev/null -w "root HTTP %{http_code} type=%{content_type}\n" http://127.0.0.1/
echo ""
echo "=== 首页首个 JS asset 可访问性 ==="
A=$(curl -s http://127.0.0.1/ | grep -oE '/assets/[^"]+\.js' | head -1)
echo "asset=$A"
[ -n "$A" ] && curl -s -o /dev/null -w "asset HTTP %{http_code}\n" "http://127.0.0.1$A"
echo ""
echo "=== 新页面 chunk 是否可访问（/my-routes 的 MyRoutesView chunk）==="
for f in $(grep -rl "MyRoutesView" /opt/bundle/trval-h5/dist/assets/*.js 2>/dev/null | head -3); do
  B=$(basename "$f")
  curl -s -o /dev/null -w "chunk $B HTTP %{http_code}\n" "http://127.0.0.1/assets/$B"
done
