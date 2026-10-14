import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, PromptOrigin, Register, RenderElement, RenderSurface } from 'claude-code'

import type { MarginaliaAction, MarginaliaPin, MarginaliaPress, MarginaliaView } from '../types'
import { ACTION_LABELS, askPrompt, chipOf, chipsIn, cleanSelection, contextBlock, defineWords, moreActions, nextNumber, normalized, preview, rememberPrompt, shortActions, sourceOf, taskTitle, withoutChip, withoutOwnRows, wordCount } from './text'
import { mergeSpans, spanOf, splitBlocks } from './blocks'
import './themes'

const pending = atom({ plugin: 'marginalia', key: 'pending' } as const, [])
const present = atom({ plugin: 'marginalia', key: 'present' } as const, [])
const selected = atom({ plugin: 'marginalia', key: 'selected' } as const, null)
const selectedRow = atom({ plugin: 'marginalia', key: 'row' } as const, null)

const POLL_MS = 400
const SETTLE_MS = 1200
const ROW_WAIT_MS = 1500
const SHIFT_MS = 1000
const CLEAR_MS = 15000
const DARK = '#2b2e3b'

async function cleanSelectionOf($: EngineInterface) {
  const sel = await $.ui.selection()
  if (!sel) return undefined
  return { ...sel, text: withoutOwnRows(sel.text) }
}

const COLORS: Record<MarginaliaAction, string> = {
  quote: 'claude',
  remember: 'remember',
  task: 'success',
  explain: 'suggestion',
  deeper: 'suggestion',
  redo: 'suggestion',
  anki: 'merged',
  define: 'ide',
  wrong: 'error',
  copy: 'subtle',
}

const roles = new Map<string, 'user' | 'assistant'>()
const onScreen = new Map<string, boolean>()
const seen = { dismissed: null as string | null, last: null as string | null, at: 0, steady: 0, skipUntil: 0, shifted: null as string | null }
const ui = { root: '', rowDrawnFor: null as string | null, pinsDrawn: new Set<string>(), claimed: new Set<string>(), flash: null as number | null, more: false, open: new Set<number>(), version: 0, shown: 0, actions: '', inFlow: false, inFlowRows: 1, inFlowSlot: '', ghosts: [] as { row: string; slot: string; rows: number }[] }

function changed($: EngineInterface) {
  ui.version += 1
  $.ui.invalidate('ui.render')
}

async function hideBar($: EngineInterface, text: string | null) {
  seen.dismissed = text
  ui.more = false
  ui.inFlow = false
  ui.ghosts = []
  await update($, selected, () => null)
  await update($, selectedRow, () => null)
  changed($)
  await expectShift($)
}

async function setPending($: EngineInterface, fn: (all: MarginaliaPin[]) => MarginaliaPin[]) {
  await update($, pending, fn)
  changed($)
}

async function visiblePins($: EngineInterface): Promise<MarginaliaPin[]> {
  const inBox = new Set(await read($, present))
  return (await read($, pending)).filter(p => inBox.has(p.n))
}

async function removeChip($: EngineInterface, n: number) {
  const box = await $.prompt.read()
  const text = withoutChip(box.text, n)
  if (text !== box.text) await $.prompt.fill({ text, mode: 'replace' })
}

async function pollSelection($: EngineInterface) {
  const sel = await $.ui.selection()
  const raw = sel?.text.trim() || null
  const text = raw ? withoutOwnRows(raw) || null : null
  const now = await $.clock.now()
  if (text !== seen.last && now < seen.skipUntil) {
    Object.assign(seen, { last: text, at: now, steady: 0, skipUntil: 0, shifted: text })
    return
  }
  if (text !== seen.last) {
    const isSame = normalized(text) === normalized(seen.dismissed)
    Object.assign(seen, { last: text, at: now, steady: 0, dismissed: isSame ? seen.dismissed : null, shifted: null })
    if (!ui.inFlow && ((await read($, selected)) !== null || (await read($, selectedRow)) !== null)) {
      ui.more = false
      await update($, selected, () => null)
      await update($, selectedRow, () => null)
      changed($)
    }
    return
  }
  seen.steady += 1
  if (now - seen.at < SETTLE_MS || seen.steady < 1 || text === seen.shifted) return
  const shown = text && normalized(text) !== normalized(seen.dismissed) ? text : null
  const old = await read($, selected)
  if (shown === old) return
  const row = shown && sel?.requestId && onScreen.get(sel.requestId) !== false ? sel.requestId : null
  const oldRow = await read($, selectedRow)
  if (!shown) ui.ghosts = []
  else if (old && oldRow && ui.inFlow && !ui.ghosts.some(g => g.row === oldRow && g.slot === ui.inFlowSlot)) ui.ghosts.push({ row: oldRow, slot: ui.inFlowSlot, rows: ui.inFlowRows })
  await update($, selected, () => shown)
  await update($, selectedRow, () => row)
  ui.more = false
  if (!shown) ui.inFlow = false
  ui.rowDrawnFor = null
  changed($)
  await expectShift($)
  if (row && !onScreen.has(row)) $.clock.after(ROW_WAIT_MS, () => void fallBackToBar($, row))
  const turn = ++ui.shown
  if (shown) $.clock.after(CLEAR_MS, () => void clearIfIdle($, turn))
}

async function clearIfIdle($: EngineInterface, turn: number) {
  const showing = await read($, selected)
  if (turn !== ui.shown || !showing || (await isSelecting($))) return
  await hideBar($, showing)
}

async function isSelecting($: EngineInterface): Promise<boolean> {
  return seen.last !== (await read($, selected)) || (await $.clock.now()) - seen.at < SETTLE_MS
}

async function fallBackToBar($: EngineInterface, row: string, isForced = false) {
  if ((await read($, selectedRow)) !== row) return
  if (!isForced && ((onScreen.get(row) ?? ui.rowDrawnFor === row) || (await isSelecting($)))) return
  await update($, selectedRow, () => null)
  changed($)
}

function noteScreen($: EngineInterface, requestId: string, at: object | null | undefined) {
  if (at === undefined) return
  const was = onScreen.get(requestId)
  onScreen.set(requestId, at !== null)
  if (at === null && was !== false) void fallBackToBar($, requestId)
}

async function quote($: EngineInterface) {
  const sel = await cleanSelectionOf($)
  if (!sel?.text.trim()) {
    $.ui.toast('Select some text in the conversation first')
    return
  }
  const role = sel.requestId ? roles.get(sel.requestId) : undefined
  const inBox = chipsIn((await $.prompt.read()).text).map(c => c.n)
  await update($, present, () => inBox)
  await setPending($, all => all.filter(p => inBox.includes(p.n)))
  const pin: MarginaliaPin = { n: nextNumber(inBox.map(n => ({ n, text: '' }))), text: sel.text, ...(sel.requestId ? { requestId: sel.requestId } : {}), ...(role ? { role } : {}) }
  const chip = chipOf(pin)
  const filled = await $.prompt.fill({ text: `${chip} `, mode: 'insert', decorations: [{ start: 0, end: chip.length, color: 'suggestion', bold: true }] })
  if (!filled.isFilled) {
    $.ui.toast('The prompt box is busy, close the dialog and try again')
    return
  }
  await expectShift($)
  await update($, present, all => [...new Set([...all, pin.n])])
  await setPending($, all => [...all, pin])
  await hideBar($, sel.text.trim())
}

async function expectShift($: EngineInterface) {
  seen.skipUntil = (await $.clock.now()) + SHIFT_MS
}

async function unpin($: EngineInterface, n: number) {
  await expectShift($)
  ui.open.delete(n)
  await update($, present, all => all.filter(m => m !== n))
  await setPending($, all => all.filter(p => p.n !== n))
  await removeChip($, n)
}

async function takeQuotes($: EngineInterface, text: string, origin: PromptOrigin): Promise<string[]> {
  const all = await read($, pending)
  if (!all.length || origin.kind === 'plugin') return []
  const quoted = chipsIn(text).flatMap(c => {
    const pin = all.find(p => p.n === c.n)
    return pin ? [contextBlock(pin)] : []
  })
  ui.open.clear()
  await update($, present, () => [])
  await setPending($, () => [])
  return quoted
}

async function runAction($: EngineInterface, action: MarginaliaAction) {
  if (action === 'quote') return quote($)
  const sel = await cleanSelectionOf($)
  if (!sel?.text.trim()) {
    $.ui.toast('Select some text in the conversation first')
    return
  }
  await hideBar($, sel.text.trim())
  if (action === 'remember') {
    await $.prompt.submit({ text: rememberPrompt(sel.text), asUser: true })
    $.ui.toast('♥ Sent to remember')
    return
  }
  if (action === 'copy') {
    const copied = await $.ui.copy({ text: cleanSelection(sel.text) })
    $.ui.toast(copied.isCopied ? '⧉ Copied' : `Copy failed: ${copied.reason}`)
    return
  }
  if (action === 'task') {
    const made = await $.process.run(['bd', 'create', taskTitle(sel.text), '--description', cleanSelection(sel.text), '-t', 'task', '-p', '2', '--json'], { cwd: ui.root || undefined }).catch(() => undefined)
    const id = made?.exitCode === 0 ? /"id":\s*"([^"]+)"/.exec(made.stdout)?.[1] : undefined
    $.ui.toast(id ? `+ Task ${id} created` : 'Could not create the task: is bd set up in this folder?')
    return
  }
  if (action === 'define') {
    const command = await $.env.get('MARGINALIA_DEFINE_CMD')
    if (command) {
      $.ui.toast(`≡ Looking up ${defineWords(sel.text).join(' ')}…`)
      const found = await $.process.run([command, ...defineWords(sel.text)], { timeoutMs: 20000 }).catch(() => undefined)
      if (found?.exitCode === 0 && found.stdout.trim()) {
        $.ui.toast(found.stdout.trim().split('\n').slice(0, 12).join('\n'), { timeoutMs: 15000 })
        return
      }
    }
  }
  const prompt = askPrompt(action, sel.text)
  if (prompt) await $.prompt.submit({ text: prompt, asUser: true })
}

async function press($: EngineInterface, args: MarginaliaPress): Promise<boolean> {
  ui.ghosts = []
  if ('action' in args) await runAction($, args.action)
  else if ('unpin' in args) await unpin($, args.unpin)
  else if ('close' in args) {
    const showing = await read($, selected)
    if (showing) await hideBar($, showing)
  } else if ('toggle' in args) {
    if (ui.open.has(args.toggle)) ui.open.delete(args.toggle)
    else ui.open.add(args.toggle)
    changed($)
  } else {
    ui.more = !ui.more
    changed($)
  }
  return true
}

async function viewOf($: EngineInterface, requestId: string, role?: 'user' | 'assistant', isExternal = false): Promise<MarginaliaView | undefined> {
  if (role) roles.set(requestId, role)
  const mine = (await visiblePins($)).filter(p => p.requestId === requestId)
  const selection = (await read($, selectedRow)) === requestId ? await read($, selected) : null
  const ghosts = ui.ghosts.filter(g => g.row === requestId).map(g => ({ slot: g.slot, rows: g.rows }))
  if (!mine.length && !selection && !ghosts.length) return undefined
  if (isExternal) ui.claimed.add(requestId)
  if (selection) ui.rowDrawnFor = requestId
  if (mine.length) ui.pinsDrawn.add(requestId)
  const button = (action: MarginaliaAction) => ({ action, label: ACTION_LABELS[action] })
  return {
    selection,
    pins: mine,
    short: shortActions(ui.actions).map(button),
    more: moreActions(ui.actions).map(button),
    isMoreOpen: ui.more,
    open: [...ui.open],
    flash: ui.flash,
    ghosts,
  }
}

function actionRow($: EngineInterface, el: ElementTable, view: MarginaliaView): RenderElement {
  const { Box, Button, Text } = el
  const button = (b: MarginaliaView['short'][number]) => (
    <Button key={b.action} label={b.label} variant="primary" onPress={() => void press($, { action: b.action })}>
      <Text color={COLORS[b.action]} bold>{b.label}</Text>
    </Button>
  )
  return (
    <Box key="actions" flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        {view.short.map(button)}
        <Button key="more" label={view.isMoreOpen ? '⋯ less' : '⋯'} onPress={() => void press($, { more: true })} />
        <Button key="close" label="✕" onPress={() => void press($, { close: true })} />
        <Text dimColor>{wordCount(view.selection ?? '')}</Text>
      </Box>
      {view.isMoreOpen ? <Box flexDirection="row" columnGap={1}>{view.more.map(button)}</Box> : null}
    </Box>
  )
}

async function goTo($: EngineInterface, requestId: string, n: number) {
  const moved = await $.ui.scroll({ to: { requestId }, block: 'center' })
  if (moved.deny) {
    $.ui.toast(`Can't jump there: ${moved.deny}`)
    return
  }
  ui.flash = n
  changed($)
  $.clock.after(3000, () => {
    if (ui.flash === n) ui.flash = null
    changed($)
  })
}

function pinRow($: EngineInterface, el: ElementTable, p: MarginaliaPin, isOpen: boolean): RenderElement {
  const { Box, Button, Text } = el
  return (
    <Box key={`bar${p.n}`} flexDirection="column">
      <Box flexDirection="row" columnGap={1}>
        <Text color="suggestion" bold>{`❝${p.n}`}</Text>
        <Text dimColor>{`"${preview(p.text)}" from ${sourceOf(p)}`}</Text>
        {p.requestId ? <Button key={`go${p.n}`} label="↥ go" onPress={() => void goTo($, p.requestId!, p.n)} /> : null}
        <Button key={`show${p.n}`} label={isOpen ? '▾ hide' : '▸ show'} onPress={() => void press($, { toggle: p.n })} />
        <Button key={`unpin${p.n}`} label="✕ unquote" onPress={() => void press($, { unpin: p.n })} />
      </Box>
      {isOpen ? (
        <Box backgroundColor={DARK} paddingX={1}>
          <Text>{p.text}</Text>
        </Box>
      ) : null}
    </Box>
  )
}

function barOverlay($: EngineInterface, el: ElementTable, view: MarginaliaView, isBelow: boolean, isBeside = false, besideAt = 0): RenderElement {
  const height = view.isMoreOpen ? 2 : 1
  if (isBeside) {
    return (
      <el.Box key="bar" position="absolute" left={besideAt} bottom={0}>
        {actionRow($, el, view)}
      </el.Box>
    )
  }
  return (
    <el.Box key="bar" position="absolute" left={0} right={0} height={height} top={isBelow ? undefined : -height} bottom={isBelow ? -height : undefined}>
      {actionRow($, el, view)}
    </el.Box>
  )
}

function pinLegend($: EngineInterface, el: ElementTable, pins: MarginaliaPin[], flash: number | null): RenderElement[] {
  const { Button, Text } = el
  return pins.flatMap(p => [
    <Text key={`pin${p.n}`} color={p.n === flash ? 'warning' : 'suggestion'} bold>{` ❝${p.n} quoted `}</Text>,
    <Button key={`unpin${p.n}`} label="✕ unquote" onPress={() => void press($, { unpin: p.n })} />,
    <Text key={`end${p.n}`}> </Text>,
  ])
}

const RULE = Array.from({ length: 200 }, () => '│').join('\n')

function pinOverlay($: EngineInterface, el: ElementTable, pins: MarginaliaPin[], flash: number | null, isTight: boolean): RenderElement[] {
  const { Box, Text } = el
  const color = pins.some(p => p.n === flash) ? 'warning' : 'inactive'
  if (isTight) {
    return [
      <Box key="rule" position="absolute" top={0} bottom={0} left={-2} width={1} overflow="hidden" flexDirection="column">
        <Text color={color}>{RULE}</Text>
      </Box>,
      <Box key="legend" position="absolute" top={0} right={0} flexDirection="row">
        {pinLegend($, el, pins, flash)}
      </Box>,
    ]
  }
  return [
    <Box key="outline" position="absolute" top={-1} bottom={-1} left={-2} right={0} borderStyle="round" borderColor={color} />,
    <Box key="legend" position="absolute" top={-1} left={1} flexDirection="row">
      {pinLegend($, el, pins, flash)}
    </Box>,
  ]
}

function noRoomForBar($: EngineInterface, requestId: string) {
  ui.rowDrawnFor = null
  void fallBackToBar($, requestId, true)
}

async function themed($: EngineInterface, surface: RenderSurface, text: string, columns: number): Promise<RenderElement | undefined> {
  try {
    const drawn = await $.prismantis.markdown({ surface, text, columns })
    if (drawn) return drawn
  } catch {}
  try {
    return await $.skins.markdown({ surface, text, columns })
  } catch {
    return undefined
  }
}

async function messageWithRows($: EngineInterface, el: ElementTable, surface: RenderSurface, text: string, columns: number, view: MarginaliaView, mark: RenderElement | null, isFullscreen: boolean): Promise<{ tree: RenderElement; hasBar: boolean; isInFlow: boolean; slot: string }> {
  const chunks = splitBlocks(text)
  const raws = chunks.map(c => c.raw)
  const end = chunks.length - 1
  const whole = { first: end, last: end }
  const groups = mergeSpans(view.pins.map(p => ({ ...(spanOf(raws, p.text) ?? whole), items: [p] })))
  const span = view.selection ? (spanOf(raws, view.selection, true) ?? whole) : null
  const width = [...view.short, ...(view.isMoreOpen ? view.more : [])].reduce((n, b) => n + b.label.length + 5, 30)
  const placeOf = (i: number) => {
    if (!chunks[i + 1]?.isTight) return { at: i, isBelow: true, isBeside: false, isInFlow: false }
    const raw = chunks[i]!.raw
    const isBeside = !raw.includes('\n') && raw.length + 4 + width <= columns
    return { at: i, isBelow: true, isBeside, isInFlow: !isBeside }
  }
  const ghostRows = new Map(view.ghosts.map(g => [g.slot, g.rows]))
  const reuse = span && span.first > 0 && chunks[span.first]?.isTight && ghostRows.has(String(span.first - 1)) ? span.first - 1 : null
  const bar = !span ? null : reuse !== null ? { at: reuse, isBelow: true, isBeside: false, isInFlow: true } : span.last < end || isFullscreen ? placeOf(span.last) : span.first > 0 ? { at: span.first, isBelow: false, isBeside: false, isInFlow: false } : null
  const { Box, Markdown } = el
  const drawn = await Promise.all(chunks.map(c => themed($, surface, c.raw, columns)))
  const gap = (i: number) => (i === 0 || chunks[i]!.isTight ? 0 : 1)
  const edgeOf = (g: { first: number; last: number }) => (bar?.isBelow ? g.last : g.first)
  const onGroup = (g: { first: number; last: number }) => !!bar && bar.at === edgeOf(g)
  const ghostAt = new Map([...ghostRows].flatMap(([slot, rows]) => {
    const at = Number(slot)
    const isGone = !/^\d+$/.test(slot) || !chunks[at + 1]?.isTight || (bar?.isInFlow && bar.at === at) || (span && at >= span.last)
    return isGone ? [] : [[at, rows] as const]
  }))
  const ghostBox = (i: number) => (ghostAt.has(i) ? <Box key={`ghost${i}`} height={ghostAt.get(i)} /> : null)
  const barAt = () => (bar?.isInFlow ? <Box key="bar">{actionRow($, el, view)}</Box> : bar ? barOverlay($, el, view, bar.isBelow, bar.isBeside, bar.isBeside ? chunks[bar.at]!.raw.length + 2 : 0) : null)
  const chunkBox = (i: number, top: number, hasBar: boolean) => (
    <Box key={`c${i}`} flexDirection="column" marginTop={top}>
      {drawn[i] ?? <Markdown text={chunks[i]!.raw} />}
      {hasBar ? barAt() : null}
      {ghostBox(i)}
    </Box>
  )
  const body: RenderElement[] = []
  for (let i = 0; i < chunks.length; i++) {
    const group = groups.find(g => g.first === i)
    if (!group) {
      body.push(chunkBox(i, gap(i), bar?.at === i))
      continue
    }
    const inside = Array.from({ length: group.last - group.first + 1 }, (_, k) => group.first + k)
    const isTight = chunks[i]!.isTight || !!chunks[group.last + 1]?.isTight
    body.push(
      <Box key={`g${i}`} flexDirection="column" marginTop={gap(i)}>
        {inside.map(j => chunkBox(j, j === i ? 0 : gap(j), bar?.at === j && !onGroup(group)))}
        {pinOverlay($, el, group.items, view.flash, isTight)}
        {onGroup(group) ? barAt() : null}
      </Box>,
    )
    i = group.last
  }
  return {
    hasBar: !!bar,
    isInFlow: !!bar?.isInFlow,
    slot: bar?.isInFlow ? String(bar.at) : '',
    tree: (
      <Box flexDirection="row" marginTop={1}>
        {mark}
        <Box flexDirection="column" flexGrow={1}>
          {body}
        </Box>
      </Box>
    ),
  }
}

async function underPrompt($: EngineInterface, el: ElementTable, requestId: string, inner: RenderElement, isFullscreen: boolean): Promise<RenderElement> {
  const view = await viewOf($, requestId, 'user')
  if (!view) return inner
  if (view.selection) ui.inFlow = false
  if (view.selection && !isFullscreen) noRoomForBar($, requestId)
  const { Box } = el
  return (
    <Box flexDirection="column">
      {inner}
      {view.pins.length ? (
        <Box position="absolute" top={0} right={0} flexDirection="row">
          {pinLegend($, el, view.pins, view.flash)}
        </Box>
      ) : null}
      {view.selection && isFullscreen ? barOverlay($, el, view, true) : null}
    </Box>
  )
}

export const register: Register = on => {
  on('engine.create', async (_$, e, next) => ({
    ...(await next(e)),
    marginalia: { view: async () => undefined, press: async () => false, version: async () => 0, placed: async () => false },
  }))

  on('marginalia.view', async ($, e) => ({ value: await viewOf($, e.requestId, e.role, true) }))
  on('marginalia.press', async ($, e) => ({ value: await press($, e) }))
  on('marginalia.version', () => ({ value: ui.version }))
  on('marginalia.placed', (_$, e) => {
    ui.inFlow = e.inFlow
    ui.inFlowRows = e.rows ?? 1
    ui.inFlowSlot = e.slot ?? ''
    return { value: true }
  })

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    ui.root = await $.session.root().catch(() => '')
    ui.actions = (await $.env.get('MARGINALIA_ACTIONS').catch(() => undefined)) ?? ''
    await $.command.register({ name: 'q', description: 'Quote the selected text into the prompt' }).catch(() => undefined)
    await $.command.register({ name: 'remember-this', description: 'Ask Claude to remember the selected text' }).catch(() => undefined)
    $.clock.every(POLL_MS, () => void pollSelection($))
    return started
  })

  on('command.run', { command: 'q' }, async $ => {
    await quote($)
    return {}
  })

  on('command.run', { command: 'remember-this' }, async $ => {
    await runAction($, 'remember')
    return {}
  })

  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    const showing = await read($, selected)
    if (showing) await hideBar($, showing)
    const chips = chipsIn(r.text)
    const now = chips.map(c => c.n)
    const before = await read($, present)
    if (now.join() !== before.join()) {
      await update($, present, () => now)
      changed($)
    }
    if (!chips.length) return r
    const paint = chips.map(c => ({ start: c.start, end: c.end, color: 'suggestion' as const, bold: true }))
    return { ...r, decorations: [...(r.decorations ?? []), ...paint] }
  })

  on('prompt.submit', async ($, e, next) => {
    const quoted = await takeQuotes($, e.text, e.origin)
    return next(quoted.length ? { ...e, context: [...(e.context ?? []), ...quoted] } : e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    noteScreen($, e.requestId, e.props.onScreen)
    const view = await viewOf($, e.requestId, 'assistant')
    if (!view || !e.props.text.trim()) return next(e)
    ui.claimed.delete(e.requestId)
    const below = await next(e)
    if (ui.claimed.has(e.requestId)) return below
    const el = $.ui.resolve(e)
    const mark = <el.Box width={2} flexShrink={0}><el.Text color="claude">{e.props.isFirstOfReply ? '●' : ' '}</el.Text></el.Box>
    const drawn = await messageWithRows($, el, e.surface, e.props.text, Math.max(20, (e.viewport?.columns ?? 100) - 4), view, mark, !!e.viewport?.isFullscreen)
    if (view.selection) Object.assign(ui, { inFlow: drawn.isInFlow, inFlowRows: view.isMoreOpen ? 2 : 1, inFlowSlot: drawn.slot })
    if (view.selection && !drawn.hasBar) noRoomForBar($, e.requestId)
    return drawn.tree
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    noteScreen($, e.requestId, e.props.onScreen)
    ui.claimed.delete(e.requestId)
    const below = await next(e)
    return ui.claimed.has(e.requestId) ? below : underPrompt($, $.ui.resolve(e), e.requestId, below, !!e.viewport?.isFullscreen)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const selection = (await read($, selectedRow)) ? null : await read($, selected)
    const loose = await visiblePins($)
    if (e.props.hasSurvey || (!selection && !loose.length)) return next(e)
    const el = $.ui.resolve(e)
    const view: MarginaliaView = { selection, pins: loose, short: shortActions(ui.actions).map(a => ({ action: a, label: ACTION_LABELS[a] })), more: moreActions(ui.actions).map(a => ({ action: a, label: ACTION_LABELS[a] })), isMoreOpen: ui.more, open: [...ui.open], flash: ui.flash, ghosts: [] }
    if (selection) ui.inFlow = false
    const others = await next(e)
    return (
      <el.Box flexDirection="column">
        {others}
        {selection ? actionRow($, el, view) : null}
        {loose.map(p => pinRow($, el, p, ui.open.has(p.n)))}
      </el.Box>
    )
  })
}
