#!/usr/bin/env bash
set -euo pipefail

APP_SERVICE="trevoro-site.service"
TUNNEL_SERVICE="cloudflared-trevoro.service"
BETA_SERVICE="nexora.service"
PUBLIC_URLS=(
  "https://trevoro.ro/"
  "https://www.trevoro.ro/"
  "https://beta.trevoro.ro/login"
)

echo "Restart ${APP_SERVICE}"
systemctl --user restart "${APP_SERVICE}"

echo "Restart ${TUNNEL_SERVICE}"
systemctl --user restart "${TUNNEL_SERVICE}"

echo
systemctl --user status "${APP_SERVICE}" "${TUNNEL_SERVICE}" "${BETA_SERVICE}" --no-pager -l

for public_url in "${PUBLIC_URLS[@]}"; do
  echo
  echo "HTTP check ${public_url}"
  for attempt in {1..20}; do
    if curl -fsSI "${public_url}" | sed -n '1,12p'; then
      continue 2
    fi
    echo "Waiting for public tunnel... (${attempt}/20)"
    sleep 2
  done

  echo "Public tunnel check failed for ${public_url}" >&2
  exit 1
done
