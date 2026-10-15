import { expect, test } from 'claude-code/testing'

import { candidates, navMap, renderIdsOf } from '../hooks/nav'

const row = (uuid: string, type: string, content: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ uuid, type, message: { content }, ...extra })

const FILE = [
  row('u1', 'user', 'first question'),
  row('a1', 'assistant', [{ type: 'text', text: 'Let me look.' }]),
  row('a1t', 'assistant', [{ type: 'tool_use', id: 't1' }]),
  row('r1', 'user', [{ type: 'tool_result', tool_use_id: 't1' }]),
  row('a1b', 'assistant', [{ type: 'text', text: 'Found it.' }]),
  row('m1', 'user', 'a reminder', { isMeta: true }),
  row('c1', 'user', '<local-command-stdout>ok</local-command-stdout>'),
  row('u2', 'user', [{ type: 'text', text: 'second question' }]),
  row('a2', 'assistant', [{ type: 'text', text: 'Answer two.' }]),
  row('s1', 'assistant', [{ type: 'text', text: 'side' }], { isSidechain: true }),
  'not json',
  row('u3', 'user', 'third'),
].join('\n')

test('targets are typed prompts and the first text block of each reply', () => {
  const map = navMap(FILE)
  expect(map.targets.map(t => `${t.role}:${t.id}`)).toEqual(['user:u1', 'assistant:a1', 'user:u2', 'assistant:a2', 'user:u3'])
})

test('down goes to the next message, up to the one before', () => {
  const map = navMap(FILE)
  const at = (id: string) => map.order.get(id)!
  expect(candidates(map, 'user', 1, at('u1'))[0]?.id).toBe('u2')
  expect(candidates(map, 'user', -1, at('u2'))[0]?.id).toBe('u1')
  expect(candidates(map, 'assistant', -1, at('a1b'))[0]?.id).toBe('a1')
})

test('a message sent mid-reply counts as yours and splits the reply', () => {
  const file = [
    row('u1', 'user', 'question'),
    row('a1', 'assistant', [{ type: 'text', text: 'Working on it.' }]),
    JSON.stringify({ uuid: 'q1', type: 'attachment', attachment: { type: 'queued_command', prompt: 'also this?' } }),
    row('a1b', 'assistant', [{ type: 'text', text: 'Found it.' }]),
  ].join('\n')
  expect(navMap(file).targets.map(t => `${t.role}:${t.id}`)).toEqual(['user:u1', 'assistant:a1', 'user:q1', 'assistant:a1b'])
})

test('from the bottom, up starts at the last message and down has none', () => {
  const map = navMap(FILE)
  expect(candidates(map, 'user', -1, null)[0]?.id).toBe('u3')
  expect(candidates(map, 'user', 1, null)).toEqual([])
})

test('a render id with the tail zeroed maps to the same row', () => {
  const id = '6d6d2c0a-717a-4f39-a643-881134b8a60d'
  const map = navMap(row(id, 'assistant', [{ type: 'text', text: 'hi' }]))
  expect(map.order.get('6d6d2c0a-717a-4f39-a643-000000000000'.slice(0, 23))).toBe(0)
  expect(renderIdsOf(id)).toEqual([id, '6d6d2c0a-717a-4f39-a643-000000000000'])
})
