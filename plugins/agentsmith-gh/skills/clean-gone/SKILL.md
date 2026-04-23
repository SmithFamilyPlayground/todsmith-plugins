---
name: clean-gone
description: Use to prune local git branches whose remotes have been deleted (shown as `[gone]` in `git branch -v`). Handles the worktree-before-branch ordering so cleanup works cleanly even when some branches are checked out in linked worktrees. Absorbed from `commit-commands`'s `/clean_gone` and owned by AgentSmith so we can evolve it as our worktree usage grows.
---

# clean-gone

When a remote branch is deleted (typically by `gh pr merge ... --delete-branch`
after a squash-merge), the local tracking branch remains. `git fetch --prune`
marks it as `[gone]` in `git branch -v` output but doesn't delete it. Over
time this clutters `git branch`, `git log --all`, and IDE branch pickers.

This skill cleans them up safely, including the case where some `[gone]`
branches are checked out in linked worktrees.

## When to run

- After you merge a few PRs.
- Before creating many new branches, to keep the list scannable.
- When `git branch -v` shows more than ~10 stale `[gone]` entries.

Run inside the repo you want to clean. Operates on local state only; never
touches the remote.

## The recipe

### 1. See what you're about to delete

```bash
git branch -v
```

Look for `[gone]` entries. Branches with a `+` prefix have associated
worktrees — those need extra handling.

### 2. See which branches have worktrees

```bash
git worktree list
```

Worktrees must be removed before their branch can be deleted.

### 3. Run the cleanup

```bash
git branch -v | grep '\[gone\]' | sed 's/^[+* ]//' | awk '{print $1}' | while read branch; do
  echo "Processing branch: $branch"
  # Find and remove any worktree linked to this branch.
  worktree=$(git worktree list | grep "\\[$branch\\]" | awk '{print $1}')
  if [ -n "$worktree" ] && [ "$worktree" != "$(git rev-parse --show-toplevel)" ]; then
    echo "  Removing worktree: $worktree"
    git worktree remove --force "$worktree"
  fi
  echo "  Deleting branch: $branch"
  git branch -D "$branch"
done
```

Behavior:

- `sed 's/^[+* ]//'` strips the `+` (worktree) or `*` (current) prefix so
  `awk` picks up the branch name cleanly.
- `worktree list | grep "[$branch]"` resolves the worktree path for a
  branch, if any. The double-backslash in `"\\[$branch\\]"` escapes the
  brackets for the shell's word-split rules; without it, `grep` reads
  them as a character class and matches the wrong thing.
- The "current worktree" guard (`!= $(git rev-parse --show-toplevel)`)
  prevents you from removing the worktree you're running the command
  in. If that branch is `[gone]`, `git branch -D` will fail loudly
  because the branch is checked out here — switch to `main` first.
- `git branch -D` (force) is needed because `[gone]` branches may
  have unmerged commits from the reviewer's perspective (they were
  squash-merged, so the local SHA isn't on main).

## Output you should see

```
Processing branch: fix/some-bug
  Deleting branch: fix/some-bug
Processing branch: feat/with-worktree
  Removing worktree: /home/you/src/project-worktrees/feat-with-worktree
  Deleting branch: feat/with-worktree
```

If nothing matches `[gone]`, the loop body never runs — "no cleanup
needed."

## Things to check first

- **Are you in the right repo?** `pwd`. The recipe edits local state
  only, but you probably want to prune the repo you mean to.
- **Have you fetched lately?** `git fetch --prune` populates the
  `[gone]` marker. Without a fresh fetch, `git branch -v` won't show
  it even for merged PRs.
- **Current branch**: if `HEAD` is on a `[gone]` branch, the loop will
  fail on that one (can't delete the branch you're on). Switch to
  `main` first: `git switch main`.

## Failure modes

| What you see | Why | Fix |
|---|---|---|
| `error: Cannot delete branch 'X' checked out at …` | You're on that branch. | `git switch main`, re-run. |
| `fatal: '.../X' is not a working tree` | Stale `.git/worktrees/X` metadata. | `git worktree prune`, re-run. |
| Nothing happens | No `[gone]` branches. | Run `git fetch --prune` first, then re-check. |
| Loop deletes something you wanted to keep | You had a local branch with the same name as a merged feature branch. | `git reflog`, recover the commit SHA. |

## Related

- `gh` skill — open / review / merge PRs. `gh pr merge ... --squash --delete-branch`
  is the upstream cause of `[gone]` branches in the first place.
- `git worktree prune` — cleans dangling worktree metadata without
  touching branches. Safe to run independently.
