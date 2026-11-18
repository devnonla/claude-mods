import { expect, test } from 'claude-code/testing'

const paneProps = {
  title: 'Repos',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const STATUS = ['## master...origin/master [ahead 1, behind 2]', ' M src/modules/ticket/ticket.service.ts', 'A  src/modules/ticket/ticket.dto.ts', '?? docs/new.md', ' D README.md', ''].join('\n')

test('the tree opens a file in the built-in diff, folds a folder and pulls, on every surface', async ($, on) => {
  const calls: string[][] = []
  const panes: unknown[] = []
  on('command.register', () => ({ value: { command: 'repos' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.exists', (_, e) => ({ value: e.path === '/work/demo/.git' }))
  on('fs.list', () => ({ value: [] }))
  on('process.run', (_, e) => {
    calls.push([...e.argv])

    return { value: { exitCode: 0, stdout: e.argv.includes('status') ? STATUS : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('clock.every', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work/demo' }))
  on('tool.call', (_, e) => {
    panes.push(e)

    return { result: {} }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'devnonla-git-changes', component: 'Pane', requestId: 'devnonla-git-changes', props: paneProps, surface })

    expect((await ui.find({ type: 'Text', text: /^demo$/ }))?.text).toBe('demo')
    expect((await ui.find({ type: 'Text', text: /^src\/modules\/ticket$/ }))?.text).toBe('src/modules/ticket')
    expect((await ui.find({ type: 'Text', text: /^ticket\.service\.ts$/ }))?.text).toBe('ticket.service.ts')

    await ui.press({ key: 'file:demo:src/modules/ticket/ticket.service.ts' })
    expect(JSON.stringify(panes.at(-1))).toContain('"pane":"diff"')
    expect(JSON.stringify(panes.at(-1))).toContain('/work/demo/src/modules/ticket/ticket.service.ts')

    await ui.press({ key: 'dir:demo:src/modules/ticket' })
    expect(await ui.find({ type: 'Text', text: /^ticket\.service\.ts$/ })).toBeUndefined()
    await ui.press({ key: 'dir:demo:src/modules/ticket' })

    await ui.press({ key: 'pull:demo' })
    expect(calls.some(argv => argv.includes('pull') && argv.includes('--ff-only'))).toBe(true)

    await ui.unmount()
  }
})

test('a session inside a sub-repo still lists the whole workspace', async ($, on) => {
  on('command.register', () => ({ value: { command: 'repos' } }))
  on('fs.exists', (_, e) => ({ value: ['/work/demo/.git', '/work/demo/admin/.git', '/work/demo/client/.git'].includes(e.path) }))
  on('fs.list', (_, e) => ({
    value:
      e.path === '/work/demo'
        ? [
            { name: 'admin', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false },
            { name: 'client', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false },
            { name: 'node_modules', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false },
          ]
        : [],
  }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '## master\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work/demo/admin' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work/demo/admin', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'devnonla-git-changes', component: 'Pane', requestId: 'devnonla-git-changes', props: paneProps, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^demo$/ }))?.text).toBe('demo')
  expect((await ui.find({ type: 'Text', text: /^admin$/ }))?.text).toBe('admin')
  expect((await ui.find({ type: 'Text', text: /^client$/ }))?.text).toBe('client')
  await ui.unmount()
})

const SEP = '\u001f'
const LOG = [
  ['c3c3c3c3', 'c1c1c1c1 c2c2c2c2', 'HEAD -> refs/heads/main, refs/remotes/origin/main', 'Ann', '3 Sep 2019 23:27', 'Merge feature'],
  ['c2c2c2c2', 'c0c0c0c0', 'refs/heads/feature, tag: refs/tags/v1', 'Bob', '3 Sep 2019 21:37', 'Add feature'],
  ['c1c1c1c1', 'c0c0c0c0', '', 'Ann', '3 Sep 2019 20:47', 'Fix bug'],
  ['c0c0c0c0', '', '', 'Ann', '3 Sep 2019 19:00', 'Initial commit'],
]
  .map(fields => fields.join(SEP))
  .join('\n')

const stubWorkspace = ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], roots: string[], cwd: string, logCalls: string[]) => {
  on('command.register', () => ({ value: { command: 'repos' } }))
  on('fs.exists', (_, e) => ({ value: roots.some(root => e.path === `${root}/.git`) }))
  on('fs.list', (_, e) => ({
    value: e.path === '/work/demo' ? roots.filter(root => root !== '/work/demo').map(root => ({ name: root.split('/').pop() ?? '', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) : [],
  }))
  on('process.run', (_, e) => {
    const isLog = e.argv.includes('log')
    if (isLog) {
      logCalls.push(JSON.stringify(e))
    }

    return { value: { exitCode: 0, stdout: isLog ? LOG : '## main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('clock.every', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: cwd }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

test('the Graph tab picks the only repo by itself and draws commits, refs and lanes on every surface', async ($, on) => {
  const logCalls: string[] = []
  stubWorkspace($, on, ['/work/demo'], '/work/demo', logCalls)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'devnonla-git-changes', component: 'Pane', requestId: 'devnonla-git-changes', props: paneProps, surface })

    await ui.press({ key: 'tab:graph' })
    expect(logCalls.at(-1)).toContain('--all')
    expect((await ui.find({ type: 'Text', text: /^Merge feature$/ }))?.text).toBe('Merge feature')
    expect((await ui.find({ type: 'Text', text: /^Initial commit$/ }))?.text).toBe('Initial commit')
    expect((await ui.find({ type: 'Text', text: /^ main $/ }))?.text).toBe(' main ')
    expect((await ui.find({ type: 'Text', text: /^ origin\/main $/ }))?.text).toBe(' origin/main ')
    expect((await ui.find({ type: 'Text', text: /^ v1 $/ }))?.text).toBe(' v1 ')
    expect((await ui.find({ type: 'Text', text: /^c3c3c3c$/ }))?.text).toBe('c3c3c3c')
    if (surface === 'terminal') {
      expect((await ui.find({ type: 'Text', text: /●/ }))?.text).toContain('●')
    }

    await ui.press({ key: 'tab:changes' })
    expect(await ui.find({ type: 'Text', text: /^Merge feature$/ })).toBeUndefined()

    await ui.unmount()
  }
})

test('with several repos the Graph tab asks which one, then loads that repo', async ($, on) => {
  const logCalls: string[] = []
  stubWorkspace($, on, ['/work/demo', '/work/demo/admin', '/work/demo/client'], '/work/demo', logCalls)
  await $.session.start({ cwd: '/work/demo', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ plugin: 'devnonla-git-changes', component: 'Pane', requestId: 'devnonla-git-changes', props: paneProps, surface: 'desktop' })
  await ui.press({ key: 'tab:graph' })
  expect(await ui.find({ type: 'Text', text: /Select a repo/ })).toBeDefined()
  expect(logCalls).toHaveLength(0)

  await ui.select({ key: 'graph-repo', value: 'admin' })
  expect(logCalls.at(-1)).toContain('/work/demo/admin')
  expect((await ui.find({ type: 'Text', text: /^Merge feature$/ }))?.text).toBe('Merge feature')
  await ui.unmount()
})
