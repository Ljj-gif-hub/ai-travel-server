#!/usr/bin/env bash
# Mobile video detail: preserve landscape footage, polish overlays and drawer interactions.
set -Eeuo pipefail
umask 077

BASE=/opt/bundle/trval-h5
RELEASE=/opt/releases/20260904-video-landscape
BACKUP=/opt/backups/releases/20260904-video-landscape
ARCHIVE=/tmp/video_landscape_20260904.tar.gz

check_file() {
  local relative=$1 expected actual
  expected=$(sha256sum "$RELEASE/dist/$relative" | cut -d ' ' -f 1)
  actual=$(curl -fsS --max-time 15 "http://127.0.0.1/$relative" | sha256sum | cut -d ' ' -f 1)
  test "$expected" = "$actual"
  printf 'Verified: %s\n' "$relative"
}

rollback() {
  test -s "$BACKUP/frontend-before.tar.gz"
  tar -xzf "$BACKUP/frontend-before.tar.gz" -C "$BASE"
  test "$(curl -fsS --max-time 15 http://127.0.0.1/ | sha256sum | cut -d ' ' -f 1)" = "$(cat "$BACKUP/index-before.sha256")"
  printf 'ROLLED_BACK\n' > "$BACKUP/status"
}

case "${1:-}" in
prepare|build)
  if test "$1" = prepare; then
    test -d "$BASE/node_modules"
    test -s "$ARCHIVE"
    test ! -e "$RELEASE"
    test ! -e "$BACKUP"
    mkdir -p "$RELEASE" "$BACKUP"
    sha256sum "$ARCHIVE" > "$BACKUP/upload.sha256"
    sha256sum "$BASE/dist/index.html" | cut -d ' ' -f 1 > "$BACKUP/index-before.sha256"
    printf 'BACKING_UP\n' > "$BACKUP/status"
    tar --exclude=node_modules --exclude=.git --exclude=.audit-build \
      --exclude=public/images --exclude=dist/images --exclude=public/demos \
      --exclude=dist/demos --exclude=public/showcase --exclude=dist/showcase \
      -czf "$BACKUP/frontend-before.tar.gz" -C "$BASE" .
    gzip -t "$BACKUP/frontend-before.tar.gz"
    tar --exclude=node_modules --exclude=dist --exclude=.git --exclude=.audit-build \
      -cf - -C "$BASE" . | tar -xf - -C "$RELEASE"
    cp -a "$BASE/node_modules" "$RELEASE/node_modules"
    tar -xzf "$ARCHIVE" -C "$RELEASE"
    printf 'BUILDING\n' > "$BACKUP/status"
  else
    test "$(cat "$BACKUP/status")" = BUILDING
  fi
  if ! test -x "$RELEASE/node_modules/.bin/vitest"; then
    (cd "$RELEASE" && npm ci --include=dev --no-audit --no-fund)
  fi
  (cd "$RELEASE" && npm test && npm run build)
  find "$RELEASE/dist" -type d -exec chmod 755 {} +
  find "$RELEASE/dist" -type f -exec chmod 644 {} +
  grep -q 'landscape-watch-btn' "$RELEASE/src/views/VideoDetailView.vue"
  grep -q 'video-current.landscape .full-video' "$RELEASE/src/views/VideoDetailView.vue"
  grep -q "router.replace({ path: '/video-detail'" "$RELEASE/src/views/VideoDetailView.vue"
  grep -q "window.addEventListener('resize', updateViewport)" "$RELEASE/src/views/VideoDetailView.vue"
  grep -q 'comment-drawer' "$RELEASE/src/views/VideoDetailView.vue"
  docker exec travel-nginx nginx -t
  printf 'PREPARED\n' > "$BACKUP/status"
  printf 'PREPARED: %s\nBACKUP: %s\n' "$RELEASE" "$BACKUP"
  ;;
activate)
  test "$(cat "$BACKUP/status")" = PREPARED
  test "$(sha256sum "$BASE/dist/index.html" | cut -d ' ' -f 1)" = "$(cat "$BACKUP/index-before.sha256")"
  sha256sum -c "$BACKUP/upload.sha256"
  trap 'code=$?; trap - ERR; printf "Activation failed; restoring previous frontend.\n"; rollback || printf "ROLLBACK_FAILED\n" > "$BACKUP/status"; exit "$code"' ERR
  find "$RELEASE/dist" -mindepth 1 -maxdepth 1 \
    ! -name index.html ! -name sw.js ! -name images ! -name demos ! -name showcase \
    -exec cp -a -t "$BASE/dist" {} +
  tar -xzf "$ARCHIVE" -C "$BASE"
  install -m 644 "$RELEASE/dist/index.html" "$BASE/dist/index.html.next"
  mv "$BASE/dist/index.html.next" "$BASE/dist/index.html"
  install -m 644 "$RELEASE/dist/sw.js" "$BASE/dist/sw.js.next"
  mv "$BASE/dist/sw.js.next" "$BASE/dist/sw.js"
  check_file index.html
  check_file sw.js
  for asset in "$RELEASE"/dist/assets/VideoDetailView-*; do
    check_file "assets/$(basename "$asset")"
  done
  curl -fsS --max-time 15 http://127.0.0.1/actuator/health | grep -q '"status":"UP"'
  printf 'DEPLOYED\n' > "$BACKUP/status"
  trap - ERR
  printf 'DEPLOYED: http://8.148.223.54/#/video-detail\nBACKUP: %s\n' "$BACKUP"
  ;;
rollback) rollback ;;
*) printf 'Usage: bash release_video_landscape_20260904.sh prepare|build|activate|rollback\n' >&2; exit 2 ;;
esac
