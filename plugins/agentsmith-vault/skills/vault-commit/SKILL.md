---
name: vault-commit
description: Use when any Smith-family agent needs to write to `~/.secondbrain` — memories, conversation archives, project wiki entries, zettel notes. Codifies the `vault-commit.sh` helper, daily-branch lifecycle, frontmatter schema, and `raw/` immutability rule. Every vault write goes through this skill; `git push origin main` direct is forbidden.
---

# vault-commit

The AgentSmith agent family writes to a shared SecondBrain vault at
`~/.secondbrain`. Writes happen constantly (auto-memories, session
archives, research notes, project deliverables) so the workflow is
optimized for safety without friction: per-edit commits to a
daily-scoped branch, once-a-day rollup to `main`, non-destructive only.

## The contract

**Never run `git push origin main` or `git commit` against `main` directly inside the vault.** Every write must go through the `vault-commit.sh` helper located in
the AgentSmith operational workspace:

```bash
~/src/agent.smith/shared/scripts/vault-commit.sh "<commit message>"
```

The helper:

1. Switches to `daily/YYYY-MM-DD` (UTC), creating it from `origin/main`
   if new.
2. Refuses to proceed if any `*/raw/` file was modified
   (immutability guard — raw/ is append-only).
3. Stages and commits under the calling agent's bot identity —
   `tod-bot@smith.family`, `amy-bot@smith.family`, etc. — picked from
   `TOD_AGENT_NAME`.
4. Pushes the daily branch with `--set-upstream`.

Rollup to `main` happens automatically via two GitHub Actions workflows
on the SecondBrain repo: `daily-rollup.yml` (00:15 UTC) opens a PR
from each prior-day `daily/*` branch; `daily-review.yml` runs the
sanity checks below and auto-merges on green. You never open a
vault PR by hand.

## Calling the helper from a skill or session

```bash
cd ~/.secondbrain              # optional; helper uses VAULT_PATH env
TOD_AGENT_NAME="${TOD_AGENT_NAME:-tod}" \
  ~/src/agent.smith/shared/scripts/vault-commit.sh \
  "research: ADU zoning primer for Placer County"
```

Exit code 0 means the daily branch advanced; non-zero means the helper
bailed (commonly: empty diff, raw/ violation, or no git identity
configured for that agent). Read stderr — the helper prints a
specific reason.

## Write scope per agent

Each agent stays in its own slot unless it has ownership in a shared
area:

- **Auto-memory** → `~/.secondbrain/10_agents/<agent>/memory/`
- **Session archives** → `~/.secondbrain/10_agents/<agent>/conversations/YYYY/MM/`
  (wired via the `SessionEnd` archive hook — don't call manually)
- **Shared project work** → `~/.secondbrain/20_projects/<slug>/` —
  raw/ wiki/ outputs/ log.md. Agents collaborate here under the
  project's own scope rules.
- **Domain areas** → `~/.secondbrain/30_areas/<topic>/` — only if
  the agent owns that area (e.g. Amy writes `30_areas/health/`,
  Sam writes `30_areas/finance/`).
- **Reference + zettel** → `40_resources/`, `50_zettel/` — any agent
  may contribute; preserve prior content, don't rewrite.
- **Never touch**: `60_archive/` (frozen), other agents' `10_agents/<other>/`
  slots.

If you're unsure whether a path is in scope, the agent-specific
`CLAUDE.md` under `~/.secondbrain/10_agents/<agent>/CLAUDE.md` is
authoritative.

## Frontmatter — required on every new note

Every `.md` note committed to the vault needs YAML frontmatter with
these fields. The `frontmatter-validator` in the daily-review workflow
rejects the PR if any are missing.

```yaml
---
type: memory | conversation | project-note | zettel | wiki | reference
agent: tod | amy | sam | ema | jef | jon | jax
created: 2026-04-19T13:14:00Z      # ISO-8601 UTC
updated: 2026-04-19T13:14:00Z
sources: []                         # wikilinks or URLs that inform this note
status: active | stable | frozen
confidence: low | medium | high
---
```

For memory notes specifically, add:

```yaml
type: memory
memory_type: user | feedback | project | reference
name: "short name"
description: "one-line hook used in the memory index"
```

Use the `obsidian` skills (`obsidian-markdown`) for nuanced formatting
— wikilinks (`[[Note Name]]` preferred over markdown links),
callouts, embeds.

## Raw/ immutability

Files under any path matching `*/raw/*` are **append-only**. You may
add new files, you may not modify existing ones. The `raw/` directories
are immutable artifacts — downloaded pages (defuddle output), API
responses, primary sources. Synthesis goes in `wiki/`, deliverables in
`outputs/`.

If you need to correct a raw/ file, add a new one with a suffix like
`-corrected.md` and reference the original via frontmatter `supersedes:`.

## Sanity checks that gate the daily PR

The SecondBrain daily-review workflow runs these on every `daily/*` PR.
Fail any and the PR is labelled `needs-review` — it stays open for a
human to triage rather than auto-merging.

- **Gitleaks** — secrets scan (Anthropic keys, Fly tokens, Telegram bot
  tokens, GitHub PATs, bearer tokens).
- **Frontmatter validator** — all `.md` match the schema above for
  their declared `type`.
- **Wikilink lint** — `[[link]]` references must resolve.
- **raw/ immutability** — existing `*/raw/*` files can't be modified.
- **Attribution integrity** — frontmatter `agent:` matches the git
  committer (e.g. `agent: tod` ↔ committer `tod-bot@smith.family`).
- **Size + rate** — PRs above 5 MB or 200 commits raise warnings.
- **Claude PII review** — Haiku-powered semantic scan against
  `00_meta/schemas/pii-policy.md`. Flags third-party contact info,
  other people's financial/medical/gov-ID details, precise geolocation
  of others. Owner's own notes allowed.

If your commit fails any of these, fix in the same daily branch and
re-run `vault-commit.sh`; rollup sees the fixed version.

## Common pitfalls

- **Empty diff**: helper exits with "nothing to commit". Usually means
  you staged nothing or wrote to a path that `.gitignore` covers. Run
  `git -C ~/.secondbrain status` to confirm.
- **Wrong identity**: if `TOD_AGENT_NAME` is unset, the helper bails.
  Systemd user units set it via `Environment=TOD_AGENT_NAME=%i`;
  ad-hoc shells need to export it.
- **Daily branch drifted**: if rollup hasn't happened for a few days,
  the daily branch may lag behind `main`. Helper rebases on `main`
  before committing; conflicts surface as a normal git conflict.
  Resolve in the vault, then re-run the helper.
- **Pushed to main by accident**: don't. If it happened, the org
  ruleset should have rejected it. If it didn't, file an incident —
  that ruleset is load-bearing.

## Related

- `obsidian-markdown`, `obsidian-bases`, `json-canvas`, `defuddle` —
  formatting and ingest skills, always used together with this one.
- `agentsmith-gh` (forthcoming) — when you need to touch the SecondBrain
  repo metadata (issues, rollup workflow runs, labels).
