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
