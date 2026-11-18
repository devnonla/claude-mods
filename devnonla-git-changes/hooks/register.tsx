import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { ChangedFile, RepoState } from '../types'

const PANE = 'devnonla-git-changes'
const INTERVAL_MS = 5000
const MAX_FILES = 300
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'vendor'])

type RepoRef = { name: string; path: string; isSessionRepo: boolean }
type TreeNode = { dirs: Map<string, TreeNode>; files: { name: string; path: string; code: string }[] }
type Row = { kind: 'dir'; name: string; path: string; depth: number; isOpen: boolean } | { kind: 'file'; name: string; path: string; code: string; depth: number }

const repos = atom({ plugin: 'devnonla-git-changes', key: 'repos' } as const, [], {
  shape: 'repos-4',
})
const collapsed = atom({ plugin: 'devnonla-git-changes', key: 'collapsed' } as const, [], {
  shape: 'collapsed-3',
})
const pulling = atom({ plugin: 'devnonla-git-changes', key: 'pulling' } as const, [], {
  shape: 'pulling-1',
})

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${body}</svg>`

const ICON_GIT = svg(
  '<path fill="#F05033" d="M15.7 7.3 8.7.3a1 1 0 0 0-1.4 0L5.8 1.8l1.8 1.8a1.2 1.2 0 0 1 1.5 1.5l1.8 1.8a1.2 1.2 0 1 1-.7.7L8.5 5.9v4.4a1.2 1.2 0 1 1-1-.1V5.8a1.2 1.2 0 0 1-.6-1.6L5.1 2.4.3 7.3a1 1 0 0 0 0 1.4l7 7a1 1 0 0 0 1.4 0l7-7a1 1 0 0 0 0-1.4z"/>',
)
const ICON_BRANCH = svg(
  '<g fill="none" stroke="#8B949E" stroke-width="1.5" stroke-linecap="round"><circle cx="4.5" cy="3.5" r="1.75"/><circle cx="4.5" cy="12.5" r="1.75"/><circle cx="11.5" cy="4.5" r="1.75"/><path d="M4.5 5.25v5.5M11.5 6.25c0 3.5-7 2.25-7 4.5"/></g>',
)
const ICON_FOLDER_OPEN = svg(
  '<path fill="#C09553" d="M1.5 2.5h4.3l1.5 1.5h6.2c.6 0 1 .4 1 1v1H4.2c-.5 0-.9.3-1 .8L1.5 12.5v-9c0-.6.4-1 1-1z"/><path fill="#DCB67A" d="M3.6 7h11.6c.5 0 .8.5.6.9l-1.7 4.8c-.1.4-.5.8-1 .8H1.6c-.5 0-.8-.5-.6-.9l1.6-4.8c.2-.5.6-.8 1-.8z"/>',
)
const ICON_FOLDER = svg(
  '<path fill="#C09553" d="M1.5 2.5h4.3l1.5 1.5h7.2c.6 0 1 .4 1 1v7.5c0 .6-.4 1-1 1h-13c-.6 0-1-.4-1-1v-9c0-.6.4-1 1-1z"/>',
)

const EXT_COLORS: Record<string, string> = {
  ts: '#3178C6',
  tsx: '#3178C6',
  js: '#E8C547',
  jsx: '#E8C547',
  mjs: '#E8C547',
  cjs: '#E8C547',
  json: '#CBCB41',
  md: '#519ABA',
  css: '#42A5F5',
  scss: '#F55385',
  html: '#E44D26',
  sh: '#89E051',
  yml: '#CB4B16',
  yaml: '#CB4B16',
  sql: '#E38C00',
  svg: '#FFB13B',
  png: '#A074C4',
  jpg: '#A074C4',
  lock: '#8B949E',
}

const fileIcon = (name: string) => {
  const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''
  const color = EXT_COLORS[ext] ?? '#8B949E'

  return svg(
    `<path fill="${color}" d="M4 1h5.2L13 4.8V14c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1V2c0-.6.4-1 1-1z"/><path fill="#FFFFFF" fill-opacity=".45" d="M9.2 1v3.8H13z"/>`,
  )
}

const unquote = (path: string) => (path.startsWith('"') && path.endsWith('"') ? path.slice(1, -1) : path)
const baseName = (path: string) => path.split('/').pop() || path

const parseStatus = (ref: RepoRef, out: string): RepoState => {
  const lines = out.split('\n').filter(line => line.length > 0)
  const head = lines.find(line => line.startsWith('## ')) ?? ''
  const branchPart = head.slice(3).split('...')[0] ?? ''
  const branch = branchPart.replace(/^No commits yet on /, '').replace(/ \[.*$/, '') || '?'
  const ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0)
  const behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0)
  let staged = 0
  let unstaged = 0
  let untracked = 0
  const files: ChangedFile[] = []
  for (const line of lines) {
    if (line.startsWith('## ')) {
      continue
    }
    const x = line[0] ?? ' '
    const y = line[1] ?? ' '
    const rawPath = line.slice(3)
    const path = unquote(rawPath.includes(' -> ') ? (rawPath.split(' -> ')[1] ?? rawPath) : rawPath)
    if (x === '?' && y === '?') {
      untracked += 1
      files.push({ path, code: 'U' })
      continue
    }
    if (x !== ' ') {
      staged += 1
    }
    if (y !== ' ') {
      unstaged += 1
    }
    files.push({ path, code: y !== ' ' ? y : x })
  }

  return { ...ref, branch, ahead, behind, staged, unstaged, untracked, files }
}

const dirty = (repo: RepoState) => repo.staged + repo.unstaged + repo.untracked

const repoKey = (repo: string) => `repo:${repo}`
const dirKey = (repo: string, path: string) => `dir:${repo}:${path}`

const buildRows = (repo: string, files: ChangedFile[], shut: readonly string[]): Row[] => {
  const root: TreeNode = { dirs: new Map(), files: [] }
  for (const file of files) {
    const parts = file.path.split('/')
    const name = parts.pop() ?? file.path
    let node = root
    for (const part of parts) {
      let child = node.dirs.get(part)
      if (!child) {
        child = { dirs: new Map(), files: [] }
        node.dirs.set(part, child)
      }
      node = child
    }
    node.files.push({ name, path: file.path, code: file.code })
  }

  const rows: Row[] = []
  const walk = (node: TreeNode, depth: number, prefix: string) => {
    for (const key of [...node.dirs.keys()].sort()) {
      let label = key
      let child = node.dirs.get(key) as TreeNode
      while (child.files.length === 0 && child.dirs.size === 1) {
        const [only] = [...child.dirs.entries()]
        if (!only) {
          break
        }
        label = `${label}/${only[0]}`
        child = only[1]
      }
      const path = `${prefix}${label}`
      const isOpen = !shut.includes(dirKey(repo, path))
      rows.push({ kind: 'dir', name: label, path, depth, isOpen })
      if (isOpen) {
        walk(child, depth + 1, `${path}/`)
      }
    }
    for (const file of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
      rows.push({ kind: 'file', name: file.name, path: file.path, code: file.code, depth })
    }
  }
  walk(root, 0, '')

  return rows
}

const codeColor = (code: string): Color => {
  if (code === 'D') {
    return 'error'
  }
  if (code === 'A' || code === 'U') {
    return 'success'
  }
  if (code === 'R' || code === 'C') {
    return 'suggestion'
  }

  return 'warning'
}

const emptyState = (ref: RepoRef, error: string): RepoState => ({
  ...ref,
  branch: '?',
  ahead: 0,
  behind: 0,
  staged: 0,
  unstaged: 0,
  untracked: 0,
  files: [],
  error,
})

const git = ($: EngineInterface, cwd: string, args: string[], timeoutMs = 15000) => $.process.run(['git', '--no-optional-locks', ...args], { cwd, timeoutMs })

const openChange = async ($: EngineInterface, repo: RepoState, path: string) => {
  const absolute = `${repo.path}/${path}`
  const call = repo.isSessionRepo
    ? await $.tool.call({ tool: 'mcp__ccd_view__show_pane', pane: 'diff', path: absolute, diff_scope: 'uncommitted' })
    : await $.tool.call({ tool: 'mcp__ccd_view__show_pane', pane: 'file', path: absolute })
  if (call.deny !== undefined) {
    $.ui.toast(`Could not open pane: ${call.deny}`)
    return
  }
  if (call.isError) {
    $.ui.toast(`Could not open pane: ${(call.text ?? '').slice(0, 160)}`)
  }
}

const pull = async ($: EngineInterface, repo: RepoState, after: (() => Promise<void>) | null) => {
  const current = await read($, pulling)
  if (current.includes(repo.name)) {
    return
  }
  await update($, pulling, old => [...old, repo.name])
  try {
    const run = await git($, repo.path, ['pull', '--ff-only'], 120000)
    if (run.exitCode === 0) {
      $.ui.toast(`${repo.name}: pulled ${repo.behind} new commit(s)`)
    } else {
      $.ui.toast(`${repo.name}: pull failed. ${(run.stderr || run.stdout).trim().slice(0, 200)}`)
    }
  } catch (error) {
    $.ui.toast(`${repo.name}: pull failed. ${String(error).slice(0, 200)}`)
  } finally {
    await update($, pulling, old => old.filter(one => one !== repo.name))
    if (after) {
      await after()
    }
  }
}

const parentOf = (path: string) => {
  const cut = path.lastIndexOf('/')

  return cut > 0 ? path.slice(0, cut) : ''
}

const discover = async ($: EngineInterface, cwd: string): Promise<RepoRef[]> => {
  let cwdRepo = ''
  let probe = cwd
  for (let level = 0; level < 6 && probe; level += 1) {
    if (await $.fs.exists(`${probe}/.git`)) {
      cwdRepo = probe
      break
    }
    probe = parentOf(probe)
  }

  let root = cwdRepo || cwd
  for (let level = 0; level < 4; level += 1) {
    const parent = parentOf(root)
    if (!parent || !(await $.fs.exists(`${parent}/.git`))) {
      break
    }
    root = parent
  }

  const found: RepoRef[] = []
  if (await $.fs.exists(`${root}/.git`)) {
    found.push({ name: baseName(root), path: root, isSessionRepo: root === cwdRepo })
  }
  for (const entry of await $.fs.list(root)) {
    if (entry.kind !== 'dir' || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) {
      continue
    }
    const path = `${root}/${entry.name}`
    if (await $.fs.exists(`${path}/.git`)) {
      found.push({ name: entry.name, path, isSessionRepo: path === cwdRepo })
    }
  }

  return found
}

export const register: Register = on => {
  let isRefreshing = false
  let refreshNow: (() => Promise<void>) | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'repos',
      description: 'Show which repos in the workspace have uncommitted changes',
    })

    const refresh = async () => {
      if (isRefreshing) {
        return
      }
      isRefreshing = true
      try {
        const found = await discover($, (await $.session.cwd()) || e.cwd)
        const states: RepoState[] = await Promise.all(
          found.map(async (ref): Promise<RepoState> => {
            try {
              const run = await git($, ref.path, ['status', '--porcelain=v1', '-b', '--untracked-files=all'])
              if (run.exitCode !== 0) {
                return emptyState(ref, run.stderr.trim().slice(0, 120) || `exit ${run.exitCode}`)
              }

              return parseStatus(ref, run.stdout)
            } catch (error) {
              return emptyState(ref, String(error).slice(0, 120))
            }
          }),
        )
        await update($, repos, () => states)
      } finally {
        isRefreshing = false
      }
    }
    refreshNow = refresh

    $.ui.status(undefined)
    void refresh()
    $.clock.every(INTERVAL_MS, refresh)

    return next(e)
  })

  on('command.run', { command: 'repos' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Repos' })

    return { text: 'Opened the Repos pane.' }
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const list = await read($, repos)
    if (list.length === 0) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const changed = list.filter(repo => dirty(repo) > 0 || repo.error).length

    return (
      <Box>
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')} </Text>}
        <Button
          key="toggle-repos"
          onPress={async () => {
            const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
            if (isOpen) {
              await $.ui.close({ id: PANE })
            } else {
              await $.ui.open({ id: PANE, title: 'Repos' })
            }
          }}
        >
          <Text color={changed === 0 ? 'success' : 'warning'}>🔀</Text>
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const isTerminal = e.surface === 'terminal'
    const headerBg = isTerminal ? undefined : 'rgba(127, 127, 127, 0.09)'
    const list = await read($, repos)
    const shut = await read($, collapsed)
    const busy = await read($, pulling)

    const toggle = (key: string) => update($, collapsed, old => (old.includes(key) ? old.filter(one => one !== key) : [...old, key]))
    const icon = (source: string, alt: string, fallback: string) => (Svg ? <Svg source={source} alt={alt} width={14} height={14} /> : <Text dimColor>{fallback}</Text>)
    const treeGap = isTerminal ? 1 : 0
    const treeIcon = (source: string, alt: string, fallback: string) =>
      Svg ? (
        <Svg source={source.replace('viewBox="0 0 16 16"', 'viewBox="0 0 19.5 16" preserveAspectRatio="xMinYMid meet"')} alt={alt} width={17} height={14} />
      ) : (
        <Text dimColor>{fallback}</Text>
      )

    type Look = { color?: Color; dim?: boolean; bold?: boolean; strike?: boolean }

    const rowPress = (key: string, onPress: () => unknown) =>
      isTerminal ? null : (
        <Box position="absolute" top={0} left={-1} right={-8} bottom={0} alignItems="center" display="none" hover={{ display: 'flex' }}>
          <Button key={key} plain onPress={onPress}>
            <Text>{'\u00A0'.repeat(Math.max(24, e.props.bodyColumns * 4))}</Text>
          </Button>
        </Box>
      )

    const rowLabel = (key: string, onPress: () => unknown, text: string, look: Look) =>
      isTerminal ? (
        <Button key={key} plain onPress={onPress}>
          <Text color={look.color} dimColor={look.dim} strikethrough={look.strike} wrap="truncate-middle">
            {text}
          </Text>
        </Button>
      ) : (
        <Text color={look.color} dimColor={look.dim} strikethrough={look.strike} wrap="truncate-middle">
          {text}
        </Text>
      )

    const pressable = (key: string, onPress: () => unknown, text: string, look: Look) => {
      const shown = (
        <Text color={look.color} dimColor={look.dim} weight={look.bold ? 'semibold' : undefined} strikethrough={look.strike} wrap="truncate-middle">
          {text}
        </Text>
      )
      if (isTerminal) {
        return (
          <Button key={key} plain onPress={onPress}>
            {shown}
          </Button>
        )
      }

      return (
        <Box key={`wrap:${key}`} position="relative" flexShrink={1} minWidth={0}>
          <Box position="absolute" top={0} left={-1} display="none" hover={{ display: 'flex' }}>
            <Button key={key} plain onPress={onPress}>
              <Text weight={look.bold ? 'semibold' : undefined}>{' '.repeat(Math.max(1, Math.round(text.length * 1.05)))}</Text>
            </Button>
          </Box>
          {shown}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="sm" paddingX="xs" paddingY="xs">
        {list.length === 0 && <Text dimColor>Reading git status...</Text>}

        {list.map(repo => {
          const total = dirty(repo)
          const isOpen = total > 0 && !shut.includes(repoKey(repo.name))
          const rows = !isOpen || repo.error ? [] : buildRows(repo.name, repo.files.slice(0, MAX_FILES), shut)
          const hidden = repo.files.length - MAX_FILES
          const isPulling = busy.includes(repo.name)
          const note = repo.error ? '' : total === 0 ? 'No changes' : isOpen ? '' : `${total} changes · collapsed`

          return (
            <Box key={`card:${repo.name}`} flexDirection="column" borderStyle="round" borderColor="subtle" overflow="hidden" padding={0}>
              <Box key={`head:${repo.name}`} backgroundColor={headerBg} paddingX="md" paddingY="sm" justifyContent="space-between" alignItems="center" gap={1}>
                <Box gap={1} alignItems="center" flexShrink={1} minWidth={0}>
                  {icon(ICON_GIT, 'git', '◆')}
                  {total > 0 ? (
                    pressable(`repo:${repo.name}`, () => toggle(repoKey(repo.name)), repo.name, { bold: true })
                  ) : (
                    <Text weight="semibold" wrap="truncate-middle">
                      {repo.name}
                    </Text>
                  )}
                </Box>
                <Box gap={1} alignItems="center" flexShrink={1} minWidth={0} justifyContent="flex-end">
                  {icon(ICON_BRANCH, 'branch', '⎇')}
                  <Text dimColor size="footnote" wrap="truncate-end">
                    {repo.branch}
                  </Text>
                  {repo.ahead > 0 && (
                    <Text color="suggestion" size="footnote">
                      ↑{repo.ahead}
                    </Text>
                  )}
                  {repo.behind > 0 && (
                    <Button key={`pull:${repo.name}`} plain onPress={() => pull($, repo, refreshNow)}>
                      <Text color="warning" size="caption">
                        {isPulling ? '…' : `↓${repo.behind}`}
                      </Text>
                    </Button>
                  )}
                </Box>
              </Box>

              {note !== '' && (
                <Box paddingX="md" paddingY="sm">
                  <Text dimColor size="footnote">
                    {note}
                  </Text>
                </Box>
              )}

              {repo.error && (
                <Box paddingX="md" paddingY="sm">
                  <Text color="error" size="footnote" wrap="wrap">
                    {repo.error}
                  </Text>
                </Box>
              )}

              {rows.length > 0 && (
                <Box flexDirection="column" rowGap="xs" paddingLeft="md" paddingRight="md" paddingTop="md" paddingBottom="md">
                  {rows.map(row =>
                    row.kind === 'dir' ? (
                      <Box key={`row:dir:${repo.name}:${row.path}`} position="relative" paddingLeft={row.depth * 2} gap={treeGap} alignItems="center">
                        {rowPress(`dir:${repo.name}:${row.path}`, () => toggle(dirKey(repo.name, row.path)))}
                        {treeIcon(row.isOpen ? ICON_FOLDER_OPEN : ICON_FOLDER, 'folder', row.isOpen ? '▾' : '▸')}
                        {rowLabel(`dir:${repo.name}:${row.path}`, () => toggle(dirKey(repo.name, row.path)), row.name, { dim: true })}
                      </Box>
                    ) : (
                      <Box key={`row:file:${repo.name}:${row.path}`} position="relative" paddingLeft={row.depth * 2} gap={1} justifyContent="space-between" alignItems="center">
                        {rowPress(`file:${repo.name}:${row.path}`, () => openChange($, repo, row.path))}
                        <Box gap={treeGap} alignItems="center" flexShrink={1} minWidth={0}>
                          {treeIcon(fileIcon(row.name), 'file', '·')}
                          {rowLabel(`file:${repo.name}:${row.path}`, () => openChange($, repo, row.path), row.name, {
                            color: codeColor(row.code),
                            strike: row.code === 'D',
                          })}
                        </Box>
                        <Box flexShrink={0}>
                          <Text color={codeColor(row.code)} weight="semibold" mono>
                            {row.code}
                          </Text>
                        </Box>
                      </Box>
                    ),
                  )}
                </Box>
              )}

              {isOpen && hidden > 0 && (
                <Box paddingX="md" paddingBottom="sm">
                  <Text dimColor size="footnote">
                    … and {hidden} more files
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}
