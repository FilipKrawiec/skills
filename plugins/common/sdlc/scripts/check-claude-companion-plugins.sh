#!/usr/bin/env sh
set -eu

required_plugins='filipkrawiec-core filipkrawiec-workflow filipkrawiec-authoring'
plugin_list="$(claude plugin list --json 2>/dev/null || true)"
enabled_plugins="$(printf '%s' "$plugin_list" | python3 -c '
import json
import sys

try:
    plugins = json.load(sys.stdin)
except (json.JSONDecodeError, TypeError):
    plugins = []

for plugin in plugins:
    if plugin.get("enabled") and isinstance(plugin.get("id"), str):
        print(plugin["id"].split("@", 1)[0])
' 2>/dev/null || true)"

missing=''
for plugin in $required_plugins; do
    if ! printf '%s\n' "$enabled_plugins" | grep -Fxq "$plugin"; then
        missing="${missing}${missing:+, }${plugin}"
    fi
done

[ -z "$missing" ] && exit 0

message="SDLC blocked: required companion plugins are unavailable to Claude: $missing"
input="$(cat)"
case "$input" in
  *UserPromptSubmit*)
    printf '%s\n' "$message" >&2
    exit 2
    ;;
  *)
    printf '%s\n' "$message"
    ;;
esac
