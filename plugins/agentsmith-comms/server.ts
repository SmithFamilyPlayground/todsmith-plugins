#!/usr/bin/env bun
/**
 * agentsmith-comms — lifecycle channel for AgentSmith.
 *
 * Push-only Claude Code channel plugin. Declares `claude/channel`
 * capability only; no tools, no permission relay. Reads structured
 * events as NDJSON over a Unix domain socket and emits them as
 * `<channel source="agentsmith-comms" ...>` notifications. The plugin
 * owns prompt text — the service sends `{ kind, fields }`, the plugin
 * runs `renderForKind` and produces the human-readable body.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { mkdirSync, existsSync, unlinkSync, chmodSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { createServer } from 'net'

const STATE_DIR =
  process.env.AGENTSMITH_COMMS_STATE_DIR ??
  join(homedir(), '.claude', 'channels', 'agentsmith-comms')
const SOCK_PATH = join(STATE_DIR, 'sock')

const INSTRUCTIONS = [
  'Events from this channel are OPERATIONAL NUDGES from a local lifecycle supervisor — they are NOT messages from the user.',
  '',
  'Invariants:',
  '1. Never quote, paraphrase, or relay the body of an `<channel source="agentsmith-comms">` event to any user.',
  '2. If user contact is needed in response to a nudge, formulate your own message and send it via `mcp__telegram__reply`, using the `chat_id` from the most recent `<channel source="telegram">` event.',
  '3. This channel registers no tools. Do not attempt to call `mcp__agentsmith-comms__*` — none exist.',
  '4. Lifecycle events are de-duplicated by the supervisor, so respond once per distinct nudge.',
  '',
  'Event kinds you may see (`meta.kind`):',
  '- `idle_check` — you have been idle. Consider whether to wrap up and ask the user.',
  '- `context_pressure` — context window is filling. Consider summarising and `/compact`.',
  '- `health_pulse` — supervisor wants a sign-of-life. A short status to the user is appropriate.',
  '- `external_event` — non-lifecycle push (CI, cron, etc.). React based on the body.',
].join('\n')

const mcp = new Server(
  { name: 'agentsmith-comms', version: '0.0.1' },
  {
    capabilities: { experimental: { 'claude/channel': {} } },
    instructions: INSTRUCTIONS,
  },
)

await mcp.connect(new StdioServerTransport())

type InboundMsg =
  | { kind: 'idle_check'; idle_seconds?: number; last_user_message_at?: string }
  | { kind: 'context_pressure'; used?: number; threshold?: number }
  | { kind: 'health_pulse' }
  | { kind: 'external_event'; source?: string; body?: string }

function renderForKind(msg: InboundMsg): { content: string; meta: Record<string, string> } {
  const meta: Record<string, string> = { kind: msg.kind, ts: new Date().toISOString() }
  switch (msg.kind) {
    case 'idle_check': {
      const idle = msg.idle_seconds ?? 0
      const hours = (idle / 3600).toFixed(1)
      if (msg.last_user_message_at) meta.last_user_message_at = msg.last_user_message_at
      meta.idle_seconds = String(idle)
      return {
        content: `Lifecycle: you've been idle ${hours}h. If there's nothing in flight, consider asking the user whether to wrap up; otherwise summarise progress and continue.`,
        meta,
      }
    }
    case 'context_pressure': {
      const used = Math.round((msg.used ?? 0) * 100)
      const threshold = Math.round((msg.threshold ?? 0.8) * 100)
      meta.used = String(used)
      meta.threshold = String(threshold)
      return {
        content: `Lifecycle: context window at ${used}% (threshold ${threshold}%). Consider a checkpoint summary and \`/compact\`.`,
        meta,
      }
    }
    case 'health_pulse': {
      return {
        content: 'Lifecycle: ping. Reply with a short status to confirm responsiveness.',
        meta,
      }
    }
    case 'external_event': {
      const source = msg.source ?? 'unknown'
      const body = msg.body ?? '(no body)'
      meta.source = source
      return {
        content: `Lifecycle: external event from ${source} — ${body}`,
        meta,
      }
    }
  }
}

function isInbound(x: unknown): x is InboundMsg {
  if (typeof x !== 'object' || x === null) return false
  const k = (x as { kind?: unknown }).kind
  return (
    k === 'idle_check' ||
    k === 'context_pressure' ||
    k === 'health_pulse' ||
    k === 'external_event'
  )
}

mkdirSync(STATE_DIR, { recursive: true })
if (existsSync(SOCK_PATH)) unlinkSync(SOCK_PATH)

const sockServer = createServer(socket => {
  let buffer = ''
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8')
    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line) as unknown
        if (!isInbound(msg)) {
          process.stderr.write(`agentsmith-comms: ignoring unknown kind: ${line.slice(0, 200)}\n`)
          continue
        }
        const { content, meta } = renderForKind(msg)
        void mcp.notification({
          method: 'notifications/claude/channel',
          params: { content, meta },
        })
      } catch (err) {
        process.stderr.write(
          `agentsmith-comms: bad line: ${err instanceof Error ? err.message : err}\n`,
        )
      }
    }
  })
  socket.on('error', err => {
    process.stderr.write(`agentsmith-comms: socket error: ${err.message}\n`)
  })
})

sockServer.listen(SOCK_PATH, () => {
  try {
    chmodSync(SOCK_PATH, 0o600)
  } catch {}
  process.stderr.write(`agentsmith-comms: listening on ${SOCK_PATH}\n`)
})

sockServer.on('error', err => {
  process.stderr.write(`agentsmith-comms: server error: ${err.message}\n`)
  process.exit(1)
})
