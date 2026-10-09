import { expect, test } from 'claude-code/testing'

type On = Parameters<import('claude-code/testing').TestBody>[1]

const at = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
const FILE = '/Users/me/AppData/Local/Temp/claude-idle-opacity/state'

// A machine whose session a terminal shows while `view.onScreen`; returns every write, path and text
function machine(on: On, view: { onScreen: boolean }) {
  const writes: string[] = []
  on('env.get', ($, e) => ({ value: ({ TEMP: 'C:\\Users\\me\\AppData\\Local\\Temp' } as Record<string, string>)[e.name] }))
  on('session.surfaces', () => ({ value: view.onScreen ? ['terminal'] : [] }))
  on('fs.write', ($, e) => {
    writes.push(`${at(e.path)} ${e.text}`)
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', () => ({ sessionId: 'sess-1' }) as never)
  return writes
}

const done = (extra: object = {}) =>
  ({ answer: '', durationMs: 10, isAborted: false, reason: 'answer', turnId: 't1', ...extra }) as never

test('the session on screen says working through a turn and stopped once the answer is in; a subagent changes nothing', async ($, on) => {
  const writes = machine(on, { onScreen: true })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete(done({ agentId: 'agent-1' }))
  expect(writes).toEqual([`${FILE} stopped`, `${FILE} working`])

  await $.turn.complete(done())
  await $.session.end({ reason: 'exit' } as never)
  expect(writes).toEqual([`${FILE} stopped`, `${FILE} working`, `${FILE} stopped`, `${FILE} ended`])
})

test('an interrupted turn counts as stopped', async ($, on) => {
  const writes = machine(on, { onScreen: true })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.start({ text: 'go', turnId: 't2' })
  await $.turn.complete(done({ isAborted: true, reason: 'aborted', turnId: 't2' }))
  expect(writes.at(-1)).toBe(`${FILE} stopped`)
})

test('a background session writes nothing until a terminal switches to it, then its state at once', async ($, on) => {
  const view = { onScreen: false }
  const writes = machine(on, view)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.start({ text: 'work', turnId: 't3' })
  expect(writes).toEqual([])

  view.onScreen = true
  await $.session.attach({ surface: 'terminal', clientId: 'terminal:default' })
  expect(writes).toEqual([`${FILE} working`])
})
