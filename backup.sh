#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${ROOT_DIR}/backups/sqlite"
DB_PATH="${ROOT_DIR}/database.db"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT_PATH="${BACKUP_DIR}/database-${STAMP}.db"

mkdir -p "${BACKUP_DIR}"

if [[ ! -f "${DB_PATH}" ]]; then
  echo "Database not found at ${DB_PATH}" >&2
  exit 1
fi

sqlite3 "${DB_PATH}" ".backup '${OUT_PATH}'"
echo "Backup created: ${OUT_PATH}"
