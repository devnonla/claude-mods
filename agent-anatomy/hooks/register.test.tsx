import { expect, test } from 'claude-code/testing'

const paneProps = {
  title: 'Anatomy',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

test('the Agents pane lists project and built-in agent types and runs one', async ($, on) => {
  const spawned: unknown[] = []
  on('command.register', () => ({ value: { command: 'anatomy' } }))
  on('session.root', () => ({ value: '/work/demo' }))
  on('fs.exists', () => ({ value: true }))
  const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 1, mtimeMs: 0, isLink: false })
  on('fs.list', (_, e) => ({ value: e.path === '/work/demo/.claude/skills' ? [entry('demo', 'dir'), entry('notes.txt', 'file')] : e.path === '/work/demo/.claude/skills/demo' ? [entry('SKILL.md', 'file'), entry('references', 'dir'), entry('node_modules', 'dir')] : e.path === '/work/demo/.claude/skills/demo/references' ? [entry('guide.md', 'file'), entry('run.sh', 'file')] : e.path === '/plugins/plugin-c/skills' ? [entry('local-one', 'dir')] : e.path === '/plugins/plugin-b/skills' ? [entry('elsewhere', 'dir')] : e.path.endsWith('/plugin-a/skills') ? [entry('shipped', 'dir'), entry('a-skill-whose-folder-name-is-long-enough-to-push-the-path-past-64-chars', 'dir')] : [entry('tester.md', 'file')] }))
  on('fs.read', (_, e) => ({
    value: e.path.endsWith('/installed_plugins.json')
      ? JSON.stringify({ plugins: { 'plugin-a@market': [{ scope: 'user', installPath: '/plugins/plugin-a' }], 'plugin-b@market': [{ scope: 'project', projectPath: '/other', installPath: '/plugins/plugin-b' }], 'plugin-c@market': [{ scope: 'local', projectPath: '/work/demo', installPath: '/plugins/plugin-c' }] } })
      : e.path.endsWith('/local-one/SKILL.md') ? '---\nname: local-one\ndescription: Installed for this project\n---\n' : e.path.endsWith('/elsewhere/SKILL.md') ? '---\nname: elsewhere\ndescription: Another project\n---\n' : e.path.endsWith('/references/guide.md') ? '# Guide\nStep one' : e.path.endsWith('/references/run.sh') ? 'echo hi' : e.path.endsWith('/shipped/SKILL.md')
        ? '---\nname: shipped\ndescription: "Ships with a plugin"\n---\nPlugin body'
        : e.path.endsWith('/demo/SKILL.md')
          ? '---\nname: demo\ndescription: Demo skill\n---\nDemo steps'
          : '---\nname: tester\ndescription: Runs the tests\ntools: Bash, Read\n---\nBody',
  }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.write', () => ({ value: undefined }))
  const ran: string[] = []
  on('process.run', (_, e) => {
    ran.push(e.argv.join(' '))

    return { value: { exitCode: 0, stdout: e.argv[0] === 'uname' ? 'Darwin\n' : '/home/u\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  const opened: unknown[] = []
  on('tool.call', (_, e) => {
    opened.push(e)

    return { result: {} }
  })
  on('tool.list', () => ({ value: [{ name: 'Read', description: 'Reads a file', mcp: false }, { name: 'Bash', description: 'Runs a shell command', mcp: false }, { name: 'mcp__x__y', description: 'Does y', mcp: true }, { name: 'mcp__x__z', description: 'Does z', mcp: true }] }))
  on('agent.spawn', (_, e) => {
    spawned.push(e)

    return { model: 'm', agentId: 'new1' }
  })
  on('prompt.attachment', (_, e) => ({ text: e.text }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })
  // Opened as a person does, with /anatomy: it loads the agent list before it opens the pane (the session start only starts that load).
  await $.command.run({ command: 'anatomy', args: '' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-anatomy', component: 'Pane', requestId: 'agent-anatomy', props: paneProps, surface })

    expect((await ui.find({ type: 'Text', text: /^tester$/ }))?.text).toBe('tester')
    expect((await ui.find({ type: 'Text', text: /^Runs the tests$/ }))?.text).toBe('Runs the tests')
    expect((await ui.find({ type: 'Text', text: /^Explore$/ }))?.text).toBe('Explore')
    expect((await ui.find({ type: 'Text', text: /tools: Bash, Read/ }))?.text).toContain('Bash')

    await ui.press({ key: 'view:tools' })
    await ui.press({ key: 'name:Bash' })
    expect((await ui.find({ type: 'Text', text: /^Runs a shell command$/ }))?.text).toBe('Runs a shell command')
    expect((await ui.find({ type: 'Text', text: /Claude Code tool · on for the main agent/ }))?.text).toContain('Claude Code tool')
    await ui.press({ key: 'name:Bash' })
    await ui.press({ key: 'tool:Bash' })
    const refused = await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(refused.deny).toContain('switched off')
    const sub = await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })
    expect(sub.deny).toBeUndefined()
    await ui.press({ key: 'tool:Bash' })
    expect((await $.tool.call({ tool: 'Bash', command: 'ls' })).deny).toBeUndefined()
    await ui.press({ key: 'server:x' })
    expect((await $.tool.call({ tool: 'mcp__x__y' } as never)).deny).toContain('switched off')
    await ui.press({ key: 'server:x' })
    expect((await $.tool.call({ tool: 'mcp__x__y' } as never)).deny).toBeUndefined()
    await ui.press({ key: 'expand:x' })
    await ui.press({ key: 'tool:mcp__x__y' })
    expect((await $.tool.call({ tool: 'mcp__x__y' } as never)).deny).toContain('switched off')
    expect((await $.tool.call({ tool: 'mcp__x__z' } as never)).deny).toBeUndefined()
    await ui.press({ key: 'tool:mcp__x__y' })
    await ui.press({ key: 'expand:x' })

    await ui.press({ key: 'view:skills' })
    expect((await ui.find({ type: 'Text', text: /^Project$/ }))?.text).toBe('Project')
    expect((await ui.find({ type: 'Text', text: /^notes\.txt$/ })) === undefined).toBe(true)
    // Grouped by reach: a plugin installed for this project sits in Project, one installed for the user in Global, one for another project nowhere.
    expect((await ui.find({ type: 'Text', text: /^Global \(this machine\)$/ }))?.text).toBe('Global (this machine)')
    expect((await ui.find({ type: 'Text', text: /^local-one$/ }))?.text).toBe('local-one')
    expect(await ui.find({ type: 'Text', text: /^elsewhere$/ })).toBeUndefined()
    // In the list a skill is its name only (with Details and a switch): no description, no tree.
    expect((await ui.find({ type: 'Text', text: /^demo$/ }))?.text).toBe('demo')
    expect(await ui.find({ type: 'Text', text: /^Demo skill$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^references$/ })).toBeUndefined()

    // Details opens the skill's own view: a breadcrumb, its group and plugin, description, folder, and its whole folder as a tree (folders first,
    // node_modules left out).
    await ui.press({ key: 'skilldetail:0' })
    expect((await ui.find({ type: 'Text', text: /^Skills$/ }))?.text).toBe('Skills')
    expect((await ui.find({ type: 'Text', text: /^Demo skill$/ }))?.text).toBe('Demo skill')
    expect((await ui.find({ type: 'Text', text: /^references$/ }))?.text).toBe('references')
    expect((await ui.find({ type: 'Text', text: /^guide\.md$/ }))?.text).toBe('guide.md')
    expect(await ui.find({ type: 'Text', text: /^node_modules/ })).toBeUndefined()
    // A folder folds (its rows go), then opens again.
    await ui.press({ key: 'skilldir:0:0' })
    expect(await ui.find({ type: 'Text', text: /^guide\.md$/ })).toBeUndefined()
    await ui.press({ key: 'skilldir:0:0' })
    expect((await ui.find({ type: 'Text', text: /^guide\.md$/ }))?.text).toBe('guide.md')
    // A file opens in a viewer under it: its text with line numbers (Code), a markdown file switching to its drawn form; one file at a time.
    await ui.press({ key: 'skillfile:0:1' })
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('# Guide\nStep one')
    expect((await ui.find({ type: 'Text', text: /^guide\.md · 2 lines$/ }))?.text).toBe('guide.md · 2 lines')
    await ui.press({ key: 'file-mode' })
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('# Guide\nStep one')
    await ui.press({ key: 'file-mode' })
    await ui.press({ key: 'skillfile:0:2' })
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('echo hi')
    expect(await ui.find({ type: 'Text', text: /^Preview$/ })).toBeUndefined()
    await ui.press({ key: 'skillfile:0:2' })
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    // The arrow opens the skill's folder in an editor found on the machine: the first one (the stubs find every app, so Cursor), or the one picked.
    await ui.press({ key: 'skilledit:0' })
    expect(ran.at(-1)).toBe('open -a Cursor /work/demo/.claude/skills/demo')
    // The breadcrumb goes back to the list.
    await ui.press({ key: 'crumb:skills' })
    expect(await ui.find({ type: 'Text', text: /^Demo skill$/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /^demo$/ }))?.text).toBe('demo')
    await ui.select({ key: 'skill-editor', value: 'Zed' })
    await ui.press({ key: 'skilldetail:0' })
    await ui.press({ key: 'skilledit:0' })
    expect(ran.at(-1)).toBe('open -a Zed /work/demo/.claude/skills/demo')
    await ui.press({ key: 'crumb:skills' })
    await ui.select({ key: 'skill-editor', value: 'Cursor' })

    // A skill switched off is left out of the listing the model reads (with any lines its description runs on over); on again, the listing is whole.
    const listing = 'Skills you can use:\n- demo: Demo skill\n  more about demo\n- plugin-a:shipped: Ships with a plugin\n- anthropic-skills:demo-two: Another\n\nEnd.'
    await ui.press({ key: 'skillswitch:0' })
    const trimmed = (await $.prompt.attachment({ type: 'skill_listing', text: listing, origin: 'engine' } as never)) as { text: string }
    expect(trimmed.text).toBe('Skills you can use:\n- plugin-a:shipped: Ships with a plugin\n- anthropic-skills:demo-two: Another\n\nEnd.')
    await ui.press({ key: 'skillswitch:0' })
    expect(((await $.prompt.attachment({ type: 'skill_listing', text: listing, origin: 'engine' } as never)) as { text: string }).text).toBe(listing)

    await ui.press({ key: 'view:memory' })
    expect((await ui.find({ type: 'Text', text: /^Loaded every session$/ }))?.text).toBe('Loaded every session')
    expect((await ui.find({ type: 'Text', text: /^tester$/ }))?.text).toBe('tester')
    expect((await ui.find({ type: 'Text', text: /^CLAUDE\.md \(project\)$/ }))?.text).toBe('CLAUDE.md (project)')
    expect((await ui.find({ type: 'Text', text: /\.claude\/projects\/-work-demo\/memory/ }))?.text).toContain('-work-demo')
    // An item opens inline from the original file (nothing is copied into the project), and a second press closes it.
    const openedBefore = opened.length
    await ui.press({ key: 'open:tester.md' })
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('Body')
    expect((await ui.find({ type: 'Text', text: /\.claude\/projects\/-work-demo\/memory\/tester\.md/ }))?.text).toContain('tester.md')
    expect(opened.length).toBe(openedBefore)
    await ui.press({ key: 'open:tester.md' })
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    await ui.press({ key: 'fold:instructions' })
    expect(await ui.find({ type: 'Text', text: /^CLAUDE\.md \(project\)$/ })).toBeUndefined()
    await ui.press({ key: 'fold:instructions' })

    await ui.press({ key: 'view:agents' })
    await ui.press({ key: 'pick:tester' })
    await ui.input({ key: 'run:tester', text: 'Run everything' })
    expect(JSON.stringify(spawned.at(-1))).toContain('Run everything')
    expect(JSON.stringify(spawned.at(-1))).toContain('tester')
    await ui.unmount()
  }
})

test('the footer button reads Anatomy and opens the pane on every surface', async ($, on) => {
  const opened: unknown[] = []
  on('command.register', () => ({ value: { command: 'anatomy' } }))
  on('session.root', () => ({ value: '/work/demo' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: '' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('store.get', () => ({ value: undefined }))
  on('tool.list', () => ({ value: [] }))
  on('ui.panes', () => ({ value: [] }))
  // Stands for what the engine draws in the footer beneath the mod.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text dimColor>mode</Text>
  })
  on('ui.open', (_, e) => {
    opened.push(e)

    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-anatomy', component: 'SessionMode', props: { modes: [] }, surface })

    expect((await ui.find({ type: 'Button', text: /Anatomy$/ }))?.text).toContain('Anatomy')
    await ui.press({ key: 'toggle-anatomy' })
    expect(JSON.stringify(opened.at(-1))).toContain('Anatomy')
    await ui.unmount()
  }
})
