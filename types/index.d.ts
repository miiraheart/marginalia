export type MarginaliaAction = 'quote' | 'remember' | 'task' | 'explain' | 'deeper' | 'redo' | 'anki' | 'define' | 'wrong' | 'copy'

export type MarginaliaPin = { n: number; text: string; requestId?: string; role?: 'user' | 'assistant' }

export type MarginaliaButton = { action: MarginaliaAction; label: string }

export type MarginaliaGhost = { slot: string; rows: number }

export type MarginaliaView = {
  selection: string | null
  pins: MarginaliaPin[]
  short: MarginaliaButton[]
  more: MarginaliaButton[]
  isMoreOpen: boolean
  open: number[]
  flash: number | null
  ghosts: MarginaliaGhost[]
}

export type MarginaliaPress =
  | { action: MarginaliaAction }
  | { unpin: number }
  | { toggle: number }
  | { more: true }
  | { close: true }

export type Marginalia = {
  view: (args: { requestId: string; role?: 'user' | 'assistant' }) => Promise<MarginaliaView | undefined>
  press: (args: MarginaliaPress) => Promise<boolean>
  version: () => Promise<number>
  placed: (args: { inFlow: boolean; rows?: number; slot?: string }) => Promise<boolean>
}

declare module 'claude-code' {
  interface EngineInterface {
    marginalia: Marginalia
  }
  interface PluginState {
    marginalia: {
      pending: MarginaliaPin[]
      present: number[]
      selected: string | null
      row: string | null
    }
  }
}
