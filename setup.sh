#!/usr/bin/env bash
# setup.sh — install the WEB DASHBOARD's dependencies (THIS repository only).
#
# Usage:  ./setup.sh        (run from the repo root, right after cloning)
#
# v4.1.0: THIS REPOSITORY IS THE WEB DASHBOARD ONLY. The Discord bot is a
# SEPARATE repository — Thor-EN — with its own setup.sh:
#   https://github.com/dwisetyabudi15581/Thor-EN
# The two connect ONLY through the DASH API (HTTP + the shared
# DASH_API_TOKEN — see .env.example in both repositories).
set -euo pipefail
cd "$(dirname "$0")"

echo "==> [1/4] Checking Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "!! Node.js is not installed. Install it first (needs >= 20):"
  echo "   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
  echo "   sudo apt install -y nodejs"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "!! Your Node.js is v$(node -v) — the web dashboard needs >= 20. Please upgrade."
  exit 1
fi
echo "    Node $(node -v) OK"

echo "==> [2/4] Installing WEB DASHBOARD dependencies..."
npm install --no-audit --no-fund

echo "==> [3/4] Generating the Prisma client..."
npx prisma generate

echo "==> [4/4] Preparing .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    .env created from the example — DON'T FORGET to fill it in"
  echo "    (Discord OAuth CLIENT_ID/SECRET + the SAME DASH_API_TOKEN as the bot repo)"
fi

echo
echo "Done! Next steps:"
echo "  1. Fill in .env        (OAuth + SESSION_SECRET + DASH_API_TOKEN)"
echo "  2. npm run build"
echo "  3. npm run start       (dashboard at http://localhost:3000)"
echo ""
echo "  The Discord bot? It is a SEPARATE repository (v4.1.0):"
echo "    git clone https://github.com/dwisetyabudi15581/Thor-EN.git"
echo "    cd Thor-EN && ./setup.sh"
echo "    (its .env needs the SAME DASH_API_TOKEN as this repo's .env)"
echo ""
echo "  UI demo without the bot: npm run mock   (fake DASH API + demo data)"
echo "  Full production guide: the Thor-EN repository's DEPLOY.md"
