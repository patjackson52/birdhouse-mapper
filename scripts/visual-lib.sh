#!/usr/bin/env bash
# Shared image discovery for visual diff scripts.
# Source this file — do not execute directly.
#
# Usage:
#   source "$(dirname "$0")/visual-lib.sh"
#   discover_images "e2e/test-results" "map-view"  # filtered
#   discover_images "e2e/test-results"              # all
#
# After calling discover_images, these arrays are populated:
#   DIFF_NAMES=()      — test names with mismatches (expected + actual + diff exist)
#   NEW_NAMES=()       — test names with no baseline (actual only)
#   MATCH_COUNT=0      — count of matching screenshots (expected exists, no diff)
#   TOTAL_COUNT=0      — total visual tests found

DIFF_NAMES=()
NEW_NAMES=()
MATCH_COUNT=0
TOTAL_COUNT=0

discover_images() {
  local results_dir="$1"
  local filter="${2:-}"

  DIFF_NAMES=()
  NEW_NAMES=()
  MATCH_COUNT=0
  TOTAL_COUNT=0

  if [ ! -d "$results_dir" ]; then
    return
  fi

  # Find all actual screenshots (Playwright generates these on every visual comparison)
  local actual_files
  actual_files=$(find "$results_dir" -name '*-actual.png' 2>/dev/null | sort)

  for actual in $actual_files; do
    local dir
    dir=$(dirname "$actual")
    local basename
    basename=$(basename "$actual" | sed 's/-actual\.png$//')

    # Apply filter if provided
    if [ -n "$filter" ] && [[ "$basename" != *"$filter"* ]]; then
      continue
    fi

    TOTAL_COUNT=$((TOTAL_COUNT + 1))

    local expected="$dir/${basename}-expected.png"
    local diff="$dir/${basename}-diff.png"

    if [ -f "$diff" ] && [ -f "$expected" ]; then
      DIFF_NAMES+=("$basename")
    elif [ ! -f "$expected" ]; then
      NEW_NAMES+=("$basename")
    fi
  done

  # Also count expected-only files (matches) that have no actual (test passed, no diff generated)
  local expected_files
  expected_files=$(find "$results_dir" -name '*-expected.png' 2>/dev/null | sort)

  for expected in $expected_files; do
    local dir
    dir=$(dirname "$expected")
    local basename
    basename=$(basename "$expected" | sed 's/-expected\.png$//')

    if [ -n "$filter" ] && [[ "$basename" != *"$filter"* ]]; then
      continue
    fi

    local actual="$dir/${basename}-actual.png"
    local diff="$dir/${basename}-diff.png"

    # Only count as match if no diff was generated
    if [ ! -f "$diff" ] && [ ! -f "$actual" ]; then
      MATCH_COUNT=$((MATCH_COUNT + 1))
      TOTAL_COUNT=$((TOTAL_COUNT + 1))
    fi
  done
}

# Build a markdown table of visual diffs for GitHub comments.
# Args: $1 = base URL for images (Pages URL or relative path)
#        $2 = results dir (to locate files)
build_diff_table() {
  local base_url="$1"
  local results_dir="$2"
  local table=""

  if [ ${#DIFF_NAMES[@]} -eq 0 ] && [ ${#NEW_NAMES[@]} -eq 0 ]; then
    echo ""
    return
  fi

  table="| Screen | Expected | Actual | Diff |
|--------|----------|--------|------|"

  for name in "${DIFF_NAMES[@]}"; do
    table="$table
| ${name} | ![expected](${base_url}/${name}-expected.png) | ![actual](${base_url}/${name}-actual.png) | ![diff](${base_url}/${name}-diff.png) |"
  done

  for name in "${NEW_NAMES[@]}"; do
    table="$table
| ${name} | _New — no baseline_ | ![actual](${base_url}/${name}-actual.png) | — |"
  done

  echo "$table"
}

# Build a summary line like "2/4 match, 1 diff, 1 new"
build_summary() {
  local parts=()
  if [ "$MATCH_COUNT" -gt 0 ]; then
    parts+=("$MATCH_COUNT/$TOTAL_COUNT match")
  fi
  if [ ${#DIFF_NAMES[@]} -gt 0 ]; then
    parts+=("${#DIFF_NAMES[@]} diff(s)")
  fi
  if [ ${#NEW_NAMES[@]} -gt 0 ]; then
    parts+=("${#NEW_NAMES[@]} new")
  fi
  if [ "$TOTAL_COUNT" -eq 0 ]; then
    echo "No visual tests ran"
    return
  fi
  local IFS=', '
  echo "${parts[*]}"
}
