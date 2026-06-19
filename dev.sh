#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# --force rebuilds everything regardless of mtime.
FORCE=0
for arg in "$@"; do
  [ "$arg" = "--force" ] && FORCE=1
done

pids=()

cleanup() {
  echo -e "\n${YELLOW}Stopping all services...${NC}"
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo -e "${YELLOW}Done.${NC}"
}
trap cleanup INT TERM EXIT

prefix_output() {
  local color="$1"
  local label="$2"
  while IFS= read -r line; do
    echo -e "${color}[${label}]${NC} $line"
  done
}

# needs_build MARKER SRC...
# Returns 0 (build) if --force, marker missing, or any source file is newer
# than the marker. Returns 1 (skip) when the marker is up to date.
needs_build() {
  local marker="$1"; shift
  [ "$FORCE" = "1" ] && return 0
  [ -e "$marker" ] || return 0
  local p found
  for p in "$@"; do
    [ -e "$p" ] || continue
    found="$(find "$p" -type f -newer "$marker" -print -quit 2>/dev/null)"
    [ -n "$found" ] && return 0
  done
  return 1
}

echo -e "${GREEN}Starting CPHub V4 dev environment...${NC}"
echo ""

# --- API ---
if needs_build "$ROOT/apps/api/bin/cphub-api" \
    "$ROOT/apps/api/cmd" "$ROOT/apps/api/internal" \
    "$ROOT/apps/api/go.mod" "$ROOT/apps/api/go.sum"; then
  echo -e "${YELLOW}Building API...${NC}"
  ( cd "$ROOT/apps/api" && go build -o ./bin/cphub-api ./cmd/main.go )
  echo -e "${GREEN}API build OK.${NC}"
else
  echo -e "${GREEN}API up to date — skip build.${NC}"
fi
echo ""

# --- Web ---
if needs_build "$ROOT/apps/web/.next/BUILD_ID" \
    "$ROOT/apps/web/src" "$ROOT/apps/web/package.json" \
    "$ROOT/apps/web/next.config.mjs" "$ROOT/apps/web/postcss.config.mjs" \
    "$ROOT/apps/web/tailwind.config.ts" "$ROOT/apps/web/tsconfig.json"; then
  echo -e "${YELLOW}Building web...${NC}"
  ( cd "$ROOT/apps/web" && bun run build )
  echo -e "${GREEN}Web build OK.${NC}"
else
  echo -e "${GREEN}Web up to date — skip build.${NC}"
fi
echo ""

# --- Extension ---
if needs_build "$ROOT/apps/extension/dist/manifest.json" \
    "$ROOT/apps/extension/src" "$ROOT/apps/extension/manifest.json" \
    "$ROOT/apps/extension/vite.config.ts" "$ROOT/apps/extension/tsconfig.json" \
    "$ROOT/apps/extension/package.json"; then
  echo -e "${YELLOW}Building extension...${NC}"
  ( cd "$ROOT/apps/extension" && bun run build )
  echo -e "${GREEN}Extension build OK.${NC}"
else
  echo -e "${GREEN}Extension up to date — skip build.${NC}"
fi
echo ""

( cd "$ROOT/apps/api" && ./bin/cphub-api 2>&1 ) \
  | prefix_output "$RED" "api" &
pids+=($!)

( cd "$ROOT/apps/web" && bun start 2>&1 ) \
  | prefix_output "$BLUE" "web" &
pids+=($!)

echo -e "${YELLOW}PIDs: api=${pids[0]} web=${pids[1]}${NC}"
echo -e "${YELLOW}Extension built to apps/extension/dist (load unpacked in browser).${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all. Use ./dev.sh --force to rebuild everything.${NC}"
echo ""

wait
