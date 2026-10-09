#!/usr/bin/env bash
echo '--- TripsView CSS 新类（计数>0 即已进产物） ---'
grep -c 'plan-ai-bg-item' /opt/bundle/trval-h5/dist/assets/TripsView*.css
grep -c 'plan-card-label-ai' /opt/bundle/trval-h5/dist/assets/TripsView*.css
echo '--- 7 张图 dist 大小 ---'
cd /opt/bundle/trval-h5/dist/images/landmarks
for f in 3d7d0734923a 29fe9eef4322 a33059051c47 895acb85a9be ba9c1bc0df23 c06ee7552e4d 1ca49d9ba37e; do
  printf "%s " "$f"; stat -c%s "$f.jpg"
done
echo '--- 根 HTTP 状态 ---'
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/
