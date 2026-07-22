#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--replace] [--dry-run]" >&2
}

replace=false
dry_run=false
for argument in "$@"; do
  case "${argument}" in
    --replace) replace=true ;;
    --dry-run) dry_run=true ;;
    *)
      usage
      exit 2
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_root="${AGY_IDE_PLUGIN_DIR:-"${HOME}/.gemini/config/plugins"}"

plugin_names=(
  filipkrawiec-core
  filipkrawiec-workflow
  filipkrawiec-sdlc
  filipkrawiec-authoring
  filipkrawiec-agy-core
  filipkrawiec-agy-sdlc
)
plugin_sources=(
  plugins/common/core
  plugins/common/workflow
  plugins/common/sdlc
  plugins/common/authoring
  plugins/agy/core
  plugins/agy/sdlc
)

if [[ "${target_root}" == "/" ]]; then
  echo "AGY_IDE_PLUGIN_DIR must not be the filesystem root." >&2
  exit 2
fi

for index in "${!plugin_names[@]}"; do
  source_directory="${repo_root}/${plugin_sources[${index}]}"
  target_directory="${target_root}/${plugin_names[${index}]}"

  if [[ ! -f "${source_directory}/plugin.json" ]]; then
    echo "Missing source plugin manifest: ${source_directory}/plugin.json" >&2
    exit 1
  fi

  if [[ -e "${target_directory}" || -L "${target_directory}" ]] && \
    ! ([[ -L "${target_directory}" ]] && [[ "$(cd "${target_directory}" && pwd -P)" == "${source_directory}" ]]); then
    if ! "${replace}"; then
      echo "Refusing to replace existing IDE plugin snapshot: ${target_directory}. Re-run with --replace." >&2
      exit 1
    fi
  fi
done

if "${dry_run}"; then
  for index in "${!plugin_names[@]}"; do
    printf 'link %s -> %s\n' "${target_root}/${plugin_names[${index}]}" "${repo_root}/${plugin_sources[${index}]}"
  done
  exit 0
fi

mkdir -p "${target_root}"
backup_root="${target_root}/.skills-backups/$(date +%Y%m%d%H%M%S)"
created_backup=false

for index in "${!plugin_names[@]}"; do
  source_directory="${repo_root}/${plugin_sources[${index}]}"
  target_directory="${target_root}/${plugin_names[${index}]}"

  if [[ -L "${target_directory}" ]] && [[ "$(cd "${target_directory}" && pwd -P)" == "${source_directory}" ]]; then
    continue
  fi

  if [[ -e "${target_directory}" || -L "${target_directory}" ]]; then
    if ! "${created_backup}"; then
      mkdir -p "${backup_root}"
      created_backup=true
    fi
    mv "${target_directory}" "${backup_root}/${plugin_names[${index}]}"
  fi

  ln -s "${source_directory}" "${target_directory}"
  echo "Linked ${plugin_names[${index}]} for Antigravity IDE."
done

if "${created_backup}"; then
  echo "Previous IDE plugin snapshots were preserved in ${backup_root}."
fi
