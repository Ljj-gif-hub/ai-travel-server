#!/usr/bin/env bash
# 本次修复发布：先 prepare，检查日志成功后再 activate；rollback 可独立执行。
set -Eeuo pipefail
umask 077
BASE=/opt/bundle
RELEASE=/opt/releases/20260831-repair
BACKUP=/opt/backups/releases/20260831-repair
ARCHIVE=/tmp/bundle_20260831_repair.tar.gz
TAG=20260831-repair
VOLUME=travel-java_agent-data

compose() { docker compose --project-directory "$BASE/travel-java" -f "$BASE/travel-java/docker-compose.yml" "$@"; }
backup_image() {
  local container=$1 tag=$2 old_image
  old_image=$(docker inspect "$container" --format '{{.Image}}')
  if docker image inspect "$old_image" >/dev/null 2>&1; then
    docker tag "$old_image" "$tag"
  else
    # 历史部署可能删除了运行容器的镜像；保留容器快照，且不暂停线上进程。
    docker commit --pause=false "$container" "$tag" >/dev/null
  fi
  docker image inspect "$tag" --format 'Rollback image ready: {{.Id}}'
}
health() {
  for attempt in $(seq 1 90); do
    if curl -fsS --max-time 3 http://127.0.0.1/actuator/health | grep -q '"status":"UP"' &&
       compose exec -T agent-service python -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:3201/api/agent/health", timeout=3)' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}
check_static() {
  # 备份目录继续私有；公开静态资源必须允许 nginx 用户读取。
  find "$RELEASE/trval-h5/dist" -type d -exec chmod 755 {} +
  find "$RELEASE/trval-h5/dist" -type f -exec chmod 644 {} +
  docker run --rm --user nginx --entrypoint sh \
    --mount "type=bind,src=$RELEASE/trval-h5/dist,dst=/verify,readonly" nginx:alpine \
    -c 'test -r /verify/index.html && test -r /verify/sw.js && test -r /verify/sw-cleanup.js && test -x /verify/assets'
}
rollback() {
  test -s "$BACKUP/sources.tar.gz"
  test -d "$BACKUP/agent-data"
  printf 'Restoring previous release; database and uploads stay in place.\n'
  compose stop app agent-service || true
  tar -xzf "$BACKUP/sources.tar.gz" -C "$BASE"
  docker tag "travel-java:rollback-$TAG" travel-java:latest
  docker tag "travel-agent:rollback-$TAG" travel-agent:latest
  compose up --no-start --no-build --no-deps --force-recreate app agent-service
  old_agent=$(compose ps -aq agent-service)
  docker cp "$BACKUP/agent-data/." "$old_agent:/app/data/"
  compose start app agent-service
  compose exec -T nginx nginx -t
  compose exec -T nginx nginx -s reload
  health
  printf 'ROLLED_BACK\n' > "$BACKUP/status"
}

case "${1:-}" in
prepare)
  test ! -e "$RELEASE"
  test ! -e "$BACKUP"
  test -s "$ARCHIVE"
  test -s "$BASE/travel-java/.env"
  mkdir -p "$RELEASE" "$BACKUP"
  printf 'BACKING_UP\n' > "$BACKUP/status"
  compose config --quiet
  backup_image travel-java-app-1 "travel-java:rollback-$TAG"
  backup_image travel-java-agent-service-1 "travel-agent:rollback-$TAG"
  tar --exclude=node_modules --exclude=target --exclude=.venv --exclude=__pycache__ \
    --exclude='*.log' --exclude=travel-java/uploads --exclude=travel-java/data \
    -czf "$BACKUP/sources.tar.gz" -C "$BASE" travel-java agent-service trval-h5
  docker exec travel-mysql sh -c 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysqldump -uroot --single-transaction --routines --no-tablespaces "$MYSQL_DATABASE"' | gzip > "$BACKUP/database.sql.gz"
  gzip -t "$BACKUP/sources.tar.gz" "$BACKUP/database.sql.gz"
  tar -xzf "$ARCHIVE" -C "$RELEASE"
  for envfile in .env .env.production; do
    if [ -f "$BASE/trval-h5/$envfile" ]; then cp -p "$BASE/trval-h5/$envfile" "$RELEASE/trval-h5/$envfile"; fi
  done
  printf 'BUILDING\n' > "$BACKUP/status"
  (cd "$RELEASE/trval-h5" && npm ci --no-audit --no-fund && npm test && npm run build)
  check_static
  cat > "$RELEASE/images.yml" <<EOF
services:
  app:
    image: travel-java:release-$TAG
  agent-service:
    image: travel-agent:release-$TAG
EOF
  docker compose --project-name travel-java --env-file "$BASE/travel-java/.env" \
    -f "$RELEASE/travel-java/docker-compose.yml" -f "$RELEASE/images.yml" config --quiet
  docker compose --project-name travel-java --env-file "$BASE/travel-java/.env" \
    -f "$RELEASE/travel-java/docker-compose.yml" -f "$RELEASE/images.yml" build app agent-service
  docker run --rm --entrypoint python "travel-agent:release-$TAG" -c 'from agent.schemas import TravelRequest, RawPlanRequest; assert RawPlanRequest is TravelRequest; r=TravelRequest(destination="Beijing",people=3,adults=2,children=1,total_budget=1200,adjustment="slow down"); assert r.budget==400 and r.adjustment=="slow down"; print("Agent contract OK")'
  printf 'PREPARED\n' > "$BACKUP/status"
  printf 'PREPARED: %s\n' "$RELEASE"
  ;;
activate)
  release_status=$(cat "$BACKUP/status")
  test "$release_status" = PREPARED || test "$release_status" = ROLLED_BACK
  check_static
  if docker volume inspect "$VOLUME" >/dev/null 2>&1; then
    # 仅允许重试本次失败的迁移，且确认未被使用、文件仍与本次快照相同。
    test "$release_status" = ROLLED_BACK
    test -z "$(docker ps -aq --filter volume="$VOLUME")"
    test "$(docker volume inspect "$VOLUME" --format '{{index .Labels "com.docker.compose.project"}}')" = travel-java
    docker run --rm --entrypoint sh --mount "type=volume,src=$VOLUME,dst=/app/data,readonly" \
      "travel-agent:release-$TAG" -c 'cd /app/data && find . -type f -exec sha256sum {} + | sort' > "$BACKUP/agent-data.retry.sha256"
    cmp "$BACKUP/agent-data.sha256" "$BACKUP/agent-data.retry.sha256"
  fi
  # 在停止前也保留副本；后面的停机快照用于准确恢复。
  mkdir -p "$BACKUP/agent-data"
  docker cp travel-java-agent-service-1:/app/data/. "$BACKUP/agent-data/"
  trap 'code=$?; line=$LINENO; trap - ERR; printf "Activation failed at line %s (%s); rolling back.\n" "$line" "$code"; rollback || printf "ROLLBACK_FAILED\n" > "$BACKUP/status"; exit "$code"' ERR
  printf 'ACTIVATING\n' > "$BACKUP/status"
  compose stop app agent-service
  docker cp travel-java-agent-service-1:/app/data/. "$BACKUP/agent-data/"
  (cd "$BACKUP/agent-data" && find . -type f -exec sha256sum {} + | sort > "$BACKUP/agent-data.sha256")
  docker volume create --label com.docker.compose.project=travel-java \
    --label com.docker.compose.volume=agent-data "$VOLUME" >/dev/null
  docker run --rm --user root --entrypoint sh \
    --mount "type=volume,src=$VOLUME,dst=/app/data" \
    --mount "type=bind,src=$BACKUP/agent-data,dst=/backup,readonly" \
    "travel-agent:release-$TAG" -c 'cp -a /backup/. /app/data/ && chown -R appuser:appuser /app/data'
  docker run --rm --entrypoint sh --mount "type=volume,src=$VOLUME,dst=/app/data" \
    "travel-agent:release-$TAG" -c 'cd /app/data && find . -type f -exec sha256sum {} + | sort' > "$BACKUP/agent-data.after.sha256"
  cmp "$BACKUP/agent-data.sha256" "$BACKUP/agent-data.after.sha256"
  cp -a "$RELEASE/travel-java/." "$BASE/travel-java/"
  cp -a "$RELEASE/agent-service/." "$BASE/agent-service/"
  docker tag "travel-java:release-$TAG" travel-java:latest
  docker tag "travel-agent:release-$TAG" travel-agent:latest
  compose up -d --no-build --no-deps app agent-service
  compose exec -T nginx nginx -t
  compose exec -T nginx nginx -s reload
  health
  # 保留旧 hash 资源供已打开页面使用；HTML 在资源就位后原子替换。
  cp -a "$RELEASE/trval-h5/src" "$RELEASE/trval-h5/tests" "$RELEASE/trval-h5/public" "$BASE/trval-h5/"
  cp -p "$RELEASE/trval-h5/"*.json "$RELEASE/trval-h5/"*.js "$RELEASE/trval-h5/index.html" "$BASE/trval-h5/"
  find "$RELEASE/trval-h5/dist" -mindepth 1 -maxdepth 1 ! -name index.html -exec cp -a -t "$BASE/trval-h5/dist" {} +
  cp "$RELEASE/trval-h5/dist/index.html" "$BASE/trval-h5/dist/index.html.next"
  chmod 644 "$BASE/trval-h5/dist/index.html.next"
  mv "$BASE/trval-h5/dist/index.html.next" "$BASE/trval-h5/dist/index.html"
  # activate 清理脚本无 hash，部署后浏览器应重新校验。
  curl -fsS --max-time 10 http://127.0.0.1/sw-cleanup.js | grep -q 'api-cache'
  curl -fsS --max-time 10 http://127.0.0.1/sw.js | grep -q 'NetworkOnly'
  test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1/api/orders)" = 401
  health
  printf 'DEPLOYED\n' > "$BACKUP/status"
  trap - ERR
  printf 'DEPLOYED; rollback backup: %s\n' "$BACKUP"
  ;;
rollback) rollback ;;
*) printf 'Usage: bash release_20260831.sh prepare|activate|rollback\n' >&2; exit 2 ;;
esac
