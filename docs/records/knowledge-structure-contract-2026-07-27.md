# Agent-Optimized Knowledge Directory Contract — 2026-07-27

This is the active directory contract. Agents inspect a small index first, then load only entries needed for the task or selected technology.

## Roots

For the MVP, Central Knowledge is this public repository's `knowledge/` directory. Project Knowledge is the fixed `.project-knowledge/` directory in a project repository. A separate Central Knowledge repository is a future evolution; it is not the MVP operating mode.

```text
skills/
├── knowledge/
│   ├── doctrines/              # required Central scaffold
│   ├── glossary/               # required Central scaffold
│   ├── preferences/            # required Central scaffold
│   ├── technology-profiles/    # required Central scaffold
│   ├── templates/              # required Central scaffold
│   ├── examples/               # required Central scaffold
│   ├── config-artifacts/       # required Central scaffold
│   └── .knowledge-index.json    # generated; do not author

project-repository/
├── .project-knowledge/          # sparse optional entry directories; generated index lives here
│   ├── glossary/                # created by project-init with a placeholder
│   └── project-profiles.yaml    # explicit active technology profiles
├── docs/                         # ordinary project documentation
└── docs/adr/                     # architecture decision records
```

Central Knowledge must visibly contain all seven kind directories. An otherwise empty Central category contains a tracked `.gitkeep` marker; the validator deliberately ignores that marker. Only the seven kind directories and `.knowledge-index.json` are allowed at the Central root. A Project Knowledge root also permits `project-profiles.yaml`, but its kind directories are optional sparse overrides: `project-init` creates only `glossary/` with its placeholder, not an empty mirror. Absence inherits Central Knowledge. Because this repository is public, its `knowledge/` content must not contain proprietary, client, or secret material.

`project-profiles.yaml` is the single small project configuration manifest and authoritative technology-profile selection surface. The CLI reads it during initialization and future verification; agents read it to select relevant Central Knowledge entries. Initialization creates an empty valid manifest without asking for profiles:

```yaml
version: 1
profiles: []
```

Populate it later with a two-space YAML list of lowercase kebab-case profile identifiers, after the project stack is known. The list is ordered and profiles are never inferred from project files.

After `project-init`, agents and users edit this manifest and add Project Knowledge override directories/entries only when needed. The CLI only reads, validates, reports, and generates derived indexes; it does not manage profiles or edit knowledge content.

## Entries

Entries are flat Markdown files named `<id>.md`. Identifiers are lowercase kebab-case and equal their front-matter `id`. Directory and `kind` pairs are fixed:

| Directory | `kind` |
| --- | --- |
| `doctrines/` | `doctrine` |
| `glossary/` | `glossary` |
| `preferences/` | `preference` |
| `technology-profiles/` | `technology-profile` |
| `templates/` | `template` |
| `examples/` | `example` |
| `config-artifacts/` | `config-artifact` |

Minimum front matter is:

```yaml
---
id: typescript
kind: technology-profile
disabled: false # optional; false when absent
---
```

`id` and `kind` are required. `disabled: true` is the explicit Project Knowledge mechanism for suppressing an inherited Central entry. Other declared scalar front-matter fields overlay matching Central fields; unspecified fields inherit. The Markdown body is readable guidance and is treated as an atomic field when a Project entry supplies one. Arrays and complex merges are intentionally unspecified.

## TypeScript example

```text
technology-profiles/typescript.md        # selected profile and declared native check
```

The profile uses the scalar front-matter field `check` for one deterministic native command. The TypeScript example declares `npm run verify`; the project defines that script according to its selected policy. This is deliberately the only TypeScript entry in the MVP: it proves selection, resolution, execution, and normalized evidence without turning this repository into a package template or universal standards engine.

## Generated index

Run:

```bash
python3 scripts/project-verify.py knowledge-index --root <knowledge-root>
```

The command validates the root and writes `.knowledge-index.json` scoped only to that root. It contains deterministic, sorted entry records with `id`, `kind`, relative `path`, and `disabled`. The index is a discovery inventory, not a semantic search result, resolver output, or Central/Project merge.

Use `--check` for a non-mutating freshness gate over a checked-in Central index. It fails with an actionable stale-index condition instead of regenerating the file:

```bash
python3 scripts/project-verify.py knowledge-index --check --root knowledge
```

Central validation requires every allowed category directory. To validate a sparse Project Knowledge root directly, add `--project`:

```bash
python3 scripts/project-verify.py knowledge-index --project --root <project-knowledge-root>
```

## Verification loop

Run the same local and CI gate:

```bash
python3 scripts/project-verify.py verify \
  --root <project-root> \
  --knowledge-root <central-knowledge-root>
```

The command validates Central and Project Knowledge structure, resolves each selected `technology-profile` entry's scalar `check` declaration (with a sparse Project Knowledge overlay when present), then runs the native command from the project root. It prints one concise pass result or one actionable failure/remedy. CI must invoke this same command, not duplicate its profile logic. The CLI does not install tools, author configuration, or interpret prose.

## Project scaffold check

Run:

```bash
python3 scripts/project-verify.py project-knowledge-check --root <project-root>
```

It checks the minimum Project Knowledge directory, deterministic profile manifest, and entry structure, then regenerates the Project Knowledge index. It does not execute selected profile checks.

## Design influences

This contract borrows only useful file-based patterns: [Spec Kit](https://github.github.io/spec-kit/) passes structured Markdown artifacts between phases and supports multiple coding agents; [OpenHands repository microagents](https://github.com/OpenHands/OpenHands/blob/main/AGENTS.md) demonstrate repository-scoped Markdown with front-matter-triggered loading; [OpenSpec](https://openspec.dev/) keeps specifications beside code organized by capability. It does not adopt their lifecycle, tool, or retrieval mechanisms.
