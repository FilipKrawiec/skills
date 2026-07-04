#!/bin/bash
set -euo pipefail

# Read stdin
INPUT_JSON=$(cat)

# Parse context details
USED_PCT=$(echo "$INPUT_JSON" | jq -r '.context_window.used_percentage // 0')
INPUT_TOKENS=$(echo "$INPUT_JSON" | jq -r '.context_window.total_input_tokens // 0')
OUTPUT_TOKENS=$(echo "$INPUT_JSON" | jq -r '.context_window.total_output_tokens // 0')
LIMIT_TOKENS=$(echo "$INPUT_JSON" | jq -r '.context_window.context_window_size // 0')

TOTAL_USED=$((INPUT_TOKENS + OUTPUT_TOKENS))

# Parse quotas
GEM_5H_PCT=$(echo "$INPUT_JSON" | jq -r '
  [ .quota | to_entries[]? | select(.key | contains("gemini") and contains("5h")) | .value.remaining_fraction * 100 | floor ] | .[0] // "N/A"
' 2>/dev/null || echo "N/A")

GEM_WK_PCT=$(echo "$INPUT_JSON" | jq -r '
  [ .quota | to_entries[]? | select(.key | contains("gemini") and contains("weekly")) | .value.remaining_fraction * 100 | floor ] | .[0] // "N/A"
' 2>/dev/null || echo "N/A")

OTH_5H_PCT=$(echo "$INPUT_JSON" | jq -r '
  [ .quota | to_entries[]? | select(.key | contains("3p") and contains("5h")) | .value.remaining_fraction * 100 | floor ] | .[0] // "N/A"
' 2>/dev/null || echo "N/A")

OTH_WK_PCT=$(echo "$INPUT_JSON" | jq -r '
  [ .quota | to_entries[]? | select(.key | contains("3p") and contains("weekly")) | .value.remaining_fraction * 100 | floor ] | .[0] // "N/A"
' 2>/dev/null || echo "N/A")

# Parse active model and VCS branch
ACTIVE_MODEL=$(echo "$INPUT_JSON" | jq -r '.model.display_name // .model.id // "N/A"' 2>/dev/null || echo "N/A")
if [ "$ACTIVE_MODEL" = "null" ] || [ -z "$ACTIVE_MODEL" ]; then
  ACTIVE_MODEL="N/A"
fi

CURRENT_DIR=$(echo "$INPUT_JSON" | jq -r '.workspace.current_dir // .cwd // "."')
VCS_BRANCH=$(git -C "$CURRENT_DIR" branch --show-current 2>/dev/null || echo "null")
if [ "$VCS_BRANCH" = "null" ] || [ -z "$VCS_BRANCH" ]; then
  VCS_BRANCH=$(echo "$INPUT_JSON" | jq -r '.workspace.git_branch // .vcs.branch // "N/A"' 2>/dev/null || echo "N/A")
fi
if [ "$VCS_BRANCH" = "null" ] || [ -z "$VCS_BRANCH" ]; then
  VCS_BRANCH="N/A"
fi

# ANSI helper constants using direct bash escape characters
R=$'\e[0m'
DIM=$'\e[90m'
BOLD_WHITE=$'\e[1m\e[37m'
SEP=$'\e[35m | \e[0m'
GREEN=$'\e[32m'
YELLOW=$'\e[33m'
RED=$'\e[31m'

# Helper: format integers into human readable string (K/M/etc)
human_format() {
  local num=$1
  if [ -z "$num" ] || [ "$num" -eq 0 ] 2>/dev/null; then
    echo "0"
    return
  fi
  if [ "$num" -ge 1000000 ] 2>/dev/null; then
    local main=$((num / 1000000))
    local frac=$(((num % 1000000) / 100000))
    echo "${main}.${frac}M"
  elif [ "$num" -ge 1000 ] 2>/dev/null; then
    local main=$((num / 1000))
    echo "${main}K"
  else
    echo "$num"
  fi
}

# Helper: color quota based on percentage
color_quota() {
  local pct=$1
  if [ -z "$pct" ] || [ "$pct" = "null" ] || [ "$pct" = "N/A" ]; then
    echo "${BOLD_WHITE}N/A${R}"
    return
  fi

  if [ "$pct" -gt 50 ]; then
    echo "${GREEN}${pct}%${R}"
  elif [ "$pct" -ge 20 ]; then
    echo "${YELLOW}${pct}%${R}"
  else
    echo "${RED}${pct}%${R}"
  fi
}

# Helper: format a pair of quotas separated by a dim slash
format_dual_quota() {
  local short_pct=$1
  local long_pct=$2
  
  local short_fmt
  short_fmt=$(color_quota "$short_pct")
  local long_fmt
  long_fmt=$(color_quota "$long_pct")
  
  echo "${short_fmt}${DIM}/${R}${long_fmt}"
}

# Format outputs
CTX_PCT_FMT=$(LC_NUMERIC=C printf "%.1f" "$USED_PCT")
CTX_USED_FMT=$(human_format "$TOTAL_USED")
CTX_LIMIT_FMT=$(human_format "$LIMIT_TOKENS")

CTX_FMT="${BOLD_WHITE}${CTX_PCT_FMT}%${R}${DIM} (${CTX_USED_FMT}/${CTX_LIMIT_FMT})${R}"

# Color quotas
GEM_FMT="${DIM}Gem: ${R}$(format_dual_quota "$GEM_5H_PCT" "$GEM_WK_PCT")"
OTH_FMT="${DIM}3P: ${R}$(format_dual_quota "$OTH_5H_PCT" "$OTH_WK_PCT")"
MODEL_FMT="${DIM}✦ ${R}${BOLD_WHITE}${ACTIVE_MODEL}${R}"
BRANCH_FMT="${DIM}⎇ ${R}${BOLD_WHITE}${VCS_BRANCH}${R}"

# Print final statusline
echo "${BRANCH_FMT}${SEP}${MODEL_FMT}${SEP}${CTX_FMT}${SEP}${GEM_FMT}${SEP}${OTH_FMT}"
