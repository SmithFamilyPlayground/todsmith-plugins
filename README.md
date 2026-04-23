# agentsmith-plugins

Claude Code plugin marketplace for the [AgentSmith](https://github.com/SmithFamilyPlayground/AgentSmith)
agent team.

Public + MIT licensed so any host that runs AgentSmith agents (fly
machines, home boxes, future dev boxes) can install without a PAT, and
so the runbooks can be referenced by other projects with similar
stacks.

## Plugins

| Plugin | Status | Purpose |
|---|---|---|
| `agentsmith-vault` | **initial** | How agents write to `~/.secondbrain` — `vault-commit.sh`, frontmatter, daily-branch lifecycle, `raw/` immutability. Every agent enables this. |
| `agentsmith-gh` | **initial** | GitHub CLI runbook — PR conventions, auto-review + daily-rollup workflow, ruleset awareness, Actions triage. Includes the `clean-gone` skill. |
| `agentsmith-fly` | **initial** | Fly.io runbook for the `tod-smith` app — anatomy, persistence, Tailscale topology, secrets rotation (incl. `VAULT_*` gotcha + Telegram-poller uniqueness), deploy/rollback, triage. |
| `agentsmith-sprites-dev` | *placeholder* | sprites.dev runbook adapted for AgentSmith. |

Follow-on PRs will flesh out the three placeholders.

## Install

### Per-agent (recommended — declare in `.claude/settings.json`)

```jsonc
{
  "enabledPlugins": {
    "agentsmith-vault@agentsmith-plugins": true
  },
  "extraKnownMarketplaces": {
    "agentsmith-plugins": {
      "source": {
        "source": "github",
        "repo": "SmithFamilyPlayground/agentsmith-plugins"
      }
    }
  }
}
```

### Interactive (any cwd)

```bash
claude plugin marketplace add SmithFamilyPlayground/agentsmith-plugins
claude plugin install agentsmith-vault@agentsmith-plugins
```

## Conventions

- **Skills**, not slash commands, as the primary surface. Skills load
  into the model's available-skills list and trigger on intent; slash
  commands are added sparingly for deterministic operator workflows.
- **AgentSmith-specific**. These runbooks assume the AgentSmith deployment
  (the `tod-smith` fly app, the `~/.secondbrain` vault, the
  `SmithFamilyPlayground` GitHub org, the `daily/YYYY-MM-DD` branch
  flow). If you're running a different stack, fork and adapt.
- **Headless-first**. Skills must work inside a systemd user unit or a
  fly container with no GUI. GUI-dependent tooling goes elsewhere.

## License

MIT. See [LICENSE](LICENSE).
