#!/usr/bin/env python3
"""Production-ready compact CLI verifier reading hierarchical AGENTS.md frontmatter."""

import sys
import os
import argparse
import subprocess
from pathlib import Path

def strip_enclosing_quotes(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and ((s.startswith("'") and s.endswith("'")) or (s.startswith('"') and s.endswith('"'))):
        return s[1:-1]
    return s

def parse_yaml_fallback(text: str) -> dict:
    """Clean YAML line-parser for AGENTS.md frontmatter."""
    res: dict = {}
    sec0 = None
    sec2 = None
    sec4 = None
    
    for line in text.splitlines():
        raw = line.rstrip()
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
            
        indent = len(raw) - len(raw.lstrip())
        
        if stripped.startswith("- "):
            item = strip_enclosing_quotes(stripped[2:])
            if sec0 and isinstance(res.get(sec0), list):
                res[sec0].append(item)
        elif ":" in stripped:
            parts = stripped.split(":", 1)
            k = strip_enclosing_quotes(parts[0])
            v = strip_enclosing_quotes(parts[1]) if len(parts) > 1 else ""
            if indent == 0:
                sec0, sec2, sec4 = k, None, None
                res[k] = v if v else ([] if k.startswith("active_") or k.endswith("_list") else {})
            elif indent == 2 and sec0 and isinstance(res.get(sec0), dict):
                sec2, sec4 = k, None
                res[sec0][k] = v if v else {}
            elif indent == 4 and sec0 and sec2 and isinstance(res.get(sec0, {}).get(sec2), dict):
                sec4 = k
                res[sec0][sec2][k] = v if v else {}
            elif indent == 6 and sec0 and sec2 and sec4 and isinstance(res.get(sec0, {}).get(sec2, {}).get(sec4), dict):
                res[sec0][sec2][sec4][k] = v
    return res

def parse_frontmatter_text(text: str) -> dict:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    try:
        end_idx = lines.index("---", 1)
    except ValueError:
        return {}
    
    yaml_text = "\n".join(lines[1:end_idx])
    try:
        import yaml
        return yaml.safe_load(yaml_text) or {}
    except ImportError:
        return parse_yaml_fallback(yaml_text)
    except Exception:
        return parse_yaml_fallback(yaml_text)

def find_agents_md(start_dir: Path) -> tuple[Path, dict]:
    curr = start_dir.resolve()
    while True:
        candidate = curr / "AGENTS.md"
        if candidate.is_file():
            try:
                content = candidate.read_text(encoding="utf-8", errors="ignore")
                config = parse_frontmatter_text(content)
                if config:
                    return candidate.parent, config
            except Exception:
                pass
        if curr.parent == curr:
            break
        curr = curr.parent
    print("ERROR: Could not find valid AGENTS.md with frontmatter in hierarchy", file=sys.stderr)
    sys.exit(1)

def detect_build_tool(root: Path, config: dict) -> tuple[str, dict]:
    build_tools = config.get("build_tools", {})
    fallback_tool = None
    
    for tool_name, tool_cfg in build_tools.items():
        if not isinstance(tool_cfg, dict):
            continue
        script_file = tool_cfg.get("build_script")
        if not script_file:
            if fallback_tool is None:
                fallback_tool = (tool_name, tool_cfg)
            continue
            
        target_path = root / script_file
        if target_path.exists():
            contains_str = tool_cfg.get("contains")
            if contains_str:
                try:
                    file_text = target_path.read_text(encoding="utf-8", errors="ignore")
                    if contains_str not in file_text:
                        continue
                except Exception:
                    continue
            return tool_name, tool_cfg
            
    if fallback_tool:
        return fallback_tool
    return "default", {}

def verify_git_hygiene(root: Path, strict: bool = False) -> None:
    res = subprocess.run(["git", "-C", str(root), "status", "--porcelain"], capture_output=True, text=True)
    if res.returncode == 0 and res.stdout.strip():
        if strict or os.environ.get("CI") == "true" or os.environ.get("STRICT_GIT") == "1":
            print("ERROR: Git worktree has uncommitted changes (strict git hygiene enforced)", file=sys.stderr)
            sys.exit(1)
        else:
            print("WARNING: Git worktree has uncommitted changes", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description="Canonical AGENTS.md Verifier")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="Start directory for AGENTS.md search")
    parser.add_argument("--strict-git", action="store_true", help="Fail with exit code 1 if git worktree has uncommitted changes")
    parser.add_argument("task", nargs="?", default="verify", help="Task name (default: verify)")

    args = parser.parse_args()
    project_root, config = find_agents_md(args.root)
    tool_name, tool_cfg = detect_build_tool(project_root, config)

    if args.task == "status":
        print(f"Project Root: {project_root}")
        print(f"Active Skills: {config.get('active_skills', [])}")
        print(f"Detected Tool: '{tool_name}' (via build_script: '{tool_cfg.get('build_script', 'N/A')}')")
        print(f"Available Tasks: {list(tool_cfg.get('lifecycle_tasks', {}).keys()) if isinstance(tool_cfg.get('lifecycle_tasks'), dict) else []}")
        return

    tasks = tool_cfg.get("lifecycle_tasks", {}) if isinstance(tool_cfg.get("lifecycle_tasks"), dict) else {}
    command = tasks.get(args.task)
    if not command or not isinstance(command, str) or not command.strip():
        print(f"ERROR: Task '{args.task}' not found or empty for tool '{tool_name}'. Available: {list(tasks.keys())}", file=sys.stderr)
        sys.exit(1)

    print(f"=== Executing [{tool_name}] task '{args.task}' -> '{command}' ===")
    res = subprocess.run(command, shell=True, cwd=project_root)
    if res.returncode != 0:
        print(f"ERROR: Task '{args.task}' failed with exit code {res.returncode}", file=sys.stderr)
        sys.exit(res.returncode)

    if args.task == "verify":
        verify_git_hygiene(project_root, strict=args.strict_git)

    print(f"PASS: Task '{args.task}' completed successfully.")

if __name__ == "__main__":
    main()
