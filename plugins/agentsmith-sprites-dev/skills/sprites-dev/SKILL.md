---
name: sprites-dev
description: Use when a Smith-family agent runs `sprite` CLI commands or calls the sprites.dev API for ephemeral fly-machine workloads — service create/update, file uploads (with the compress-over-~20MB rule), checkpoints, URL auth. Triggers on `sprite exec`, `sprite api`, `sprite console`, `sprite checkpoint`, `sprite url`. AgentSmith version: headless-Linux-only; Windows/Git-Bash path-mangling rules are out of scope (we don't run on Windows).
---

# sprites-dev (AgentSmith)

`sprites.dev` runs ephemeral fly machines for one-off workloads —
useful when you need an isolated environment to run a tool, try a
library, or serve something temporarily without touching the
`tod-smith` production app.

This skill covers the CLI + API patterns that AgentSmith agents need,
adapted from the upstream `spinlockdevelopment/dev-setup` version
with the Windows/Git-Bash material stripped. All our hosts (fly + home
box) run Linux; the `MSYS_NO_PATHCONV`, `C:` drive collision, and
Git-Bash path-rewrite rules don't apply here.

## When to use sprites.dev vs. our fly app

| Use sprites.dev | Use the `tod-smith` fly app |
|---|---|
| Run a tool once, throw it away. | Long-running agents (Tod, specialties). |
| Try a library / CLI before committing to the image. | Anything that must persist state across redeploys. |
| Serve a one-off demo URL. | Anything Jimmy DMs over Telegram. |
| Scratch compute where you don't want `/data` clutter. | Anything that writes to SecondBrain. |

If you're tempted to use sprites for agent workloads, you're probably
reaching for the wrong tool — use the `agentsmith-fly` skill instead.

## Rules

### 1. Wrap exec commands in `bash -c`

`sprite exec -- <cmd>` passes the remainder to the CLI's own arg
parser first. Flags for your command (`-a`, `-l`, etc.) can be
intercepted by `sprite` itself. Wrap in `bash -c` so the remote shell
owns the parsing:

```bash
# Fragile — `-a` can be read as a sprite flag
sprite exec -- uname -a

# Robust — bash -c protects the argv
sprite exec -- bash -c "uname -a"
sprite exec -- bash -c "python3 --version"
sprite exec -- bash -c "cd /app && pip install -r requirements.txt"
```

Use single-argument `bash -c "..."` even for simple commands; the
consistency is worth more than a few keystrokes.

### 2. API syntax: path first, then `--`, then curl flags

`sprite api <path> -- [curl-options]`. Curl flags like `-X PUT` go
**after** the `--` separator:

```bash
# WRONG — -X parsed as a sprite flag
sprite api -X PUT /v1/sprites/rd-demo/services/web

# RIGHT — path first, then --, then curl flags
sprite api /v1/sprites/rd-demo/services/web -- \
  -X PUT \
  -H "Content-Type: application/json" \
  -d '{"cmd":"python3","args":["app.py"]}'
```

### 3. File uploads: relative paths, source:dest format

```bash
cd data/
sprite exec --file "geo.db:/app/data/geo.db" -- bash -c "ls -lh /app/data/geo.db"
```

The `--file` flag is `<local>:<remote>`. Keep the local path
relative and `cd` to its directory first; that keeps the intent
legible and avoids any colon-ambiguity edge cases.

### 4. Compress files larger than ~20 MB before upload

Uploads above roughly 20 MB hit HTTP 502 intermittently. Gzip first,
decompress inside the sprite:

```bash
cd data/
gzip -k -9 geo.db
sprite exec --file "geo.db.gz:/app/data/geo.db.gz" -- \
  bash -c "cd /app/data && gzip -d geo.db.gz && ls -lh geo.db"
rm geo.db.gz
```

`-k` keeps the original locally; `-9` is max compression (cheaper
upload, marginal cost on a fast CPU).

### 5. Prefer `cd` inside `bash -c` over `--dir`

The `--dir` flag works, but `cd` inside the remote shell is one
fewer piece of syntax to remember and composes cleanly with
multi-step work:

```bash
sprite exec -- bash -c "cd /app && pip install flask && python3 app.py"
```

## Service management

### Create or update a service

```bash
sprite api /v1/sprites/SPRITE_NAME/services/SERVICE_NAME -- \
  -X PUT \
  -H "Content-Type: application/json" \
  -d '{
    "cmd": "python3",
    "args": ["app.py"],
    "dir": "/app",
    "http_port": 5000,
    "env": {"KEY": "value"}
  }'
```

Service fields:

| Field | Type | Purpose |
|---|---|---|
| `cmd` | string | Executable. |
| `args` | string[] | Arguments. |
| `dir` | string | Working directory inside the sprite. |
| `http_port` | number | Port the service listens on; sprites.dev exposes it through the sprite URL. |
| `env` | map | Per-service env vars. |
| `needs` | string[] | Service dependencies (startup ordering). |

### Inspect / logs / restart

```bash
# List services
sprite api /v1/sprites/SPRITE_NAME/services

# Logs (most recent)
sprite api /v1/sprites/SPRITE_NAME/services/SERVICE_NAME/logs

# Restart via stop + start (the restart endpoint is flaky — use two calls)
sprite api /v1/sprites/SPRITE_NAME/services/SERVICE_NAME/stop  -- -X POST
sprite api /v1/sprites/SPRITE_NAME/services/SERVICE_NAME/start -- -X POST
```

## URL management

```bash
sprite info                              # current URL, auth, services
sprite url update --auth public          # anyone with the URL can hit it
sprite url update --auth sprite          # org members only (default)
```

**Auth defaults to `sprite`.** If you serve something public, flip to
`public` only for as long as needed, then back. Public URLs are
indexable.

## Checkpoints

Ephemeral sprites still get stable restore points:

```bash
sprite checkpoint create --comment "before the risky migration"
sprite checkpoint list
sprite restore v1                        # restore to named checkpoint
```

## Staging deploy flow

For a full end-to-end recipe (create → upload → mint secrets →
service PUT → `url update --auth public` → `sprite info` → teardown),
see the [AgentSmith sprites staging deploy
runbook](https://github.com/SmithFamilyPlayground/AgentSmith/blob/main/shared/runbooks/sprites-deploy.md).

This skill captures the individual command shapes. The runbook
captures the six-step sequence we actually use for deploys like
`dashboard-staging`, and is the input artifact for the future
`spindev-deploy` plugin that will port the same workflow into
claude-web-compatible slash commands.

Teardown, missing from the quick-ref table below:

```bash
sprite destroy <name> --force   # --force skips the TTY prompt; safe for scripts
```

## Quick reference

| Task | Command |
|---|---|
| Run a command | `sprite exec -- bash -c "command"` |
| Interactive shell | `sprite console` |
| Upload a file | `cd dir/ && sprite exec --file "file:/dest/file" -- bash -c "ls /dest/file"` |
| API GET | `sprite api /v1/sprites/NAME/endpoint` |
| API PUT/POST | `sprite api /v1/sprites/NAME/endpoint -- -X PUT -d '{...}'` |
| Set active sprite | `sprite use SPRITE_NAME` |
| List sprites | `sprite list` |
| Current sprite info | `sprite info` |

## AgentSmith-specific notes

- **Don't run agents on sprites.** Agents need the always-on
  attachable invariant (`min_machines_running=1`, OAuth on persistent
  volume, tmux + wrapper). Sprites are ephemeral; they lose OAuth on
  restart and there's no "stay alive" knob. Use the `tod-smith` fly
  app.
- **Don't write to SecondBrain from a sprite.** `vault-commit.sh`
  expects the AgentSmith workspace clone and the per-agent git
  identity; sprites don't have either. Produce artifacts on the
  sprite, pull them locally or to the fly app, *then* commit.
- **Secrets**: don't put long-lived secrets in `env:` on a sprite
  service. Use short-lived tokens. Sprites don't have fly's secret
  separation.

## When a rule here is wrong

Upstream `sprite` CLI evolves; if you find a rule that no longer
matches observed behavior, **update this file**. Every rule should
trace to a real failure. Add a one-line "why" next to a new rule
rather than a long rationale.

## Related

- `agentsmith-fly` skill — always the right place for agent workloads
  and anything with state.
- `vault-commit` skill — how SecondBrain writes happen; sprites are
  the wrong layer for this.
