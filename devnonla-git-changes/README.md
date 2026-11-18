# devnonla-git-changes

A Claude Code mod that shows the git repos in the working directory (the root and its direct child repos), which of them have uncommitted changes, and a changed-file tree like VS Code's Source Control.

- 🔀 button at the foot of the input box: yellow when any repo has changes, green when all are clean. Click to open/close the Repos pane.
- The `/repos` command also opens the pane.
- Click a file row: opens Claude desktop's built-in Diff pane (for the session's repo) or the Files pane (for child repos).
- Click a repo or folder name: collapse/expand it.
- `↓N` next to the branch name: click to run `git pull --ff-only`.

## Install

```bash
/plugin install devnonla-git-changes --marketplace devnonla/claude-mods
```

See the [repo README](../README.md) for the CLI and desktop install steps.
