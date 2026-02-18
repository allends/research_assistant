#!/bin/bash
set -e

echo "=== Research Assistant Setup ==="
echo

# Check for bun
if ! command -v bun &> /dev/null; then
  echo "Error: bun is not installed. Install it from https://bun.sh"
  exit 1
fi
echo "✓ bun found ($(bun --version))"

# Install dependencies
echo
echo "Installing dependencies..."
bun install
echo "✓ Dependencies installed"

# Check for .env
if [ ! -f .env ]; then
  echo
  echo "Creating .env with defaults..."
  cat > .env <<EOF
RA_DEV=1
RA_VAULT=./test-vault
EOF
  echo "✓ .env created"
else
  echo "✓ .env exists"
fi

# Check for qmd
echo
if command -v qmd &> /dev/null; then
  echo "✓ qmd found"
else
  echo "⚠ qmd not found — install with: bun install -g @tobilu/qmd"
  echo "  (required for init/index/search commands)"
fi

# Init vault if RA_VAULT is set
VAULT=$(grep -E '^RA_VAULT=' .env 2>/dev/null | cut -d= -f2-)
if [ -n "$VAULT" ] && [ -d "$VAULT/.obsidian" ]; then
  echo
  echo "Vault found at: $VAULT"
  echo "Run 'bun run src/index.ts init' to initialize it."
else
  echo
  echo "Set RA_VAULT in .env to point to your Obsidian vault, e.g.:"
  echo "  RA_VAULT=/path/to/your/vault"
fi

echo
echo "=== Setup complete ==="
echo
echo "Quick start:"
echo "  bun run src/index.ts init        # Initialize vault (uses RA_VAULT)"
echo "  bun run src/index.ts index       # Index vault documents"
echo "  bun run src/index.ts search \"q\"   # Search your vault"
