import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Meters, Window } from '../types'
import { EMPTY, FILLED, SEGMENTS, filled, percent, resetLabel, severity } from './meters'

const meters = atom({ plugin: 'usage-meters', key: 'meters' } as const, {})

/** The figures Claude Code reported, absent ones left out so they never blank a meter. */
function reading(context: SessionContextUsage, limits: SessionRateLimit[]): Meters {
  const pick = (kind: string): Window | undefined => {
    const limit = limits.find(r => r.kind === kind)

    return limit && { used: limit.percentUsed, resetsAt: limit.resetsAt }
  }
  const all: Meters = { fiveHour: pick('five_hour'), week: pick('seven_day'), context: context.percent }

  return Object.fromEntries(Object.entries(all).filter(([, v]) => v !== undefined)) as Meters
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    await update($, meters, cur => ({ ...cur, ...reading(usage.context, usage.rateLimits) }))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, meters, cur => ({ ...cur, ...reading(e.context, e.rateLimits) }))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, meters)
    if (e.props.hasSurvey || (!m.fiveHour && !m.week && m.context === undefined)) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = new Date(await $.clock.now())

    const meter = (label: string, used: number, resetsAt?: string) => {
      const color = severity(used)
      const n = filled(used)
      const reset = resetLabel(resetsAt, now)

      return (
        <Text key={label}>
          <Text dimColor>{label} </Text>
          <Text color={color}>{FILLED.repeat(n)}</Text>
          <Text dimColor>{EMPTY.repeat(SEGMENTS - n)}</Text>
          <Text color={color} bold> {percent(used)}</Text>
          {reset && <Text dimColor> · {reset}</Text>}
        </Text>
      )
    }

    // The band is shared: what the plugins beneath draw (cc-image-view's pasted previews) stays,
    // above the meters, so the meters sit right over the prompt
    const beneath = await next(e)

    return (
      <Box flexDirection="column">
        {beneath}
        <Box gap={3}>
          {m.fiveHour && meter('5h', m.fiveHour.used, m.fiveHour.resetsAt)}
          {m.week && meter('week', m.week.used, m.week.resetsAt)}
          {m.context !== undefined && meter('ctx', m.context)}
        </Box>
      </Box>
    )
  })
}
