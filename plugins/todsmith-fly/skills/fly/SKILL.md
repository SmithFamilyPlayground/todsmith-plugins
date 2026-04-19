---
name: fly-todsmith
description: Fly.io runbook for the TodSmith deployment — the `tod-smith` app, its volume, secrets layout, tmux/tini/tailscale topology. PLACEHOLDER — content forthcoming. Do not rely on this skill yet; use `fly --help` and fly docs for now.
---

# fly (TodSmith) — placeholder

This skill will host the TodSmith-specific Fly.io runbook once
authored:

- `tod-smith` app anatomy (region, machine size, volume, tmux/tini
  PID 1, tailscale userspace, OAuth persistence on `/data`).
- Deploy (`fly deploy`), rollback, machine lifecycle, volume
  snapshots, logs.
- Secrets layout — the `TELEGRAM_<AGENT>_BOT_TOKEN` pattern, why
  `VAULT_*` names are forbidden (fly reserves them), how the
  entrypoint seeds them into per-agent `.env` files.
- Tailscale SSH as the only ingress; attaching to agent tmux sessions
  over tailnet; no public OpenSSH.
- Troubleshooting: respawn loop flapping, MCP telegram "Failed to
  connect" gotchas (cross-link to the telegram gotchas in TodSmith
  memory).

Until this skill has real content, use `fly --help`, fly's official
docs, and the existing `docs/overview.md` in TodSmith for context.

## Scope

TodSmith's `tod-smith` fly app only. Sibling fly apps Jimmy runs
personally (`claude-proxy`, etc.) are out of scope — those belong in
Jimmy's personal dev-setup plugins, not here.
