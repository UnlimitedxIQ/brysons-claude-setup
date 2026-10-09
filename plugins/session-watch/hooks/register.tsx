import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Peer } from '../types'
import { POLL_MS, justStopped, look, parsePeer, sameList, shortName, visiblePeers } from './sessions'

const peers = atom({ plugin: 'session-watch', key: 'peers' } as const, [])

/** Where background sessions keep their state: <config dir>/jobs/<id>/state.json */
async function jobsDir($: EngineInterface): Promise<string | undefined> {
  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const base = config ?? (home && `${home}/.claude`)
  return base && `${base.replace(/\\/g, '/').replace(/\/+$/, '')}/jobs`
}

type Seen = { mtimeMs: number; peer?: Peer }

/** Every job's state, reading a file again only when it changed since `cache`. */
async function scan($: EngineInterface, dir: string, cache: Map<string, Seen>): Promise<Map<string, Seen>> {
  const entries = await $.fs.list(dir).catch(() => [])
  const next = new Map<string, Seen>()
  for (const entry of entries.filter(x => x.kind === 'dir')) {
    const file = `${dir}/${entry.name}/state.json`
    const stat = await $.fs.stat(file).catch(() => undefined)
    if (!stat || stat.kind !== 'file') continue
    const old = cache.get(file)
    if (old && old.mtimeMs === stat.mtimeMs) {
      next.set(file, old)
      continue
    }
    const text = await $.fs.read(file).catch(() => undefined)
    next.set(file, { mtimeMs: stat.mtimeMs, peer: typeof text === 'string' ? parsePeer(text) : undefined })
  }
  return next
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const dir = await jobsDir($)
    if (!dir || !e.isInteractive) return started

    const self = await $.session.id()
    let cache = new Map<string, Seen>()
    let busy = false

    const refresh = async () => {
      if (busy) return
      busy = true
      try {
        cache = await scan($, dir, cache)
        const found = [...cache.values()].flatMap(s => (s.peer ? [s.peer] : []))
        const shown = visiblePeers(found, self, await $.clock.now())
        const before = await read($, peers)
        if (sameList(before, shown)) return
        for (const p of justStopped(before, shown)) $.ui.toast(`${p.name}: ${look(p.state).word}`)
        await update($, peers, () => shown)
      } finally {
        busy = false
      }
    }

    await refresh()
    $.clock.every(POLL_MS, () => void refresh())
    return started
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, peers)
    if (e.props.hasSurvey || shown.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    // The band is shared: what the plugins beneath draw stays above this line
    const beneath = await next(e)

    return (
      <Box flexDirection="column">
        {beneath}
        <Box gap={3} flexWrap="wrap">
          {shown.map(p => {
            const l = look(p.state)
            return (
              <Text key={p.id}>
                <Text color={l.color} dimColor={!l.color}>{l.mark} </Text>
                <Text dimColor={!l.color}>{shortName(p.name)} </Text>
                <Text color={l.color} dimColor={!l.color}>{l.word}</Text>
              </Text>
            )
          })}
        </Box>
      </Box>
    )
  })
}
