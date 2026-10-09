// Pure meter math for the band: no `$`, so the tests call it directly.

export const SEGMENTS = 10
export const FILLED = '▰'
export const EMPTY = '▱'

/** Percent used at which a meter turns amber, then red. */
export const WARN_AT = 50
export const DANGER_AT = 80

export type Severity = 'success' | 'warning' | 'error'

const clamp = (n: number) => Math.min(100, Math.max(0, n))

/** Filled segments out of SEGMENTS: 9% shows one, 26% three. */
export function filled(percentUsed: number): number {
  return Math.round(clamp(percentUsed) / (100 / SEGMENTS))
}

/** Green under 50% used, amber from 50, red above 80: the theme's own colors. */
export function severity(percentUsed: number): Severity {
  if (percentUsed > DANGER_AT) return 'error'
  if (percentUsed >= WARN_AT) return 'warning'
  return 'success'
}

/** The window's percentages as /usage prints them: whole numbers stay whole. */
export function percent(n: number): string {
  return `${Math.round(n * 10) / 10}%`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "2:39pm", in the machine's local time. */
export function clockTime(day: Date): string {
  const hours = day.getHours()
  const minutes = String(day.getMinutes()).padStart(2, '0')

  return `${hours % 12 || 12}:${minutes}${hours < 12 ? 'am' : 'pm'}`
}

/**
 * When a window resets: the clock time, led by the weekday when it is more than
 * a day off ("resets 2:39pm", "resets Tue 9:00pm").
 */
export function resetLabel(iso: string | undefined, now: Date): string {
  if (!iso) return ''
  // Windows end a moment before the minute (03:59:59.7Z): round to the minute they open on.
  const at = new Date(Math.round(new Date(iso).getTime() / 60_000) * 60_000)
  if (Number.isNaN(at.getTime())) return ''
  const isWithinDay = at.getTime() - now.getTime() < 24 * 60 * 60 * 1000

  return `resets ${isWithinDay ? '' : `${WEEKDAYS[at.getDay()] ?? ''} `}${clockTime(at)}`
}
