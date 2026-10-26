#!/bin/sh
# PostgreSQL (+ optional media) backup with retention cleanup.
set -eu

TS=$(date +%Y%m%d_%H%M%S)
PG_OUT="/backups/postgres/${PGDATABASE}_${TS}.sql.gz"

echo "[backup] PostgreSQL dump started at $(date -Iseconds)"
PGPASSWORD="${PGPASSWORD}" pg_dump \
    -h "${PGHOST}" \
    -U "${PGUSER}" \
    -d "${PGDATABASE}" \
    --no-owner \
    --no-acl \
    | gzip -9 > "${PG_OUT}"
echo "[backup] PostgreSQL dump finished: ${PG_OUT} ($(du -h "${PG_OUT}" | cut -f1))"

find /backups/postgres -name '*.sql.gz' -type f -mtime +"${BACKUP_RETENTION_DAYS}" -delete

case "${BACKUP_MEDIA:-false}" in
    true|1|yes|on)
        MEDIA_OUT="/backups/media/media_${TS}.tar.gz"
        echo "[backup] Media archive started"
        tar -czf "${MEDIA_OUT}" -C /media .
        find /backups/media -name 'media_*.tar.gz' -type f \
            -mtime +"${BACKUP_MEDIA_RETENTION_DAYS:-30}" -delete
        echo "[backup] Media archive finished: ${MEDIA_OUT} ($(du -h "${MEDIA_OUT}" | cut -f1))"
        ;;
esac

echo "[backup] Done at $(date -Iseconds)"
