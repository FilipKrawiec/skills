# Health targets frozen 2026-10-18

Base: `93ed7e937214625528ba88c3cdf3bdb10b6be37e`. Scope: the two CI workflows; confidence configuration belongs to the parent change.

| Dependency | Previous | Frozen stable target |
| --- | --- | --- |
| actions/checkout | v4.2.2 | v7.0.1, `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| actions/setup-python | v5.4.0 | v7.0.0, `5fda3b95a4ea91299a34e894583c3862153e4b97` |
| extractions/setup-just | v4 | Unchanged, `53165ef7e734c5c07cb06b3c8e7b647c5aa16db3` |
| just | 1.59.0 | Unchanged, 1.59.0 |
| gitleaks/gitleaks-action | v2 | v3.0.0, `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` |
| Gitleaks scanner | Default 8.24.3 | Explicit 8.30.1 |
| Python | CI 3.11 | 3.15.0 |
| PyYAML | Unpinned | 6.0.3 |
| Runner OS | ubuntu-latest (24.04) | ubuntu-26.04, generally available |
| Confidence probe only | Not configured by this slice | coverage 7.16.2, radon 6.0.1, cosmic-ray 8.7.0; xenon 0.9.3 added by the parent |

Node 24 actions require runner >=2.327.1. setup-just is composite and pins setup-crate v2.0.0 (Node 24). Checkout v7 changes credential storage and restricts unsafe fork checkout on triggers not used here. setup-python's removed pip-install input is unused. Gitleaks v3 retains scanner default 8.24.3, requiring a separate explicit scanner pin; scanner 8.30.1 retains the deprecated detect command used by the action.

Python 3.15.0 is stable and has setup-python downloads for Ubuntu 26.04. PyYAML's classifiers/wheels stop at 3.14, but installation from source and parser execution succeeded on 3.15.0; that metadata gap does not justify a Python exception. No fallback was taken. PyYAML used its pure-Python parser (`yaml.__with_libyaml__ == False`).

## Compatibility evidence

Disposable environment: `/private/tmp/skills-health-20261018-leaf/venv315`, macOS arm64, CPython 3.15.0. Cache, managed Python downloads and disposable uv runner were also under this temporary directory. The system uv lacked 3.15 download metadata; a disposable current uv resolved it without a global installation.

- `uv tool run --from uv uv venv --python 3.15.0 --seed <env>`: exit 0 with UV_CACHE_DIR, UV_PYTHON_INSTALL_DIR, UV_TOOL_DIR and UV_TOOL_BIN_DIR directed into the temporary directory.
- `uv pip install --python <env>/bin/python PyYAML==6.0.3 coverage==7.16.2 radon==6.0.1 cosmic-ray==8.7.0`: exit 0; all four imports, version checks, CLI help and a YAML parse passed.
- `<env>/bin/python -m unittest discover -s scripts/tests -p test_release_automation.py`: exit 0, 20 tests passed in 7.272s against the current shared worktree.
- Temporary sample: `coverage run --data-file=.coverage -m unittest test_sample` and `radon cc sample.py -s`: exit 0; one passing test and complexity A (1).
- Temporary sample: `cosmic-ray init config.toml session.sqlite`, `cosmic-ray baseline config.toml`, and `cosmic-ray exec config.toml session.sqlite`: exit 0; 13 normal worker outcomes, all 13 mutations killed. An initial baseline invocation mistakenly supplied a session argument (exit 2); the documented invocation above passed.
- Parsed both workflow YAML files and compared permissions, job controls, checkout refs/paths/credential settings and shell commands against HEAD: exit 0; only approved dependency/runtime changes differ.

The sample establishes tool operation, not repository confidence scores. Hosted Ubuntu execution, the full verify gate and repository metric measurements remain the parent's delivery evidence. No workflow was dispatched, release settings changed or code pushed. The literal publication hold, permissions and trust job separation remain unchanged. The parent integrates confidence tools separately. It also pins upload-artifact v7.0.2 (`cf430e030ddbb5b0abf93d22962f4752f3646cd9`) for native evidence retention, verified against its upstream release and tag.

## Primary sources

- [Checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) and [migration/runtime documentation](https://github.com/actions/checkout/tree/v7.0.1).
- [setup-python v7.0.0](https://github.com/actions/setup-python/releases/tag/v7.0.0) and [Python download manifest](https://github.com/actions/python-versions/blob/main/versions-manifest.json).
- [setup-just v4 manifest](https://github.com/extractions/setup-just/blob/v4/action.yaml), [pinned setup-crate manifest](https://github.com/extractions/setup-crate/blob/0551596312d4008a6dfbc4d3c38fa20eaef46d2d/action.yaml), [just 1.59.0](https://github.com/casey/just/releases/tag/1.59.0).
- [Gitleaks action v3.0.0](https://github.com/gitleaks/gitleaks-action/releases/tag/v3.0.0), [default scanner selection](https://github.com/gitleaks/gitleaks-action/blob/v3.0.0/src/index.js), [scanner 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), [legacy CLI compatibility](https://github.com/gitleaks/gitleaks/blob/v8.30.1/cmd/detect.go).
- [Python 3.15.0 stable release](https://www.python.org/downloads/release/python-3150/), [PyYAML 6.0.3 metadata](https://pypi.org/pypi/PyYAML/6.0.3/json).
- [Ubuntu 26.04 image and GA announcement](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md).

- [Artifact upload v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2).
