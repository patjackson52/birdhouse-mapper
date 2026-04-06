#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  echo "Usage: $0 <category> \"message\""
  echo ""
  echo "Appends a timestamped entry to the appropriate memory file."
  echo ""
  echo "Categories:"
  echo "  project       → memory/decisions/project-decisions.md"
  echo "  org           → memory/decisions/org-decisions.md"
  echo "  pattern       → memory/patterns/coding-patterns.md"
  echo "  architecture  → memory/patterns/architecture-patterns.md"
  echo "  release       → memory/procedures/release-process.md"
  echo "  incident      → memory/procedures/incident-response.md"
  echo "  product       → memory/context/product-context.md"
  echo "  team          → memory/context/team-context.md"
  echo "  inbox         → memory/inbox/note-<timestamp>.md (new file)"
  echo ""
  echo "Example:"
  echo "  $0 project \"Decided to use Redis for session caching\""
  exit 1
}

if [[ $# -lt 2 ]] || [[ -z "$1" ]] || [[ -z "$2" ]]; then
  usage
fi

CATEGORY="$1"
MESSAGE="$2"
TODAY=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)

# Map category to file
case "$CATEGORY" in
  project)      TARGET="$REPO_ROOT/memory/decisions/project-decisions.md" ;;
  org)          TARGET="$REPO_ROOT/memory/decisions/org-decisions.md" ;;
  pattern)      TARGET="$REPO_ROOT/memory/patterns/coding-patterns.md" ;;
  architecture) TARGET="$REPO_ROOT/memory/patterns/architecture-patterns.md" ;;
  release)      TARGET="$REPO_ROOT/memory/procedures/release-process.md" ;;
  incident)     TARGET="$REPO_ROOT/memory/procedures/incident-response.md" ;;
  product)      TARGET="$REPO_ROOT/memory/context/product-context.md" ;;
  team)         TARGET="$REPO_ROOT/memory/context/team-context.md" ;;
  inbox)
    TARGET="$REPO_ROOT/memory/inbox/note-$TIMESTAMP.md"
    mkdir -p "$(dirname "$TARGET")"
    echo "- [$TODAY] $MESSAGE" > "$TARGET"
    echo "Created: $TARGET"
    exit 0
    ;;
  *)
    echo "Error: Unknown category '$CATEGORY'"
    echo ""
    usage
    ;;
esac

# Ensure the target directory exists
mkdir -p "$(dirname "$TARGET")"

# Create the file with a heading if it doesn't exist
if [[ ! -f "$TARGET" ]]; then
  echo "# ${CATEGORY^} Notes" > "$TARGET"
  echo "" >> "$TARGET"
fi

# Append the entry
echo "- [$TODAY] $MESSAGE" >> "$TARGET"
echo "Recorded in: $TARGET"
