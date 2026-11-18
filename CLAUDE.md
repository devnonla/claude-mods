# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code **plugin marketplace** (`devnonla-mods`) holding "mods": plugins that extend Claude Code's own UI/behaviour through the engine's hook API. There is no `package.json`, bundler, or lint config — each mod is a folder of source loaded directly by the Claude Code engine. All text in this repo is English: READMEs, manifest descriptions, and user-visible strings in mods (toasts, pane text, command descriptions). Keep new text in English.

- `.claude-plugin/marketplace.json` lists every mod; a new mod must be added to its `plugins` array (`source` is the mod's relative folder) and to the table in the root `README.md`.
- Each mod folder is self-contained: `.claude-plugin/plugin.json` (name, version, `types` pointer), `hooks/hooks.json` (`{ "modules": ["./register.tsx"] }`), `hooks/register.tsx` (the module), optional `types/index.d.ts` and `hooks/*.test.tsx`.

## Commands

The `claude-code` and `claude-code/testing` imports are provided by the engine, not npm. Use the Claude Code CLI:

```bash
claude plugin validate devnonla-git-changes   # checks manifest + module source, incl. $.state keys against types/index.d.ts
claude plugin test devnonla-git-changes       # runs hooks/*.test.tsx
tsc -p devnonla-git-changes                   # type-check; works only after the engine has loaded the mod and written .claude-plugin/types/ (incl. tsconfig.json)
```

Checks run automatically in two places, so keep both passing:
- `.claude/settings.json` registers a `PostToolUse` hook (`Edit|Write`) running `.claude/hooks/check-mod.sh`. When a file inside a mod folder changes, it runs `claude plugin validate` and `claude plugin test` for that mod and exits 2 (failure fed back to Claude) if either fails.
- `scripts/check-all.sh` is the single full check: `claude plugin validate --strict` on the marketplace and on every mod folder, then `claude plugin test` per mod. CI (`.github/workflows/ci.yml`) runs it on every push to `main` and on PRs; run it by hand before pushing if you want the same check locally. The repo deliberately versions no git hook and uses no husky, so nothing needs installing per clone; the maintainer's own clone has an unversioned `.git/hooks/pre-push` that just calls `scripts/check-all.sh` (skip once with `git push --no-verify`). `--strict` turns warnings into errors, so each `plugin.json` / marketplace entry needs an `author`, and each mod README needs the `/plugin install <mod> --marketplace devnonla/claude-mods` line.

Install locally for development with `claude --plugin-dir <mod folder>` (hot-reloads). The `plugin-authoring` skill documents the full mod API (`$` engine interface, events, `ui.render`, `$.state` contracts) and ships `claude-code.d.ts` with every type — grep it rather than guessing.

## Mod architecture (devnonla-git-changes)

`hooks/register.tsx` exports `register: Register = on => {...}`; everything hangs off `on(event, matcher?, hook)` with hooks of the form `($, e, next)`:

- `session.start`: registers the `/repos` command and starts polling — `refresh()` runs immediately and every 5s via `$.clock.every`. `refresh` re-runs `discover()` (session cwd's repo, walks up to 4 parents to find the workspace root, then direct child dirs containing `.git`, skipping `node_modules/dist/build/vendor`) and `git status --porcelain=v1 -b --untracked-files=all` per repo in parallel, parsed by `parseStatus`. `isRefreshing` guards against overlap; `refreshNow` is stashed so `pull` can trigger a refresh.
- `command.run {command:'repos'}`: opens the pane (`PANE` id = plugin name).
- `ui.render {component:'SessionMode'}`: injects the 🔀 button beside the prompt footer (yellow when any repo is dirty/errored).
- `ui.render {component:'Pane', requestId: PANE}`: draws the whole Repos pane — one card per repo, file tree built by `buildRows` (single-child directory chains are collapsed into `a/b/c` labels).

Key conventions in this module:

- **State flows through atoms**: `repos`, `collapsed`, `pulling` are declared with `atom(...)` and typed via `interface PluginState` in `types/index.d.ts`. Render hooks `read($, atom)`; handlers/refresh `update($, atom, fn)`, which redraws readers. When changing an atom's stored shape, bump its `shape` string (`'repos-4'`, etc.) so old persisted values are migrated/discarded, and update `types/index.d.ts` to match.
- **Clicking a file** goes through `$.tool.call` of `mcp__ccd_view__show_pane`: the session's own repo opens the built-in `diff` pane (`diff_scope: 'uncommitted'`); other repos open the `file` pane.
- **Pull** is `git pull --ff-only` (120s timeout), all git calls use `--no-optional-locks`, and `pulling` prevents double-pulls per repo name.
- **Surface differences**: the render code branches on `e.surface === 'terminal'` vs. graphical surfaces. Terminal rows are wrapped in `Button`; desktop rows use an absolutely positioned, hover-revealed invisible `Button` overlay (`rowPress`/`pressable`) so the whole row is clickable. `Svg` may be absent from the element table — always fall back to a text glyph. Tree-row press keys follow `file:<repo>:<path>`, `dir:<repo>:<path>`, `repo:<repo>`, `pull:<repo>`; the tests drive the UI via these keys, so keep them stable.
- **Graph tab** (`tab` atom: `'changes' | 'graph'`; the tab buttons have keys `tab:changes` / `tab:graph`): `loadGraph` runs `git log --all --date-order -n 200 --decorate=full` with `\x1f`-separated fields for the repo picked by `pickGraphRepo` (the only repo, else the `graphRepo` atom; the `Select` key is `graph-repo`). It is called on tab switch, repo pick and every 5s refresh while the Graph tab is open; concurrent calls collapse via `isGraphLoading`/`isGraphStale`. `layoutGraph` assigns lanes (a lane holds the hash it expects next) and stores per-row segments (`full`/`top`/`bottom`) in the `graph` atom; `graphSvg` (desktop, one fixed-height SVG per row so lines join) and `graphText` (terminal, box-drawing chars) both draw from those segments. In the test harness the terminal table still contains `Svg` but draws it as an empty Box, so graph code uses `Svg && !isTerminal`.
- Folding is stored as keys of *collapsed* nodes (`repoKey`/`dirKey`), so new nodes default to open.

## Tests

`hooks/register.test.tsx` uses `claude-code/testing`: engine nouns (`fs.exists`, `fs.list`, `process.run`, `tool.call`, `clock.every`, `session.cwd`, …) are stubbed with `on('<noun.method>', handler)`, then `$.session.start` and `$.ui.mount(...)` render the pane, and `ui.find` / `ui.press` assert on it. Any new engine call made by the mod must be stubbed in the tests or they will fail.

## Mod UI lessons (learned the hard way — read before touching `ui.render`)

How to see changes: the user's installed copy of the mod is a separate, older copy (check `claude plugin list` for its "Read from" path; a same-version cache is never refreshed). To see edits live, copy the mod into `~/.claude/dev-mods/<session-id>/<mod>/` (hot-reloads, user must accept "Turn on mods?" once) or run `claude --plugin-dir <mod folder>`. Bump `version` in `plugin.json` for any installed-copy update. Tests only check the returned tree, never how it is painted, so say plainly when a visual change is unseen and ask the user to look; never commit UI changes as "tested" before they have.

Rules for what draws well on desktop:
- **Button children may only be strings or `Text`** (any other element is refused). Padding inside a Button via spaces/`\n` is clipped by the native button and shows `…` (and newlines collapse), so do not pad inside a Button.
- **To get a big, correctly sized click target, use the native Button itself**: `<Button label="…" variant="primary|secondary" />` (`primary` = filled active, `secondary` = grey inactive). A `plain` Button wrapped in a padded/filled Box leaves the Button smaller than the visible area; a transparent Button overlaid on a Box shrinks into a pill and truncates its text.
- The hover-revealed full-row Button overlay (`rowPress` in the file tree: absolute Box, `display="none"`, `hover={{ display: 'flex' }}`) is the one working way to make a whole custom row clickable; put `wrap="truncate"` (no ellipsis) on its nbsp Text. It only reacts after hovering.
- **Never show `…`**: use `wrap="truncate"` (hard cut) rather than `truncate-end`/`truncate-middle` where the user dislikes ellipses (the graph rows do), and do not add UI text that ends in `…`/`...` unless asked.
- Per-row SVG (graph) must have a fixed height equal to the row so lanes join; row spacing is changed through `ROW_H`, never through gaps between rows.
- No per-side borders and no rounded top corners exist on `Box`; do not promise tab designs that need them. Reference "underline tab" looks can only be approximated (fills, an absolutely positioned wide `Svg` clipped by `overflow="hidden"`).
- The terminal table has no `Svg` (the test harness still lists it but draws an empty Box): guard with `Svg && !isTerminal` and provide a text fallback.
- Colors are free strings (`#RRGGBB`, `rgba(...)`), but a native Button may override text color; do not rely on custom text color inside Buttons.
- Keep UI text English and short; the user prefers no counts/icons in tab labels.
