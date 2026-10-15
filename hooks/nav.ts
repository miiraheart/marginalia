export type NavRole = 'user' | 'assistant'
export type NavTarget = { id: string; role: NavRole; at: number }
export type NavMap = { order: Map<string, number>; targets: NavTarget[] }

export const stemOf = (id: string): string => id.slice(0, 23)

export const renderIdsOf = (id: string): string[] => (/^[0-9a-f-]{36}$/.test(id) ? [id, `${stemOf(id)}-000000000000`] : [id])

type Block = { type?: string; text?: string }
type Content = string | Block[] | undefined
type Row = { uuid?: string; type?: string; isMeta?: boolean; isSidechain?: boolean; message?: { content?: Content }; attachment?: { type?: string } }

const isTyped = (content: Content): boolean => {
  if (typeof content === 'string') return !!content.trim() && !content.trimStart().startsWith('<')
  if (!Array.isArray(content) || content.some(b => b.type === 'tool_result')) return false
  return content.some(b => b.type === 'text' && !!b.text?.trim() && !b.text.trimStart().startsWith('<'))
}

const hasText = (content: Content): boolean =>
  Array.isArray(content) ? content.some(b => b.type === 'text' && !!b.text?.trim()) : typeof content === 'string' && !!content.trim()

export const navMap = (jsonl: string): NavMap => {
  const order = new Map<string, number>()
  const targets: NavTarget[] = []
  let isInReply = false
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    let row: Row
    try {
      row = JSON.parse(line) as Row
    } catch {
      continue
    }
    if (!row.uuid || row.isSidechain || order.has(stemOf(row.uuid))) continue
    const at = order.size
    order.set(stemOf(row.uuid), at)
    const isQueued = row.type === 'attachment' && row.attachment?.type === 'queued_command'
    if (isQueued || (row.type === 'user' && !row.isMeta && isTyped(row.message?.content))) {
      targets.push({ id: row.uuid, role: 'user', at })
      isInReply = false
    } else if (row.type === 'assistant' && !isInReply && hasText(row.message?.content)) {
      targets.push({ id: row.uuid, role: 'assistant', at })
      isInReply = true
    }
  }
  return { order, targets }
}

export const candidates = (map: NavMap, role: NavRole, dir: 1 | -1, at: number | null): NavTarget[] => {
  const mine = map.targets.filter(t => t.role === role)
  if (at === null) return dir === 1 ? [] : [...mine].reverse()
  return dir === 1 ? mine.filter(t => t.at > at) : mine.filter(t => t.at < at).reverse()
}
