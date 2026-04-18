#!/usr/bin/env bash
set -e

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Automated Website Business — Setup Script  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Check prerequisites ────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "❌  Node.js is required. Install from https://nodejs.org"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "❌  npm is required."; exit 1; }

NODE_VERSION=$(node -e "process.stdout.write(process.version)")
echo "✓  Node.js $NODE_VERSION detected"

# ── Install dependencies ───────────────────────────────────────────────────────
echo ""
echo "Installing npm dependencies..."
npm install

# ── Create required directories ────────────────────────────────────────────────
echo ""
echo "Creating data directories..."
mkdir -p data/sites
mkdir -p logs

# ── Initialise already-contacted.json ─────────────────────────────────────────
if [ ! -f data/already-contacted.json ]; then
  echo '{"placeIds":[]}' > data/already-contacted.json
  echo "✓  Created data/already-contacted.json"
else
  echo "✓  data/already-contacted.json already exists"
fi

# ── Copy .env.example → .env ───────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓  Created .env from .env.example"
  echo ""
  echo "⚠️  IMPORTANT: Open .env and fill in all your API keys before running."
else
  echo "✓  .env already exists (not overwritten)"
fi

# ── Done ───────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Setup complete!                            ║"
echo "╟──────────────────────────────────────────────╢"
echo "║  Next steps:                                 ║"
echo "║  1. Fill in .env with your API keys          ║"
echo "║  2. npm run test-run   (verify one business) ║"
echo "║  3. npm start          (start full system)   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
