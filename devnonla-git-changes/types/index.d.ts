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

declare module 'claude-code' {
  interface PluginState {
    'devnonla-git-changes': {
      repos: Shaped<RepoState[]>
      collapsed: Shaped<string[]>
      pulling: Shaped<string[]>
    }
  }
}
