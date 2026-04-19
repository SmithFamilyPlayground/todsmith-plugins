---
name: sprites-dev-todsmith
description: sprites.dev runbook adapted for TodSmith — path mangling / flag ordering / large-file upload gotchas. PLACEHOLDER — content forthcoming. Do not rely on this skill yet.
---

# sprites-dev (TodSmith) — placeholder

This skill will host the TodSmith-adapted sprites.dev runbook once
authored. The original lives in Jimmy's personal `spinlockdevelopment`
marketplace; we'll fork the bits that generalize and drop the
Windows-specific parts we don't care about on our Linux-only hosts.

Intended contents:

- When to use sprites.dev at all — the "ephemeral fly machine for a
  tool" use case.
- Core commands: `sprite exec`, `sprite api`, `sprite console`,
  `sprite checkpoint`, `sprite url`.
- File upload gotchas (large-file limits, path escaping on non-Windows
  hosts), command flag ordering, common error modes.
- How this fits with the `tod-smith` app's existing fly deployment —
  when to prefer an ephemeral sprite versus a proper machine.

Until this skill has real content, fall back to `sprite --help` and
the sprites.dev docs.

## Scope

TodSmith-flavored — headless Linux only. The Windows / Git Bash
path-mangling material in the upstream spindev version is out of
scope; our hosts don't run Windows.
