export type ToolDesc = {
  name: string
  description: string
}

export type MemoryEntry = {
  id: string
  name: string
  description: string
  kind: string
  body: string
  path: string
}

export type SkillEntry = {
  id: string
  name: string
  description: string
  source: string
  plugin: string
  path: string
}

export type SkillFile = {
  path: string
  depth: number
  isDir: boolean
}

export type SkillText = {
  path: string
  text: string
}

export type SkillFiles = {
  id: string
  files: SkillFile[]
  isCut: boolean
}

export type MemoryState = {
  dir: string
  index: string
  indexPath: string
  entries: MemoryEntry[]
}

export type AgentType = {
  name: string
  description: string
  tools: string
  source: string
}

declare module 'claude-code' {
  interface PluginState {
    'agent-anatomy': {
      types: Shaped<AgentType[]>
      picked: Shaped<string>
      view: Shaped<string>
      memory: Shaped<MemoryState>
      memFolded: Shaped<string[]>
      memOpen: Shaped<string>
      skills: Shaped<SkillEntry[]>
      skillDetail: Shaped<string>
      skillDirShut: Shaped<string[]>
      fileRendered: Shaped<boolean>
      skillsOff: Shaped<string[]>
      skillsScanned: Shaped<boolean>
      editor: Shaped<string>
      editors: Shaped<string[]>
      skillFiles: Shaped<SkillFiles[]>
      skillText: Shaped<SkillText>
      toolNames: Shaped<string[]>
      toolDescs: Shaped<ToolDesc[]>
      detailTool: Shaped<string>
      disabled: Shaped<string[]>
      expanded: Shaped<string[]>
    }
  }
}
