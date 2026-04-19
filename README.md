# todsmith-plugins

Claude Code plugin marketplace for the [Tod Smith](https://github.com/SmithFamilyPlayground/TodSmith)
agent team.

Public + MIT licensed so any host that runs TodSmith agents (fly
machines, home boxes, future dev boxes) can install without a PAT, and
so the runbooks can be referenced by other projects with similar
stacks.

## Plugins

| Plugin | Status | Purpose |
|---|---|---|
| `todsmith-vault` | **initial** | How agents write to `~/.secondbrain` — `vault-commit.sh`, frontmatter, daily-branch lifecycle, `raw/` immutability. Every agent enables this. |
| `todsmith-gh` | **initial** | GitHub CLI runbook — PR conventions, auto-review + daily-rollup workflow, ruleset awareness, Actions triage. Includes the `clean-gone` skill. |
| `todsmith-fly` | *placeholder* | Fly.io runbook (machines, volumes, secrets, logs). |
| `todsmith-sprites-dev` | **initial** | sprites.dev CLI + API runbook — ephemeral fly-machine workloads. Linux-only; Windows/Git-Bash material dropped from the upstream version. |

Follow-on PRs will flesh out the three placeholders.

## Install

### Per-agent (recommended — declare in `.claude/settings.json`)

```jsonc
{
  "enabledPlugins": {
    "todsmith-vault@todsmith-plugins": true
  },
  "extraKnownMarketplaces": {
    "todsmith-plugins": {
      "source": {
        "source": "github",
        "repo": "SmithFamilyPlayground/todsmith-plugins"
      }
    }
  }
}
```

### Interactive (any cwd)

```bash
claude plugin marketplace add SmithFamilyPlayground/todsmith-plugins
claude plugin install todsmith-vault@todsmith-plugins
```

## Conventions

- **Skills**, not slash commands, as the primary surface. Skills load
  into the model's available-skills list and trigger on intent; slash
  commands are added sparingly for deterministic operator workflows.
- **TodSmith-specific**. These runbooks assume the TodSmith deployment
  (the `tod-smith` fly app, the `~/.secondbrain` vault, the
  `SmithFamilyPlayground` GitHub org, the `daily/YYYY-MM-DD` branch
  flow). If you're running a different stack, fork and adapt.
- **Headless-first**. Skills must work inside a systemd user unit or a
  fly container with no GUI. GUI-dependent tooling goes elsewhere.

## License

MIT. See [LICENSE](LICENSE).
