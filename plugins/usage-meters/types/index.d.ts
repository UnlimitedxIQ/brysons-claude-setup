/** One rate-limit window: percent used, 0 to 100, and when it resets (ISO 8601). */
export type Window = { used: number; resetsAt?: string }

/** What the band draws; a meter is absent until Claude Code has a reading for it. */
export type Meters = { fiveHour?: Window; week?: Window; context?: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-meters': { meters: Meters }
  }
}
