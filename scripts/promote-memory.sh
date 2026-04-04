#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  echo "Usage: $0 [--yes] <source-file> <target-category>"
  echo ""
  echo "Promotes a memory file (e.g., from inbox) to a target category."
  echo ""
  echo "Options:"
  echo "  --yes    Skip confirmation prompt"
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
  echo ""
  echo "Example:"
  echo "  $0 memory/inbox/note-2024-01-15-103045.md project"
  echo "  $0 --yes memory/inbox/note-2024-01-15-103045.md pattern"
  exit 1
}

AUTO_YES=false
if [[ "${1:-}" == "--yes" ]]; then
  AUTO_YES=true
  shift
fi

if [[ $# -lt 2 ]] || [[ -z "$1" ]] || [[ -z "$2" ]]; then
  usage
fi

SOURCE="$1"
CATEGORY="$2"

# Resolve source path relative to repo root if not absolute
if [[ "$SOURCE" != /* ]]; then
  SOURCE="$REPO_ROOT/$SOURCE"
fi

if [[ ! -f "$SOURCE" ]]; then
  echo "Error: Source file not found: $SOURCE"
  exit 1
fi

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
  *)
    echo "Error: Unknown category '$CATEGORY'"
    echo ""
    usage
    ;;
esac

# Show contents
echo "=== Source: $SOURCE ==="
echo ""
cat "$SOURCE"
echo ""
echo "=== Target: $TARGET ==="
echo ""

# Confirm
if [[ "$AUTO_YES" == false ]]; then
  read -rp "Append contents to target and remove source? [y/N] " CONFIRM
  if [[ "$CONFIRM" != [yY] ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# Ensure target directory exists
mkdir -p "$(dirname "$TARGET")"

# Create the file with a heading if it doesn't exist
if [[ ! -f "$TARGET" ]]; then
  echo "# ${CATEGORY^} Notes" > "$TARGET"
  echo "" >> "$TARGET"
fi

# Append contents
echo "" >> "$TARGET"
cat "$SOURCE" >> "$TARGET"

echo "Appended to: $TARGET"

# Remove source
rm "$SOURCE"
echo "Removed: $SOURCE"
