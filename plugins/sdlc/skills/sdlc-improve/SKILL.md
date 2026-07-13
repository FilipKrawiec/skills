---
name: sdlc-improve
description: Record outcome evidence, retrospective insights, and follow-up improvements.
---

# IMPROVE

Lifecycle position: `IMPROVE` stage skill, before terminal `CLOSED`.

Require an `sdlc`-validated stage envelope; otherwise return `{status: REFUSED, code: INVALID_ENVELOPE, required_stage: sdlc}`. Manage this stage through the shared phase lifecycle defined by root `sdlc`.

Before completing IMPROVE, use the current validated Task snapshot, its Lifecycle history and results, referenced artifacts, and the deterministic measurement report to produce the required Agentic Diagnosis. State evidence separately from hypotheses; do not expose raw reasoning or present an inference as a fact. Request the terminal `CLOSED` state or a linked follow-up; do not authorize either. Read [agentic-diagnosis.md](references/agentic-diagnosis.md) before producing the diagnosis.
