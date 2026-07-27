# TypeScript Verification-Loop Example

This smallest public example selects the Central `typescript` profile. The profile declares `npm run verify`; this project supplies that script. Run the same gate locally and in CI:

```bash
python3 ../../scripts/project-verify.py verify --root . --knowledge-root ../../knowledge
```

To observe a deterministic failure, change the script to `node -e "process.exit(1)"` and rerun. The CLI reports `profile.check_failed`, the exit status, and the command to rerun directly.
