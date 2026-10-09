import type { Peer } from '../types'

/** How often the job folders are listed; a state file is only read again once it has changed. */
export const POLL_MS = 2000
/** A session untouched this long has been left; it drops off the line. */
export const STALE_MS = 12 * 60 * 60 * 1000
export const MAX_SHOWN = 6
export const MAX_NAME = 28

/** A job's state.json as a Peer, or undefined when it isn't one. */
export function parsePeer(text: string): Peer | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!raw || typeof raw !== 'object') return undefined
  const j = raw as Record<string, unknown>
  if (typeof j.sessionId !== 'string' || typeof j.state !== 'string') return undefined
  const updatedAt = typeof j.updatedAt === 'string' ? Date.parse(j.updatedAt) : NaN
  const name = typeof j.name === 'string' ? j.name.trim() : ''

  return { id: j.sessionId, name: name || j.sessionId.slice(0, 8), state: j.state, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 }
}

/** The sessions to show: not this one, not left for STALE_MS, in a stable order by name. */
export function visiblePeers(peers: Peer[], selfId: string, now: number): Peer[] {
  return peers
    .filter(p => p.id !== selfId && now - p.updatedAt < STALE_MS)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_SHOWN)
}

export const shortName = (name: string) => (name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name)

export type Look = { mark: string; word: string; color?: 'success' | 'warning' | 'error' }

export function look(state: string): Look {
  switch (state) {
    case 'done':
      return { mark: '✓', word: 'done', color: 'success' }
    case 'blocked':
      return { mark: '?', word: 'needs you', color: 'warning' }
    case 'failed':
      return { mark: '✗', word: 'failed', color: 'error' }
    case 'working':
      return { mark: '●', word: 'working' }
    default:
      return { mark: '●', word: state }
  }
}

/** Sessions that were working and have stopped since the last look: done, blocked or failed. */
export function justStopped(before: Peer[], after: Peer[]): Peer[] {
  return after.filter(p => p.state !== 'working' && before.some(b => b.id === p.id && b.state === 'working'))
}

export const sameList = (a: Peer[], b: Peer[]) =>
  a.length === b.length && a.every((p, i) => p.id === b[i]?.id && p.state === b[i]?.state && p.name === b[i]?.name)
