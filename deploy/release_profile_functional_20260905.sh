#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
BASE=/opt/bundle
RELEASE=/opt/releases/20260905-profile-functional-r1
BACKUP=/opt/backups/releases/20260905-profile-functional-r1
ARCHIVE=/tmp/profile_functional_20260905.tar.gz
CANDIDATE=travel-java:profile-functional-r1
COMPOSE=(docker compose --project-directory "$BASE/travel-java" -f "$BASE/travel-java/docker-compose.yml")

health() {
  for _ in $(seq 1 45); do
    if docker exec travel-nginx wget -qO- http://app:3200/actuator/health 2>/dev/null | grep -q '"status":"UP"'; then return 0; fi
    sleep 2
  done
  return 1
}
public_health() {
  for _ in $(seq 1 20); do
    if curl -fsS --max-time 5 http://127.0.0.1/actuator/health 2>/dev/null | grep -q '"status":"UP"'; then return 0; fi
    sleep 1
  done
  return 1
}
rollback() {
  tar -xzf "$BACKUP/source-before.tar.gz" -C "$BASE"
  # Remove only files this release introduced; keep additive schema and hash assets.
  while IFS= read -r path; do test -n "$path" && rm -f -- "$BASE/$path"; done < "$BACKUP/new-source-files.txt"
  docker tag "$(cat "$BACKUP/image-before")" travel-java:latest
  "${COMPOSE[@]}" up -d --no-deps --force-recreate app
  health
  docker exec travel-nginx nginx -t
  docker exec travel-nginx nginx -s reload
  public_health
  printf 'ROLLED_BACK\n' > "$BACKUP/status"
}
verify_file() {
  local path=$1
  test "$(sha256sum "$RELEASE/trval-h5/dist/$path" | cut -d ' ' -f 1)" = "$(curl -fsS --max-time 20 "http://127.0.0.1/$path" | sha256sum | cut -d ' ' -f 1)"
}

case "${1:-}" in
prepare)
  test -s "$ARCHIVE"; test ! -e "$RELEASE"; test ! -e "$BACKUP"
  mkdir -p "$RELEASE" "$BACKUP"
  sha256sum "$ARCHIVE" > "$BACKUP/upload.sha256"
  # Retain production-only fixes, configuration, images and dependency versions.
  tar --exclude=node_modules --exclude=dist --exclude=.git --exclude=.audit-build --exclude='.env*' \
      -cf - -C "$BASE" trval-h5 | tar -xf - -C "$RELEASE"
  tar --exclude=target --exclude=uploads --exclude=.git --exclude='.env*' \
      -cf - -C "$BASE" travel-java | tar -xf - -C "$RELEASE"
  tar -tzf "$ARCHIVE" | grep -v '/$' > "$BACKUP/overlay-files.txt"
  : > "$BACKUP/new-source-files.txt"
  while IFS= read -r path; do
    case "$path" in trval-h5/*|travel-java/*) ;; *) exit 2;; esac
    if ! test -f "$BASE/$path"; then printf '%s\n' "$path" >> "$BACKUP/new-source-files.txt"; fi
  done < "$BACKUP/overlay-files.txt"
  # Keep hashes of existing source files, so a concurrent release fails closed.
  (cd "$BASE"; while IFS= read -r path; do if test -f "$path"; then sha256sum "$path"; fi; done < "$BACKUP/overlay-files.txt") > "$BACKUP/source-before.sha256"
  sha256sum "$BASE/trval-h5/dist/index.html" > "$BACKUP/index-before.sha256"
  tar -xzf "$ARCHIVE" -C "$RELEASE"
  printf 'BUILDING\n' > "$BACKUP/status"
  (cd "$RELEASE/trval-h5"; npm ci --include=dev --no-audit --no-fund; npm test; npm run build)
  # Run the backend tests inside the Linux build, too.
  sed -i 's/mvn package -DskipTests -B/mvn package -B/' "$RELEASE/travel-java/Dockerfile"
  docker build -t "$CANDIDATE" "$RELEASE/travel-java"
  docker exec travel-nginx nginx -t
  printf 'PREPARED\n' > "$BACKUP/status"
  ;;
activate)
  test "$(cat "$BACKUP/status")" = PREPARED
  sha256sum -c "$BACKUP/upload.sha256"
  (cd "$BASE"; sha256sum -c "$BACKUP/source-before.sha256")
  sha256sum -c "$BACKUP/index-before.sha256"
  docker inspect --format '{{.Image}}' "$("${COMPOSE[@]}" ps -q app)" > "$BACKUP/image-before"
  tar --exclude=trval-h5/dist/images --exclude=trval-h5/dist/demos --exclude=trval-h5/dist/showcase \
    -czf "$BACKUP/source-before.tar.gz" -C "$BASE" \
    trval-h5/src trval-h5/tests trval-h5/package.json trval-h5/package-lock.json trval-h5/dist travel-java/src
  gzip -t "$BACKUP/source-before.tar.gz"
  docker exec travel-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --no-tablespaces --set-gtid-purged=OFF "$MYSQL_DATABASE"' | gzip > "$BACKUP/database-before.sql.gz"
  gzip -t "$BACKUP/database-before.sql.gz"
  test "$(stat -c %s "$BACKUP/database-before.sql.gz")" -gt 1000
  printf 'ACTIVATING\n' > "$BACKUP/status"
  trap 'code=$?; trap - ERR; rollback || printf "ROLLBACK_FAILED\n" > "$BACKUP/status"; exit "$code"' ERR
  # Additive schema update is idempotent and remains compatible with the old image.
  COLUMN_EXISTS=$(docker exec -i travel-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot -N "$MYSQL_DATABASE"' <<<'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "users" AND COLUMN_NAME = "last_check_in_date";')
  if test "$COLUMN_EXISTS" = 0; then
    docker exec -i travel-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE"' <<<'ALTER TABLE users ADD COLUMN last_check_in_date DATE NULL;'
  else test "$COLUMN_EXISTS" = 1; fi
  tar -xzf "$ARCHIVE" -C "$BASE"
  docker tag "$CANDIDATE" travel-java:latest
  "${COMPOSE[@]}" up -d --no-deps --force-recreate app
  health
  docker exec travel-nginx nginx -t
  docker exec travel-nginx nginx -s reload
  public_health
  python3 /tmp/smoke_profile_functional_20260905.py
  # Existing clients can continue to fetch old hashed chunks.
  find "$RELEASE/trval-h5/dist" -type d -exec chmod 755 {} +
  find "$RELEASE/trval-h5/dist" -type f -exec chmod 644 {} +
  find "$RELEASE/trval-h5/dist" -mindepth 1 -maxdepth 1 ! -name index.html ! -name sw.js ! -name images ! -name demos ! -name showcase -exec cp -a -t "$BASE/trval-h5/dist" {} +
  install -m 644 "$RELEASE/trval-h5/dist/index.html" "$BASE/trval-h5/dist/index.html.next"
  mv "$BASE/trval-h5/dist/index.html.next" "$BASE/trval-h5/dist/index.html"
  install -m 644 "$RELEASE/trval-h5/dist/sw.js" "$BASE/trval-h5/dist/sw.js.next"
  mv "$BASE/trval-h5/dist/sw.js.next" "$BASE/trval-h5/dist/sw.js"
  verify_file index.html; verify_file sw.js
  for path in "$RELEASE"/trval-h5/dist/assets/Profile-* "$RELEASE"/trval-h5/dist/assets/SettingsView-* "$RELEASE"/trval-h5/dist/assets/jsQR-* "$RELEASE"/trval-h5/dist/assets/EditProfileView-*; do verify_file "assets/$(basename "$path")"; done
  public_health
  test "$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1/api/user/check-in)" = 401
  printf 'DEPLOYED\n' > "$BACKUP/status"
  trap - ERR
  printf 'DEPLOYED: http://8.148.223.54/#/profile\nBACKUP: %s\n' "$BACKUP"
  ;;
rollback) rollback ;;
*) echo 'Usage: prepare|activate|rollback'; exit 2 ;;
esac
