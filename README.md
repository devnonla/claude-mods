# claude-mods

Claude Code mods by devnonla.

## Install

Add the mod marketplace once (nothing is installed yet):

```bash
claude plugin marketplace add devnonla/claude-mods
```

Install a mod:

```bash
claude plugin install devnonla-git-changes@devnonla-mods
claude plugin install agent-anatomy@devnonla-mods
```

In Claude desktop: click `+` next to the input box, choose Plugins, Add marketplace with `devnonla/claude-mods`, then Add plugin.

Update: `claude plugin update devnonla-git-changes`.

## Mods

| Mod | Description |
| --- | --- |
| [devnonla-git-changes](devnonla-git-changes) | A 🔀 button at the foot of the input box and a pane showing which repos have uncommitted changes, with a file tree like VS Code's Source Control. Click a file to see its diff, click `↓N` to pull. Command `/repos`. |
| [agent-anatomy](agent-anatomy) | An "Anatomy" button at the foot of the input box and a pane that dissects the main agent: the agents it can run (each with a pixel avatar), its tools with on/off switches, the skills it can use, and what it remembers about the project. Command `/anatomy`. |
