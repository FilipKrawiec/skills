# Evaluating a Skill

Source: https://agentskills.io/skill-creation/evaluating-skills

## Triggering

- Write about 20 prompts: 10 that should load the skill, 10 near-misses that share its words but need something else.
- Run each in a fresh agent; record whether the skill loaded.
- Fix the description to generalise, never by pasting a failed prompt's words into it.

## Behaviour

- Pick a real task the skill exists for. Run it in a fresh subagent with the skill and once without.
- Read the trace, not only the result. Wasted steps point to a vague rule, a rule that does not apply, or options without a default.
- Grade each expected outcome PASS or FAIL with evidence from the trace. No evidence is FAIL.
- Keep a change only when the run with it beats the run without it.

## Cutting

For each line ask: would the run go wrong without it? Delete it unless the answer is yes and a run shows it.

## Scripts

- Inputs by flag, env var or stdin; no prompts.
- `--help` with one example; errors say what was expected and how to fix it.
- Data on stdout, diagnostics on stderr; JSON when another agent reads it.
- Pin versions of one-off tools (`npx eslint@9.0.0`).
