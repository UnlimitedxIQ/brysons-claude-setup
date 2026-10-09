export type Todo = { id: string; text: string; isDone: boolean; isActive?: boolean }

// `answer` is the user's reply from the pane, kept until Claude closes the decision
export type Decision = { id: string; text: string; answer?: string }

export type Pin = { href: string; label: string }

// What the user should know without reading the transcript: a discovery, a change of course, a run's outcome
export type FindingKind = 'found' | 'switched' | 'result'
export type Finding = { id: string; kind: FindingKind; text: string; why?: string }

declare module 'claude-code' {
  interface PluginState {
    pinboard: {
      decisions: Decision[]
      todos: Todo[]
      links: Pin[]
      findings: Finding[]
    }
  }
}
