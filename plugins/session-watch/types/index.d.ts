/** Another background session, from its job's state.json: `state` is `working`, `blocked`, `done` or `failed`. */
export type Peer = { id: string; name: string; state: string; updatedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'session-watch': { peers: Peer[] }
  }
}
