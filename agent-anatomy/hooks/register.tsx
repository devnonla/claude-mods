import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { AgentType, MemoryState, SkillEntry, SkillFile, SkillFiles, SkillText } from '../types'
import { EXT_ICON, ICONS, NAME_ICON } from './icons'

const PANE = 'agent-anatomy'

type AgentRow = { id: string; status: string }

const types = atom({ plugin: 'agent-anatomy', key: 'types' } as const, [], { shape: 'types-1' })
const toolNames = atom({ plugin: 'agent-anatomy', key: 'toolNames' } as const, [], { shape: 'toolNames-1' })
const disabled = atom({ plugin: 'agent-anatomy', key: 'disabled' } as const, [], { shape: 'disabled-1' })
const expanded = atom({ plugin: 'agent-anatomy', key: 'expanded' } as const, [], { shape: 'expanded-1' })
const toolDescs = atom({ plugin: 'agent-anatomy', key: 'toolDescs' } as const, [], { shape: 'toolDescs-1' })
const detailTool = atom({ plugin: 'agent-anatomy', key: 'detailTool' } as const, '', { shape: 'detailTool-1' })
// The Model Context Protocol mark (three strokes) from modelcontextprotocol/modelcontextprotocol docs/favicon.svg, without its black tile.
const ICON_MCP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 8 164 164" fill="none" stroke="#9AA4B2" stroke-width="12" stroke-linecap="round"><path d="M23.6 85.25 86.2 22.65c8.65-8.64 22.66-8.64 31.3 0 8.65 8.65 8.65 22.66 0 31.3L70.23 101.23"/><path d="M70.88 100.58 117.5 53.95c8.65-8.64 22.66-8.64 31.3 0l.33.33c8.64 8.64 8.64 22.65 0 31.3l-56.62 56.62c-2.88 2.88-2.88 7.55 0 10.43l11.63 11.63"/><path d="M101.85 38.3 55.55 84.6c-8.64 8.64-8.64 22.66 0 31.3 8.65 8.65 22.66 8.65 31.3 0l46.3-46.3"/></svg>'

// "Open in editor": a rounded box open at the top right with an arrow leaving it, in the tree's grey.
const ICON_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#8B949E" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M9.5 3H13v3.5M13 3 7.5 8.5"/></svg>'

// One row of the tool tree, 20px tall like the rows themselves, so the vertical lines of neighbouring rows join: a line down at x=7, the centre of the
// 14px MCP icon above it, and a short branch to the name (the last row's line turns into the branch with a rounded corner).
const treeSvg = (isLast: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="20" viewBox="0 0 18 20" fill="none" stroke="#6E7681" stroke-width="1.2" stroke-linecap="round">${
    isLast ? '<path d="M7 0V6.5Q7 10 10.5 10H16"/>' : '<path d="M7 0V20M7 10H16"/>'
  }</svg>`

// Friendly names for MCP servers whose config key is an opaque id. Only add an id once it is certain what it is (the engine gives a mod no display name).
const SERVER_NAMES: Record<string, string> = {
  '1a59c906-04da-521d-bda7-7f71b9f9e01c': 'Claude Docs',
}
const serverLabel = (id: string) => SERVER_NAMES[id] ?? (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id) ? `${id.slice(0, 8)}…` : id)

const view = atom({ plugin: 'agent-anatomy', key: 'view' } as const, 'agents', { shape: 'view-1' })
const memory = atom({ plugin: 'agent-anatomy', key: 'memory' } as const, { dir: '', index: '', indexPath: '', entries: [] } as MemoryState, { shape: 'memory-1' })
const memFolded = atom({ plugin: 'agent-anatomy', key: 'memFolded' } as const, [], { shape: 'memFolded-1' })
const memOpen = atom({ plugin: 'agent-anatomy', key: 'memOpen' } as const, '', { shape: 'memOpen-1' })
const skills = atom({ plugin: 'agent-anatomy', key: 'skills' } as const, [] as SkillEntry[], { shape: 'skills-2' })
const skillsScanned = atom({ plugin: 'agent-anatomy', key: 'skillsScanned' } as const, false, { shape: 'skillsScanned-1' })
const editor = atom({ plugin: 'agent-anatomy', key: 'editor' } as const, '', { shape: 'editor-1' })
const editors = atom({ plugin: 'agent-anatomy', key: 'editors' } as const, [], { shape: 'editors-1' })
const skillsOff = atom({ plugin: 'agent-anatomy', key: 'skillsOff' } as const, [], { shape: 'skillsOff-1' })
const skillDirShut = atom({ plugin: 'agent-anatomy', key: 'skillDirShut' } as const, [], { shape: 'skillDirShut-1' })
const skillDetail = atom({ plugin: 'agent-anatomy', key: 'skillDetail' } as const, '', { shape: 'skillDetail-1' })
const fileRendered = atom({ plugin: 'agent-anatomy', key: 'fileRendered' } as const, false, { shape: 'fileRendered-1' })
const skillText = atom({ plugin: 'agent-anatomy', key: 'skillText' } as const, { path: '', text: '' } as SkillText, { shape: 'skillText-1' })
const skillFiles = atom({ plugin: 'agent-anatomy', key: 'skillFiles' } as const, [] as SkillFiles[], { shape: 'skillFiles-3' })
const picked = atom({ plugin: 'agent-anatomy', key: 'picked' } as const, '', { shape: 'picked-1' })

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const BUILT_IN: AgentType[] = [
  { name: 'general-purpose', description: 'Researches questions, searches code and runs multi-step tasks.', tools: 'all tools', source: 'built-in' },
  { name: 'Explore', description: 'Read-only search agent for broad sweeps across many files.', tools: 'read-only tools', source: 'built-in' },
  { name: 'Plan', description: 'Designs implementation plans and weighs trade-offs. Read-only.', tools: 'read-only tools', source: 'built-in' },
]

/** Reads `.claude/agents/*.md` of the session's folder: frontmatter `name`, `description`, `tools`. */
const loadTypes = async ($: EngineInterface) => {
  const dir = `${await $.session.root()}/.claude/agents`
  const found: AgentType[] = []
  if (await $.fs.exists(dir)) {
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) {
        continue
      }
      const text = await $.fs.read(`${dir}/${entry.name}`)
      const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
      const field = (key: string) => new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(front)?.[1]?.trim() ?? ''
      const allowed = field('tools')
      const denied = field('disallowedTools')
      found.push({
        name: field('name') || entry.name.replace(/\.md$/, ''),
        description: field('description'),
        tools: allowed || (denied ? `all except ${denied}` : 'all tools'),
        source: 'project',
      })
    }
  }
  const listed = await $.tool.list()
  const names = listed.map(tool => tool.name)
  if (!sameJson(await read($, toolNames), names)) {
    await update($, toolNames, () => names)
  }
  const descs = listed.map(tool => ({ name: tool.name, description: (tool.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000) }))
  if (!sameJson(await read($, toolDescs), descs)) {
    await update($, toolDescs, () => descs)
  }
  const next = [...found.sort((a, b) => a.name.localeCompare(b.name)), ...BUILT_IN]
  if (!sameJson(await read($, types), next)) {
    await update($, types, () => next)
  }
}

const MEMORY_COLORS: Record<string, string> = { user: '#4C9AFF', feedback: '#E5A93B', project: '#58B368', reference: '#9B6BFF', instructions: '#8B949E' }

const SKILL_TREE_LIMIT = 80
const SKILL_TREE_DEPTH = 4
const SKILL_TREE_SKIP = new Set(['node_modules', '__pycache__', '.git'])

/** Every file under a skill's folder (a skill is more than its SKILL.md: references, scripts, assets), folders first, cut at a limit for a huge tree. */
const scanSkillTree = async ($: EngineInterface, skill: SkillEntry): Promise<SkillFiles> => {
  const dir = skill.path.slice(0, skill.path.lastIndexOf('/'))
  const files: SkillFile[] = []
  let isCut = false
  const walk = async (folder: string, depth: number) => {
    const entries = [...(await $.fs.list(folder))]
      .filter(entry => !SKILL_TREE_SKIP.has(entry.name) && entry.name !== '.DS_Store')
      .sort((a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (files.length >= SKILL_TREE_LIMIT) {
        isCut = true

        return
      }
      const isDir = entry.kind === 'dir'
      files.push({ path: `${folder}/${entry.name}`, depth, isDir })
      if (isDir && depth < SKILL_TREE_DEPTH) {
        await walk(`${folder}/${entry.name}`, depth + 1)
      }
    }
  }
  try {
    await walk(dir, 0)
  } catch {
    // A folder that cannot be listed just ends the tree there.
  }

  return { id: skill.id, files, isCut }
}

// A skill's file tree is drawn like the Repos pane of devnonla-git-changes: Material Icon Theme file icons by name or extension, a folder
// icon open or shut, indented rows.
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${body}</svg>`
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


// Editors a skill folder can open in, in order of preference: the macOS app name (opened with `open -a`) and the command elsewhere.
const EDITORS = [
  { app: 'Cursor', cli: 'cursor' },
  { app: 'Visual Studio Code', cli: 'code' },
  { app: 'Windsurf', cli: 'windsurf' },
  { app: 'Zed', cli: 'zed' },
  { app: 'VSCodium', cli: 'codium' },
  { app: 'Sublime Text', cli: 'subl' },
  { app: 'IntelliJ IDEA', cli: 'idea' },
  { app: 'WebStorm', cli: 'webstorm' },
]

/** Every editor found on this machine: an app in /Applications or ~/Applications on macOS, a command on the PATH elsewhere. */
const findEditors = async ($: EngineInterface) => {
  const root = await $.session.root()
  const isMac = (await $.process.run(['uname'], { cwd: root, timeoutMs: 5000 })).stdout.trim() === 'Darwin'
  const home = (await $.process.run(['printenv', 'HOME'], { cwd: root, timeoutMs: 5000 })).stdout.trim()
  const found: string[] = []
  for (const one of EDITORS) {
    if (isMac) {
      if ((await $.fs.exists(`/Applications/${one.app}.app`)) || (await $.fs.exists(`${home}/Applications/${one.app}.app`))) {
        found.push(one.app)
      }
    } else if ((await $.process.run(['which', one.cli], { cwd: root, timeoutMs: 5000 })).exitCode === 0) {
      found.push(one.cli)
    }
  }

  return found
}

// The editor picked is the person's, not the project's: kept across projects. Absent or no longer installed, the first one found.
const EDITOR_KEY = 'editor'
const setEditor = async ($: EngineInterface, name: string) => {
  await update($, editor, () => name)
  await $.store.set(EDITOR_KEY, name)
}

/** Opens a folder in the editor found: `open -a <app> <folder>` on macOS, `<command> <folder>` elsewhere. */
const openInEditor = async ($: EngineInterface, name: string, folder: string) => {
  const root = await $.session.root()
  const argv = EDITORS.some(one => one.app === name) ? ['open', '-a', name, folder] : [name, folder]
  const run = await $.process.run(argv, { cwd: root, timeoutMs: 15000 })
  if (run.exitCode !== 0) {
    $.ui.toast(`Could not open it in ${name}: ${(run.stderr || `exit ${run.exitCode}`).slice(0, 160)}`)
  }
}

/** Claude Code's memory of this project (`~/.claude/projects/<slug>/memory/*.md`, with MEMORY.md as the index) and the CLAUDE.md files. */
const loadMemory = async ($: EngineInterface) => {
  const root = await $.session.root()
  const home = (await $.process.run(['printenv', 'HOME'], { cwd: root, timeoutMs: 5000 })).stdout.trim()
  const dir = `${home}/.claude/projects/${root.replace(/[^A-Za-z0-9]/g, '-')}/memory`
  const entries: MemoryState['entries'] = []
  let index = ''
  const parse = (text: string) => {
    const front = /^---\n([\s\S]*?)\n---\n?/.exec(text)
    const head = front?.[1] ?? ''
    const field = (key: string) => new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm').exec(head)?.[1]?.trim() ?? ''

    return { name: field('name'), description: field('description'), kind: field('type'), body: text.slice(front?.[0].length ?? 0).trim() }
  }
  if (await $.fs.exists(dir)) {
    for (const entry of await $.fs.list(dir)) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.md')) {
        continue
      }
      const text = await $.fs.read(`${dir}/${entry.name}`)
      if (entry.name === 'MEMORY.md') {
        index = text.trim()
        continue
      }
      const one = parse(text)
      entries.push({ id: entry.name, name: one.name || entry.name.replace(/\.md$/, ''), description: one.description, kind: one.kind || 'memory', body: one.body.slice(0, 12000), path: `${dir}/${entry.name}` })
    }
  }
  for (const [label, path] of [
    ['CLAUDE.md (project)', `${root}/CLAUDE.md`],
    ['CLAUDE.md (user)', `${home}/.claude/CLAUDE.md`],
  ] as const) {
    if (await $.fs.exists(path)) {
      entries.push({ id: path, name: label, description: path.replace(home, '~'), kind: 'instructions', body: (await $.fs.read(path)).trim().slice(0, 12000), path })
    }
  }
  const next: MemoryState = { dir: dir.replace(home, '~'), index, indexPath: `${dir}/MEMORY.md`, entries }
  if (!sameJson(await read($, memory), next)) {
    await update($, memory, () => next)
  }
}

/**
 * The skills found on disk: this project's (`.claude/skills`), the user's (`~/.claude/skills`, with those synced from the account) and the ones installed
 * plugins ship (`<install path>/skills`, from `~/.claude/plugins/installed_plugins.json`). Skills the app builds in hold no file and are not listed.
 */
const loadSkills = async ($: EngineInterface) => {
  const root = await $.session.root()
  const home = (await $.process.run(['printenv', 'HOME'], { cwd: root, timeoutMs: 5000 })).stdout.trim()
  const found: SkillEntry[] = []
  const unquote = (text: string) => text.replace(/^["']|["']$/g, '')
  const readSkill = async (dir: string, source: string, plugin: string) => {
    const path = `${dir}/SKILL.md`
    if (!(await $.fs.exists(path))) {
      return
    }
    const text = await $.fs.read(path)
    const front = /^---\n([\s\S]*?)\n---\n?/.exec(text)
    const head = front?.[1] ?? ''
    const field = (key: string) => unquote(new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(head)?.[1]?.trim() ?? '')
    found.push({ id: path, name: field('name') || dir.slice(dir.lastIndexOf('/') + 1), description: field('description'), source, plugin, path })
  }
  const scan = async (base: string, source: string, plugin = '') => {
    if (!(await $.fs.exists(base))) {
      return
    }
    for (const entry of await $.fs.list(base)) {
      if ((entry.kind === 'dir' || entry.isLink) && !entry.name.startsWith('.')) {
        await readSkill(`${base}/${entry.name}`, source, plugin)
      }
    }
  }
  await scan(`${root}/.claude/skills`, 'Project')
  const userDir = `${home}/.claude/skills`
  await scan(userDir, 'Machine')
  if (await $.fs.exists(`${userDir}/synced`)) {
    for (const bucket of await $.fs.list(`${userDir}/synced`)) {
      if ((bucket.kind === 'dir' || bucket.isLink) && !bucket.name.startsWith('.')) {
        await scan(`${userDir}/synced/${bucket.name}`, 'Account')
      }
    }
  }
  const installed = `${home}/.claude/plugins/installed_plugins.json`
  if (await $.fs.exists(installed)) {
    try {
      // An install's scope says who it is for: `user` every project on this machine; `project` and `local` the one project at `projectPath`.
      const data = JSON.parse(await $.fs.read(installed)) as { plugins?: Record<string, { installPath?: string; scope?: string; projectPath?: string }[]> }
      for (const [key, installs] of Object.entries(data.plugins ?? {})) {
        for (const one of installs) {
          const isProjectInstall = one.scope === 'project' || one.scope === 'local'
          if (!one.installPath || (isProjectInstall && one.projectPath !== root)) {
            continue
          }
          await scan(`${one.installPath}/skills`, isProjectInstall ? 'Project' : 'Machine', key.split('@')[0] as string)
        }
      }
    } catch {
      // A file that is not JSON just yields no plugin skills.
    }
  }
  const next = found.filter((one, index) => found.findIndex(other => other.id === one.id) === index)
  // A skill's tree is scanned once a session: a folder rarely changes, and scanning every skill on each visit made the tab slow.
  const known = await read($, skillFiles)
  const trees = await Promise.all(next.map(one => known.find(tree => tree.id === one.id) ?? scanSkillTree($, one)))
  if (!sameJson(await read($, skills), next)) {
    await update($, skills, () => next)
  }
  if (!sameJson(await read($, skillFiles), trees)) {
    await update($, skillFiles, () => trees)
  }
  // Looked for whenever none is known yet, not only on the first scan: a session that scanned before this existed must look too.
  if ((await read($, editors)).length === 0) {
    const found = await findEditors($)
    await update($, editors, () => found)
    const saved = await $.store.get(EDITOR_KEY)
    await update($, editor, () => (typeof saved === 'string' && found.includes(saved) ? saved : (found[0] ?? '')))
  }
  if (!(await read($, skillsScanned))) {
    await update($, skillsScanned, () => true)
  }
}

// ---- Avatars: a pixel critter per agent. Color and accessory come from the agent id; motion comes from its status. ----
const BODY_COLORS = ['#D97757', '#3FB6A8', '#9B6BFF', '#58B368', '#E5A93B', '#4C9AFF', '#E667A8', '#8CC63F']

const hashOf = (text: string) => {
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0
  }

  return hash
}

// A hover scope (and a Box key, which names one) is 1 to 64 characters, else the whole pane is refused. Long ids (a path, an MCP tool name) are hashed.
const scopeId = (prefix: string, id: string) => (`${prefix}:${id}`.length <= 64 ? `${prefix}:${id}` : `${prefix}:${hashOf(id).toString(36)}`)

const shade = (hex: string, factor: number) => {
  const channel = (at: number) =>
    Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(at, at + 2), 16) * factor)))
      .toString(16)
      .padStart(2, '0')

  return `#${channel(1)}${channel(3)}${channel(5)}`
}

const move = (values: string, dur: string, begin = '0s') =>
  `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`

const avatarSvg = (row: AgentRow) => {
  const hash = hashOf(row.id)
  const base = BODY_COLORS[hash % BODY_COLORS.length] as string
  const dark = shade(base, 0.74)
  const accessory = (hash >> 5) % 4
  const status = row.status
  const isRunning = status === 'running'
  const isFailed = status === 'failed' || status === 'killed'
  const isDone = status === 'completed'
  const isCalm = status === 'idle' || status === 'waiting'

  const bob = isRunning ? move('0 0;0 -0.5;0 0', '0.5s') : isCalm ? move('0 0;0 -0.25;0 0', '2.4s') : ''
  const sway = status === 'waiting' ? '<animateTransform attributeName="transform" type="rotate" values="-4 5 5;4 5 5;-4 5 5" dur="1.6s" repeatCount="indefinite"/>' : ''
  const legLeft = isRunning ? move('0 0;0 -0.7;0 0', '0.5s') : ''
  const legRight = isRunning ? move('0 0;0 -0.7;0 0', '0.5s', '-0.25s') : ''
  const armLeft = isRunning ? move('0 0;0 -0.8;0 0', '0.5s', '-0.25s') : ''
  const armRight = isRunning ? move('0 0;0 -0.8;0 0', '0.5s') : ''
  const blink = (y: number) =>
    isDone || isFailed
      ? ''
      : `<animate attributeName="height" values="2;2;2;0.2;2" keyTimes="0;0.9;0.94;0.97;1" dur="3.4s" repeatCount="indefinite"/><animate attributeName="y" values="${y};${y};${y};${y + 1.8};${y}" keyTimes="0;0.9;0.94;0.97;1" dur="3.4s" repeatCount="indefinite"/>`
  const eyeY = isDone ? 1.8 : 1
  const eyeH = isDone ? 0.6 : 2

  const extras = [
    '',
    `<rect x="4.5" y="-1.2" width="1" height="1.2" fill="${dark}"/><rect x="4.1" y="-1.9" width="1.8" height="0.9" fill="${shade(base, 1.25)}"/>`,
    `<rect x="1" y="-1" width="1.4" height="1" fill="${dark}"/><rect x="7.6" y="-1" width="1.4" height="1" fill="${dark}"/>`,
    `<rect x="3" y="-0.9" width="1" height="0.9" fill="${dark}"/><rect x="4.5" y="-1.4" width="1" height="1.4" fill="${dark}"/><rect x="6" y="-0.9" width="1" height="0.9" fill="${dark}"/>`,
  ][accessory]

  const badge = isDone
    ? '<circle cx="9.4" cy="7.4" r="1.7" fill="#2EA043"/><path d="M8.6 7.4l.6.7 1.3-1.5" stroke="#fff" stroke-width=".5" fill="none"/>'
    : isFailed
      ? '<circle cx="9.4" cy="7.4" r="1.7" fill="#F85149"/><path d="M8.7 6.7l1.4 1.4M10.1 6.7l-1.4 1.4" stroke="#fff" stroke-width=".5"/>'
      : ''
  const opacity = status === 'pending' ? 0.5 : isFailed ? 0.75 : 1

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -2 12 10.8" width="37" height="33" opacity="${opacity}">` +
    '<ellipse cx="5" cy="8.1" rx="3.6" ry="0.5" fill="#000" fill-opacity=".2"/>' +
    `<g>${sway}<g>${bob}` +
    `<g>${legLeft}<rect x="2.1" y="5" width=".8" height="2.4" fill="${dark}"/><rect x="3.5" y="5" width=".8" height="2.4" fill="${dark}"/></g>` +
    `<g>${legRight}<rect x="5.7" y="5" width=".8" height="2.4" fill="${dark}"/><rect x="7.1" y="5" width=".8" height="2.4" fill="${dark}"/></g>` +
    `<g>${armLeft}<rect x="-0.2" y="2.6" width="1.4" height="1.2" fill="${dark}"/></g>` +
    `<g>${armRight}<rect x="8.8" y="2.6" width="1.4" height="1.2" fill="${dark}"/></g>` +
    `<rect x="1" y="0" width="8" height="5" fill="${base}"/>${extras}` +
    `<rect x="2.2" y="${eyeY}" width="1" height="${eyeH}" fill="#1B1F23">${blink(eyeY)}</rect>` +
    `<rect x="6.8" y="${eyeY}" width="1" height="${eyeH}" fill="#1B1F23">${blink(eyeY)}</rect>` +
    `</g></g>${badge}</svg>`
  )
}

// The store is one file for the whole plugin, so the switches are kept under the project's root: each project has its own.
const storeKey = async ($: EngineInterface) => `disabledTools:${await $.session.root()}`
const serverOf = (name: string) => (name.startsWith('mcp__') ? (name.split('__')[1] ?? name) : '')

const setDisabled = async ($: EngineInterface, next: string[]) => {
  await update($, disabled, () => next)
  await $.store.set(await storeKey($), next)
}

// Skills switched off, by name (the part after any `plugin:`, as the listing writes it), kept per project like the tools. A change asks the engine
// for the skill listing again, so the next turn's request carries the new one.
const skillStoreKey = async ($: EngineInterface) => `disabledSkills:${await $.session.root()}`
const setSkillsOff = async ($: EngineInterface, next: string[]) => {
  await update($, skillsOff, () => next)
  await $.store.set(await skillStoreKey($), next)
  $.ui.invalidate('prompt.attachment')
}

/**
 * The skill listing without the skills switched off. Each skill is a `- name: description` line (the name may carry a `plugin:` prefix), and a
 * description can run on over further lines until a blank line or the next `- `; all of them go.
 */
const dropSkills = (text: string, off: readonly string[]) => {
  if (off.length === 0) {
    return text
  }
  const kept: string[] = []
  let isDropping = false
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) {
      const name = /^- (\S+?)(?::\s|:?$)/.exec(line)?.[1] ?? ''
      isDropping = off.includes(name.slice(name.lastIndexOf(':') + 1))
    } else if (line.trim() === '') {
      isDropping = false
    }
    if (!isDropping) {
      kept.push(line)
    }
  }

  return kept.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'anatomy', description: 'Open the Agent Anatomy pane (agents, tools, skills and memory of the main agent)' })
    const saved = await $.store.get(await storeKey($))
    if (Array.isArray(saved)) {
      await update($, disabled, () => saved.filter((one): one is string => typeof one === 'string'))
    }
    const savedSkills = await $.store.get(await skillStoreKey($))
    if (Array.isArray(savedSkills)) {
      await update($, skillsOff, () => savedSkills.filter((one): one is string => typeof one === 'string'))
    }
    await update($, view, () => 'agents')
    loadTypes($).catch(() => undefined)
    loadMemory($).catch(() => undefined)

    return next(e)
  })

  // Only the main agent is held to the switches; sub agents keep whatever their own config gives them.
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined && (await read($, disabled)).includes(e.tool)) {
      return { deny: `${e.tool} is switched off for the main agent in the Anatomy pane.` }
    }

    return next(e)
  })

  // A skill switched off is left out of the listing the model reads, so it costs no tokens and the model does not pick it. Typed as `/name` it still runs.
  on('prompt.attachment', { type: 'skill_listing' }, async ($, e, next) => {
    const off = await read($, skillsOff)

    return off.length === 0 ? next(e) : next({ ...e, text: dropSkills(e.text, off) })
  })

  on('command.run', { command: 'anatomy' }, async $ => {
    await update($, view, () => 'agents')
    await loadTypes($)
    await $.ui.open({ id: PANE, title: '🧬 Anatomy' })

    return { text: 'Opened the Agents pane.' }
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    // Keep what the engine and other mods draw here (mode text, other buttons) and add ours beside it.
    const base = await next(e)

    const toggle = async () => {
      const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
      if (isOpen) {
        await $.ui.close({ id: PANE })
      } else {
        await update($, view, () => 'agents')
        await loadTypes($)
        await $.ui.open({ id: PANE, title: '🧬 Anatomy' })
      }
    }

    // One native Button with a `label` (no children, not `plain`), the word alone. The footer ignores `display`, `position`, `minHeight` and
    // `minWidth` of the Box around it, and a Button has no size props, so its height and padding are the native Button's own, not the model button's.
    const label = <Button key="toggle-anatomy" label={e.surface === 'terminal' ? '◈ Anatomy' : '🧬 Anatomy'} onPress={toggle} />

    return (
      <Box gap={1} alignItems="center">
        {base}
        {label}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Button, Input, Select, Text } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    // A file's text drawn as markdown (headings, lists, fences, tables), like an assistant reply; plain Text where the surface has no Markdown.
    // Markdown allows no control character but tab and newline, so the rest (a stray \r, an escape) is dropped first.
    const Markdown = 'Markdown' in table ? table.Markdown : undefined
    const Code = 'Code' in table ? table.Code : undefined
    const markdown = (text: string) => {
      const clean = text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')

      return Markdown ? <Markdown text={clean} /> : <Text wrap="wrap">{clean}</Text>
    }
    const canDraw = Svg !== undefined && e.surface !== 'terminal'
    const roster = await read($, types)
    const open = await read($, picked)
    const allTools = await read($, toolNames)
    const off = await read($, disabled)
    const shown = await read($, expanded)
    const descs = await read($, toolDescs)
    const detailOf = await read($, detailTool)
    const groups = [
      { id: 'builtin', label: 'Claude Code', names: allTools.filter(tool => serverOf(tool) === '') },
      ...[...new Set(allTools.map(serverOf).filter(Boolean))].map(server => ({ id: server, label: serverLabel(server), names: allTools.filter(tool => serverOf(tool) === server) })),
    ].filter(group => group.names.length > 0)
    const toolsOpen = true

    // A press redraws the pane and the window can jump to the end. Bring the pressed element back into view afterwards so the person keeps their place.
    const keep = (key: string, action: () => unknown) => async () => {
      await action()
      try {
        await $.ui.scroll({ to: { key }, in: PANE, block: 'nearest' })
      } catch {
        // the element is not drawn any more: nothing to keep in view
      }
    }

    // A pill switch. Both states are always drawn and only `display` flips (no image swap: no flash, no change of row height); a transparent
    // Button of 3 non-breaking spaces (shorter than the pill, so nothing is cut with an ellipsis) sits over it. Terminal: plain [ ON]/[OFF] text.
    const switchFor = (key: string, isOn: boolean, onPress: () => unknown) => {
      if (!Svg || !canDraw) {
        return (
          <Button key={key} plain onPress={keep(key, onPress)}>
            <Text color={isOn ? '#2EA043' : undefined} dimColor={!isOn}>
              {isOn ? '[ ON]' : '[OFF]'}
            </Text>
          </Button>
        )
      }
      // A rounded rectangle (radius 3) with a square-ish knob, so it sits cleanly inside the native button's own hover background.
      const drawn = (active: boolean) =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="14" viewBox="0 0 26 14"><rect width="26" height="14" rx="3" fill="${active ? '#2EA043' : '#3A3A3C'}"/><rect x="${active ? 14 : 2}" y="2" width="10" height="10" rx="2" fill="#fff"/></svg>`

      return (
        <Box key={`sw:${key}`} position="relative" flexShrink={0}>
          <Box display={isOn ? 'flex' : 'none'}>
            <Svg source={drawn(true)} alt="on" width={26} height={14} />
          </Box>
          <Box display={isOn ? 'none' : 'flex'}>
            <Svg source={drawn(false)} alt="off" width={26} height={14} />
          </Box>
          <Box position="absolute" top={0} left={0} right={0} bottom={0} overflow="hidden">
            <Button key={key} plain onPress={keep(key, onPress)}>
              <Text wrap="truncate">{'\u00A0'.repeat(3)}</Text>
            </Button>
          </Box>
        </Box>
      )
    }

    // A hover only tints the row's background (a reveal would change the scrollable height and make the pane jump). Click a name for the detail.
    const withTip = (name: string, chip: RenderChildren) => (
      <Box key={scopeId('row', name)} width="100%" hover={{ scope: scopeId('row', name), backgroundColor: 'rgba(127, 127, 127, 0.16)' }}>
        {chip}
      </Box>
    )

    const toolsView = (
      <Box flexDirection="column" gap="sm" width="100%">
          <Box gap={1} alignItems="center" justifyContent="space-between">
            <Text weight="semibold">Main agent tools</Text>
            <Text dimColor size="footnote">
              {off.length === 0 ? 'all on' : `${off.length} off`}
            </Text>
          </Box>
          {toolsOpen && (
            <Box flexDirection="column" gap="xs" width="100%">
              <Text dimColor size="footnote" wrap="wrap">
                Switch on = allowed. A tool switched off is refused when the main agent calls it; sub agents follow their own config.              </Text>
              {groups.map(group => {
                const onCount = group.names.filter(name => !off.includes(name)).length
                const isGroupOpen = group.id === 'builtin' ? !shown.includes('builtin') : shown.includes(group.id)

                return (
                  <Box key={`group:${group.id}`} flexDirection="column" alignItems="stretch" width="100%">
                    <Box gap={1} alignItems="center" justifyContent="space-between" width="100%" hover={{ scope: `group:${group.id}`, backgroundColor: 'rgba(127, 127, 127, 0.16)' }}>
                      <Box gap={1} alignItems="center" flexShrink={1} minWidth={0}>
                        {Svg && canDraw && group.id !== 'builtin' && <Svg source={ICON_MCP} alt="MCP" width={14} height={14} />}
<Box marginLeft={-1}>
                                                  <Button key={`expand:${group.id}`} plain onPress={() => update($, expanded, old => (old.includes(group.id) ? old.filter(one => one !== group.id) : [...old, group.id]))}>
                          <Text weight="semibold" wrap="truncate">
                            {group.label}
                          </Text>
                        </Button>
                        </Box>
                        <Text dimColor size="footnote">
                          {`${onCount}/${group.names.length}`}
                        </Text>
                      </Box>
                      {switchFor(`server:${group.id}`, onCount > 0, () => setDisabled($, onCount === 0 ? off.filter(one => !group.names.includes(one)) : [...new Set([...off, ...group.names])]))}
                    </Box>
                    {isGroupOpen && (
                      <Box flexDirection="column">
                        {Svg && canDraw && <Svg source={'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="2" viewBox="0 0 1 2"/>'} alt="spacer" width={1} height={2} />}
                      {group.names.map((name, index) => {
                        const isOff = off.includes(name)
                        const label = group.id === 'builtin' ? name : name.split('__').slice(2).join('__')

                        return withTip(
                          name,
                          <Box flexDirection="column" width="100%">
                            <Box gap={1} alignItems="center" justifyContent="space-between" width="100%">
                              <Box gap={0} alignItems="center" flexShrink={1} minWidth={0}>
                                {Svg && canDraw ? <Svg source={treeSvg(index === group.names.length - 1)} alt="tree branch" width={18} height={20} /> : <Text dimColor>{index === group.names.length - 1 ? '└─' : '├─'}</Text>}
                                <Box flexShrink={1} minWidth={0}>
                                  <Button key={`name:${name}`} plain onPress={() => update($, detailTool, old => (old === name ? '' : name))}>
                                    <Text dimColor={isOff} wrap="truncate">
                                      {label}
                                    </Text>
                                  </Button>
                                </Box>
                              </Box>
                              {switchFor(`tool:${name}`, !isOff, () => setDisabled($, isOff ? off.filter(one => one !== name) : [...off, name]))}
                            </Box>
                            {detailOf === name && (
                              <Box flexDirection="column" gap="xs" marginLeft="lg" paddingX="md" paddingY="sm" borderStyle="round" borderColor="#3B9EFF">
                                <Text weight="semibold" wrap="wrap">
                                  {name}
                                </Text>
                                <Text dimColor size="footnote">
                                  {`${group.id === 'builtin' ? 'Claude Code tool' : `MCP server: ${group.label}${group.label === group.id ? '' : ` (${group.id})`}`} · ${isOff ? 'off for the main agent' : 'on for the main agent'}`}
                                </Text>
                                <Text size="footnote" wrap="wrap">
                                  {descs.find(one => one.name === name)?.description || 'No description.'}
                                </Text>
                              </Box>
                            )}
                          </Box>,
                        )
                      })}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
    )

    const agentsView = (
      <Box flexDirection="column" gap="sm" width="100%">
        <Text dimColor size="footnote">
          Agents you can run. Click a name, describe the task, press Enter.
        </Text>
        {roster.map(type => {
          const isOpen = open === type.name
          const avatar: AgentRow = { id: type.name, status: 'idle' }

          return (
            <Box key={`type:${type.name}`} flexDirection="column" borderStyle="round" borderColor={isOpen ? '#3B9EFF' : 'subtle'} paddingX="md" paddingY="sm" gap="xs">
              <Box gap={2} alignItems="center">
                {Svg && canDraw ? <Svg source={avatarSvg(avatar)} alt={`${type.name} avatar`} width={37} height={33} isInteractive /> : <Text dimColor>◆</Text>}
                <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} gap="xs">
                  <Box gap={1} alignItems="center" justifyContent="space-between">
                    <Box flexShrink={1} minWidth={0}>
                      <Button key={`pick:${type.name}`} plain onPress={() => update($, picked, old => (old === type.name ? '' : type.name))}>
                        <Text weight="semibold" wrap="truncate">
                          {type.name}
                        </Text>
                      </Button>
                    </Box>
                    <Text dimColor size="footnote">
                      {type.source}
                    </Text>
                  </Box>
                  <Text size="footnote" wrap="wrap">
                    {type.description || 'No description.'}
                  </Text>
                  <Text dimColor size="footnote" wrap="truncate">
                    {`tools: ${type.tools}`}
                  </Text>
                </Box>
              </Box>
              {isOpen && (
                <Box flexDirection="column" gap="sm" paddingTop="sm">
                  <Input
                    key={`run:${type.name}`}
                    placeholder={`Task for ${type.name}, then Enter`}
                    submitLabel="Run"
                    onSubmit={async value => {
                      const prompt = value.trim()
                      if (!prompt) {
                        return
                      }
                      const started = await $.agent.spawn({ subagentType: type.name, prompt, description: prompt.slice(0, 40) })
                      $.ui.toast(started.deny !== undefined ? `Could not run ${type.name}: ${started.deny}` : `Started ${type.name}`)
                      if (started.deny === undefined) {
                        await update($, picked, () => '')
                      }
                    }}
                  />
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )

    const mem = await read($, memory)
    const folded = await read($, memFolded)
    const openItem = await read($, memOpen)
    type MemItem = { id: string; name: string; file: string; path: string; body: string }
    const itemOf = (entry: MemoryState['entries'][number]): MemItem => ({ id: entry.id, name: entry.name, file: entry.id.includes('/') ? entry.id.slice(entry.id.lastIndexOf('/') + 1) : entry.id, path: entry.path, body: entry.body })
    const KNOWN = ['user', 'feedback', 'project', 'reference']
    const memGroups: { id: string; label: string; color: string; items: MemItem[] }[] = [
      {
        id: 'instructions',
        label: 'Loaded every session',
        color: MEMORY_COLORS.instructions as string,
        items: [...mem.entries.filter(entry => entry.kind === 'instructions').map(itemOf), ...(mem.index !== '' ? [{ id: '__index__', name: 'MEMORY.md (index)', file: 'MEMORY.md', path: mem.indexPath, body: mem.index }] : [])],
      },
      ...KNOWN.map(kind => ({ id: kind, label: kind.charAt(0).toUpperCase() + kind.slice(1), color: MEMORY_COLORS[kind] as string, items: mem.entries.filter(entry => entry.kind === kind).map(itemOf) })),
      { id: 'other', label: 'Other', color: '#8B949E', items: mem.entries.filter(entry => entry.kind !== 'instructions' && !KNOWN.includes(entry.kind)).map(itemOf) },
    ].filter(group => group.items.length > 0)

    const memoryView = (
      <Box flexDirection="column" gap="sm" width="100%">
        <Text dimColor size="footnote" wrap="wrap">
          {mem.dir ? `What Claude remembers about this project (${mem.dir}). Click an item to read it; ask Claude to change or remove one.` : 'Loading memory…'}
        </Text>
        {mem.dir !== '' && memGroups.length === 0 && <Text dimColor>No memory files yet.</Text>}
        <Box flexDirection="column" width="100%">
          {memGroups.map(group => {
            const isGroupOpen = !folded.includes(group.id)

            return (
              <Box key={`memgroup:${group.id}`} flexDirection="column" alignItems="stretch" width="100%">
                <Box gap={1} alignItems="center" justifyContent="space-between" width="100%" hover={{ scope: `memgroup:${group.id}`, backgroundColor: 'rgba(127, 127, 127, 0.16)' }}>
                  <Box gap={1} alignItems="center" flexShrink={1} minWidth={0}>
                    <Text color={group.color}>●</Text>
                    <Button key={`fold:${group.id}`} plain onPress={() => update($, memFolded, old => (old.includes(group.id) ? old.filter(one => one !== group.id) : [...old, group.id]))}>
                      <Text weight="semibold" wrap="truncate">
                        {group.label}
                      </Text>
                    </Button>
                  </Box>
                  <Text dimColor size="footnote">
                    {String(group.items.length)}
                  </Text>
                </Box>
                {isGroupOpen && (
                  <Box flexDirection="column">
                    {group.items.map((item, index) => (
                      <Box key={scopeId('memitem', item.id)} flexDirection="column" width="100%">
                      <Box key={scopeId('memrow', item.id)} width="100%" hover={{ scope: scopeId('memrow', item.id), backgroundColor: 'rgba(127, 127, 127, 0.16)' }}>
                        <Box gap={1} alignItems="center" justifyContent="space-between" width="100%">
                          <Box gap={0} alignItems="center" flexShrink={1} minWidth={0}>
                            {Svg && canDraw ? <Svg source={treeSvg(index === group.items.length - 1)} alt="tree branch" width={18} height={20} /> : <Text dimColor>{index === group.items.length - 1 ? '└─' : '├─'}</Text>}
                            <Box flexShrink={1} minWidth={0}>
                              <Button key={`open:${item.id}`} plain onPress={() => update($, memOpen, old => (old === item.id ? '' : item.id))}>
                                <Text wrap="truncate">{item.name}</Text>
                              </Button>
                            </Box>
                          </Box>
                          <Box flexShrink={1} minWidth={0} paddingRight="xs">
                            <Text dimColor size="footnote" wrap="truncate">
                              {item.file}
                            </Text>
                          </Box>
                        </Box>
                      </Box>
                      {openItem === item.id && (
                        <Box key={scopeId('membody', item.id)} flexDirection="column" gap="xs" paddingX="md" paddingY="sm" marginLeft={2} backgroundColor="rgba(127, 127, 127, 0.10)">
                          <Text dimColor size="footnote" wrap="wrap">
                            {item.path.replace(/^\/Users\/[^/]+/, '~')}
                          </Text>
                          {markdown(item.body === '' ? '(empty)' : item.body)}
                        </Box>
                      )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      </Box>
    )

    const allSkills = await read($, skills)
    const skillsLoaded = await read($, skillsScanned)
    const detailId = await read($, skillDetail)
    const shutDirs = await read($, skillDirShut)
    const isRendered = await read($, fileRendered)
    const offSkills = await read($, skillsOff)
    const editorName = await read($, editor)
    const editorList = await read($, editors)
    const trees = await read($, skillFiles)
    const fileText = await read($, skillText)
    // Grouped by reach: this project only, every project on this machine, or every machine signed in to the account. A plugin is a tag on its card.
    const SKILL_GROUPS = [
      { id: 'Project', label: 'Project', color: '#58B368' },
      { id: 'Machine', label: 'Global (this machine)', color: '#4C9AFF' },
      { id: 'Account', label: 'Global (account)', color: '#9B6BFF' },
    ]
    const skillGroups = SKILL_GROUPS.map(group => ({ ...group, items: allSkills.map((one, position) => ({ ...one, short: String(position) })).filter(one => one.source === group.id) })).filter(
      group => group.items.length > 0,
    )

    // A skill opens in its own view (Details): its facts, its folder as a file tree, and a file's text in a viewer under it. A breadcrumb goes back.
    const openDetail = async (item: SkillEntry) => {
      await update($, skillText, () => ({ path: '', text: '' }))
      await update($, skillDetail, () => item.id)
    }
    const toggleFile = async (path: string) => {
      if (fileText.path === path) {
        await update($, skillText, () => ({ path: '', text: '' }))

        return
      }
      let text: string
      try {
        text = await $.fs.read(path)
      } catch {
        text = '(could not read this file)'
      }
      if (text.includes('\u0000')) {
        text = '(binary file)'
      } else if (text.length > 20000) {
        text = `${text.slice(0, 20000)}\n\n(cut at 20000 characters)`
      }
      await update($, skillText, () => ({ path, text }))
    }
    // A file in a box like the app's own viewer: its name and line count on top, then its text with line numbers and the highlighter's colours
    // (`Code`); a markdown file can switch to its drawn form (Preview). A note (binary, unreadable) is plain text.
    const fileViewer = (path: string, text: string) => {
      const name = path.slice(path.lastIndexOf('/') + 1)
      const isNote = text.startsWith('(')
      const isMarkdownFile = path.endsWith('.md') && !isNote
      const clean = text.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
      const lineCount = clean.split('\n').length

      return (
        <Box key="file-viewer" flexDirection="column" borderStyle="round" borderColor="subtle" marginLeft={2}>
          <Box gap={1} alignItems="center" justifyContent="space-between" paddingX="sm" paddingY="xs">
            <Text dimColor size="footnote" wrap="truncate">
              {`${name} · ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`}
            </Text>
            {isMarkdownFile && (
              <Button key="file-mode" plain onPress={() => update($, fileRendered, old => !old)}>
                <Text dimColor size="footnote">
                  {isRendered ? 'Source' : 'Preview'}
                </Text>
              </Button>
            )}
          </Box>
          <Box flexDirection="column" paddingX="sm" paddingY="xs">
            {isNote ? <Text dimColor>{text}</Text> : isMarkdownFile && isRendered ? markdown(clean) : Code ? <Code source={clean} path={path} startLine={1} /> : <Text wrap="wrap">{clean}</Text>}
          </Box>
        </Box>
      )
    }

    // "Open in editor" as an icon (a box with an arrow out of it), drawn like the switch: the Svg with a transparent Button of non-breaking spaces
    // over it, so the whole icon is the click target. The terminal has no Svg: a ↗ glyph.
    const editIcon = (key: string, label: string, onPress: () => unknown) => {
      if (!Svg || !canDraw) {
        return (
          <Button key={key} plain onPress={keep(key, onPress)}>
            <Text dimColor>↗</Text>
          </Button>
        )
      }

      return (
        <Box key={`icon:${key}`} position="relative" flexShrink={0}>
          <Svg source={ICON_OPEN} alt={label} width={16} height={16} />
          <Box position="absolute" top={0} left={0} right={0} bottom={0} overflow="hidden">
            <Button key={key} plain onPress={keep(key, onPress)}>
              <Text wrap="truncate">{'\u00A0'.repeat(2)}</Text>
            </Button>
          </Box>
        </Box>
      )
    }

    // Tree rows as in devnonla-git-changes: the icon scaled into a 17x14 box, and on a graphical surface the whole row clickable through a
    // transparent Button that shows only under the pointer (the label itself is plain Text); in the terminal the label is the Button.
    const isTerminal = e.surface === 'terminal'
    const treeGap = isTerminal ? 1 : 0
    const treeIcon = (source: string, alt: string, fallback: string) =>
      Svg && canDraw ? (
        <Svg source={source.replace(/viewBox="(\S+) (\S+) (\S+) (\S+)"/, (_, x, y, _w, h) => `viewBox="${x} ${y} ${Number(h) * 1.21875} ${h}" preserveAspectRatio="xMinYMid meet"`)} alt={alt} width={17} height={14} />
      ) : (
        <Text dimColor>{fallback}</Text>
      )
    const rowPress = (key: string, onPress: () => unknown) =>
      isTerminal ? null : (
        <Box position="absolute" top={0} left={-1} right={-8} bottom={0} alignItems="center" display="none" hover={{ display: 'flex' }}>
          <Button key={key} plain onPress={onPress}>
            <Text wrap="truncate">{'\u00A0'.repeat(40)}</Text>
          </Button>
        </Box>
      )
    const rowLabel = (key: string, onPress: () => unknown, text: string, look: { dim?: boolean; bold?: boolean }) => {
      const shown = (
        <Text dimColor={look.dim === true} {...(look.bold ? { weight: 'semibold' as const } : {})} wrap="truncate">
          {text}
        </Text>
      )

      return isTerminal ? (
        <Button key={key} plain onPress={onPress}>
          {shown}
        </Button>
      ) : (
        shown
      )
    }
    const toggleDir = (path: string) => update($, skillDirShut, old => (old.includes(path) ? old.filter(one => one !== path) : [...old, path]))

    // In the list a skill is one line: a bullet in its group's color, its name (opens its detail), its switch; each row is a box with a rounded border in its group's color.
    const skillRow = (item: SkillEntry & { short: string }, color: string) => {
      const isOff = offSkills.includes(item.name)

      return (
        <Box
          key={`skillcard:${item.short}`}
          gap={1}
          alignItems="center"
          justifyContent="space-between"
          borderStyle="round"
          borderColor={tint(color, 0.25)}
          paddingX="sm"
          width="100%"
        >
          <Box gap={0} alignItems="center" flexShrink={1} minWidth={0}>
            <Text color={isOff ? undefined : color} dimColor={isOff}>
              ●
            </Text>
            <Button key={`skilldetail:${item.short}`} plain onPress={() => openDetail(item)}>
              <Text weight="semibold" dimColor={isOff} wrap="truncate">
                {item.name}
              </Text>
            </Button>
          </Box>
          <Box flexShrink={0}>{switchFor(`skillswitch:${item.short}`, !isOff, () => setSkillsOff($, isOff ? offSkills.filter(one => one !== item.name) : [...offSkills, item.name]))}</Box>
        </Box>
      )
    }

    const detail = allSkills.map((one, position) => ({ ...one, short: String(position) })).find(one => one.id === detailId)
    const detailView = (() => {
      if (!detail) {
        return undefined
      }
      const group = SKILL_GROUPS.find(one => one.id === detail.source)
      const tree = trees.find(one => one.id === detail.id)
      const isOff = offSkills.includes(detail.name)
      const folder = detail.path.slice(0, detail.path.lastIndexOf('/'))

      return (
        <Box flexDirection="column" gap="sm" width="100%">
          <Box gap={1} alignItems="center">
            <Button key="crumb:skills" plain onPress={() => update($, skillDetail, () => '')}>
              <Text color="#3B9EFF">Skills</Text>
            </Button>
            <Text dimColor>›</Text>
            <Text weight="semibold" wrap="truncate">
              {detail.name}
            </Text>
          </Box>
          <Box gap={1} alignItems="center" justifyContent="space-between" width="100%">
            <Box gap={1} alignItems="center" flexShrink={1} minWidth={0}>
              <Text color={group?.color ?? '#8B949E'} size="footnote">
                {group?.label ?? detail.source}
              </Text>
              {detail.plugin !== '' && (
                <Text dimColor size="footnote">
                  {`· ${detail.plugin} plugin`}
                </Text>
              )}
            </Box>
            <Box gap={1} alignItems="center" flexShrink={0}>
              {editorName !== '' && editIcon(`skilledit:${detail.short}`, `Open in ${editorName}`, () => openInEditor($, editorName, folder))}
              {switchFor(`skillswitch:${detail.short}`, !isOff, () => setSkillsOff($, isOff ? offSkills.filter(one => one !== detail.name) : [...offSkills, detail.name]))}
            </Box>
          </Box>
          {detail.description !== '' && <Text wrap="wrap">{detail.description}</Text>}
          <Text dimColor size="footnote" wrap="wrap">
            {`${folder.replace(/^\/Users\/[^/]+/, '~')}/`}
          </Text>
          <Box flexDirection="column" gap="xs" borderStyle="round" borderColor="subtle" paddingX="md" paddingY="sm" width="100%">
            <Text weight="semibold" size="footnote">
              Files
            </Text>
            {!tree && <Text dimColor>Loading files</Text>}
            {tree && (
              <Box flexDirection="column" rowGap="xs">
                {tree.files.map((file, position) => {
                  if (shutDirs.some(dir => file.path.startsWith(`${dir}/`))) {
                    return null
                  }
                  const name = file.path.slice(file.path.lastIndexOf('/') + 1)
                  if (file.isDir) {
                    const isOpen = !shutDirs.includes(file.path)
                    const key = `skilldir:${detail.short}:${position}`

                    return (
                      <Box key={`skillnode:${detail.short}:${position}`} position="relative" paddingLeft={file.depth * 2} gap={treeGap} alignItems="center">
                        {rowPress(key, () => toggleDir(file.path))}
                        {treeIcon(isOpen ? ICON_FOLDER_OPEN : ICON_FOLDER, 'folder', isOpen ? '▾' : '▸')}
                        {rowLabel(key, () => toggleDir(file.path), name, { dim: true })}
                      </Box>
                    )
                  }
                  const isOpenFile = fileText.path === file.path
                  const key = `skillfile:${detail.short}:${position}`

                  return (
                    <Box key={`skillnode:${detail.short}:${position}`} flexDirection="column" rowGap="xs">
                      <Box position="relative" paddingLeft={file.depth * 2} gap={treeGap} alignItems="center">
                        {rowPress(key, () => toggleFile(file.path))}
                        {treeIcon(fileIcon(name), 'file', '·')}
                        {rowLabel(key, () => toggleFile(file.path), name, { bold: isOpenFile })}
                      </Box>
                      {isOpenFile && fileViewer(file.path, fileText.text)}
                    </Box>
                  )
                })}
                {tree.isCut && (
                  <Text dimColor size="footnote">
                    {`Only the first ${SKILL_TREE_LIMIT} entries are listed.`}
                  </Text>
                )}
              </Box>
            )}
          </Box>
        </Box>
      )
    })()

    // A group is a rounded block tinted with its color (a hex color at low opacity, its border a little stronger), its skills inside as plain rows.
    const tint = (hex: string, alpha: number) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`

    const skillsList = (
      <Box flexDirection="column" gap="md" width="100%">
        <Text dimColor size="footnote" wrap="wrap">
          Skills on disk, by where they apply. Click a skill for its files; the switch leaves a skill out of what Claude is told. A skill switched off is left out of what Claude is told (no tokens); typed as /name it still runs.
        </Text>
        {editorList.length > 1 && (
          <Box gap={1} alignItems="center">
            <Text dimColor size="footnote">
              Open with
            </Text>
            <Select key="skill-editor" options={editorList.map(name => ({ value: name, label: name }))} value={editorName === '' ? undefined : editorName} onSelect={name => setEditor($, name)} />
          </Box>
        )}
        {allSkills.length === 0 && <Text dimColor>{skillsLoaded ? 'No skills found.' : 'Loading skills'}</Text>}
        {skillGroups.map(group => {
          return (
            <Box key={`skillgroup:${group.id}`} flexDirection="column" gap="xs" width="100%" padding="sm" borderStyle="round" borderColor={tint(group.color, 0.3)} backgroundColor={tint(group.color, 0.08)}>
              <Box gap={1} alignItems="center" justifyContent="space-between" width="100%" paddingBottom="xs">
                <Box flexShrink={1} minWidth={0} paddingX="sm">
                  <Text weight="bold" size="heading" color={group.color} wrap="truncate">
                    {group.label}
                  </Text>
                </Box>
                <Text dimColor size="footnote">
                  {String(group.items.length)}
                </Text>
              </Box>
              {group.items.map(item => skillRow(item, group.color))}
            </Box>
          )
        })}
      </Box>
    )

    const skillsView = detailView ?? skillsList

    const currentView = await read($, view)
    const showView = async (next: string) => {
      await update($, view, () => next)
      if (next === 'memory') {
        await loadMemory($)
      }
      if (next === 'skills') {
        await update($, skillDetail, () => '')
        // Not awaited: the tab shows at once and fills in when the scan is done.
        loadSkills($).catch(() => undefined)
      }
    }
    const tabButton = (id: string, label: string) => (
      <Button key={`view:${id}`} label={label} variant={currentView === id ? 'primary' : 'secondary'} onPress={() => showView(id)} />
    )

    return (
      <Box flexDirection="column" gap="sm" paddingX="xs" paddingY="xs">
        <Box gap={1} alignItems="center">
          {tabButton('agents', '🤖 Agents')}
          {tabButton('tools', '🧰 Tools')}
          {tabButton('skills', '✨ Skills')}
          {tabButton('memory', '🧠 Memory')}
        </Box>
        {currentView === 'tools' ? toolsView : currentView === 'skills' ? skillsView : currentView === 'memory' ? memoryView : agentsView}
      </Box>
    )
  })
}
