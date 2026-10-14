import { expect, mock, test } from 'claude-code/testing'

import { askPrompt, chipOf, chipsIn, cleanSelection, contextBlock, defineWords, moreActions, nextNumber, preview, normalized, rememberPrompt, shortActions, taskTitle, withoutChip, withoutOwnRows, wordCount } from '../hooks/text'

const pin = { n: 1, text: "Je ne pense pas que ce soit utile, vraiment pas.", role: 'assistant' as const }

test('a chip shows the number and a short preview', () => {
  expect(chipOf(pin)).toBe('[❝1 Je ne pense pas que ce s…]')
})

test('preview flattens newlines and drops brackets so the chip stays one token', () => {
  expect(preview('a [b]\nc')).toBe('a b c')
})

test('chips are found with their ranges', () => {
  const text = `pourquoi ${chipOf(pin)} et [❝2 autre] ?`
  expect(chipsIn(text).map(c => c.n)).toEqual([1, 2])
  const first = chipsIn(text)[0]!
  expect(text.slice(first.start, first.end)).toBe(chipOf(pin))
})

test('unpinning removes only that chip', () => {
  expect(withoutChip('a [❝1 x] b [❝2 y] c', 1)).toBe('a b [❝2 y] c')
})

test('numbers keep counting past removed pins', () => {
  expect(nextNumber([{ n: 1, text: 'a' }, { n: 3, text: 'b' }])).toBe(4)
  expect(nextNumber([])).toBe(1)
})

test('the model gets the full text tagged with its source', () => {
  const block = contextBlock(pin)
  expect(block).toContain('<quoted_text n="1" source="assistant">')
  expect(block).toContain(pin.text)
  expect(contextBlock({ n: 2, text: 'x' })).toContain('source="conversation"')
})

test('remember quotes every line', () => {
  expect(rememberPrompt('a\nb')).toContain('> a\n> b')
})

test('/q quotes the selection as a chip, and submit hands the model the full text', async ($, on) => {
  mock.env(on, {})
  mock.clock(on, { now: 1_000_000 })
  let draft = ''
  let seen: readonly string[] | undefined
  on('ui.selection', () => ({ value: { text: pin.text } }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_, e) => {
    draft = e.mode === 'insert' ? draft + e.text : e.text
    return { isFilled: true, text: draft, cursor: draft.length }
  })
  on('prompt.submit', (_, e) => {
    seen = e.context
    return { text: e.text, context: e.context }
  })
  on('command.run', () => ({}))
  await $.command.run({ command: 'q', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect(draft).toBe(`${chipOf(pin)} `)
  await $.prompt.submit({ text: `pourquoi ${draft}?`, wait: false, origin: { kind: 'composer' } })
  expect(seen?.some(c => c.includes('<quoted_text n="1"') && c.includes(pin.text))).toBe(true)
  seen = undefined
  await $.prompt.submit({ text: 'and again', wait: false, origin: { kind: 'composer' } })
  const after: readonly string[] = (seen as readonly string[] | undefined) ?? []
  expect(after.some(c => c.includes('<quoted_text'))).toBe(false)
})

test('a quote after the earlier chips were deleted is numbered 1 again', async ($, on) => {
  mock.env(on, {})
  mock.clock(on, { now: 1_000_000 })
  let draft = ''
  on('ui.selection', () => ({ value: { text: pin.text } }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_, e) => {
    draft = e.mode === 'insert' ? draft + e.text : e.text
    return { isFilled: true, text: draft, cursor: draft.length }
  })
  on('command.run', () => ({}))
  const quote = () => $.command.run({ command: 'q', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  await quote()
  await quote()
  expect(chipsIn(draft).map(c => c.n)).toEqual([1, 2])
  draft = ''
  await quote()
  expect(chipsIn(draft).map(c => c.n)).toEqual([1])
})

test('the bar shows Quote, Remember and Task unless MARGINALIA_ACTIONS picks others', () => {
  expect(shortActions()).toEqual(['quote', 'remember', 'task'])
  expect(shortActions('quote, Define,anki,task,nope,anki')).toEqual(['quote', 'define', 'anki', 'task'])
  expect(shortActions('nope')).toEqual(['quote', 'remember', 'task'])
  expect(moreActions()).toContain('explain')
  expect(moreActions()).not.toContain('quote')
  expect(moreActions('quote,define')).toContain('remember')
})

test('ask actions quote the passage under a short instruction', () => {
  expect(askPrompt('explain', 'a\nb')).toBe('Explain this passage more simply, in a few lines:\n\n> a\n> b')
  expect(askPrompt('task', 'x')).toBeUndefined()
})

test('a clean copy drops copy buttons and the jump hint', () => {
  expect(cleanSelection('[ ⧉ copy ]\nqu\'il pleuve   \nJump to bottom (click) ↓')).toBe("qu'il pleuve")
})

test('a task title is one short line', () => {
  expect(taskTitle('fix   the\nband ' + 'x'.repeat(80)).length).toBeLessThanOrEqual(71)
})

test('define takes the first words without punctuation', () => {
  expect(defineWords('« bonheur », gendre.')).toEqual(['bonheur', 'gendre'])
})

test('own bar fragments are cut from a selection', () => {
  expect(withoutOwnRows('the cat sat  [ ❝ Quote ]  [ ♥ Remember ]  [ + Task ]  [ ⋯ ]  3 words selected')).toBe('the cat sat')
  expect(withoutOwnRows('a line\n[ ⋯ ]  [ ? Explain ]\n12 words selected\nnext')).toBe('a line\nnext')
  expect(withoutOwnRows('[❝1 kept chip] text')).toBe('[❝1 kept chip] text')
  expect(withoutOwnRows('❝2 quoted\nthe passage\n[ ✕ unquote ]')).toBe('the passage')
})

test('a selection loses its list markers', () => {
  expect(withoutOwnRows('• first\n- second\n12. third\n◦ fourth\n-1 stays')).toBe('first\nsecond\nthird\nfourth\n-1 stays')
})

test('word counts ignore bar fragments and empty text', () => {
  expect(wordCount('two words [ ≡ Define ] [ + Task ]')).toBe('2 words selected')
  expect(wordCount('')).toBe('0 words selected')
})

test('normalized text ignores whitespace and own rows', () => {
  expect(normalized('a  b\n c [ ❝ Quote ]')).toBe(normalized('a b c'))
  expect(normalized('  ')).toBeNull()
})
