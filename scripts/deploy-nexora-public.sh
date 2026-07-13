#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="${NEXORA_VPS_HOST:-trevoro-vps}"
REMOTE_DIR="${NEXORA_REMOTE_DIR:-/home/server/Nexora}"

echo "Sync Nexora code to ${VPS_HOST}:${REMOTE_DIR}"
rsync -az --relative --chown=server:server \
  server.js auth.js db.js package.json package-lock.json \
  lib routes src public scripts ops docs \
  "${VPS_HOST}:${REMOTE_DIR}/"

echo
echo "Validate and restart on VPS"
ssh -o BatchMode=yes "${VPS_HOST}" "set -euo pipefail; cd '${REMOTE_DIR}'; node --check routes/travel-routes.js; node --check src/ui/nexora-travel-pages.js; node --check lib/lead-builder.js; node --check routes/lead-builder-routes.js; node --check src/ui/nexora-lead-builder-pages.js; node --check scripts/launch-emarqet-auto-prahova.mjs; node --check lib/emarqet-monetization.js; node --check lib/emarqet-marketplace-services.js; node --check lib/emarqet-billing.js; node --check routes/emarqet-routes.js; node --check routes/emarqet-public-routes.js; node --check routes/billing-routes.js; node --check src/ui/nexora-emarqet-pages.js; node --check src/ui/emarqet-public-pages.js; systemctl restart nexora.service; systemctl status nexora.service --no-pager -l | sed -n '1,50p'"

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
