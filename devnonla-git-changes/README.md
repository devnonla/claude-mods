# devnonla-git-changes

A Claude Code mod that shows the git repos in the working directory (the root and its direct child repos), which of them have uncommitted changes, and a changed-file tree like VS Code's Source Control.

- 🔀 button at the foot of the input box: yellow when any repo has changes, green when all are clean. Click to open/close the Repos pane.
- The `/repos` command also opens the pane.
- Two tabs at the top of the pane: **Changes** (the file tree below) and **Graph**.
- **Graph** tab: commit history of one repo with columns Graph / Description / Date / Author / Commit. Branch, remote and tag labels sit next to the subject. With one repo it is picked automatically; with several, choose from the Repo dropdown. Loads the latest 100 commits of all branches, with a **Load more** button for 100 more; while a repo's refs have not moved it does not re-read the log. Desktop draws colored SVG lanes, the terminal draws them with box-drawing characters; narrow panes hide the Date/Author columns.

**Changes tab**
- Click a file row: opens Claude desktop's built-in Diff pane (for the session's repo) or the Files pane (for child repos).
- Click a repo or folder name: collapse/expand it.
- `↓N` next to the branch name: click to run `git pull --ff-only`.

## Install

```bash
/plugin install devnonla-git-changes --marketplace devnonla/claude-mods
```

See the [repo README](../README.md) for the CLI and desktop install steps.

## Credits

File-type icons are from [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) (MIT, see `NOTICE-material-icon-theme.txt`).
