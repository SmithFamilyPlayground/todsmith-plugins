---
name: gh
description: Use when a Tod Smith agent touches GitHub — creating or reviewing PRs, triaging Actions runs, understanding the org rulesets, navigating the multi-repo layout (TodSmith / SecondBrain / todsmith-plugins). Complements Claude Code's built-in "Creating pull requests" guidance with TodSmith-specific body templates, bot attribution, and the auto-review / daily-rollup workflow expectations.
---

# gh (TodSmith)

Claude Code's built-in system prompt already covers the mechanics of
`gh pr create`, commit messages via HEREDOC, the Summary + Test plan
structure, and returning the PR URL. **Don't re-derive that here.**
This skill covers what's specific to TodSmith: our repo layout, our
bot identities, our auto-review + daily-rollup workflows, our org
ruleset, and the issue/label conventions baked into the tooling.

## Repos we touch

| Repo | Visibility | Branch policy | What lives here |
|---|---|---|---|
| `SmithFamilyPlayground/TodSmith` | Private | Feature-branch → PR → squash-merge | Operational workspace, agent cwds, shared scripts, hooks, fly/home-box deploy, docs. |
| `SmithFamilyPlayground/SecondBrain` | Private | Daily-branch (`daily/YYYY-MM-DD`) → auto-rollup PR to main | The vault. Memories, conversations, projects, zettel. **Agents write via `vault-commit.sh`, never directly.** |
| `SmithFamilyPlayground/todsmith-plugins` | **Public**, MIT | Feature-branch → PR | This marketplace. Skills + plugins for the team. |

The fine-grained PAT is at `~/.config/tod/secrets/github-pat` (chmod
600). Scopes and rotation are covered in `bootstrap/github-pat.sh` in
the TodSmith repo — go there before rotating.

## Bot identities

Each agent commits under its own email so `git blame` gives free
attribution. The helper scripts set this up; you rarely set it
manually. Format:

```
<agent>-bot@smith.family
```

Current identities: `tod-bot`, `jef-bot`, `jon-bot`, `sam-bot`,
`amy-bot`, `ema-bot`, `jax-bot`.

When you open a PR, the commit trailer should include the Claude
co-author line. This repo's `attribution` setting injects it
automatically; you don't add it to the HEREDOC.

## PR bodies in TodSmith

Our body template, built on Claude Code's default Summary + Test plan:

```markdown
## Summary

<1–3 bullets. Why, not what — the diff shows what.>

## <Optional topic sections>

<For multi-concern PRs. Example: "What changes", "Why this repo exists (separate from …)", "Follow-ups".>

## Test plan

- [x] <Thing I verified locally — check the box only after I actually ran it.>
- [ ] <Thing I haven't verified but the reviewer / CI should catch.>
- [ ] <Environment-specific check the reviewer needs to do on fly / home box.>
```

Guidelines that hold across the team:

- **Test plan must be bulleted markdown checkboxes.** The auto-review
  workflow expects this shape.
- **"Summary" bullets are `why`, not `what`.** The diff covers what.
  A good Summary bullet names the problem the change solves; a bad
  one restates the function name you added.
- **Link follow-up PRs in the body.** Stacked / dependent PRs must
  say so explicitly so reviewers know the order.

## Opening a PR

Use Claude Code's standard HEREDOC pattern from the system prompt.
TodSmith-specific: match the body template above; no manual
`Co-Authored-By` line (the `attribution` setting injects it).

```bash
gh pr create --title "<type>: <short imperative summary>" --body "$(cat <<'EOF'
## Summary

- <why bullet 1>
- <why bullet 2>

## Test plan

- [ ] <thing the reviewer should verify>
EOF
)"
```

Conventional-commit prefixes we use: `feat:`, `fix:`, `refactor:`,
`docs:`, `chore:`, `test:`. Keep titles under 70 chars.

## Reviewing a PR

```bash
gh pr view <num>                    # summary, checks, conversation
gh pr diff <num>                    # the full diff
gh pr checks <num>                  # CI status (our auto-review)
gh api repos/:owner/:repo/pulls/<num>/comments   # inline review comments
gh pr review <num> --approve        # or --request-changes / --comment
gh pr merge <num> --squash --delete-branch   # our default
```

**Only squash-merge.** Never merge-commit or rebase-merge. Keeps
history linear; the squash message is the PR title.

## The auto-review workflow (every TodSmith PR)

Our `.github/workflows/pr-review.yml` runs on every PR. It's a
lighter version of the SecondBrain daily-review workflow — checks
the changes won't break things but doesn't hold the PR hostage to
opinion.

What it runs:
- Gitleaks (secrets scan).
- Shellcheck on any changed `*.sh`.
- Claude semantic review on prose-y config changes (CLAUDE.md, docs/,
  settings.json) flagging PII or stale references.

Green → PR is mergeable. Findings → `needs-review` label + a comment;
PR stays open for a human to triage. Don't auto-dismiss the findings.

## SecondBrain daily-rollup pattern (different from code PRs)

Vault PRs are **opened by an Action, not by you.** The pattern:

1. Agents commit to `daily/YYYY-MM-DD` via `vault-commit.sh`.
2. `daily-rollup.yml` runs at 00:15 UTC, opens a PR from each
   prior-day `daily/*` branch into `main`.
3. `daily-review.yml` runs the sanity checks (gitleaks, frontmatter
   validator, wikilink lint, raw/ immutability, attribution, PII
   scan).
4. Clean → auto-merge (squash, delete branch). Findings →
   `needs-review` label, PR stays open.
5. `daily-prune.yml` (Sundays, 00:30 UTC) deletes merged daily
   branches older than 14 days.

**As an agent, you never open a vault PR by hand.** If you see one
you opened, close it — something went wrong.

Triage commands:

```bash
# List open daily PRs and their status
gh --repo SmithFamilyPlayground/SecondBrain pr list --label needs-review

# See what the daily-review workflow flagged
gh --repo SmithFamilyPlayground/SecondBrain pr view <num> --comments

# Force a rollup for today (manual dispatch)
gh --repo SmithFamilyPlayground/SecondBrain workflow run daily-rollup.yml
```

## Org ruleset: `protect-release-branches`

Applied to every repo in the `SmithFamilyPlayground` org. Enforces
on `main`, `staging`, `prod`:

- Force-push blocked.
- Branch deletion blocked.
- PR required for every merge.
- No bypass actors.

The PAT can't override it. That's intentional — the PAT creates
repos and pushes feature branches; the ruleset is the safety net.

If you hit a "push rejected" error on main, **don't try to bypass**
— it means you forgot to branch. Branch + PR + merge instead.

## Triaging Actions runs

```bash
gh run list --limit 10                                # recent runs, any workflow
gh run list --workflow=pr-review.yml --limit 5        # specific workflow
gh run view <run-id>                                  # summary
gh run view <run-id> --log-failed                     # only failed steps
gh run watch <run-id>                                 # live tail
gh run rerun <run-id>                                 # rerun from scratch
gh run rerun <run-id> --failed                        # rerun only failed jobs
```

Common failure modes:

- **Auto-review workflow failed**: usually gitleaks hit a false
  positive. Check the log; if it's a real secret, rotate immediately
  and history-rewrite (rare; coordinate with the user).
- **Daily-review workflow "needs-review"**: follow the link in the
  PR comment. Most common: frontmatter schema violation or a broken
  wikilink.

## Issues + labels

Open an issue only when the work won't be addressed in the current
session. TodSmith prefers PRs over issues — a PR with a failing test
documents the problem better than an issue.

Labels we use (both repos):

- `needs-review` — auto-applied by workflows when their checks flag
  something. Do not remove without addressing.
- `bug`, `enhancement`, `documentation`, `help wanted` — standard.
- `blocked` — PR / issue waiting on external work.

## Related

- `clean-gone` skill — prune local branches whose remotes are deleted.
  Use together with `gh pr list --state merged`.
- `todsmith-fly` skill — when CI failures trace back to fly deploy
  config.
- `vault-commit` skill — **always** the correct entry point for
  SecondBrain writes; never `git push` against main on that repo.
