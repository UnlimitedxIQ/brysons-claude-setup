import { describe, expect, test } from 'claude-code/testing'

import { answerDecision, applyUpdate, asksUser, describeBoard, urlPins } from '../hooks/register'

const SURFACES = ['terminal', 'desktop'] as const
const TOOL = 'mcp__pinboard__update'
const PANE = {
  plugin: 'pinboard',
  component: 'Pane',
  requestId: 'pinboard',
  props: {
    title: 'Pinboard',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')

describe('board', () => {
  test('updates add, check off, remove and decide by id', () => {
    let board = applyUpdate({ todos: [], decisions: [] }, { add_todos: ['Write it', 'Test it', 'Drop it'], open_decisions: ['Ship it?', 'Which owner?'] })
    expect(board.todos.map(t => t.id)).toEqual(['t1', 't2', 't3'])
    expect(board.decisions.map(d => d.id)).toEqual(['d1', 'd2'])
    board = applyUpdate(board, { done_todos: ['t1'], remove_todos: ['t3'], decide: [{ id: 'd1', answer: 'yes' }] })
    expect(board.todos).toEqual([
      { id: 't1', text: 'Write it', isDone: true },
      { id: 't2', text: 'Test it', isDone: false },
    ])
    expect(board.decisions).toEqual([{ id: 'd2', text: 'Which owner?' }])
    expect(applyUpdate(board, { add_todos: ['Ship it'] }).todos.at(-1)?.id).toBe('t3')
  })

  test('one todo is in progress at a time, and finishing it ends that', () => {
    let board = applyUpdate({ todos: [], decisions: [] }, { add_todos: ['a', 'b'], start_todo: 't1' })
    expect(board.todos.map(t => !!t.isActive)).toEqual([true, false])
    board = applyUpdate(board, { start_todo: 't2' })
    expect(board.todos.map(t => !!t.isActive)).toEqual([false, true])
    board = applyUpdate(board, { done_todos: ['t2'] })
    expect(board.todos.some(t => t.isActive)).toBe(false)
    expect(describeBoard(applyUpdate(board, { start_todo: 't1' }))).toBe('Pinboard now:\nt1 [>] a\nt2 [x] b')
  })

  test('the board reads back with ids', () => {
    expect(describeBoard({ todos: [], decisions: [] })).toBe('Pinboard is empty.')
    expect(describeBoard({ todos: [{ id: 't1', text: 'Write it', isDone: true }], decisions: [{ id: 'd1', text: 'Which owner?' }] })).toBe(
      'Pinboard now:\nt1 [x] Write it\nd1 [?] Which owner?',
    )
  })

  test('an answer from the pane stays on the board until Claude closes it', () => {
    const decisions = [{ id: 'd1', text: 'Ship it?' }, { id: 'd2', text: 'Which owner?' }]
    const answered = answerDecision(decisions, 'd2', '  Bryson  ')
    expect(answered).toEqual([{ id: 'd1', text: 'Ship it?' }, { id: 'd2', text: 'Which owner?', answer: 'Bryson' }])
    // Blank replies and unknown ids change nothing
    expect(answerDecision(decisions, 'd1', '   ')).toBe(decisions)
    expect(answerDecision(decisions, 'd9', 'yes')).toBe(decisions)
    expect(describeBoard({ todos: [], decisions: answered })).toBe('Pinboard now:\nd1 [?] Ship it?\nd2 [answered] Which owner? → Bryson')
    expect(applyUpdate({ todos: [], decisions: answered }, { decide: [{ id: 'd2', answer: 'Bryson' }] }).decisions).toEqual([{ id: 'd1', text: 'Ship it?' }])
  })

  test('findings are added with ids and a why, removed by id, and read back', () => {
    let board = applyUpdate(
      { todos: [], decisions: [] },
      {
        add_findings: [
          { kind: 'result', text: 'Momentum on SPY: Sharpe 0.4', why: '2010-2024, beats buy and hold only before costs' },
          { kind: 'switched', text: 'Moved from yfinance to Stooq data', why: 'yfinance rate-limited after 40 tickers' },
        ],
      },
    )
    expect(board.findings?.map(f => f.id)).toEqual(['f1', 'f2'])
    board = applyUpdate(board, { remove_findings: ['f1'], add_findings: [{ kind: 'found', text: 'Earnings drift holds in small caps' }] })
    expect(board.findings).toEqual([
      { id: 'f2', kind: 'switched', text: 'Moved from yfinance to Stooq data', why: 'yfinance rate-limited after 40 tickers' },
      { id: 'f3', kind: 'found', text: 'Earnings drift holds in small caps' },
    ])
    expect(describeBoard(board)).toBe(
      'Pinboard now:\nf2 [switched] Moved from yfinance to Stooq data — yfinance rate-limited after 40 tickers\nf3 [found] Earnings drift holds in small caps',
    )
    // An unknown kind reads as a plain finding
    expect(applyUpdate({ todos: [], decisions: [] }, { add_findings: [{ kind: 'nope' as never, text: 'x' }] }).findings?.[0]?.kind).toBe('found')
  })

  test('a reply asks the user something when it ends on a question outside code', () => {
    expect(asksUser('Saved the draft.\n\nShould I delete it?')).toBe(true)
    expect(asksUser('Done.\n\n**Want me to go ahead?**')).toBe(true)
    expect(asksUser('Why did it fail? The cache was stale.\n\nFixed.\n\nTests pass.\n\nPushed.')).toBe(false)
    expect(asksUser('Run this:\n\n```\n[ -z "$x" ] && echo unset?\n```')).toBe(false)
    expect(asksUser('')).toBe(false)
  })

  test('URLs get short GitHub labels and lose trailing punctuation', () => {
    const pins = urlPins('See https://github.com/o/hivemind/pull/338, and https://mail.google.com/mail/#drafts/abc). Skip https://x.com/a@b')
    expect(pins).toEqual([
      { href: 'https://github.com/o/hivemind/pull/338', label: 'hivemind PR #338' },
      { href: 'https://mail.google.com/mail/#drafts/abc', label: 'mail.google.com/mail/#drafts/abc' },
    ])
  })
})

describe('session', () => {
  test('the tool updates the pane and the system prompt carries the board', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' }] }))
    const first = await $.tool.call({ tool: TOOL, add_todos: ['Write it', 'Test it', 'Ship it'], open_decisions: ['Should I ship it?', 'Which owner?'] })
    expect('result' in first && first.result).toContain('d2 [?] Which owner?')
    await $.tool.call({ tool: TOOL, done_todos: ['t1'], start_todo: 't2', decide: [{ id: 'd1', answer: 'yes' }] })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      const all = await texts(ui)
      // Finished todos fold into one line; the active one is marked and colored
      expect(all).toContain('✓ 1 done')
      expect(all).not.toContain('Write it')
      expect(all).toContain('▸ Test it')
      expect((await ui.find({ type: 'Text', text: 'Test it' }))?.props.color).toBe('#FFEB95')
      expect(all).toContain('○ Ship it')
      expect(all).toContain('1/3')
      expect(all).toContain('? Which owner?')
      expect(all).not.toContain('Should I ship it?')
      // The bullet sits apart from wrapping text, so a second line indents under the text
      expect((await ui.find({ type: 'Text', text: 'Which owner?' }))?.props.wrap).toBe('wrap')
      await ui.unmount()
    }
    const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
    expect(sections.at(-1)?.text).toBe('Pinboard now:\nt1 [x] Write it\nt2 [>] Test it\nt3 [ ] Ship it\nd2 [?] Which owner?')
  })

  test('a question left only in the reply sends Claude back once to pin it', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    // The settings hooks beneath have nothing to say
    on('classic.Stop', () => ({}))
    const asking = { stop_hook_active: false, last_assistant_message: 'Draft saved.\n\nShould I delete the old one?' }
    expect((await $.classic.Stop(asking)).block).toContain('open_decisions')
    // Once, so a rhetorical question can still end the turn
    expect((await $.classic.Stop({ ...asking, stop_hook_active: true })).block).toBeUndefined()
    expect((await $.classic.Stop({ ...asking, last_assistant_message: 'Draft saved.' })).block).toBeUndefined()
    await $.tool.call({ tool: TOOL, open_decisions: ['Delete the old draft?'] })
    expect((await $.classic.Stop(asking)).block).toBeUndefined()
  })

  test('a reply typed in the pane goes to Claude as the user and marks the decision answered', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('prompt.compose', () => ({ sections: [] }))
    const sent: { text: string; asUser?: boolean }[] = []
    on('prompt.submit', (_$, e) => {
      sent.push({ text: e.text, asUser: e.origin?.kind === 'plugin' ? e.origin.asUser : undefined })
      return { text: e.text }
    })
    await $.tool.call({ tool: TOOL, open_decisions: ['Build the watchdog?', 'Which port?'] })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const fields = await ui.findAll({ type: 'Input' })
    expect(fields.length).toBe(2)
    // Focusing the pane lands in the first open question's field
    expect(fields.map(f => f.props.autoFocus)).toEqual([true, undefined])
    await ui.input({ key: 'reply-d1', text: '   ' })
    expect(sent).toEqual([])
    await ui.input({ key: 'reply-d1', text: 'yes, build it' })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toContain('d1')
    expect(sent[0]?.text).toContain('Build the watchdog?')
    expect(sent[0]?.text).toContain('yes, build it')
    expect(sent[0]?.asUser).toBe(true)
    await ui.unmount()
    const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
    // The answered one shows its answer instead of a field
    expect((await after.findAll({ type: 'Input' })).length).toBe(1)
    expect(await texts(after)).toContain('yes, build it')
    const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
    expect(sections.at(-1)?.text).toContain('d1 [answered] Build the watchdog? → yes, build it')
  })

  test('ending on a pinned question with open todos sends Claude back once to keep working', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('classic.Stop', () => ({}))
    const asking = { stop_hook_active: false, last_assistant_message: 'Pinned it.\n\nShould I build the watchdog?' }
    await $.tool.call({ tool: TOOL, open_decisions: ['Build the watchdog?'] })
    expect((await $.classic.Stop(asking)).block).toBeUndefined()
    await $.tool.call({ tool: TOOL, add_todos: ['Write the docs', 'Install it'], done_todos: [] })
    expect((await $.classic.Stop(asking)).block).toContain('does not depend')
    expect((await $.classic.Stop({ ...asking, stop_hook_active: true })).block).toBeUndefined()
    await $.tool.call({ tool: TOOL, done_todos: ['t1', 't2'] })
    expect((await $.classic.Stop(asking)).block).toBeUndefined()
  })

  test('the pane opens when an interactive session starts, without /pinboard', async ($, on) => {
    const opened: string[] = []
    on('ui.open', (_$, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })
    // The engine beneath registers the command and tool and starts the session
    on('command.register', () => ({ value: undefined }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: false })
    expect(opened).toEqual([])
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    expect(opened).toEqual(['pinboard'])
  })

  test('the docked pane asks for a quarter of the screen, and opens at it the next session', async ($, on) => {
    const asked: (number | undefined)[] = []
    on('ui.open', (_$, e) => {
      asked.push(e.columns)
      return { value: { isPlaced: true } }
    })
    on('command.register', () => ({ value: undefined }) as never)
    on('tool.register', () => ({ value: undefined }) as never)
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    const kept = new Map<string, unknown>()
    on('store.get', (_$, e) => ({ value: kept.get(e.key) }) as never)
    on('store.set', (_$, e) => {
      kept.set(e.key, e.value)
      return { value: undefined } as never
    })
    // Inline above the prompt the width is the engine's; only the dock is sized
    const inline = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 50, isFullscreen: false } })
    await inline.unmount()
    expect(asked).toEqual([])
    const docked = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: { columns: 200, rows: 50, isFullscreen: true } })
    await docked.unmount()
    expect(asked).toEqual([50])
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    expect(asked).toEqual([50, 50])
  })

  test('findings show under links, newest first with their why, and clear empties them', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('prompt.compose', () => ({ sections: [] }))
    await $.tool.call({ tool: TOOL, add_findings: [{ kind: 'result', text: 'Pairs trade: +6.1%/yr', why: 'Sharpe 1.1 over 2015-2024 after costs' }] })
    await $.tool.call({ tool: TOOL, add_findings: [{ kind: 'switched', text: 'Dropped the options idea for pairs', why: 'no free intraday options data' }] })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      const all = await texts(ui)
      expect(all).toContain('Findings')
      expect(all.indexOf('Links')).toBeLessThan(all.indexOf('Findings'))
      // Newest first, each with a kind mark and its why beneath
      expect(all.indexOf('Dropped the options idea')).toBeLessThan(all.indexOf('Pairs trade'))
      expect(all).toContain('↪ Dropped the options idea for pairs')
      expect(all).toContain('▪ Pairs trade: +6.1%/yr')
      expect(all).toContain('Sharpe 1.1 over 2015-2024 after costs')
      await ui.unmount()
    }
    const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
    expect(sections.at(-1)?.text).toContain('f1 [result] Pairs trade: +6.1%/yr — Sharpe 1.1 over 2015-2024 after costs')
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'clear-findings' })
    expect(await texts(ui)).toContain('Nothing found yet.')
  })

  test('a long stretch of work with nothing pinned reminds Claude to pin findings, until it does', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('prompt.compose', () => ({ sections: [] }))
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
    const compose = async () =>
      (await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })).sections.at(-1)?.text ?? ''
    await $.turn.start({ text: 'run the backtests', turnId: 't1' } as never)
    for (let i = 0; i < 14; i++) await $.tool.call({ tool: 'Bash', command: 'python backtest.py' })
    expect(await compose()).not.toContain('add_findings')
    await $.tool.call({ tool: 'Bash', command: 'python backtest.py' })
    expect(await compose()).toContain('add_findings')
    await $.tool.call({ tool: TOOL, add_findings: [{ kind: 'result', text: 'RSI(2) on QQQ: Sharpe 0.9' }] })
    expect(await compose()).not.toContain('add_findings')
    // Calls made by subagents don't count toward it
    await $.turn.start({ text: 'again', turnId: 't2' } as never)
    for (let i = 0; i < 20; i++) await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' } as never)
    expect(await compose()).not.toContain('add_findings')
  })

  test('an answer typed in chat to a pinned question is sent back once to close the decision', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('classic.Stop', () => ({}))
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    const asked = { stop_hook_active: false, last_assistant_message: 'Built it.\n\nShould I merge it?' }
    const done = { stop_hook_active: false, last_assistant_message: 'Merged.' }

    await $.turn.start({ text: 'build it', turnId: 't1' } as never)
    await $.tool.call({ tool: TOOL, open_decisions: ['Merge it?'] })
    expect((await $.classic.Stop(asked)).block).toBeUndefined()

    // The answer comes in chat; the turn ends without closing d1
    await $.turn.start({ text: 'yes merge it', turnId: 't2' } as never)
    const block = (await $.classic.Stop(done)).block
    expect(block).toContain('decide')
    expect(block).toContain('d1')
    expect((await $.classic.Stop({ ...done, stop_hook_active: true })).block).toBeUndefined()
    await $.tool.call({ tool: TOOL, decide: [{ id: 'd1', answer: 'yes' }] })
    expect((await $.classic.Stop(done)).block).toBeUndefined()

    // A decision left open for days does not bounce a turn that didn't follow a question
    await $.tool.call({ tool: TOOL, open_decisions: ['Pick a theme?'] })
    await $.turn.start({ text: 'something else', turnId: 't3' } as never)
    expect((await $.classic.Stop(done)).block).toBeUndefined()
    await $.turn.start({ text: 'and another', turnId: 't4' } as never)
    expect((await $.classic.Stop(done)).block).toBeUndefined()
  })

  test('a long turn that ends with nothing pinned is sent back once to pin its findings', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('classic.Stop', () => ({}))
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
    const done = { stop_hook_active: false, last_assistant_message: 'Ran all six strategies.' }
    await $.turn.start({ text: 'short one', turnId: 't1' } as never)
    for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect((await $.classic.Stop(done)).block).toBeUndefined()
    await $.turn.start({ text: 'long one', turnId: 't2' } as never)
    for (let i = 0; i < 15; i++) await $.tool.call({ tool: 'Bash', command: 'python backtest.py' })
    const block = (await $.classic.Stop(done)).block
    expect(block).toContain('add_findings')
    expect(block).toContain('do not repeat')
    expect((await $.classic.Stop({ ...done, stop_hook_active: true })).block).toBeUndefined()
    await $.tool.call({ tool: TOOL, add_findings: [{ kind: 'found', text: 'Only the RSI strategy survives costs' }] })
    expect((await $.classic.Stop(done)).block).toBeUndefined()
  })

  test('the tool call shows as one dim line in the transcript', async $ => {
    const ui = await $.ui.mount({
      plugin: 'pinboard',
      surface: 'terminal',
      component: 'ToolUse',
      props: { tool_use_id: 'u1', tool: TOOL, input: { add_todos: ['a', 'b'], decide: [{ id: 'd1', answer: 'x' }], add_findings: [{ kind: 'found', text: 'y' }] }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect(await texts(ui)).toBe('Pinboard: +2 todo, 1 decided, +1 finding')
  })

  test('links come only from actions that make something, and clear empties them', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('tool.call', { tool: 'Bash' }, (_$, e) => {
      const url = e.command.startsWith('gh') ? 'https://github.com/o/repo/pull/12' : 'https://github.com/o/fixture/pull/99'
      return { result: { stdout: url + '\n', stderr: '', interrupted: false }, text: url + '\n' }
    })
    // A command that only prints a URL is not pinned
    await $.tool.call({ tool: 'Bash', command: 'cat tests/fixtures.ts' })
    await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      const found = await ui.findAll({ type: 'Link' })
      expect(found.map(l => l.props.label)).toEqual(['repo PR #12'])
      await ui.unmount()
    }
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'clear-links' })
    expect(await ui.find({ type: 'Link' })).toBeUndefined()
  })
})
