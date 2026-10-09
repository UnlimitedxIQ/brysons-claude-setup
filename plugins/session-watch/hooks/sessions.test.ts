import { expect, test } from 'claude-code/testing'

import { STALE_MS, justStopped, look, parsePeer, sameList, shortName, visiblePeers } from './sessions'

const state = (o: Record<string, unknown>) => JSON.stringify({ tempo: 'active', tokens: 1, ...o })
const peer = (id: string, name: string, s = 'working', updatedAt = 1000) => ({ id, name, state: s, updatedAt })

test('a job state file reads as a peer; anything else is skipped', () => {
  expect(parsePeer(state({ sessionId: 'abc', name: ' sleeper ', state: 'done', updatedAt: '2026-10-08T22:49:12.542Z' }))).toEqual({
    id: 'abc',
    name: 'sleeper',
    state: 'done',
    updatedAt: Date.parse('2026-10-08T22:49:12.542Z'),
  })
  expect(parsePeer(state({ sessionId: 'abcdef123456', state: 'working' }))?.name).toBe('abcdef12')
  expect(parsePeer('{not json')).toBeUndefined()
  expect(parsePeer(state({ state: 'done' }))).toBeUndefined()
})

test('shown: not this session, not left for half a day, sorted by name, at most six', () => {
  const now = 10 * STALE_MS
  const all = [peer('me', 'mine'), peer('b', 'beta', 'done', now), peer('a', 'alpha', 'working', now), peer('old', 'old', 'done', now - STALE_MS)]
  expect(visiblePeers(all, 'me', now).map(p => p.id)).toEqual(['a', 'b'])
  const many = Array.from({ length: 9 }, (_, i) => peer(`p${i}`, `n${i}`, 'working', now))
  expect(visiblePeers(many, 'me', now)).toHaveLength(6)
})

test('a long name is cut with an ellipsis', () => {
  expect(shortName('short')).toBe('short')
  expect(shortName('x'.repeat(40))).toHaveLength(28)
  expect(shortName('x'.repeat(40)).endsWith('…')).toBe(true)
})

test('each state has its mark and color; working is dim', () => {
  expect(look('done')).toEqual({ mark: '✓', word: 'done', color: 'success' })
  expect(look('blocked').word).toBe('needs you')
  expect(look('failed').color).toBe('error')
  expect(look('working').color).toBeUndefined()
  expect(look('paused').word).toBe('paused')
})

test('only a session that went from working to stopped is announced', () => {
  const before = [peer('a', 'a'), peer('b', 'b', 'done'), peer('c', 'c')]
  const after = [peer('a', 'a', 'done'), peer('b', 'b', 'done'), peer('c', 'c'), peer('d', 'd', 'done')]
  expect(justStopped(before, after).map(p => p.id)).toEqual(['a'])
  expect(sameList(before, before)).toBe(true)
  expect(sameList(before, after)).toBe(false)
})
