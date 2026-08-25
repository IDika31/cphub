#!/usr/bin/env bash
# Deploy CPHub to a remote host WITHOUT building on that host.
#
# The production box this was written for has 892 MB of RAM: `next build` wants
# ~1.5 GB and gets OOM-killed or swap-thrashes, and Go is not installed there at
# all. So both artifacts are produced locally — the Go binary via cross-compile,
# the Next output as a plain `.next` directory — and only finished bytes travel.
#
# Usage:
#   SSH_HOST=1.2.3.4 SSH_USER=deploy ./deploy/push.sh
#   ./deploy/push.sh --api-only        # skip the web build/upload
#   ./deploy/push.sh --web-only        # skip the Go build/upload
#   ./deploy/push.sh --no-migrate      # leave the database alone
#
# Auth: an SSH key is expected. If you only have a password, export CPHUB_SSH_PW
# and this script wires up an askpass helper for the session. The password is
# never written to disk and never stored in this file.
set -euo pipefail

# No host defaults live here: this repo is public, and a production IP plus a
# login name sitting in a committed file is an invitation. Point the script at an
# ~/.ssh/config alias (SSH_TARGET=myhost) — the alias carries the key, so nothing
# sensitive lands in this file or in shell history — or pass SSH_USER + SSH_HOST.
TARGET="${SSH_TARGET:-}"
if [ -z "$TARGET" ]; then
  if [ -z "${SSH_USER:-}" ] || [ -z "${SSH_HOST:-}" ]; then
    echo "set SSH_TARGET=<ssh config alias>, or both SSH_USER and SSH_HOST" >&2
    exit 2
  fi
  TARGET="$SSH_USER@$SSH_HOST"
fi
# Relative to the remote login's home, so the deploy account's name stays out of
# the file too. Every use below runs after a cd into it.
REMOTE_DIR="${REMOTE_DIR:-cphub}"

DO_API=1
DO_WEB=1
DO_MIGRATE=1
for arg in "$@"; do
  case "$arg" in
    --api-only) DO_WEB=0 ;;
    --web-only) DO_API=0 ;;
    --no-migrate) DO_MIGRATE=0 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Password fallback: OpenSSH 8.4+ honours SSH_ASKPASS_REQUIRE=force with no TTY.
if [ -n "${CPHUB_SSH_PW:-}" ]; then
  printf '%s\n' '#!/bin/sh' 'printf "%s\n" "$CPHUB_SSH_PW"' > "$STAGE/askpass.sh"
  chmod 700 "$STAGE/askpass.sh"
  export SSH_ASKPASS="$STAGE/askpass.sh" SSH_ASKPASS_REQUIRE=force DISPLAY="${DISPLAY:-:0}"
fi
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o NumberOfPasswordPrompts=1"
# shellcheck disable=SC2086
sshr() { ssh $SSH_OPTS "$TARGET" "$@"; }
# shellcheck disable=SC2086
scpr() { scp $SSH_OPTS "$@"; }

say() { printf '\n\033[1;35m==>\033[0m %s\n' "$*"; }

say "checking connectivity to $TARGET"
sshr 'echo "  connected: $(whoami)@$(hostname)"'

# ── build ────────────────────────────────────────────────────────────────────
if [ "$DO_API" = 1 ]; then
  say "cross-compiling the API for linux/amd64 (static, stripped)"
  ( cd apps/api
    GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o "$STAGE/cphub-api" ./cmd
    GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o "$STAGE/cphub-migrate" ./cmd/migrate )
  ls -lh "$STAGE/cphub-api" "$STAGE/cphub-migrate" | awk '{print "  " $9, $5}'
fi

if [ "$DO_WEB" = 1 ]; then
  say "building the web app locally"
  ( cd apps/web && npm run build >/dev/null )
  # cache/ is a local build accelerator, ~400 MB, and useless on the server.
  tar czf "$STAGE/next.tar.gz" -C apps/web --exclude=cache .next
  echo "  .next payload: $(du -h "$STAGE/next.tar.gz" | cut -f1)"
fi

# ── source subset ────────────────────────────────────────────────────────────
# Deliberately NOT the whole tree: the server carries deployment-specific edits
# (Caddy config, install scripts, .env) that must survive a push. The extension
# is shipped whole now that its server-side edits have been reconciled back into
# this repo — before that reconciliation, sweeping in all of src/shared clobbered
# the server's api.ts and broke its build.
say "packaging source"
cat > "$STAGE/shiplist" <<'LIST'
apps/api/cmd
apps/api/internal
apps/api/migrations
apps/api/go.mod
apps/api/go.sum
apps/web/package.json
apps/web/bun.lock
apps/web/public
apps/web/src
apps/extension/manifest.json
apps/extension/vite.config.ts
apps/extension/package.json
apps/extension/src
apps/extension/public
LIST
( cd "$ROOT" && tar czf "$STAGE/src.tar.gz" -T "$STAGE/shiplist" 2>/dev/null )
echo "  source payload: $(du -h "$STAGE/src.tar.gz" | cut -f1)"

# ── backup ───────────────────────────────────────────────────────────────────
say "backing up the remote (revertible)"
sshr "bash -s" <<REMOTE
set -e
TS=\$(date +%Y%m%d-%H%M%S)
B="\$HOME/cphub-backups/\$TS"
mkdir -p "\$B"
cd "$REMOTE_DIR"
git diff > "\$B/uncommitted.patch" 2>/dev/null || true
cp .env "\$B/env.backup" 2>/dev/null || true
[ -f apps/api/bin/cphub-api ] && cp apps/api/bin/cphub-api "\$B/cphub-api.prev"
[ -d apps/web/.next ] && tar czf "\$B/next.prev.tar.gz" -C apps/web --exclude=cache .next
sudo -n -u postgres pg_dump -p 5432 cphub > "\$B/cphub.sql" 2>/dev/null || echo "  (db dump skipped)"
echo "\$TS" > \$HOME/cphub-backups/LATEST
echo "  backup: \$B (\$(du -sh "\$B" | cut -f1))"
REMOTE

# ── upload ───────────────────────────────────────────────────────────────────
say "uploading"
UPLOADS="$STAGE/src.tar.gz"
[ "$DO_WEB" = 1 ] && UPLOADS="$UPLOADS $STAGE/next.tar.gz"
[ "$DO_API" = 1 ] && UPLOADS="$UPLOADS $STAGE/cphub-api $STAGE/cphub-migrate"
# shellcheck disable=SC2086
scpr $UPLOADS "$TARGET:/tmp/"

# ── apply ────────────────────────────────────────────────────────────────────
say "applying on the remote"
sshr "bash -s" <<REMOTE
set -e
export PATH="\$HOME/.bun/bin:\$PATH"
cd "$REMOTE_DIR"
TS=\$(date +%Y%m%d-%H%M%S)

tar xzf /tmp/src.tar.gz -C .
echo "  source applied"

sudo -n systemctl stop cphub-web cphub-api

if [ "$DO_API" = 1 ]; then
  [ -f apps/api/bin/cphub-api ] && mv apps/api/bin/cphub-api apps/api/bin/cphub-api.prev-\$TS
  install -m 755 /tmp/cphub-api apps/api/bin/cphub-api
  install -m 755 /tmp/cphub-migrate apps/api/bin/cphub-migrate
  echo "  api binary installed"
fi

if [ "$DO_WEB" = 1 ]; then
  ( cd apps/web && bun install >/dev/null 2>&1 ) && echo "  deps installed"
  [ -d apps/web/.next ] && mv apps/web/.next apps/web/.next.prev-\$TS
  tar xzf /tmp/next.tar.gz -C apps/web
  echo "  build \$(cat apps/web/.next/BUILD_ID) installed"
fi

if [ "$DO_MIGRATE" = 1 ] && [ -x apps/api/bin/cphub-migrate ]; then
  apps/api/bin/cphub-migrate 2>&1 | tail -2
fi

# The Download button serves this zip, so a stale one hands users an extension
# without the current fixes. Rebuilt on the server (vite, ~2s, negligible RAM)
# rather than shipped, so it always matches the source that just landed.
if [ -d apps/extension ]; then
  ( cd apps/extension
    bun install >/dev/null 2>&1 || true
    if bun run build >/tmp/ext-build.log 2>&1; then
      rm -f cphub-extension.zip
      ( cd dist && zip -qr ../cphub-extension.zip . )
      echo "  extension v\$(python3 -c 'import json;print(json.load(open("dist/manifest.json"))["version"])') zipped (\$(du -h cphub-extension.zip | cut -f1))"
    else
      echo "  extension build FAILED — zip left untouched:"; tail -6 /tmp/ext-build.log | sed 's/^/    /'
    fi )
fi

sudo -n systemctl daemon-reload
sudo -n systemctl start cphub-api
sleep 4
sudo -n systemctl start cphub-web
sleep 5
rm -f /tmp/src.tar.gz /tmp/next.tar.gz /tmp/cphub-api /tmp/cphub-migrate
REMOTE

# ── verify ───────────────────────────────────────────────────────────────────
say "verifying"
sshr "bash -s" <<'REMOTE'
fail=0
printf '  services: %s\n' "$(systemctl is-active cphub-api cphub-web | paste -sd' ')"
for probe in "http://127.0.0.1:3001/api/health" "http://127.0.0.1:3000/"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$probe")
  printf '  %-42s %s\n' "$probe" "$code"
  [ "$code" = 200 ] || fail=1
done
curl -s --max-time 10 http://127.0.0.1:3001/api/health | head -c 300; echo
free -m | head -2 | sed 's/^/  /'
[ "$fail" = 0 ] && echo "  OK" || { echo "  FAILED — roll back with the newest ~/cphub-backups entry"; exit 1; }
REMOTE

say "done"

