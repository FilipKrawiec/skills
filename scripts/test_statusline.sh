#!/bin/bash
set -euo pipefail

# Define mock JSON metadata matching agy input format
MOCK_JSON='{
  "model": {
    "id": "gemini-1.5-pro",
    "display_name": "Gemini 1.5 Pro"
  },
  "context_window": {
    "used_percentage": 12.3,
    "total_input_tokens": 1230,
    "total_output_tokens": 456,
    "context_window_size": 200000
  },
  "workspace": {
    "current_dir": "/Users/filip/Developer/projects/github.com/FilipKrawiec/skills",
    "git_branch": "feat/agy-statusline"
  },
  "quota": {
    "gemini:5h": {
      "remaining_fraction": 0.85
    },
    "gemini:weekly": {
      "remaining_fraction": 0.95
    }
  }
}'

# Determine script path (under scripts/statusline.sh in workspace)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUSLINE_SCRIPT="${SCRIPT_DIR}/statusline.sh"

echo "Running test with mock JSON input..."
if [ ! -f "$STATUSLINE_SCRIPT" ]; then
  echo "Error: statusline.sh not found at $STATUSLINE_SCRIPT"
  exit 1
fi

# Run the statusline script with the mock input
OUTPUT=$(echo "$MOCK_JSON" | bash "$STATUSLINE_SCRIPT")
echo "Output: $OUTPUT"

# Assert branch is present in the output
EXPECTED_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
if [[ "$OUTPUT" == *"$EXPECTED_BRANCH"* ]]; then
  echo "PASS: Status line contains the correct branch name."
else
  echo "FAIL: Expected output to contain '$EXPECTED_BRANCH', but got: $OUTPUT"
  exit 1
fi
