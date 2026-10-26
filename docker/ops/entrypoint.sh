#!/bin/sh
# Backup scheduler: runs pg_dump on a cron schedule with log output to stdout.
set -eu

: "${BACKUP_SCHEDULE_CRON:=0 3 * * *}"
: "${BACKUP_RETENTION_DAYS:=14}"
: "${BACKUP_MEDIA:=false}"
: "${BACKUP_MEDIA_RETENTION_DAYS:=30}"
: "${PGHOST:=db}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"

mkdir -p /backups/postgres /backups/media

# dcron reads system crontab from /etc/crontabs/root
printf '%s /ops/run-backup.sh >> /proc/1/fd/1 2>> /proc/1/fd/2\n' \
    "${BACKUP_SCHEDULE_CRON}" > /etc/crontabs/root

echo "[ops] Backup scheduler started"
echo "[ops]   cron:      ${BACKUP_SCHEDULE_CRON}"
echo "[ops]   retention: ${BACKUP_RETENTION_DAYS} days (postgres)"
echo "[ops]   media:     ${BACKUP_MEDIA} (retention ${BACKUP_MEDIA_RETENTION_DAYS} days)"

if [ "${BACKUP_RUN_ON_START:-false}" = "true" ]; then
    echo "[ops] Running initial backup (BACKUP_RUN_ON_START=true)..."
    /ops/run-backup.sh
fi

exec crond -f -l 2
