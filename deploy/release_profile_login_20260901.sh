#!/usr/bin/env bash
# Profile/login/settings-only release; leave backend containers, uploads and data untouched.
set -Eeuo pipefail
umask 077
BASE=/opt/bundle/trval-h5
RELEASE=/opt/releases/20260901-profile-login
BACKUP=/opt/backups/releases/20260901-profile-login
ARCHIVE=/tmp/profile_login_20260901.tar.gz

check_file() {
  local relative=$1 expected actual
  expected=$(sha256sum "$RELEASE/dist/$relative" | cut -d ' ' -f 1)
  actual=$(curl -fsS --max-time 15 "http://127.0.0.1/$relative" | sha256sum | cut -d ' ' -f 1)
  test "$expected" = "$actual"
  printf 'Verified: %s\n' "$relative"
}

patch_router() {
  python3 - "$1" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
raw = path.read_bytes()
newline = "\r\n" if b"\r\n" in raw else "\n"
text = raw.decode("utf-8").replace("\r\n", "\n")
changed = False

old_block = """  {
    path: '/edit-profile',
    name: 'EditProfile',
    component: () => import('../views/EditProfileView.vue'),
    meta: { transition: 'slide-left' },
  },"""
new_block = old_block + """
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { transition: 'slide-left' },
  },"""

if "path: '/settings'" not in text:
    if old_block not in text:
        raise SystemExit("edit-profile block not found")
    text = text.replace(old_block, new_block, 1)
    changed = True

old_whitelist = "'/login', '/register', '/about',"
new_whitelist = "'/login', '/register', '/about', '/settings',"
if old_whitelist in text:
    text = text.replace(old_whitelist, new_whitelist, 1)
    changed = True
elif new_whitelist not in text:
    raise SystemExit("login whitelist line not found")

if "path: '/settings'" not in text or "import('../views/SettingsView.vue')" not in text:
    raise SystemExit("settings route missing after patch")
if new_whitelist not in text:
    raise SystemExit("settings whitelist missing after patch")

if changed:
    path.write_bytes(text.replace("\n", newline).encode("utf-8"))
print("ROUTER_PATCHED" if changed else "ROUTER_ALREADY_PATCHED")
PY
}

rollback() {
  test -s "$BACKUP/frontend-before.tar.gz"
  tar -xzf "$BACKUP/frontend-before.tar.gz" -C "$BASE"
  # Keep new hash assets too, for clients that already opened the new version.
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
  # Build from the production baseline, overlaying only the reviewed profile/login
  # files and a surgical settings-route patch. Do not ship unrelated local changes.
  tar --exclude=node_modules --exclude=dist --exclude=.git --exclude=.audit-build \
    -cf - -C "$BASE" . | tar -xf - -C "$RELEASE"
  cp -a "$BASE/node_modules" "$RELEASE/node_modules"
  tar -xzf "$ARCHIVE" -C "$RELEASE"
  patch_router "$RELEASE/src/router/index.js"
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
  test -s "$RELEASE/dist/travel-hero.jpg"
  test -s "$RELEASE/dist/travel-cover.svg"
  grep -l 'hero-tools' "$RELEASE"/dist/assets/Profile-*.css
  grep -l 'login-btn' "$RELEASE"/dist/assets/LoginView-*.css
  grep -l 'settings-page' "$RELEASE"/dist/assets/SettingsView-*.css
  docker exec travel-nginx nginx -t
  printf 'PREPARED\n' > "$BACKUP/status"
  printf 'PREPARED: %s\nBACKUP: %s\n' "$RELEASE" "$BACKUP"
  ;;
activate)
  test "$(cat "$BACKUP/status")" = PREPARED
  test "$(sha256sum "$BASE/dist/index.html" | cut -d ' ' -f 1)" = "$(cat "$BACKUP/index-before.sha256")"
  sha256sum -c "$BACKUP/upload.sha256"
  trap 'code=$?; trap - ERR; printf "Activation failed; restoring previous frontend.\n"; rollback || printf "ROLLBACK_FAILED\n" > "$BACKUP/status"; exit "$code"' ERR
  # Static assets first; preserve old hashes and all existing landmark images.
  find "$RELEASE/dist" -mindepth 1 -maxdepth 1 \
    ! -name index.html ! -name sw.js ! -name images ! -name demos ! -name showcase \
    -exec cp -a -t "$BASE/dist" {} +
  tar -xzf "$ARCHIVE" -C "$BASE"
  patch_router "$BASE/src/router/index.js"
  install -m 644 "$RELEASE/dist/index.html" "$BASE/dist/index.html.next"
  mv "$BASE/dist/index.html.next" "$BASE/dist/index.html"
  install -m 644 "$RELEASE/dist/sw.js" "$BASE/dist/sw.js.next"
  mv "$BASE/dist/sw.js.next" "$BASE/dist/sw.js"
  check_file index.html
  check_file sw.js
  check_file travel-hero.jpg
  check_file travel-cover.svg
  check_file images/landmarks/1a57149358c0.jpg
  for asset in "$RELEASE"/dist/assets/Profile-* "$RELEASE"/dist/assets/LoginView-* "$RELEASE"/dist/assets/SettingsView-*; do
    check_file "assets/$(basename "$asset")"
  done
  curl -fsS --max-time 15 http://127.0.0.1/actuator/health | grep -q '"status":"UP"'
  test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' http://127.0.0.1/api/orders)" = 401
  printf 'DEPLOYED\n' > "$BACKUP/status"
  trap - ERR
  printf 'DEPLOYED: http://8.148.223.54/#/profile\nBACKUP: %s\n' "$BACKUP"
  ;;
rollback) rollback ;;
*) printf 'Usage: bash release_profile_login_20260901.sh prepare|build|activate|rollback\n' >&2; exit 2 ;;
esac
