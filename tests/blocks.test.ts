import { expect, test } from 'claude-code/testing'

import { chunkIndexOf, mergeSpans, spanOf, splitBlocks } from '../hooks/blocks'

const REPLY = [
  '## Ideas',
  '',
  'Your **Remember** click came through.',
  'It was a real request.',
  '',
  '- first bullet',
  '  still the first bullet',
  '- second bullet',
  '  - nested under second',
  '',
  '| Button | What |',
  '|---|---|',
  '| + Task | Creates a bead |',
  '',
  '```bash',
  'echo hi',
  '',
  'echo again',
  '```',
  '',
  '1. step one',
  '2. step two',
].join('\n')

test('a reply splits into blocks, one chunk per list item', () => {
  const chunks = splitBlocks(REPLY)
  expect(chunks.map(c => c.raw.split('\n')[0])).toEqual([
    '## Ideas',
    'Your **Remember** click came through.',
    '- first bullet',
    '- second bullet',
    '| Button | What |',
    '```bash',
    '1. step one',
    '2. step two',
  ])
  expect(chunks[2]!.raw).toContain('still the first bullet')
  expect(chunks[3]!.raw).toContain('nested under second')
  expect(chunks[5]!.raw).toContain('echo again')
})

test('list items after the first sit tight, other blocks keep their gap', () => {
  const chunks = splitBlocks(REPLY)
  expect(chunks.map(c => c.isTight)).toEqual([false, false, false, true, false, false, false, true])
})

test('a selection finds its chunk, even cut mid-word or across rendered tables', () => {
  const raws = splitBlocks(REPLY).map(c => c.raw)
  expect(chunkIndexOf(raws, 'econd bullet')).toBe(3)
  expect(chunkIndexOf(raws, '+ Task      Creates a bead')).toBe(4)
  expect(chunkIndexOf(raws, 'step two')).toBe(7)
  expect(chunkIndexOf(raws, 'not in this reply')).toBe(-1)
})

test('a selection across a table, a heading and a diagram spans all three chunks', () => {
  const raws = splitBlocks(['Intro line here.', '', '| Name | Role |', '|---|---|', '| api | serves |', '', '## Flow', '', '```', '┌─────┐', '│ api │ ──▶ database', '└─────┘', '```', '', 'Outro paragraph.'].join('\n')).map(c => c.raw)
  const selection = ['Name    Role', 'api     serves', '', 'Flow', '', '┌─────┐', '│ api │ ──▶ database'].join('\n')
  expect(spanOf(raws, selection)).toEqual({ first: 1, last: 3 })
})

test('a one line selection spans its own chunk, an unknown one spans nothing', () => {
  const raws = splitBlocks(REPLY).map(c => c.raw)
  expect(spanOf(raws, 'econd bullet')).toEqual({ first: 3, last: 3 })
  expect(spanOf(raws, '2. step two')).toEqual({ first: 7, last: 7 })
  expect(spanOf(raws, 'not in this reply')).toBeNull()
})

test('when only one end of a selection matches, the span is that chunk', () => {
  const raws = splitBlocks(REPLY).map(c => c.raw)
  expect(spanOf(raws, 'nothing like this\nstep one')).toEqual({ first: 6, last: 6 })
})

test('overlapping spans merge into one group', () => {
  const merged = mergeSpans([{ first: 3, last: 4, items: ['b'] }, { first: 1, last: 3, items: ['a'] }, { first: 6, last: 6, items: ['c'] }])
  expect(merged).toEqual([{ first: 1, last: 4, items: ['a', 'b'] }, { first: 6, last: 6, items: ['c'] }])
})

test('a selection that starts with the list number still finds its item, not the whole list', () => {
  const raws = ['1. Look at your existing pin above.', '2. If the box is gone, or a refused line shows, tell me.']
  expect(chunkIndexOf(raws, '2. If the box is gone, o')).toBe(1)
  expect(chunkIndexOf(['- first', '- second bullet here'], '• second bullet')).toBe(1)
})

test('the bar end prefers the latest chunk a short last line matches', () => {
  const raws = ['- /home/me/src/marginalia/hooks/register.tsx', '- /home/me/src/prismantis/hooks/register.tsx', 'Checks:']
  expect(spanOf(raws, '/home/me/src/marginalia/hooks/register.tsx\n/home/me/src', true)).toEqual({ first: 0, last: 1 })
})
