# agent-anatomy

A Claude Code mod: a side pane that dissects the main agent, so you can see what it is able to do in this project: the agents it can run, the tools it has and what it remembers.

- The "Anatomy" button at the foot of the input box (🧬 and the word, a native button; `◈ Anatomy` in the terminal) (or the `/anatomy` command) opens the pane. It has four tabs:
  - **Agents**: the agents you can run, the project's own (`.claude/agents/*.md`: name, description, tools) and the built-in ones (general-purpose, Explore, Plan), each with its own pixel avatar. Click a name, describe the task, press Enter to run it.
  - **Tools**: the main agent's tools as a tree, one tool per line, grouped as **Claude Code** (built-in tools) and one group per MCP server (with its icon, `on/total`, and a switch for the whole group; click a group name to fold or unfold it, MCP groups start folded). Click a tool's name for its detail (name, where it comes from, full description, state). A tool switched off is refused when the **main agent** calls it; sub agents are not affected and follow their own config. The tool stays in the model's tool list, so it may still try it once and be told no. Switches persist across sessions of the **same project** (stored per project root). Servers whose key is an opaque id can be named in `SERVER_NAMES` at the top of `hooks/register.tsx`.
  - **Skills**: the skills found on disk, grouped by where they apply, each group a block tinted with its color: **Project** (`.claude/skills`, and plugins installed for this project), **Global (this machine)** (`~/.claude/skills`, and plugins installed for the user) and **Global (account)** (the ones synced from your claude.ai account); a plugin installed for another project is left out. In the list each skill is one line: a bullet in its group color, its name and a switch. Clicking the name opens the skill's own view, with a breadcrumb (**Skills › name**) back to the list: its group and plugin, an arrow icon that opens its folder in an editor found on this machine (Cursor, VS Code, Windsurf, Zed, VSCodium, Sublime Text, IntelliJ IDEA or WebStorm: apps in `/Applications` on macOS, commands on the PATH elsewhere; with more than one, an **Open with** picker at the top of the list chooses, kept across projects), its switch, description and folder, and its whole folder as a file tree drawn like the Repos pane (Material Icon Theme file icons, folders that fold; references, scripts, assets; folders first, `node_modules` and `.git` left out, at most 80 entries). Click a file to read it in a viewer under it, with line numbers and syntax colours; a markdown file has **Preview** / **Source**. A skill switched off is left out of the skill listing the model reads (so it costs no tokens and the model does not pick it), from the next turn; typed as `/name` it still runs. Switches persist per project and match skills by name. Trees are scanned once a session, so the tab opens at once. Nothing is copied. Skills the app builds in hold no file, so they are not listed.
  - **Memory**: what Claude remembers about this project (`~/.claude/projects/<project>/memory/*.md`), as a tree grouped by type: **Loaded every session** (the `CLAUDE.md` files, project and user, and the `MEMORY.md` index), then **User**, **Feedback**, **Project**, **Reference** (and **Other**), each with a colored dot and a count; click a group name to fold it. Click an item to read its content right in the pane, taken from the original file (nothing is copied into the project); click it again to close. Read-only: ask Claude to change or remove an entry.

## Install

```bash
/plugin install agent-anatomy --marketplace devnonla/claude-mods
```

See the [repo README](../README.md) for the CLI and desktop install steps.

## Credits

File-type icons are from [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) (MIT, Copyright (c) 2025 Material Extensions), as in devnonla-git-changes.

The MCP group icon is the Model Context Protocol mark from [modelcontextprotocol/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol) (`docs/favicon.svg`).
