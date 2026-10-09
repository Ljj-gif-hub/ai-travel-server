#!/usr/bin/env bash
# 探测哪些城市在 /api/map/city-attractions 有景点数据
for c in 北京 上海 广州 重庆 成都 三亚 西安 杭州 张家界 桂林 大理 丽江 南京 苏州 拉萨 深圳 都江堰 敦煌 厦门; do
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$c")
  n=$(curl -s "http://127.0.0.1/api/map/city-attractions?city=$enc" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('data') or []))")
  echo "$c -> $n"
done
