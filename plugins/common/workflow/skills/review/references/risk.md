# Risk assessment

The `devops` agent, task `risk`, sets a change's risk by reasoning about what it does. `drive` names it before the implementer starts, with the issue and its scope packet, and again when the draft opens, with the diff. The PR's `risk:R*` label picks the models and whether the owner reviews, so R2 is for critical changes only.

## Factors

| Factor | Question |
| --- | --- |
| What it does | Which behaviour, contracts and callers does it alter? |
| Blast radius | Who or what breaks if it is wrong: one feature, every run the workflow drives, production users? |
| Reversibility | Is a revert enough, or does it leave data, state, published artifacts or credentials behind? |
| Gates and trust | Does it touch authorization, credentials, CI, release, review or merge gates, or weaken a check? |
| Evidence | How well do the tests and checks observe the outcome? |

Paths, CODEOWNERS, CI files, migrations and the repository's own rules are evidence you weigh, never the verdict: code under `scripts/` or a build file is not R2 by where it lives.

## Levels

| Risk | When |
| --- | --- |
| R0 | Text only, with no behaviour change. |
| R1 | Everything else. |
| R2 | Critical: wrong would be hard to reverse, or it can weaken a gate, leak a credential, lose data or break every downstream run. |

Weak evidence raises the level only when the outcome it fails to observe is itself critical.

## Hand-back

```text
risk: R1
reason: changes how one parser reads hand-backs; a revert undoes it and the drive tests cover each field
```

`drive` sets the PR's label from it and posts the reason once as a PR comment; the newest assessment of the diff wins, so a draft can come out lower than the issue estimate. An owner-set `risk:R*` label on the issue is a floor `drive` applies; assess the change on its own. After a fix round, `drive` asks again only when the head touches files the last assessment did not see.
