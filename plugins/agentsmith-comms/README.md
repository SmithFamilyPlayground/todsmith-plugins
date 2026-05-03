# agentsmith-comms

Lifecycle channel plugin for AgentSmith. Push-only. The plugin lets a
local supervisor process (the lifecycle service, separate process) nudge
a long-running `claude` session about idle, context pressure, and
external events without going through the user-facing telegram channel.

## Why a second channel

User-facing comms run through the `telegram` plugin (`@claude-plugins-official`).
Lifecycle nudges have a different posture: not user messages, no reply
contract, and on `agentsmith-comms` no tools at all. Decoupling makes
the lifecycle path independent of whichever user-facing surface is
current — when telegram is replaced later by a Tailscale-gated rich
client, this channel is unaffected.

See `docs/agentsmith-svc/` in the [AgentSmith
repo](https://github.com/SmithFamilyPlayground/AgentSmith) for the full
architecture write-up.

## Shape

- **Server name:** `agentsmith-comms` → claude sees events as `<channel
  source="agentsmith-comms" ...>`.
- **Capabilities:** `experimental['claude/channel']: {}` only. No `tools`,
  no `claude/channel/permission`.
- **Transport (inbound from supervisor):** Unix domain socket at
  `~/.claude/channels/agentsmith-comms/sock` (override with
  `AGENTSMITH_COMMS_STATE_DIR`).
- **Wire format:** newline-delimited JSON, one message per line.
- **Rendering:** the plugin owns prompt text via `renderForKind`; the
  supervisor sends `{ kind, ...fields }`, the plugin produces the body
  claude reads.

## Event kinds (initial set)

| `kind` | Inbound JSON | Rendered body |
| --- | --- | --- |
| `idle_check` | `{ kind: "idle_check", idle_seconds: 14400, last_user_message_at: "..." }` | `Lifecycle: you've been idle 4.0h. If there's nothing in flight, ...` |
| `context_pressure` | `{ kind: "context_pressure", used: 0.82, threshold: 0.80 }` | `Lifecycle: context window at 82% (threshold 80%). ...` |
| `health_pulse` | `{ kind: "health_pulse" }` | `Lifecycle: ping. Reply with a short status to confirm responsiveness.` |
| `external_event` | `{ kind: "external_event", source: "ci", body: "..." }` | `Lifecycle: external event from ci — ...` |

The body always begins with the literal token `Lifecycle:` so any
accidental leakage to the user is visually obvious.

## Install

Marketplace: `agentsmith-plugins`. Once published, wire on launch:

```sh
claude --channels plugin:telegram@claude-plugins-official \
                  plugin:agentsmith-comms@agentsmith-plugins
```

## Sending a manual nudge

```sh
echo '{"kind":"health_pulse"}' | nc -U ~/.claude/channels/agentsmith-comms/sock
```

`mcp__agentsmith-comms__*` tools do **not** exist — the plugin is
push-only. To respond, claude uses tools on other channels (typically
`mcp__telegram__reply` for user-facing replies).
