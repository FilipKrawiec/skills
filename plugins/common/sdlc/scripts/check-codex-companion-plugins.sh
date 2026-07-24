#!/usr/bin/env sh
set -eu

required_plugins='filipkrawiec-core filipkrawiec-workflow filipkrawiec-authoring'
plugin_list="$(codex plugin list 2>/dev/null || true)"
missing=''

for plugin in $required_plugins; do
    if ! printf '%s\n' "$plugin_list" | awk -v plugin="$plugin@" 'index($0, plugin) && /installed, enabled/ { found = 1 } END { exit !found }'; then
        missing="${missing}${missing:+, }${plugin}"
    fi
done

[ -z "$missing" ] && exit 0

message="SDLC blocked: required companion plugins are unavailable to Codex: $missing"
input="$(cat)"
case "$input" in
  *SessionStart*)
    printf '{"systemMessage":"%s"}\n' "$message"
    ;;
  *)
    printf '{"continue":false,"stopReason":"%s","systemMessage":"%s"}\n' "$message" "$message"
    ;;
esac
