import { expect, test } from 'claude-code/testing'

import { clockTime, filled, percent, resetLabel, severity } from './meters'

test('segments: 9% shows one, 26% three, 100% all ten', () => {
  expect(filled(0)).toBe(0)
  expect(filled(9)).toBe(1)
  expect(filled(26)).toBe(3)
  expect(filled(100)).toBe(10)
  expect(filled(130)).toBe(10)
})

test('severity: green under 50, amber 50 to 80, red above 80', () => {
  expect(severity(49)).toBe('success')
  expect(severity(50)).toBe('warning')
  expect(severity(80)).toBe('warning')
  expect(severity(81)).toBe('error')
})

test('percent prints like /usage', () => {
  expect(percent(26)).toBe('26%')
  expect(percent(23.5)).toBe('23.5%')
})

test('reset: clock time within a day, weekday and time beyond it', () => {
  const now = new Date(2026, 9, 7, 12, 0)
  expect(clockTime(new Date(2026, 9, 7, 14, 39))).toBe('2:39pm')
  expect(clockTime(new Date(2026, 9, 7, 0, 5))).toBe('12:05am')
  expect(resetLabel(new Date(2026, 9, 7, 14, 39).toISOString(), now)).toBe('resets 2:39pm')
  expect(resetLabel(new Date(2026, 9, 13, 21, 0).toISOString(), now)).toBe('resets Tue 9:00pm')
  expect(resetLabel('2026-10-14T03:59:59.715Z', now)).toMatch(/^resets Tue \d{1,2}:00(am|pm)$/)
  expect(resetLabel(undefined, now)).toBe('')
})

test('the band draws all three meters on one row, terminal and desktop', async ($, on) => {
  on('clock.now', () => ({ value: new Date(2026, 9, 7, 12, 0).getTime() }) as never)
  // The engine beneath draws nothing of its own in the band
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  on('session.measure', ($, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { tokens: 68_000, window: 200_000, percent: 34 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 26, resetsAt: new Date(2026, 9, 7, 14, 39).toISOString() },
      { kind: 'seven_day', percentUsed: 9, resetsAt: new Date(2026, 9, 13, 21, 0).toISOString() },
    ],
    changed: ['context', 'rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'usage-meters',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never,
    })
    expect(await ui.find({ text: /26%/ })).toBeDefined()
    expect(await ui.find({ text: /resets 2:39pm/ })).toBeDefined()
    expect(await ui.find({ text: /resets Tue 9:00pm/ })).toBeDefined()
    expect(await ui.find({ text: /34%/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the band keeps what the plugins beneath it draw, such as pasted image previews', async ($, on) => {
  on('clock.now', () => ({ value: new Date(2026, 9, 7, 12, 0).getTime() }) as never)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: ['image #1 preview'] }))
  await $.session.measure({ context: { tokens: 68_000, window: 200_000, percent: 34 }, rateLimits: [], changed: ['context'] })

  const ui = await $.ui.mount({
    plugin: 'usage-meters',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 } as never,
  })
  expect(await ui.find({ text: /image #1 preview/ })).toBeDefined()
  expect(await ui.find({ text: /34%/ })).toBeDefined()
  await ui.unmount()
})
