---
id: typescript
kind: technology-profile
check: npm run verify
---
# TypeScript

Select this profile explicitly in `.project-knowledge/project-profiles.yaml` when TypeScript is part of the project stack.

The verification loop runs `npm run verify` from the project root. The project's selected Central/Project Knowledge policy defines that script and the native tools behind it. Preserve the command result as task evidence and run the same CLI gate in CI.

This entry intentionally does not provide package metadata, lint or formatting configuration, CI files, or a broad TypeScript standards framework.
