#!/usr/bin/env bash
echo '--- dist 里 attraction-images.json 是否含新键（应各输出1） ---'
grep -c '雷峰塔' /opt/bundle/trval-h5/dist/attraction-images.json
grep -c '西溪湿地' /opt/bundle/trval-h5/dist/attraction-images.json
echo '--- 两张图 dist 是否存在 ---'
for f in f0821bcc2a54 a93910e530ad; do printf "%s " "$f"; stat -c%s "/opt/bundle/trval-h5/dist/images/landmarks/$f.jpg"; done
echo '--- 根 HTTP ---'
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/
