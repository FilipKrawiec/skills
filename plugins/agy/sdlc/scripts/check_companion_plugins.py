#!/usr/bin/env python3
"""Antigravity PreInvocation hook script to check for required companion plugins."""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
from typing import Any

REQUIRED_COMPANION_PLUGINS = {
    "filipkrawiec-sdlc",
    "filipkrawiec-core",
    "filipkrawiec-workflow",
    "filipkrawiec-authoring",
}


def get_installed_plugins_from_cli() -> set[str]:
    try:
        raw = subprocess.check_output(["agy", "plugin", "list"], text=True, stderr=subprocess.DEVNULL)
        data = json.loads(raw)
        return {plugin.get("name") for plugin in data.get("imports", []) if plugin.get("name")}
    except Exception:
        return set()


def get_installed_plugins_from_dir(plugin_dir: pathlib.Path | None = None) -> set[str]:
    if plugin_dir is None:
        custom_dir = os.environ.get("AGY_IDE_PLUGIN_DIR")
        plugin_dir = pathlib.Path(custom_dir) if custom_dir else pathlib.Path.home() / ".gemini" / "config" / "plugins"

    if not plugin_dir.is_dir():
        return set()

    return {entry.name for entry in plugin_dir.iterdir() if entry.is_dir() and not entry.name.startswith(".")}


def get_missing_companion_plugins(
    required: set[str] = REQUIRED_COMPANION_PLUGINS,
    installed_cli: set[str] | None = None,
    plugin_dir: pathlib.Path | None = None,
) -> list[str]:
    if installed_cli is None:
        installed_cli = get_installed_plugins_from_cli()
    installed_dir = get_installed_plugins_from_dir(plugin_dir)
    installed = installed_cli | installed_dir
    return sorted(required - installed)


def build_hook_payload(missing: list[str]) -> dict[str, Any]:
    if not missing:
        return {}
    return {
        "injectSteps": [
            {
                "ephemeralMessage": f"SDLC notice: missing companion plugins: {', '.join(missing)}"
            }
        ]
    }


def main() -> None:
    missing = get_missing_companion_plugins()
    payload = build_hook_payload(missing)
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
