#!/usr/bin/env bash
set -euo pipefail

APP_SERVICE="nexora.service"
VPS_HOST="${NEXORA_VPS_HOST:-trevoro-vps}"
EXPECTED_PUBLIC_IP="${NEXORA_EXPECTED_IP:-46.225.237.185}"

if ! hostname -I 2>/dev/null | grep -qw "${EXPECTED_PUBLIC_IP}"; then
  echo "Local machine is not the public Nexora VPS (${EXPECTED_PUBLIC_IP}). Restarting ${APP_SERVICE} on ${VPS_HOST}."
  ssh -o BatchMode=yes "${VPS_HOST}" "cd /home/server/Nexora && systemctl restart ${APP_SERVICE} && systemctl status ${APP_SERVICE} --no-pager -l | sed -n '1,50p'"
  echo
  echo "Public origin check"
  node scripts/check-nexora-public-origin.mjs
  exit 0
fi

echo "Restart ${APP_SERVICE}"
systemctl --user restart "${APP_SERVICE}"

echo
systemctl --user status "${APP_SERVICE}" --no-pager -l

echo
echo "Public origin check"
for attempt in {1..20}; do
  if node scripts/check-nexora-public-origin.mjs; then
    exit 0
  fi
  echo "Waiting for public Nexora route... (${attempt}/20)"
  sleep 2
done

echo "Public Nexora route check failed" >&2
exit 1
