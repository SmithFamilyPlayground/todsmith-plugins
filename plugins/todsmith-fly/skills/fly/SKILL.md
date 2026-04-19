---
name: fly
description: Use when a Tod Smith agent touches the `tod-smith` fly.io deployment — deploying, reading logs, reaching the machine, rotating secrets, understanding the persistence layout, triaging failures. TodSmith-specific conventions — the always-on attachable invariant, the userspace-networking Tailscale topology, the SECONDBRAIN_* env prefix (VAULT_* is fly-reserved), and the bot-token uniqueness constraint across fly + home box.
---

# fly (TodSmith)

Claude Code doesn't have built-in knowledge of `fly` specific to our
deployment. This skill covers everything TodSmith — the `tod-smith`
app's shape, why we built it this way, and the knobs that must not
change without thinking.

## App anatomy

| Property | Value | Why |
|---|---|---|
| App name | `tod-smith` | Also the fly hostname: `tod-smith.fly.dev`. |
| Org | `personal` (Jimmy Smith) | Not the SmithFamilyPlayground GitHub org — fly orgs are separate. |
| Region | `iad` | Closest to Jimmy; low-latency Telegram long-poll. |
| VM | `shared-cpu-1x`, 1 GB RAM, 1 CPU | Cheap. Claude Code + Telegram long-poll fits comfortably; raise only if we add parallel subagent dispatch. |
| `min_machines_running` | `1` | **Load-bearing.** Agents are "always on" — if this drops to 0, Jimmy's DMs silently queue in Telegram's buffer. Never set to 0 casually. |
| `auto_stop_machines` | `"off"` | Same invariant. Don't turn on. |
| Volume | `data` (3 GB, encrypted, snapshots enabled, retention 5) | Mounted at `/data`. Holds all state that must persist across deploys. |
| PID 1 | `tini` | Signal forwarding for the bash script + child processes. |
| Entrypoint | `fly/entrypoint.sh` in the TodSmith repo | See below. |

## The always-on attachable invariant

The whole operator flow depends on this shape:

1. Machine is always running (`min_machines_running=1`, `auto_stop_machines=off`).
2. `tini` is PID 1 → `fly/entrypoint.sh` → ends in `tail -f /dev/null` so the container stays alive even if every agent session dies.
3. One tmux session per agent, wrapped in `shared/scripts/agent-tmux-loop.sh` (respawns `claude --channels plugin:telegram@…` on exit with backoff).
4. Any operator can reach the machine via Tailscale SSH and `tmux attach -t <agent>` to drive the live Claude session — OAuth login, Telegram pairing, ad-hoc long conversations.

**Don't break any link in that chain without understanding what you'll lose.**

## Persistence layout on `/data`

| Path | Symlinked from | What lives here |
|---|---|---|
| `/data/secondbrain` | `$HOME/.secondbrain` | The SecondBrain vault clone (on `main`). Git-backed; `vault-commit.sh` writes here. |
| `/data/src/tod.smith` | `$HOME/src/tod.smith` | The TodSmith repo clone. All agent cwds, shared scripts, the entrypoint script itself. |
| `/data/claude` | `$HOME/.claude` | Claude Code state — OAuth creds, plugin marketplaces + cache, per-agent telegram state, session history. |
| `/data/tailscale` | *(direct)* | `tailscaled.state` — keeps the machine stable across reboots so the tailnet IP is consistent. |

First-boot and every-boot: entrypoint `git pull`s both repos, refreshes the marketplaces, symlinks `$HOME/*` → `/data/*`.

## Secrets inventory

```bash
fly --app tod-smith secrets list
```

| Name | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Yes | Fine-grained PAT for `git pull` / `git push` on both TodSmith + SecondBrain. Scoped read/write Contents + Metadata + PullRequests + Workflows; see `bootstrap/github-pat.sh`. |
| `TELEGRAM_<AGENT>_BOT_TOKEN` | One per enabled agent | Uppercased agent name. `TELEGRAM_TOD_BOT_TOKEN` for Tod, etc. Entrypoint seeds each into `/data/claude/channels/telegram-<agent>/.env` on boot. |
| `TS_AUTHKEY` | Optional but recommended | Tailscale auth key. If unset, Tailscale isn't started and the only shell path is `fly ssh console` (limited). With it, `ssh root@tod-smith-fly` from any tailnet device just works. |
| `FLY_DEPLOY_TOKEN` | Local env only (not a runtime secret) | App-scoped deploy token in `~/src/tod.smith/.env`. Export as `FLY_API_TOKEN` for flyctl. |

**Not a secret**: `ANTHROPIC_API_KEY`. Intentionally absent. Agents authenticate via OAuth (`/login` inside the tmux session), creds persist on `/data/claude/.credentials.json`, survive restarts.

### Rotating a secret

```bash
fly --app tod-smith secrets set TELEGRAM_TOD_BOT_TOKEN="<new-token>"
# Triggers a deploy automatically (all changed secrets → new release).
# Entrypoint re-seeds .env and respawns agents on next boot.
```

### The `VAULT_*` reserved-name gotcha

**fly strips any `VAULT_*` env var at runtime** — reserved for their HashiCorp Vault integration. `fly config show` and `fly secrets list` display them, but `/proc/<pid>/environ` inside the container does not have them. Our vault-related env uses `SECONDBRAIN_*` instead: `SECONDBRAIN_REPO`, `SECONDBRAIN_PATH`. Do not rename these back.

## Tailscale topology

Userspace networking (no TUN device required), started by the entrypoint when `TS_AUTHKEY` is set:

```
tailscaled \
  --state=/data/tailscale/tailscaled.state \
  --socket=/var/run/tailscale/tailscaled.sock \
  --tun=userspace-networking &

tailscale up \
  --authkey=$TS_AUTHKEY \
  --hostname=tod-smith-fly \
  --ssh \
  --accept-routes=false
```

Key facts:

- **No TUN, no iptables, userspace-only.** Keeps the image simple and works on fly's shared infra. Tailscale SSH still works under userspace-networking.
- **No OpenSSH server installed.** `openssh-client` is in the image for outbound `gh`/`git` flows; there is no inbound `sshd`. Tailscale SSH is the **only** inbound shell path.
- **Hostname `tod-smith-fly`** — the MagicDNS name Jimmy's other tailnet devices resolve. Don't rename without updating operator docs and muscle memory.
- **Gotcha**: `/usr/sbin` must be on `$PATH` in the image for `tailscaled` to launch (the binary is at `/usr/sbin/tailscaled`). Our Dockerfile ENV already covers this — captured as a fly gotcha because the slim node base image doesn't include it by default.

## Deploying

From `~/src/tod.smith/`:

```bash
# Standard deploy (builds + rolls the machine).
FLY_API_TOKEN=$FLY_DEPLOY_TOKEN fly deploy

# Deploy from a branch without pushing to main first (sanity check).
FLY_API_TOKEN=$FLY_DEPLOY_TOKEN fly deploy --strategy=immediate

# No-change redeploy (re-runs entrypoint; useful after a secret change
# if you need the re-seed to happen now vs. next natural restart).
FLY_API_TOKEN=$FLY_DEPLOY_TOKEN fly deploy --strategy=immediate --now
```

`deploy.strategy = "immediate"` in `fly.toml` means the old machine is replaced in one step rather than blue/green — fine for a single-machine always-on deployment, and simpler to reason about.

### Rollback

```bash
fly --app tod-smith releases list      # find the release number to revert to
fly --app tod-smith releases revert <N>
```

## Reaching the machine

**Tailscale SSH (preferred):**

```bash
ssh root@tod-smith-fly
# then inside:
tmux list-sessions
tmux attach -t tod        # or jef, etc.
# Ctrl-b d to detach — wrapper keeps claude alive.
```

**Fly's built-in SSH (fallback):** works even without Tailscale, but limited to what flyctl exposes.

```bash
fly --app tod-smith ssh console
fly --app tod-smith ssh console -C "tmux list-sessions"
fly --app tod-smith ssh console -C "tail -f /var/log/tailscaled.log"
```

### Running a one-off command without entering a shell

```bash
fly --app tod-smith ssh console -C "cat /data/claude/channels/telegram-tod/access.json"
fly --app tod-smith ssh console -C "journalctl --no-pager | tail -100"    # not applicable — no systemd in container
fly --app tod-smith ssh console -C "tmux capture-pane -t tod -p | tail -60"
```

## Logs

```bash
fly --app tod-smith logs                   # live tail
fly --app tod-smith logs --region iad      # filter to primary region
fly --app tod-smith logs | grep -i error   # quick filter
```

Entrypoint log lines are timestamped `[YYYY-MM-DDTHH:MM:SSZ]`. Things to look for:

- `launching tmux session '<agent>' in <cwd>` — agent started successfully.
- `warning: TELEGRAM_<AGENT>_BOT_TOKEN not set` — secret missing for an agent in `TOD_ENABLED_AGENTS`.
- `warning: /root/src/tod.smith/<agent> missing` — repo clone is missing the agent cwd (PR not merged yet on main?).
- `tailscale up failed` — check `/var/log/tailscaled.log` via `fly ssh console -C 'cat /var/log/tailscaled.log'`.

## Machines + volumes

```bash
fly --app tod-smith status              # machine state + release info
fly --app tod-smith machine list
fly --app tod-smith machine restart <id>
fly --app tod-smith volumes list
fly --app tod-smith volumes snapshots list --volume <id>
fly --app tod-smith volumes snapshots create <id>
```

**Don't** `fly volumes destroy` without a confirmed restore path — `/data` holds OAuth creds, the vault clone (also in git, but in-flight commits might not be), and per-agent telegram pairing state.

### Volume resize (offline)

```bash
fly --app tod-smith machine stop <id>
fly --app tod-smith volumes extend <vol-id> --size-gb <N>
fly --app tod-smith machine start <id>
```

## Promoting an agent to fly

1. Edit `fly.toml`: add the agent to `TOD_ENABLED_AGENTS = "tod,jef"`.
2. `fly secrets set TELEGRAM_<AGENT>_BOT_TOKEN="<token>"`.
3. **Before deploy, stop the local copy** if one is running. **Telegram's bot API allows exactly one `getUpdates` long-poll per token at a time.** A second poller gets silent 409 Conflict errors; whichever started second appears dead. On the home box:
   ```bash
   systemctl --user stop tod-smith-agent@<agent>.service
   ```
4. `fly deploy`.
5. Reach the machine, attach to the new tmux session, `/login` once for OAuth, pair the Telegram bot.

## Triage playbook

### Agent not responding to Telegram DMs

1. `fly logs` — is the container alive? Are there recent entrypoint lines?
2. `fly ssh console -C "tmux list-sessions"` — is the agent's session there?
3. `fly ssh console -C "tmux capture-pane -t <agent> -p | tail -40"` — what does the pane show?
4. `fly ssh console -C 'cd ~/src/tod.smith/<agent> && claude mcp list'` — telegram `✓ Connected`?
5. If "Failed to connect," see `project_telegram_plugin_gotchas.md` — usually the MCP startup race (resolves in ~60s or after `/reload-plugins`) or a missing `bun` (captured as gotcha #6).

### Container crash-loops on boot

1. `fly logs` will show the entrypoint error that caused exit.
2. Most common causes:
   - `GITHUB_TOKEN missing` — secret unset.
   - Image build failure — look at the deploy output, not the runtime logs.
   - A `VAULT_*` env var got reintroduced somewhere and fly strips it, breaking an unguarded path reference. Check for it.
3. `fly ssh console` **won't work on a crash-looping machine** — the SSH server (built into flyctl) needs the machine running. Instead: `fly deploy --strategy=immediate --config <known-good.toml>` to roll back the config, then debug.

### Tailscale SSH stopped working

1. `fly ssh console -C 'cat /var/log/tailscaled.log | tail -100'`.
2. Check the key: `TS_AUTHKEY` is often short-lived (default 90 days). Rotate via Tailscale admin → `fly secrets set TS_AUTHKEY="tskey-auth-..."`.
3. Verify hostname still matches: `fly ssh console -C 'tailscale status | head'` — if it's showing a different hostname, the state may have been wiped and a new device registered.

### OAuth creds wiped

1. `fly ssh console -C 'ls -la /data/claude/.credentials.json'` — still there?
2. If missing: attach to each agent's tmux (`tmux attach -t <agent>`), `/login`, re-authenticate. Creds re-persist to the same path.
3. If the volume was recreated, OAuth + every per-agent telegram state is gone — full re-pair is needed.

## Related

- `vault-commit` skill — how agents write SecondBrain. Runs inside these tmux sessions against `/data/secondbrain`.
- `gh` skill — PR and CI flow for `tod-smith.fly.dev` releases driven by `fly/entrypoint.sh` + `fly.toml` changes.
- `clean-gone` skill — irrelevant for fly's state but useful locally after many deploys.
- Telegram gotchas memory — the triage matrix for MCP connection issues; especially gotcha #6 (bun-on-PATH), which blocked bring-up on the home box and is pre-solved in the fly Dockerfile.
