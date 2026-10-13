export type Chunk = { raw: string; isItem: boolean; isTight: boolean }

const FENCE = /^\s*(`{3,}|~{3,})/
const ITEM = /^([-*+]|\d+[.)])\s+/
const HEADING = /^#{1,6}\s/
const TABLE = /^\s*\|/

const startsBlock = (line: string) => FENCE.test(line) || ITEM.test(line) || HEADING.test(line) || TABLE.test(line)

export const splitBlocks = (text: string): Chunk[] => {
  const lines = text.split('\n')
  const chunks: Chunk[] = []
  let i = 0
  let afterItem = false
  const push = (raw: string[], isItem: boolean) => {
    chunks.push({ raw: raw.join('\n'), isItem, isTight: isItem && afterItem })
    afterItem = isItem
  }
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      if (lines[i] !== undefined && !ITEM.test(lines[i]!)) afterItem = false
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const body = [line]
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i++]!)
      if (i < lines.length) body.push(lines[i++]!)
      push(body, false)
      continue
    }
    if (TABLE.test(line)) {
      const body: string[] = []
      while (i < lines.length && TABLE.test(lines[i]!)) body.push(lines[i++]!)
      push(body, false)
      continue
    }
    if (HEADING.test(line)) {
      push([line], false)
      i++
      continue
    }
    if (ITEM.test(line)) {
      const body = [line]
      i++
      while (i < lines.length && lines[i]!.trim() && !ITEM.test(lines[i]!) && !(startsBlock(lines[i]!) && !/^\s/.test(lines[i]!))) body.push(lines[i++]!)
      while (i < lines.length && /^\s+\S/.test(lines[i]!) ) body.push(lines[i++]!)
      push(body, true)
      continue
    }
    const body = [line]
    i++
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!)) body.push(lines[i++]!)
    push(body, false)
  }
  return chunks
}

const forMatch = (text: string): string =>
  text
    .replace(/\[\s*⧉[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()

const ends = (selection: string): (string | undefined)[] => {
  const lines = selection.split('\n').map(line => forMatch(line.replace(/^\s*(\d+[.)]|[-*+•◦])\s+/, ''))).filter(line => line.length >= 3)
  return [lines[0], lines.at(-1)].map(p => p?.slice(0, 40))
}

const probes = (selection: string): string[] => ends(selection).filter((p): p is string => !!p)

export const chunkIndexOf = (raws: readonly string[], selection: string): number => {
  const flat = raws.map(forMatch)
  for (const probe of probes(selection)) {
    const at = flat.findIndex(raw => raw.includes(probe))
    if (at !== -1) return at
  }
  return -1
}

export type Span = { first: number; last: number }

export const spanOf = (raws: readonly string[], selection: string, isLatest = false): Span | null => {
  const flat = raws.map(forMatch)
  const [head, tail] = ends(selection)
  const find = (probe: string | undefined, from: number) => (probe ? flat.findIndex((raw, i) => i >= from && raw.includes(probe)) : -1)
  const first = find(head, 0)
  const after = first === -1 ? -1 : isLatest && tail ? flat.findLastIndex((raw, i) => i >= first && raw.includes(tail)) : find(tail, first)
  const last = after === -1 ? find(tail, 0) : after
  if (first === -1 && last === -1) return null
  if (first === -1) return { first: last, last }
  if (last === -1) return { first, last: first }
  return { first: Math.min(first, last), last: Math.max(first, last) }
}

export const mergeSpans = <T>(spans: (Span & { items: T[] })[]): (Span & { items: T[] })[] =>
  [...spans]
    .sort((a, b) => a.first - b.first)
    .reduce<(Span & { items: T[] })[]>((all, s) => {
      const prev = all.at(-1)
      if (!prev || s.first > prev.last) return [...all, s]
      return [...all.slice(0, -1), { first: prev.first, last: Math.max(prev.last, s.last), items: [...prev.items, ...s.items] }]
    }, [])
