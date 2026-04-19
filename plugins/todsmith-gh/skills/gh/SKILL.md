---
name: gh-todsmith
description: GitHub CLI runbook for the SmithFamilyPlayground org and TodSmith-owned repos. PLACEHOLDER — content forthcoming. Do not rely on this skill yet; fall back to `gh --help` and the `gh` manual for now.
---

# gh (TodSmith) — placeholder

This skill will host TodSmith-specific GitHub CLI patterns once
authored:

- Opening PRs with the TodSmith body convention (Summary + Test plan
  checklist + bot attribution).
- Reviewing PRs: `gh pr review`, the `needs-review` label workflow,
  handling the daily-rollup PRs on SecondBrain.
- Reading and triaging Actions runs (`gh run list`, `gh run view`, log
  tail patterns).
- Org ruleset management — when to add a repo to the
  `protect-release-branches` ruleset; how to verify it's applied.
- The fine-grained PAT at `~/.config/tod/secrets/github-pat` — scopes
  expected, how to rotate.

Until this skill has real content, agents should use `gh --help`,
`gh <cmd> --help`, and the gh manual directly.

## Scope

TodSmith-owned repos only (`SmithFamilyPlayground/*`). Not a
general-purpose `gh` runbook — Jon and Jax author here for each other
and for Tod's reviewer dispatches.
