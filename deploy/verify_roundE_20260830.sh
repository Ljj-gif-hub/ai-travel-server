#!/usr/bin/env bash
echo "=== dist/attraction-images.json 是否含全部新键（应各输出1） ==="
for k in 八达岭长城 颐和园 磁器口古镇 解放碑 李子坝 大雁塔 华清宫 回民街 张家界国家森林公园 大峡谷玻璃桥 黄龙洞; do
  printf "%s: " "$k"; grep -c "\"$k\"" /opt/bundle/trval-h5/dist/attraction-images.json
done
echo ""
echo "=== dist/images/landmarks 这批图是否存在（stat） ==="
for f in 65f0e0cebc0a 208f376e9712 ff9dcd0e21d5 91d22a7515f0 777565b971f5 79b21044d044 cd1616d0fe4b 6da5266c7911 1260698db1f0 ba2b8b0b444c 966746b0a130; do
  printf "%s " "$f"; stat -c%s "/opt/bundle/trval-h5/dist/images/landmarks/$f.jpg" 2>/dev/null || echo "MISSING"
done
echo ""
echo "=== HTTP 抽检两张图 ==="
for f in 79b21044d044 208f376e9712; do
  curl -s -o /dev/null -w "$f HTTP %{http_code} size=%{size_download}\n" "http://127.0.0.1/images/landmarks/$f.jpg"
done
echo ""
echo "=== dist/attraction-images.json 根 HTTP ==="
curl -s -o /dev/null -w "json HTTP %{http_code}\n" "http://127.0.0.1/attraction-images.json"
