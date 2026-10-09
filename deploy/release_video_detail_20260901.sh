#!/usr/bin/env bash
# Video detail 9.2: dual player + media=video + share card. Recreate Java app; leave MySQL/uploads/agent.
set -Eeuo pipefail
umask 077

BUNDLE=/opt/bundle
H5=$BUNDLE/trval-h5
JAVA=$BUNDLE/travel-java
RELEASE=/opt/releases/20260901-video-detail
BACKUP=/opt/backups/releases/20260901-video-detail
ARCHIVE=/tmp/video_detail_20260901.tar.gz
TAG=20260901-video

compose() {
  docker compose --project-directory "$JAVA" -f "$JAVA/docker-compose.yml" --env-file "$JAVA/.env" "$@"
}

health() {
  for attempt in $(seq 1 60); do
    if curl -fsS --max-time 3 http://127.0.0.1/actuator/health | grep -q '"status":"UP"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

check_file() {
  local relative=$1 expected actual
  expected=$(sha256sum "$RELEASE/trval-h5/dist/$relative" | cut -d ' ' -f 1)
  actual=$(curl -fsS --max-time 15 "http://127.0.0.1/$relative" | sha256sum | cut -d ' ' -f 1)
  test "$expected" = "$actual"
  printf 'Verified: %s\n' "$relative"
}

backup_image() {
  local container=$1 tag=$2 old_image
  old_image=$(docker inspect "$container" --format '{{.Image}}')
  if docker image inspect "$old_image" >/dev/null 2>&1; then
    docker tag "$old_image" "$tag"
  else
    docker commit --pause=false "$container" "$tag" >/dev/null
  fi
}

rollback() {
  test -s "$BACKUP/frontend-before.tar.gz"
  tar -xzf "$BACKUP/frontend-before.tar.gz" -C "$H5"
  if test -s "$BACKUP/java-src-before.tar.gz"; then
    tar -xzf "$BACKUP/java-src-before.tar.gz" -C "$JAVA"
  fi
  test "$(curl -fsS --max-time 15 http://127.0.0.1/ | sha256sum | cut -d ' ' -f 1)" = "$(cat "$BACKUP/index-before.sha256")"
  docker tag "travel-java:rollback-$TAG" travel-java:latest
  compose up -d --no-build --no-deps --force-recreate app
  health
  printf 'ROLLED_BACK\n' > "$BACKUP/status"
}

case "${1:-}" in
prepare|build)
  if test "$1" = prepare; then
    test -d "$H5/node_modules"
    test -s "$JAVA/.env"
    test -s "$ARCHIVE"
    test ! -e "$RELEASE"
    test ! -e "$BACKUP"
    mkdir -p "$RELEASE/trval-h5" "$RELEASE/travel-java" "$BACKUP"
    sha256sum "$ARCHIVE" > "$BACKUP/upload.sha256"
    sha256sum "$H5/dist/index.html" | cut -d ' ' -f 1 > "$BACKUP/index-before.sha256"
    printf 'BACKING_UP\n' > "$BACKUP/status"
    tar --exclude=node_modules --exclude=.git --exclude=.audit-build \
      --exclude=public/images --exclude=dist/images --exclude=public/demos \
      --exclude=dist/demos --exclude=public/showcase --exclude=dist/showcase \
      -czf "$BACKUP/frontend-before.tar.gz" -C "$H5" .
    tar --exclude=target --exclude=uploads --exclude=.git \
      -czf "$BACKUP/java-src-before.tar.gz" -C "$JAVA" src pom.xml Dockerfile settings.xml
    gzip -t "$BACKUP/frontend-before.tar.gz" "$BACKUP/java-src-before.tar.gz"
    tar --exclude=node_modules --exclude=dist --exclude=.git --exclude=.audit-build \
      -cf - -C "$H5" . | tar -xf - -C "$RELEASE/trval-h5"
    cp -a "$H5/node_modules" "$RELEASE/trval-h5/node_modules"
    tar --exclude=target --exclude=uploads --exclude=.git \
      -cf - -C "$JAVA" . | tar -xf - -C "$RELEASE/travel-java"
    tar -xzf "$ARCHIVE" -C "$RELEASE"
    printf 'BUILDING\n' > "$BACKUP/status"
  else
    test "$(cat "$BACKUP/status")" = BUILDING
  fi
  if ! test -x "$RELEASE/trval-h5/node_modules/.bin/vitest"; then
    (cd "$RELEASE/trval-h5" && npm ci --include=dev --no-audit --no-fund)
  fi
  (cd "$RELEASE/trval-h5" && npm test && npm run build)
  find "$RELEASE/trval-h5/dist" -type d -exec chmod 755 {} +
  find "$RELEASE/trval-h5/dist" -type f -exec chmod 644 {} +
  grep -q '/api/notes/' "$RELEASE"/trval-h5/dist/assets/VideoDetailView-*.js
  grep -q 'full-video' "$RELEASE"/trval-h5/dist/assets/VideoDetailView-*.css
  grep -q shareCard "$RELEASE/travel-java/src/main/java/org/example/traveljava/controller/NoteController.java"
  grep -q 'equalsIgnoreCase(media)' "$RELEASE/travel-java/src/main/java/org/example/traveljava/controller/NoteController.java"
  docker build -t "travel-java:release-$TAG" "$RELEASE/travel-java"
  docker exec travel-nginx nginx -t
  printf 'PREPARED\n' > "$BACKUP/status"
  printf 'PREPARED: %s\nBACKUP: %s\n' "$RELEASE" "$BACKUP"
  ;;
activate)
  test "$(cat "$BACKUP/status")" = PREPARED
  test "$(sha256sum "$H5/dist/index.html" | cut -d ' ' -f 1)" = "$(cat "$BACKUP/index-before.sha256")"
  sha256sum -c "$BACKUP/upload.sha256"
  backup_image travel-java-app-1 "travel-java:rollback-$TAG"
  trap 'code=$?; trap - ERR; printf "Activation failed; restoring previous release.\n"; rollback || printf "ROLLBACK_FAILED\n" > "$BACKUP/status"; exit "$code"' ERR
  docker tag "travel-java:release-$TAG" travel-java:latest
  rm -rf "$JAVA/src"
  cp -a "$RELEASE/travel-java/src" "$JAVA/src"
  compose up -d --no-build --no-deps --force-recreate app
  health
  find "$RELEASE/trval-h5/dist" -mindepth 1 -maxdepth 1 \
    ! -name index.html ! -name sw.js ! -name images ! -name demos ! -name showcase \
    -exec cp -a -t "$H5/dist" {} +
  tar -xzf "$ARCHIVE" -C "$BUNDLE"
  install -m 644 "$RELEASE/trval-h5/dist/index.html" "$H5/dist/index.html.next"
  mv "$H5/dist/index.html.next" "$H5/dist/index.html"
  if test -f "$RELEASE/trval-h5/dist/sw.js"; then
    install -m 644 "$RELEASE/trval-h5/dist/sw.js" "$H5/dist/sw.js.next"
    mv "$H5/dist/sw.js.next" "$H5/dist/sw.js"
  fi
  check_file index.html
  for asset in "$RELEASE"/trval-h5/dist/assets/VideoDetailView-*; do
    check_file "assets/$(basename "$asset")"
  done
  curl -fsS --max-time 15 "http://127.0.0.1/api/notes?page=1&size=50&media=video" | grep -q '"hasMore"'
  curl -fsS --max-time 15 "http://127.0.0.1/api/notes/6/card" | grep -q 'og:video'
  curl -fsS --max-time 15 http://127.0.0.1/actuator/health | grep -q '"status":"UP"'
  test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' http://127.0.0.1/api/orders)" = 401
  printf 'DEPLOYED\n' > "$BACKUP/status"
  trap - ERR
  printf 'DEPLOYED: http://8.148.223.54/#/video-detail\nBACKUP: %s\n' "$BACKUP"
  ;;
rollback) rollback ;;
*) printf 'Usage: bash release_video_detail_20260901.sh prepare|build|activate|rollback\n' >&2; exit 2 ;;
esac
