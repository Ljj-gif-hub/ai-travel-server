#!/usr/bin/env bash
# 检查 Round E 目标图在服务器 public/images/landmarks 是否齐全（缺则需上传）
D=/opt/bundle/trval-h5/public/images/landmarks
for f in 65f0e0cebc0a 208f376e9712 ff9dcd0e21d5 91d22a7515f0 777565b971f5 79b21044d044 cd1616d0fe4b 6da5266c7911 1260698db1f0 ba2b8b0b444c 966746b0a130; do
  if [ -f "$D/$f.jpg" ]; then printf "OK   %s\n" "$f"; else printf "MISS %s\n" "$f"; fi
done
