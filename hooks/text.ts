import type { MarginaliaAction, MarginaliaPin as Pin } from '../types'

const PREVIEW = 24
const CHIP = /\[❝(\d+)[^\]\n]*\]/g

export const preview = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim()
  return flat.length > PREVIEW ? `${flat.slice(0, PREVIEW).trimEnd()}…` : flat
}

export const chipOf = (pin: Pin): string => `[❝${pin.n} ${preview(pin.text)}]`

export const chipsIn = (text: string): { n: number; start: number; end: number }[] =>
  [...text.matchAll(CHIP)].map(m => ({ n: Number(m[1]), start: m.index, end: m.index + m[0].length }))

export const withoutChip = (text: string, n: number): string =>
  text.replace(CHIP, (chip, id) => (Number(id) === n ? '' : chip)).replace(/ {2,}/g, ' ')

export const nextNumber = (pins: Pin[]): number => pins.reduce((max, p) => Math.max(max, p.n), 0) + 1

const SOURCE = { assistant: 'assistant', user: 'user' } as const

export const contextBlock = (pin: Pin): string =>
  `The user quoted this passage and refers to it as ❝${pin.n} in their message.\n` +
  `<quoted_text n="${pin.n}" source="${pin.role ? SOURCE[pin.role] : 'conversation'}">\n${pin.text}\n</quoted_text>`

export const rememberPrompt = (text: string): string =>
  `I like this passage and want you to remember it. Save it the way this project stores memories, then confirm in one line.\n\n${text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')}`

export const wordCount = (text: string): string => {
  const n = withoutOwnRows(text).split(/\s+/).filter(Boolean).length
  return `${n} word${n === 1 ? '' : 's'} selected`
}

export const sourceOf = (pin: Pin): string =>
  pin.role === 'user' ? 'your message' : pin.role === 'assistant' ? 'my reply' : 'the conversation'

type QuoteAction = MarginaliaAction

export const ACTION_LABELS: Record<QuoteAction, string> = {
  quote: '❝ Quote',
  remember: '♥ Remember',
  task: '+ Task',
  explain: '? Explain',
  deeper: '↳ Deeper',
  redo: '✎ Redo',
  anki: '▤ Anki',
  define: '≡ Define',
  wrong: '✗ Wrong',
  copy: '⧉ Copy clean',
}

const ALL_ACTIONS = Object.keys(ACTION_LABELS) as QuoteAction[]

const DEFAULT_ACTIONS: QuoteAction[] = ['quote', 'remember', 'task']

const isAction = (name: string): name is QuoteAction => name in ACTION_LABELS

export const shortActions = (setting = ''): QuoteAction[] => {
  const picked = [...new Set(setting.split(',').map(name => name.trim().toLowerCase()).filter(isAction))]
  return picked.length ? picked : DEFAULT_ACTIONS
}

export const moreActions = (setting = ''): QuoteAction[] => {
  const short = new Set(shortActions(setting))
  return ALL_ACTIONS.filter(a => !short.has(a))
}

const asQuote = (text: string) => text.split('\n').map(line => `> ${line}`).join('\n')

const ASK: Partial<Record<QuoteAction, string>> = {
  explain: 'Explain this passage more simply, in a few lines:',
  deeper: 'Go deeper on this passage, with one concrete example:',
  redo: "This passage didn't click. Rewrite it another way:",
  define: 'Define this in a few lines with one example sentence. If its language gives words a gender, include it:',
  anki: 'Turn this passage into an Anki card the way this project makes cards, then confirm in one line:',
  wrong: 'This passage looks wrong or unclear. Check it and fix it:',
}

export const askPrompt = (action: QuoteAction, text: string): string | undefined => {
  const lead = ASK[action]
  return lead ? `${lead}\n\n${asQuote(text)}` : undefined
}

export const cleanSelection = (text: string): string =>
  text
    .replace(/\[\s*⧉[^\]]*\]/g, '')
    .replace(/Jump to bottom \(click\) ↓/g, '')
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const taskTitle = (text: string): string => {
  const flat = cleanSelection(text).replace(/\s+/g, ' ')
  return flat.length > 70 ? `${flat.slice(0, 70).trimEnd()}…` : flat
}

export const defineWords = (text: string): string[] =>
  cleanSelection(text).replace(/[«»"“”.,;:!?()]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 4)

const BOX_ONLY = /^[\s─│╭╮╰╯┌┐└┘├┤┬┴┼]+$/
const OWN_LINE = /^\[ ❝ Quote \]|\bwords? selected$|^❝\d+( pinned|\s+")|\[ ✕ unpin \]$/
const BAR_TAIL = /\s*\[ [❝≡♥+].*$/
const BAR_ONLY = /^(?:\[ [^\]]*\]|⋯|\d+ words? selected|\s)+$/
const LIST_MARKER = /^(?:[•◦*+-]|\d+\.)\s+/

export const withoutOwnRows = (raw: string): string =>
  raw
    .split('\n')
    .map(line => line.replace(BAR_TAIL, '').replace(/^[\s│╭╮╰╯─]+|[\s│╭╮╰╯─]+$/g, ''))
    .filter(line => line && !OWN_LINE.test(line) && !BOX_ONLY.test(line) && !BAR_ONLY.test(line))
    .map(line => line.replace(LIST_MARKER, ''))
    .join('\n')
    .trim()

export const normalized = (text: string | null): string | null => (text ? withoutOwnRows(text).replace(/\s+/g, ' ').trim() || null : null)
