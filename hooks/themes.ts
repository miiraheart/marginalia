import type { RenderElement, RenderSurface } from 'claude-code'

export type ThemeMarkdownArgs = { surface: RenderSurface; text: string; columns: number }

declare module 'claude-code' {
  interface EngineInterface {
    prismantis: { markdown: (args: ThemeMarkdownArgs) => Promise<RenderElement | undefined> }
    skins: { markdown: (args: ThemeMarkdownArgs) => Promise<RenderElement | undefined> }
  }
}
