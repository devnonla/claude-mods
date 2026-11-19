export type ChangedFile = {
  path: string
  code: string
}

export type RepoState = {
  name: string
  path: string
  isSessionRepo: boolean
  branch: string
  ahead: number
  behind: number
  staged: number
  unstaged: number
  untracked: number
  files: ChangedFile[]
  error?: string
}

export type GraphRef = {
  name: string
  kind: 'head' | 'branch' | 'remote' | 'tag'
}

/**
 * One drawn piece of a graph row. `from`/`to` are lane indexes, `color` an index into the palette.
 * - full: vertical line on lane `from`, whole row height
 * - top: from lane `from` at the row's top edge to lane `to` at the node's height
 * - bottom: from lane `from` at the node's height to lane `to` at the row's bottom edge
 */
export type GraphSeg = {
  kind: 'full' | 'top' | 'bottom'
  from: number
  to: number
  color: number
}

export type GraphRow = {
  hash: string
  short: string
  subject: string
  author: string
  date: string
  refs: GraphRef[]
  node: number
  color: number
  segs: GraphSeg[]
}

export type GraphState = {
  repo: string
  lanes: number
  rows: GraphRow[]
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'devnonla-git-changes': {
      repos: Shaped<RepoState[]>
      collapsed: Shaped<string[]>
      pulling: Shaped<string[]>
      tab: Shaped<string>
      graphRepo: Shaped<string>
      graphLimit: Shaped<number>
      graph: Shaped<GraphState>
    }
  }
}
