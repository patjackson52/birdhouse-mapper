#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ADR_DIR="$REPO_ROOT/docs/adr"
TEMPLATE="$ADR_DIR/template.md"

usage() {
  echo "Usage: $0 \"Title of the ADR\""
  echo ""
  echo "Creates a new Architecture Decision Record from the template."
  echo ""
  echo "Example:"
  echo "  $0 \"Use Redis for caching\""
  exit 1
}

if [[ $# -lt 1 ]] || [[ -z "$1" ]]; then
  usage
fi

TITLE="$1"

# Find the next ADR number by scanning existing files
NEXT_NUM=1
if ls "$ADR_DIR"/[0-9]*.md &>/dev/null; then
  LAST_NUM=$(ls "$ADR_DIR"/[0-9]*.md | sed 's|.*/||' | grep -oE '^[0-9]+' | sort -n | tail -1)
  NEXT_NUM=$((LAST_NUM + 1))
fi

# Pad to 4 digits
NUM=$(printf "%04d" "$NEXT_NUM")

# Slugify the title: lowercase, spaces to hyphens, strip special chars
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')

FILENAME="$NUM-$SLUG.md"
FILEPATH="$ADR_DIR/$FILENAME"

# Get today's date
TODAY=$(date +%Y-%m-%d)

# Copy template and replace placeholders
cp "$TEMPLATE" "$FILEPATH"
sed -i '' "s/ADR-NNN/ADR-$NUM/" "$FILEPATH"
sed -i '' "s/# ADR-$NUM: Title/# ADR-$NUM: $TITLE/" "$FILEPATH"
sed -i '' "s/YYYY-MM-DD/$TODAY/" "$FILEPATH"

echo "$FILEPATH"
