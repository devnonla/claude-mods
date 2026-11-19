import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register, RenderChildren } from 'claude-code'

import { EXT_ICON, ICONS, NAME_ICON } from './icons'
import type { ChangedFile, GraphRef, GraphRow, GraphSeg, GraphState, RepoState } from '../types'

const PANE = 'devnonla-git-changes'
const INTERVAL_MS = 5000
const MAX_FILES = 300
// The Changes tab draws at most this many tree rows in all (every row carries an icon and a click target): a workspace with hundreds of changes would
// otherwise make a tree of several hundred KB that the desktop app may refuse to draw. Fold a repo to see the rest.
const ROW_BUDGET = 120
// The graph loads this many commits at first and this many more each time "Load more" is pressed (every row is a drawn SVG, so the tree grows with it).
const GRAPH_PAGE = 100
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'vendor'])

// Graph geometry (px, desktop SVG) and colors. Lane colors repeat when there are more lines than colors.
const LANE_W = 12
const ROW_H = 30
const PAD_X = 8
const MAX_LANES = 8
const PALETTE = ['#3B9EFF', '#F5A623', '#B15DFF', '#2ECC71', '#FF5C5C', '#1ABC9C', '#E91E8C', '#C0CA33']
const LOG_FORMAT = '%H%x1f%P%x1f%D%x1f%an%x1f%ad%x1f%s'

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
const tab = atom({ plugin: 'devnonla-git-changes', key: 'tab' } as const, 'changes', {
  shape: 'tab-1',
})
const graphRepo = atom({ plugin: 'devnonla-git-changes', key: 'graphRepo' } as const, '', {
  shape: 'graphRepo-1',
})
const graphLimit = atom({ plugin: 'devnonla-git-changes', key: 'graphLimit' } as const, 100, {
  shape: 'graphLimit-1',
})
const graph = atom({ plugin: 'devnonla-git-changes', key: 'graph' } as const, { repo: '', lanes: 1, rows: [] } as GraphState, {
  shape: 'graph-1',
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

const fileIcon = (name: string) => {
  const lower = name.toLowerCase()
  const ext = lower.includes('.') ? (lower.split('.').pop() ?? '') : ''
  const key = NAME_ICON[lower] ?? (lower.startsWith('.env') ? 'key' : EXT_ICON[ext]) ?? 'document'

  return ICONS[key] ?? (ICONS.document as string)
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

type RawCommit = { hash: string; parents: string[]; refs: GraphRef[]; author: string; date: string; subject: string }
type Lane = { hash: string; color: number }

const parseRefs = (raw: string): GraphRef[] =>
  raw
    .split(', ')
    .filter(part => part.length > 0)
    .map((part): GraphRef => {
      if (part.startsWith('HEAD -> ')) {
        return { name: part.slice(8).replace(/^refs\/heads\//, ''), kind: 'head' }
      }
      if (part === 'HEAD') {
        return { name: 'HEAD', kind: 'head' }
      }
      if (part.startsWith('tag: ')) {
        return { name: part.slice(5).replace(/^refs\/tags\//, ''), kind: 'tag' }
      }
      if (part.startsWith('refs/remotes/')) {
        return { name: part.slice(13), kind: 'remote' }
      }

      return { name: part.replace(/^refs\/heads\//, ''), kind: 'branch' }
    })
    .filter(ref => !ref.name.endsWith('/HEAD'))

const parseLog = (out: string): RawCommit[] =>
  out
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const [hash = '', parents = '', refs = '', author = '', date = '', ...subject] = line.split('\u001f')

      return { hash, parents: parents.split(' ').filter(Boolean), refs: parseRefs(refs), author, date, subject: subject.join('\u001f') }
    })

/**
 * Assigns every commit a lane, git-gui style: a lane holds the hash it expects next. A commit takes the lane(s)
 * waiting for it (extra ones merge into it), then its first parent keeps the lane and further parents get/join lanes.
 */
const layoutGraph = (repo: string, commits: RawCommit[]): GraphState => {
  const lanes: (Lane | null)[] = []
  let nextColor = 0
  let widest = 1

  const free = () => {
    const at = lanes.indexOf(null)

    return at >= 0 ? at : lanes.length
  }

  const rows = commits.map((commit): GraphRow => {
    const segs: GraphSeg[] = []
    const before = lanes.slice()
    const matches = before.flatMap((lane, index) => (lane?.hash === commit.hash ? [index] : []))

    before.forEach((lane, index) => {
      if (lane && !matches.includes(index)) {
        segs.push({ kind: 'full', from: index, to: index, color: lane.color })
      }
    })

    let node = free()
    let color = nextColor
    if (matches.length > 0) {
      node = matches[0] ?? node
      color = before[node]?.color ?? color
      for (const index of matches) {
        segs.push({ kind: 'top', from: index, to: node, color: before[index]?.color ?? color })
        if (index !== node) {
          lanes[index] = null
        }
      }
    } else {
      nextColor += 1
    }

    const [first, ...others] = commit.parents
    if (first) {
      lanes[node] = { hash: first, color }
      segs.push({ kind: 'bottom', from: node, to: node, color })
    } else {
      lanes[node] = null
    }
    for (const parent of others) {
      let at = lanes.findIndex(lane => lane?.hash === parent)
      let parentColor = lanes[at]?.color ?? 0
      if (at < 0) {
        at = free()
        parentColor = nextColor
        nextColor += 1
        lanes[at] = { hash: parent, color: parentColor }
      }
      segs.push({ kind: 'bottom', from: node, to: at, color: parentColor })
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }
    widest = Math.max(widest, before.length, lanes.length, node + 1)

    return { hash: commit.hash, short: commit.hash.slice(0, 7), subject: commit.subject, author: commit.author, date: commit.date, refs: commit.refs, node, color, segs }
  })

  return { repo, lanes: widest, rows }
}

const pickGraphRepo = (list: readonly RepoState[], chosen: string) => (list.length === 1 ? (list[0]?.name ?? '') : list.some(repo => repo.name === chosen) ? chosen : '')

let isGraphLoading = false
let isGraphStale = false
// What the shown graph was built from (repo, how many commits, and every ref's tip): while it is unchanged, a refresh is one cheap `rev-parse` and no `log`.
let loadedKey = ''

const loadGraphOnce = async ($: EngineInterface) => {
  const list = await read($, repos)
  const name = pickGraphRepo(list, await read($, graphRepo))
  const repo = list.find(one => one.name === name)
  if (!repo) {
    return
  }
  const limit = await read($, graphLimit)

  let tips = ''
  try {
    const refs = await git($, repo.path, ['rev-parse', '--all', 'HEAD'], 10000)
    tips = refs.exitCode === 0 ? refs.stdout.trim() : ''
  } catch {
    tips = ''
  }
  const key = `${name}|${limit}|${tips}`
  if (tips !== '' && key === loadedKey && (await read($, graph)).repo === name) {
    return
  }

  let next: GraphState
  try {
    const run = await git($, repo.path, ['log', '--all', '--date-order', '-n', String(limit), '--decorate=full', '--date=format:%d %b %Y %H:%M', `--format=${LOG_FORMAT}`], 30000)
    next = run.exitCode === 0 ? layoutGraph(name, parseLog(run.stdout)) : { repo: name, lanes: 1, rows: [], error: run.stderr.trim().slice(0, 160) || `exit ${run.exitCode}` }
    loadedKey = run.exitCode === 0 ? key : ''
  } catch (error) {
    next = { repo: name, lanes: 1, rows: [], error: String(error).slice(0, 160) }
    loadedKey = ''
  }

  if (JSON.stringify(await read($, graph)) !== JSON.stringify(next)) {
    await update($, graph, () => next)
  }
}

/** Loads the graph of the selected repo; calls made while a load runs collapse into one more run. */
const loadGraph = async ($: EngineInterface) => {
  if (isGraphLoading) {
    isGraphStale = true
    return
  }
  isGraphLoading = true
  try {
    do {
      isGraphStale = false
      await loadGraphOnce($)
    } while (isGraphStale)
  } finally {
    isGraphLoading = false
  }
}

const laneX = (lane: number) => PAD_X + Math.min(lane, MAX_LANES - 1) * LANE_W
const graphWidth = (lanes: number) => PAD_X * 2 + (Math.min(Math.max(lanes, 1), MAX_LANES) - 1) * LANE_W

const graphSvg = (row: GraphRow, lanes: number) => {
  const width = graphWidth(lanes)
  const mid = ROW_H / 2
  const paths = row.segs
    .map(seg => {
      const x1 = laneX(seg.from)
      const x2 = laneX(seg.to)
      const stroke = PALETTE[seg.color % PALETTE.length]
      let d = `M${x1} 0V${ROW_H}`
      if (seg.kind === 'top') {
        d = x1 === x2 ? `M${x1} 0V${mid}` : `M${x1} 0Q${x1} ${mid} ${x2} ${mid}`
      } else if (seg.kind === 'bottom') {
        d = x1 === x2 ? `M${x1} ${mid}V${ROW_H}` : `M${x1} ${mid}Q${x2} ${mid} ${x2} ${ROW_H}`
      }

      return `<path d="${d}" stroke="${stroke}"/>`
    })
    .join('')
  const dot = `<circle cx="${laneX(row.node)}" cy="${mid}" r="4.5" fill="${PALETTE[row.color % PALETTE.length]}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROW_H}" viewBox="0 0 ${width} ${ROW_H}"><g fill="none" stroke-width="1.8" stroke-linecap="round">${paths}</g>${dot}</svg>`
}

const graphHeaderSvg = (lanes: number) => {
  const width = Math.max(graphWidth(lanes), 44)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROW_H}" viewBox="0 0 ${width} ${ROW_H}"><text x="${PAD_X - 4}" y="${ROW_H / 2 + 4}" font-size="11" font-weight="600" fill="#8B949E">Graph</text></svg>`
}

/** The same graph in box-drawing characters, for the terminal (two cells a lane). Returns colored runs. */
const graphText = (row: GraphRow, lanes: number): { text: string; color: number }[] => {
  const count = Math.max(Math.min(lanes, MAX_LANES), 3)
  const chars: string[] = Array.from({ length: count * 2 }, () => ' ')
  const colors: number[] = Array.from({ length: count * 2 }, () => -1)
  const put = (position: number, char: string, color: number) => {
    if (position >= 0 && position < chars.length) {
      chars[position] = char
      colors[position] = color
    }
  }
  const at = (lane: number) => Math.min(lane, count - 1) * 2

  for (const seg of row.segs) {
    const from = at(seg.from)
    const to = at(seg.to)
    if (seg.kind === 'full' || from === to) {
      put(from, '│', seg.color)
      continue
    }
    const corner = seg.kind === 'top' ? (to < from ? '╯' : '╰') : to < from ? '╭' : '╮'
    for (let position = Math.min(from, to) + 1; position < Math.max(from, to); position += 1) {
      put(position, '─', seg.color)
    }
    put(from, corner, seg.color)
  }
  put(at(row.node), '●', row.color)

  const runs: { text: string; color: number }[] = []
  chars.forEach((char, index) => {
    const color = colors[index] ?? -1
    const last = runs[runs.length - 1]
    if (last && last.color === color) {
      last.text += char
    } else {
      runs.push({ text: char, color })
    }
  })

  return runs
}

const refColor = (kind: GraphRef['kind']) => (kind === 'head' ? '#2EA043' : kind === 'branch' ? '#D29922' : kind === 'tag' ? '#8957E5' : '#4B5563')

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
        if ((await read($, tab)) === 'graph') {
          await loadGraph($)
        }
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
    // Keep what the engine and other mods draw here (mode text, other buttons) and add ours beside it.
    const base = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const changed = list.filter(repo => dirty(repo) > 0 || repo.error).length

    return (
      <Box>
        {base}
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
    const { Box, Button, Select, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const isTerminal = e.surface === 'terminal'
    const headerBg = isTerminal ? undefined : 'rgba(127, 127, 127, 0.09)'
    const list = await read($, repos)
    const shut = await read($, collapsed)
    const busy = await read($, pulling)
    const currentTab = await read($, tab)
    const chosen = pickGraphRepo(list, await read($, graphRepo))
    const graphState = await read($, graph)
    const pageLimit = await read($, graphLimit)

    const toggle = (key: string) => update($, collapsed, old => (old.includes(key) ? old.filter(one => one !== key) : [...old, key]))
    const icon = (source: string, alt: string, fallback: string) => (Svg ? <Svg source={source} alt={alt} width={14} height={14} /> : <Text dimColor>{fallback}</Text>)
    const treeGap = isTerminal ? 1 : 0
    const treeIcon = (source: string, alt: string, fallback: string) =>
      Svg ? (
        <Svg source={source.replace(/viewBox="(\S+) (\S+) (\S+) (\S+)"/, (_, x, y, _w, h) => `viewBox="${x} ${y} ${Number(h) * 1.21875} ${h}" preserveAspectRatio="xMinYMid meet"`)} alt={alt} width={17} height={14} />
      ) : (
        <Text dimColor>{fallback}</Text>
      )

    type Look = { color?: Color; dim?: boolean; bold?: boolean; strike?: boolean }

    const rowPress = (key: string, onPress: () => unknown) =>
      isTerminal ? null : (
        <Box position="absolute" top={0} left={-1} right={-8} bottom={0} alignItems="center" display="none" hover={{ display: 'flex' }}>
          <Button key={key} plain onPress={onPress}>
            <Text>{'\u00A0'.repeat(40)}</Text>
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

    let rowBudget = ROW_BUDGET
    const changesView = (
      <Box flexDirection="column" gap="sm">
        {list.length === 0 && <Text dimColor>Reading git status...</Text>}

        {list.map(repo => {
          const total = dirty(repo)
          const isOpen = total > 0 && !shut.includes(repoKey(repo.name))
          const allRows = !isOpen || repo.error ? [] : buildRows(repo.name, repo.files.slice(0, MAX_FILES), shut)
          const rows = allRows.slice(0, Math.max(rowBudget, 0))
          rowBudget -= rows.length
          const hidden = allRows.length - rows.length + Math.max(repo.files.length - MAX_FILES, 0)
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
                    … and {hidden} more (fold another repo to see them)
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )

    const showTab = async (next: string) => {
      await update($, tab, () => next)
      if (next === 'graph') {
        await loadGraph($)
      }
    }

    // Tabs are native Buttons, so the whole button is the click target: primary (filled) for the active tab, secondary for the other.
    const tabButton = (id: string, label: string) => (
      <Button key={`tab:${id}`} label={label} variant={currentTab === id ? 'primary' : 'secondary'} onPress={() => showTab(id)} />
    )

    const graphView = () => {
      const showAuthor = e.props.bodyColumns >= 70
      const showDate = e.props.bodyColumns >= 90
      const lanes = graphState.repo === chosen ? graphState.lanes : 1
      const drawSvg = Svg !== undefined && !isTerminal
      const cell = (row: GraphRow) =>
        Svg && drawSvg ? (
          <Svg source={graphSvg(row, lanes)} alt="graph" width={graphWidth(lanes)} height={ROW_H} />
        ) : (
          <Box flexShrink={0}>
            {graphText(row, lanes).map((run, index) => (
              <Text key={`run:${index}`} color={run.color < 0 ? undefined : PALETTE[run.color % PALETTE.length]}>
                {run.text}
              </Text>
            ))}
          </Box>
        )
      const columns = (graphCell: RenderChildren, description: RenderChildren, date: string, author: string, hash: string, look: { dim: boolean }) => (
        <Box gap={2} alignItems="center" paddingX="xs">
          {graphCell}
          <Box flexGrow={1} flexShrink={1} minWidth={0} gap={1} alignItems="center">
            {description}
          </Box>
          {showDate && (
            <Box width={17} flexShrink={0}>
              <Text dimColor size="footnote" wrap="truncate">
                {date}
              </Text>
            </Box>
          )}
          {showAuthor && (
            <Box width={14} flexShrink={0}>
              <Text dimColor={look.dim} size="footnote" wrap="truncate">
                {author}
              </Text>
            </Box>
          )}
          <Box width={8} flexShrink={0}>
            <Text dimColor mono size="footnote">
              {hash}
            </Text>
          </Box>
        </Box>
      )

      if (list.length === 0) {
        return <Text dimColor>Reading git status...</Text>
      }

      const picker =
        list.length > 1 ? (
          <Select
            key="graph-repo"
            options={list.map(repo => ({ value: repo.name, label: repo.name }))}
            value={chosen === '' ? undefined : chosen}
            onSelect={async value => {
              await update($, graphRepo, () => value)
              await update($, graphLimit, () => GRAPH_PAGE)
              await loadGraph($)
            }}
          />
        ) : null

      if (chosen === '') {
        return (
          <Box flexDirection="column" gap="sm">
            {picker}
            <Text dimColor>Select a repo to see its graph.</Text>
          </Box>
        )
      }
      if (graphState.repo !== chosen) {
        return (
          <Box flexDirection="column" gap="sm">
            {picker}
            <Text dimColor>Loading graph...</Text>
          </Box>
        )
      }

      const header = columns(
        Svg && drawSvg ? <Svg source={graphHeaderSvg(lanes)} alt="Graph" width={Math.max(graphWidth(lanes), 44)} height={ROW_H} /> : <Text dimColor>{'Graph'.padEnd(Math.max(Math.min(lanes, MAX_LANES), 3) * 2)}</Text>,
        <Text dimColor size="footnote" weight="semibold">
          Description
        </Text>,
        'Date',
        'Author',
        'Commit',
        { dim: true },
      )

      return (
        <Box flexDirection="column" gap="sm">
          {picker}
          {graphState.error && (
            <Text color="error" size="footnote" wrap="wrap">
              {graphState.error}
            </Text>
          )}
          {!graphState.error && graphState.rows.length === 0 && <Text dimColor>No commits yet.</Text>}
          {graphState.rows.length > 0 && (
            <Box flexDirection="column" rowGap={0}>
              {header}
              {graphState.rows.map(row => (
                <Box key={`commit:${row.hash}`} flexDirection="column">
                  {columns(
                    cell(row),
                    <Box gap={1} alignItems="center" flexShrink={1} minWidth={0}>
                      {row.refs.map(ref => (
                        <Box key={`ref:${row.hash}:${ref.kind}:${ref.name}`} flexShrink={0}>
                          <Text backgroundColor={refColor(ref.kind)} color="#FFFFFF" size="caption" weight="semibold" wrap="truncate">
                            {` ${ref.name} `}
                          </Text>
                        </Box>
                      ))}
                      <Text wrap="truncate">{row.subject}</Text>
                    </Box>,
                    row.date,
                    row.author,
                    row.short,
                    { dim: false },
                  )}
                </Box>
              ))}
            </Box>
          )}
          {graphState.rows.length >= pageLimit && (
            <Box>
              <Button
                key="graph-more"
                label="Load more"
                variant="secondary"
                onPress={async () => {
                  await update($, graphLimit, old => old + GRAPH_PAGE)
                  await loadGraph($)
                }}
              />
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="sm" paddingX="xs" paddingY="xs">
        <Box gap={1} alignItems="center">
          {tabButton('changes', 'Changes')}
          {tabButton('graph', 'Graph')}
        </Box>
        {currentTab === 'graph' ? graphView() : changesView}
      </Box>
    )
  })
}
