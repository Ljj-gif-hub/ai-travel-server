#!/usr/bin/env bash
# Central JWT boundary release with automatic application rollback.
set -Eeuo pipefail
umask 077

BASE=/opt/bundle/travel-java
ARCHIVE=/tmp/api_security_20260904.tar.gz
BACKUP=/opt/backups/releases/20260904-api-security-r5
COMPOSE=(docker compose --project-directory "$BASE" -f "$BASE/docker-compose.yml")

health() {
  for _ in $(seq 1 45); do
    docker exec travel-nginx wget -qO- http://app:3200/actuator/health 2>/dev/null \
      | grep -q '"status":"UP"' && return 0
    sleep 2
  done
  return 1
}

public_health() {
  for _ in $(seq 1 15); do
    curl -fsS --max-time 5 http://127.0.0.1/actuator/health 2>/dev/null \
      | grep -q '"status":"UP"' && return 0
    sleep 1
  done
  return 1
}

rollback() {
  tar -xzf "$BACKUP/source-before.tar.gz" -C "$BASE"
  rm -f "$BASE/src/main/java/org/example/traveljava/config/JwtAuthenticationFilter.java"
  rm -f "$BASE/src/test/java/org/example/traveljava/ApiSecurityConfigTest.java"
  docker tag "$(cat "$BACKUP/image-before")" travel-java:latest
  "${COMPOSE[@]}" up -d --no-deps --force-recreate app
  health
  docker exec travel-nginx nginx -t
  docker restart travel-nginx >/dev/null
  public_health
  printf 'ROLLED_BACK\n' > "$BACKUP/status"
}

test -s "$ARCHIVE"
test -d "$BASE/src/main/java"
test ! -e "$BACKUP"
test ! -e "$BASE/src/main/java/org/example/traveljava/config/JwtAuthenticationFilter.java"
test ! -e "$BASE/src/test/java/org/example/traveljava/ApiSecurityConfigTest.java"
mkdir -p "$BACKUP"
APP_CONTAINER=$("${COMPOSE[@]}" ps -q app)
test -n "$APP_CONTAINER"
docker inspect --format '{{.Image}}' "$APP_CONTAINER" > "$BACKUP/image-before"
tar -czf "$BACKUP/source-before.tar.gz" -C "$BASE" \
  src/main/java/org/example/traveljava/config/ApiSecurityConfig.java
printf 'BUILDING\n' > "$BACKUP/status"

trap 'code=$?; trap - ERR; rollback || printf "ROLLBACK_FAILED\n" > "$BACKUP/status"; exit "$code"' ERR
tar -xzf "$ARCHIVE" -C "$BASE"
grep -q 'anyRequest().authenticated()' "$BASE/src/main/java/org/example/traveljava/config/ApiSecurityConfig.java"
grep -q 'class JwtAuthenticationFilter' "$BASE/src/main/java/org/example/traveljava/config/JwtAuthenticationFilter.java"
"${COMPOSE[@]}" build app
"${COMPOSE[@]}" up -d --no-deps --force-recreate app
health
docker exec travel-nginx nginx -t
docker restart travel-nginx >/dev/null
public_health

test "$(curl -sS -o /tmp/api-security-private.json -w '%{http_code}' --max-time 10 http://127.0.0.1/api/user/profile)" = 401
grep -q '请先登录' /tmp/api-security-private.json
curl -fsS --max-time 10 http://127.0.0.1/api/posts >/dev/null
curl -fsS --max-time 10 'http://127.0.0.1/api/city/hot?type=domestic' >/dev/null
printf 'DEPLOYED\n' > "$BACKUP/status"
trap - ERR
printf 'DEPLOYED: api-security\nBACKUP: %s\n' "$BACKUP"
