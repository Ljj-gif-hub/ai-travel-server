#!/usr/bin/env bash
# Read-only production readiness snapshot. Never prints secret values.
set -u

echo APP_FLAGS
docker exec travel-java-app-1 sh -lc '
  for key in SPRING_PROFILES_ACTIVE PAYMENT_PROVIDER PAYMENT_MOCK_PAY_ENABLED BOOKING_HOTEL_PROVIDER BOOKING_FLIGHT_PROVIDER MODERATION_ENABLED AI_PROVIDER; do
    value=$(printenv "$key" 2>/dev/null || true)
    if test -n "$value"; then printf "%s=%s\n" "$key" "$value"; else printf "%s=unset(default)\n" "$key"; fi
  done
'

echo AGENT_FLAGS
docker exec travel-java-agent-service-1 sh -lc '
  for key in GUNICORN_WORKERS KNOWLEDGE_SOURCE; do
    value=$(printenv "$key" 2>/dev/null || true)
    if test -n "$value"; then printf "%s=%s\n" "$key" "$value"; else printf "%s=unset(default)\n" "$key"; fi
  done
  for key in LLM_API_KEY TAVILY_API_KEY AMAP_WEB_KEY KNOWLEDGE_REMOTE_URL; do
    value=$(printenv "$key" 2>/dev/null || true)
    if test -n "$value"; then printf "%s=set\n" "$key"; else printf "%s=unset\n" "$key"; fi
  done
'

echo DB_MIGRATION_STATE
docker exec travel-mysql sh -lc '
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
  mysql -uroot "$MYSQL_DATABASE" -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('\''flyway_schema_history'\'','\''plan_catalog'\'','\''trip_plans'\'','\''refunds'\'','\''invoices'\'') ORDER BY table_name"
'

echo HEALTH
curl -fsS --max-time 10 http://127.0.0.1/actuator/health
printf '\n'
curl -fsS --max-time 10 http://127.0.0.1/api/agent/health
printf '\n'

echo BACKUP_VERIFY
latest=$(find /opt/backups/mysql -name 'travel_plans_*.sql.gz' -type f | sort | tail -1)
if test -n "$latest" && gzip -t "$latest"; then echo latest_backup_gzip=OK; else echo latest_backup_gzip=FAILED; fi

echo ERROR_COUNTS_24H
printf 'app='
docker logs --since 24h travel-java-app-1 2>&1 | grep -cE 'ERROR|Exception' || true
printf 'agent='
docker logs --since 24h travel-java-agent-service-1 2>&1 | grep -cE 'ERROR|Traceback' || true

echo DOCKER_DISK
docker system df
