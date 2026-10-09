import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Decision, Finding, FindingKind, Pin, Todo } from '../types'

const PANE = 'pinboard'
const TITLE = 'Pinboard'
const TOOL = 'mcp__pinboard__update'
// NightOwl Cyberpunk, matching the terminal scheme. The engine paints panes solid #262626, so the
// board paints the scheme's own background over it. WezTerm at text_background_opacity 0 draws no
// painted cell, so there the pane is the terminal's own see-through background; Windows Terminal
// keeps any painted cell opaque, where this one at least matches the scheme.
const THEME = {
  bg: '#011627',
  heading: '#7FDBCA',
  text: '#D6DEEB',
  muted: '#637777',
  decision: '#C792EA',
  active: '#FFEB95',
  open: '#82AAFF',
  done: '#22DA6E',
} as const

const decisions = atom({ plugin: 'pinboard', key: 'decisions' } as const, [] as Decision[])
const todos = atom({ plugin: 'pinboard', key: 'todos' } as const, [] as Todo[])
const links = atom({ plugin: 'pinboard', key: 'links' } as const, [] as Pin[])
const findings = atom({ plugin: 'pinboard', key: 'findings' } as const, [] as Finding[])

// Each kind's mark and color in the pane
const KINDS: Record<FindingKind, { mark: string; color: string }> = {
  found: { mark: '◆', color: THEME.active },
  switched: { mark: '↪', color: THEME.decision },
  result: { mark: '▪', color: THEME.open },
}
// Kept newest first, enough for a long session without the pane turning into the transcript
const MAX_FINDINGS = 20
// The pane shows the newest few; older ones fold into one line (Claude still sees all of them)
const SHOWN_FINDINGS = 8

const DESCRIPTION = [
  "Keep the session's task list and open decisions on the user's Pinboard, a sidebar that stays in view while the transcript scrolls.",
  'Any question you end a reply on that needs the user to answer goes in open_decisions, however small the task, even a single yes/no.',
  'Use it in place of writing task lists in your reply whenever the work takes 3+ distinct steps or the user gives new instructions.',
  'add_todos: one action per item. start_todo: the todo id you are working on now; exactly one is in progress at a time. done_todos / remove_todos: todo ids.',
  'Update in real time; do not batch completions. Mark a todo done only after the work is actually done, including any verification it needs, never based on intent.',
  'If blocked or partly done, leave it in progress and add a follow-up todo describing the blocker.',
  'open_decisions: questions that need the user to choose. Never stop and wait on one, since the user may be away:',
  'pin it, then carry on with every step that does not depend on the answer, and leave the steps that do as todos saying which decision they wait on.',
  'The user can answer in the Pinboard pane at any time; the answer arrives as a user message naming the decision id, and the board marks it [answered].',
  'Act on the answer, then close the decision with decide (do the same when the user answers in chat).',
  'add_findings: pin what the user should know without reading the transcript, as it happens, not saved for the end:',
  "kind 'found' for a discovery, 'switched' when you change approach or move to other work (the why says why it was the better move), 'result' for the outcome of a run, test or backtest with its numbers.",
  'text is a headline of about 12 words; why is one short sentence on why it matters, or the data behind it. remove_findings: finding ids that turned out wrong or no longer matter.',
  'With the findings on the board, keep the reply that ends your work short: a few lines on what changed and what the user should do next, not a retelling of everything you tried.',
  'The current board, with ids, is at the end of your system prompt.',
].join(' ')

const strings = { type: 'array', items: { type: 'string' } }
const SCHEMA = {
  type: 'object',
  properties: {
    add_todos: strings,
    start_todo: { type: 'string' },
    done_todos: strings,
    remove_todos: strings,
    open_decisions: strings,
    decide: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, answer: { type: 'string' } }, required: ['id', 'answer'] },
    },
    add_findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: Object.keys(KINDS) }, text: { type: 'string' }, why: { type: 'string' } },
        required: ['kind', 'text'],
      },
    },
    remove_findings: strings,
  },
}

export type Update = {
  add_todos?: string[]
  start_todo?: string
  done_todos?: string[]
  remove_todos?: string[]
  open_decisions?: string[]
  decide?: { id: string; answer: string }[]
  add_findings?: { kind: FindingKind; text: string; why?: string }[]
  remove_findings?: string[]
}

type Board = { todos: Todo[]; decisions: Decision[]; findings?: Finding[] }

// The next id for a prefix: one past the highest in use
const nextId = (prefix: string, ids: string[]) =>
  prefix + (Math.max(0, ...ids.map(id => Number(id.slice(prefix.length)) || 0)) + 1)

export function applyUpdate(board: Board, change: Update): Board {
  let { todos: t, decisions: d } = board
  for (const text of change.add_todos ?? []) t = [...t, { id: nextId('t', t.map(x => x.id)), text, isDone: false }]
  for (const text of change.open_decisions ?? []) d = [...d, { id: nextId('d', d.map(x => x.id)), text }]
  const done = new Set(change.done_todos ?? [])
  const removed = new Set(change.remove_todos ?? [])
  const decided = new Set((change.decide ?? []).map(x => x.id))
  t = t.filter(x => !removed.has(x.id)).map(x => (done.has(x.id) ? { ...x, isDone: true } : x))
  // One todo in progress at a time; finishing it ends its turn too
  if (change.start_todo) t = t.map(x => ({ ...x, isActive: x.id === change.start_todo }))
  t = t.map(x => (x.isDone && x.isActive ? { ...x, isActive: false } : x))
  d = d.filter(x => !decided.has(x.id))
  return { todos: t, decisions: d, findings: applyFindings(board.findings ?? [], change) }
}

// Findings stay in the order they were found; the pane shows the newest first
function applyFindings(list: Finding[], change: Update): Finding[] {
  const removed = new Set(change.remove_findings ?? [])
  let f = list.filter(x => !removed.has(x.id))
  for (const add of change.add_findings ?? []) {
    const text = add.text?.trim()
    if (!text) continue
    const kind = add.kind in KINDS ? add.kind : 'found'
    const why = add.why?.trim()
    const id = nextId('f', [...list, ...f].map(x => x.id))
    f = [...f, why ? { id, kind, text, why } : { id, kind, text }]
  }
  return f.slice(-MAX_FINDINGS)
}

export function describeBoard(board: Board): string {
  const found = board.findings ?? []
  if (board.todos.length + board.decisions.length + found.length === 0) return 'Pinboard is empty.'
  return [
    'Pinboard now:',
    ...board.todos.map(t => `${t.id} [${t.isDone ? 'x' : t.isActive ? '>' : ' '}] ${t.text}`),
    ...board.decisions.map(d => (d.answer ? `${d.id} [answered] ${d.text} → ${d.answer}` : `${d.id} [?] ${d.text}`)),
    ...found.map(f => `${f.id} [${f.kind}] ${f.text}${f.why ? ` — ${f.why}` : ''}`),
  ].join('\n')
}

// Records the user's reply to a decision; a blank reply or an unknown id leaves the list as it was
export function answerDecision(list: Decision[], id: string, reply: string): Decision[] {
  const answer = reply.trim()
  if (!answer || !list.some(d => d.id === id)) return list
  return list.map(d => (d.id === id ? { ...d, answer } : d))
}

// What Claude reads when the user answers from the pane
const replyText = (d: Decision) => `Answer to Pinboard decision ${d.id} ("${d.text}"): ${d.answer}`

// A reply asks the user something when one of its last lines, outside code, ends in a question mark
export function asksUser(reply: string): boolean {
  const prose = reply.replace(/```[\s\S]*?```/g, '')
  const lines = prose.split('\n').map(l => l.trim()).filter(Boolean).slice(-3)
  return lines.some(l => /\?[*_`)"'\]]*$/.test(l))
}

const NUDGE =
  'Your reply ends on a question for the user, but the Pinboard has no open decision. ' +
  'Call mcp__pinboard__update with open_decisions for it (close it with decide once answered), then end your turn. ' +
  'If it was rhetorical, end your turn as is.'

const KEEP_GOING =
  'Your reply ends on a question, but the user may be away; their answer comes back through the Pinboard whenever they reply. ' +
  'Do not wait for it: carry on with every open todo that does not depend on the answer, and note on the ones that do which decision they wait on. ' +
  'End your turn once nothing left can move without an answer.'

const closeAnswered = (ids: string[]) =>
  `The user replied in chat to the question you asked last turn, but ${ids.join(', ')} is still open on the Pinboard. ` +
  'If this message answered it, close it with mcp__pinboard__update decide (the answer in a few words), then end your turn; do not repeat your reply. ' +
  'If it did not, end your turn as is.'

// Findings get pinned as work goes: a stretch this long with none puts a reminder in the board,
// and a turn this long that ends with none is sent back once to pin them
const PIN_AFTER_CALLS = 15
const FINDINGS_REMINDER =
  `You have made ${PIN_AFTER_CALLS} or more tool calls this turn without pinning a finding. ` +
  "If anything the user should know has come up (a discovery, a change of approach, a run's numbers), pin it now with add_findings, then carry on."
const PIN_FINDINGS =
  'This turn did a lot of work but pinned no findings. ' +
  'Call mcp__pinboard__update with add_findings for what the user should know (a discovery, a change of approach, a result with its numbers), then end your turn; do not repeat your reply. ' +
  'If nothing is worth pinning, end your turn as is.'

// This turn's work in the main conversation: tool calls made, calls since the last finding, whether any was pinned
type Work = { calls: number; sinceFinding: number; pinned: boolean }
const FRESH_WORK: Work = { calls: 0, sinceFinding: 0, pinned: false }

const MAKES_COMMAND = /\bgh\s+(?:(?:pr|issue|release|repo|gist)\s+create|(?:pr|issue)\s+comment)\b|\bgit\s+push\b/
const MAKES_MCP = /^mcp__.*(?:create|draft|send|publish|share|canvas|upload)/i

const URL = /https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9\-._~:/?#[\]!$&'()*+,;=%@]*)?/g

export const urlPins = (text: string): Pin[] =>
  [...new Set([...text.matchAll(URL)].map(m => m[0].replace(/[)\].,;:'!?*]+$/, '')))]
    .filter(href => !href.includes('@') && href.length <= 2048)
    .map(href => {
      const gh = /github\.com\/[^/]+\/([^/]+)\/(pull|issues)\/(\d+)/.exec(href)
      return { href, label: gh ? `${gh[1]} ${gh[2] === 'pull' ? 'PR' : 'issue'} #${gh[3]}` : href.slice(8) }
    })

const isEmpty = async ($: EngineInterface) =>
  (await read($, decisions)).length + (await read($, todos)).length + (await read($, links)).length + (await read($, findings)).length === 0

// The docked pane's share of the screen, and the width it last saw, kept so the next session opens at it
const DOCK_SHARE = 0.25
const MIN_DOCK_COLUMNS = 30
const SCREEN_KEY = 'screenColumns'

const dockColumns = (screen: number) => Math.max(MIN_DOCK_COLUMNS, Math.round(screen * DOCK_SHARE))

async function openPane($: EngineInterface): Promise<void> {
  // A store that can't be read only costs the remembered width; the engine's share stands in
  const screen = await $.store.get(SCREEN_KEY).catch(() => undefined)
  await $.ui.open(typeof screen === 'number' ? { id: PANE, title: TITLE, columns: dockColumns(screen) } : { id: PANE, title: TITLE })
}

// Runs a capture; opens the pane when it puts the first thing on an empty board
async function capture($: EngineInterface, change: () => Promise<unknown>): Promise<void> {
  const wasEmpty = await isEmpty($)
  await change()
  if (wasEmpty && !(await isEmpty($))) await openPane($)
}

// A reply typed in the pane: kept on the board, and queued to Claude as the user's own words,
// starting a turn as soon as the session is idle
async function reply($: EngineInterface, id: string, value: string): Promise<void> {
  const before = await read($, decisions)
  const after = answerDecision(before, id, value)
  if (after === before) return
  await update($, decisions, () => after)
  const answered = after.find(d => d.id === id)
  if (answered) await $.prompt.submit({ text: replyText(answered), asUser: true })
}

export const register: Register = on => {
  let work = FRESH_WORK
  // The screen width the dock was last sized for
  let sizedFor: number | undefined
  // Decisions open when the last turn ended on a question, and those this turn's message may answer
  let askedLast: string[] = []
  let awaiting: string[] = []

  on('turn.start', async ($, e, next) => {
    work = FRESH_WORK
    awaiting = askedLast
    askedLast = []
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pinboard', description: 'Open the pane of open decisions, todos and links', immediate: true })
    await $.tool.register({ name: 'update', description: DESCRIPTION, inputSchema: SCHEMA })
    // Todos parsed from replies by older versions have no id; the tool can't reach them
    await update($, todos, old => old.filter(t => typeof t.id === 'string'))
    const started = await next(e)
    // Open by default, so the board is there without /pinboard; a narrow terminal seats it once it widens
    if (e.isInteractive) await openPane($)
    return started
  })

  on('command.run', { command: 'pinboard' }, async $ => {
    await openPane($)
    return {}
  })

  // The board rides at the end of the system prompt, so it never has to be repeated in replies
  on('prompt.compose', async ($, e, next) => {
    const { sections } = await next(e)
    const board = describeBoard({ todos: await read($, todos), decisions: await read($, decisions), findings: await read($, findings) })
    // The reminder only flips on and off, so the section stays stable for the prompt cache
    const text = work.sinceFinding >= PIN_AFTER_CALLS ? `${board}\n\n${FINDINGS_REMINDER}` : board
    return { sections: [...sections, { id: 'pinboard:board', text, scope: 'session' }] }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    if (e.agentId) return { deny: 'Only the main conversation updates the Pinboard.' }
    let board: Board = { todos: [], decisions: [] }
    await capture($, async () => {
      board = applyUpdate({ todos: await read($, todos), decisions: await read($, decisions), findings: await read($, findings) }, e as Update)
      await update($, todos, () => board.todos)
      await update($, decisions, () => board.decisions)
      await update($, findings, () => board.findings ?? [])
    })
    if ((e as Update).add_findings?.length) work = { ...work, sinceFinding: 0, pinned: true }
    return { result: describeBoard(board) }
  })

  // A question left only in the reply scrolls away; send Claude back once to pin it.
  // A pinned one with work still open sends it back once to keep going instead of waiting.
  // A long turn that pinned nothing is sent back once to pin its findings.
  // An answer typed in chat, not the pane, leaves the question open; it is sent back once to close it.
  on('classic.Stop', async ($, e, next) => {
    const ran = await next(e)
    if (ran.block || e.stop_hook_active) return ran
    const open = (await read($, decisions)).filter(d => !d.answer).map(d => d.id)
    const stillOpen = awaiting.filter(id => open.includes(id))
    awaiting = []
    if (stillOpen.length) return { ...ran, block: closeAnswered(stillOpen) }
    if (asksUser(e.last_assistant_message ?? '')) {
      askedLast = open
      if (!open.length) return { ...ran, block: NUDGE }
      if ((await read($, todos)).some(t => !t.isDone)) return { ...ran, block: KEEP_GOING }
    }
    return work.calls >= PIN_AFTER_CALLS && !work.pinned ? { ...ran, block: PIN_FINDINGS } : ran
  })

  // Links only from actions that make something; reads, fetches and test output just mention URLs
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (!e.agentId && e.tool !== TOOL) work = { ...work, calls: work.calls + 1, sinceFinding: work.sinceFinding + 1 }
    const makes = e.tool === 'Bash' ? MAKES_COMMAND.test(e.command) : MAKES_MCP.test(e.tool)
    if (e.agentId || !makes || !('text' in ran) || ran.isError) return ran
    const found = urlPins(ran.text ?? '')
    if (found.length > 0 && found.length <= 3) {
      await capture($, () => update($, links, old => [...found, ...old.filter(p => !found.some(f => f.href === p.href))].slice(0, 12)))
    }
    return ran
  })

  // An update is one dim line in the transcript; the board itself is in the pane
  on('ui.render', { component: 'ToolUse', props: { tool: TOOL } }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    const change = (e.props.input ?? {}) as Update
    const parts = [
      change.add_todos?.length && `+${change.add_todos.length} todo`,
      change.start_todo && `started ${change.start_todo}`,
      change.done_todos?.length && `${change.done_todos.length} done`,
      change.remove_todos?.length && `-${change.remove_todos.length} todo`,
      change.open_decisions?.length && `+${change.open_decisions.length} decision`,
      change.decide?.length && `${change.decide.length} decided`,
      change.add_findings?.length && `+${change.add_findings.length} finding`,
      change.remove_findings?.length && `-${change.remove_findings.length} finding`,
    ].filter(Boolean)
    return <Text color={THEME.muted}>{'Pinboard: ' + (parts.join(', ') || 'no change')}</Text>
  })

  on('ui.render', { component: 'ToolResult', props: { tool: TOOL } }, async ($, e, next) =>
    e.props.isErrored ? next(e) : $.ui.resolve(e).Text({ children: [''] }),
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // Docked, ask for a quarter of the screen once per width; a width the user drags to still wins.
    // Not awaited: the open settles once the pane is drawn, which is this render
    const screen = e.viewport?.isFullscreen ? e.viewport.columns : undefined
    if (screen !== undefined && screen !== sizedFor) {
      sizedFor = screen
      void $.ui.open({ id: PANE, title: TITLE, columns: dockColumns(screen) })
      void $.store.set(SCREEN_KEY, screen).catch(() => undefined)
    }
    const elements = $.ui.resolve(e)
    const { Box, Text, Button, Link } = elements
    // The mobile app draws no text field; there the user answers in chat
    const Input = 'Input' in elements ? elements.Input : undefined
    // One cell of padding on every side
    const inner = Math.max(10, e.props.bodyColumns - 2)
    const allDecisions = await read($, decisions)
    const allTodos = await read($, todos)
    const allLinks = await read($, links)
    const allFindings = await read($, findings)
    const doneCount = allTodos.filter(t => t.isDone).length
    const firstOpen = allDecisions.find(d => !d.answer)

    const header = (title: string, count: string) => (
      <Text bold color={THEME.heading}>
        {title} <Text color={THEME.muted}>{count}</Text>
      </Text>
    )
    const empty = (text: string) => <Text color={THEME.muted}>  {text}</Text>
    // The bullet stays in its own column, so wrapped lines indent under the text
    const item = (bullet: string, text: string, bulletColor: string, textColor: string = THEME.text) => (
      <Box flexDirection="row" width={inner}>
        <Text color={bulletColor}>{'  ' + bullet + ' '}</Text>
        <Box flexShrink={1} flexGrow={1}>
          <Text color={textColor} wrap="wrap">
            {text}
          </Text>
        </Box>
      </Box>
    )

    return (
      <Box
        flexDirection="column"
        width={inner + 2}
        minHeight={e.props.scroll.bodyRows}
        padding={1}
        backgroundColor={THEME.bg}
      >
        {header('Open decisions', allDecisions.length ? String(allDecisions.length) : '')}
        {allDecisions.length === 0 && empty('No open decisions.')}
        {Input && firstOpen && empty('ctrl+x tab to reply · tab for the next one')}
        {/* Unanswered: a reply field under the question. Answered: the reply, until Claude closes it */}
        {allDecisions.map(d =>
          d.answer ? (
            <Box flexDirection="column" width={inner}>
              {item('?', d.text, THEME.muted, THEME.muted)}
              {item('  ↳', d.answer, THEME.done, THEME.done)}
            </Box>
          ) : (
            <Box flexDirection="column" width={inner}>
              {item('?', d.text, THEME.decision)}
              {Input && (
                <Box paddingLeft={4} width={inner}>
                  {/* Focusing the pane lands in the first unanswered field, ready to type */}
                  <Input
                    key={`reply-${d.id}`}
                    placeholder="reply…"
                    submitLabel="send"
                    autoFocus={d.id === firstOpen?.id || undefined}
                    onSubmit={(value: string) => reply($, d.id, value)}
                  />
                </Box>
              )}
            </Box>
          ),
        )}
        <Text> </Text>

        {header('Todos', allTodos.length ? `${doneCount}/${allTodos.length}` : '')}
        {allTodos.length === 0 && empty('No todos yet.')}
        {allTodos
          .filter(t => !t.isDone)
          .map(t => (t.isActive ? item('▸', t.text, THEME.active, THEME.active) : item('○', t.text, THEME.open)))}
        {/* Finished todos fold into one line so open work stays on top */}
        {doneCount > 0 && <Text color={THEME.done}>{`  ✓ ${doneCount} done`}</Text>}
        <Text> </Text>

        <Box flexDirection="row" justifyContent="space-between" width={inner}>
          {header('Links', allLinks.length ? String(allLinks.length) : '')}
          <Button key="clear-links" label="clear" hotkey="l" plain dimColor onPress={() => update($, links, () => [])} />
        </Box>
        {allLinks.length === 0 && empty('Nothing created yet.')}
        {allLinks.map(p => (
          <Text wrap="truncate-middle">
            {'  '}
            <Link href={p.href} label={p.label} />
          </Text>
        ))}
        <Text> </Text>

        <Box flexDirection="row" justifyContent="space-between" width={inner}>
          {header('Findings', allFindings.length ? String(allFindings.length) : '')}
          <Button key="clear-findings" label="clear" hotkey="f" plain dimColor onPress={() => update($, findings, () => [])} />
        </Box>
        {allFindings.length === 0 && empty('Nothing found yet.')}
        {/* Newest first: a headline marked by kind, its why dim beneath */}
        {[...allFindings].reverse().slice(0, SHOWN_FINDINGS).map(f => (
          <Box flexDirection="column" width={inner}>
            {item(KINDS[f.kind].mark, f.text, KINDS[f.kind].color)}
            {f.why && item(' ', f.why, THEME.muted, THEME.muted)}
          </Box>
        ))}
        {allFindings.length > SHOWN_FINDINGS && empty(`… ${allFindings.length - SHOWN_FINDINGS} earlier`)}
      </Box>
    )
  })
}
