import { visibleText } from './visible-text'

const FIBER_WORDS = [
  'cotton', 'polyester', 'nylon', 'wool', 'silk', 'linen', 'hemp',
  'tencel', 'lyocell', 'viscose', 'rayon', 'acrylic', 'elastane',
  'spandex', 'cashmere', 'modal', 'bamboo', 'polyamide', 'polyurethane',
  'leather', 'suede', 'denim', 'alpaca', 'mohair', 'ramie', 'jute',
  'polypropylene', 'lycra', 'fleece',
] as const

const FIBER_LIST = FIBER_WORDS.join('|')
const PREFIX = '(?:organic\\s+|recycled\\s+|certified\\s+)?'

const RE_LEADING_PERCENT = new RegExp(
  `(\\d{1,3}%\\s*${PREFIX}\\b(?:${FIBER_LIST})\\b(?:\\s*[,/&]?\\s*\\d{1,3}%\\s*${PREFIX}\\b(?:${FIBER_LIST})\\b){0,6})`,
  'i',
)
const RE_TRAILING_PERCENT = new RegExp(
  `(${PREFIX}\\b(?:${FIBER_LIST})\\b\\s*\\d{1,3}%(?:\\s*[,/&]?\\s*${PREFIX}\\b(?:${FIBER_LIST})\\b\\s*\\d{1,3}%){0,6})`,
  'i',
)
const RE_FIBERS_NO_PERCENT = new RegExp(
  `(${PREFIX}\\b(?:${FIBER_LIST})\\b(?:\\s*[,/&]\\s*${PREFIX}\\b(?:${FIBER_LIST})\\b){1,6})`,
  'i',
)

export type FiberMatch = {
  value: string
  source: 'jsonld' | 'labeled' | 'regex' | 'composition'
}

const LABELS = [
  'composition', 'material', 'materials', 'fabric', 'fabric content',
  'fiber content', 'fibre content', 'contents',
]

const PART_LABELS = [
  'shell', 'body', 'lining', 'outer', 'outer shell', 'main', 'main fabric',
  'sleeves', 'trim', 'bottom part', 'top part', 'rib', 'exterior', 'interior',
  'contrast', 'gusset', 'pocket', 'insert', 'stripe', 'inside', 'outside',
  'cuffs', 'collar', 'waistband', 'filling', 'fill',
  'outside material', 'inside material', 'fabric 1', 'fabric 2',
  'upper', 'sole', 'insole', 'outsole',
]

const STOP_LABELS = [
  'care', 'care instruction', 'care instructions', 'origin',
  'country of origin', 'imported', 'made in', 'size', 'size & fit',
  'size and fit', 'description', 'product details', 'shipping',
  'returns', 'reviews', 'ratings', 'about this item', 'delivery',
  'features', 'style', 'color', 'wash', 'dimensions',
]

function cleanValue(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/^[:\-–—\s]+/, '').trim().slice(0, 220)
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1).toLowerCase())
    .join(' ')
}

function isLabelMatch(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[:*\s]+$/, '')
  return LABELS.some((l) => t === l || t.startsWith(l + ':') || t === l + ':')
}

function isCompositionHeader(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[:*\s]+$/, '')
  return ['composition', 'material composition', 'materials composition',
    'fiber content', 'fibre content', 'fabric content', 'materials'].some(
    (l) => t === l || t.startsWith(l + ':') || t === l + ':',
  )
}

export function extractFiberFromText(text: string): FiberMatch | null {
  if (!text) return null
  const leading = text.match(RE_LEADING_PERCENT)
  if (leading?.[1]) return { value: cleanValue(leading[1]), source: 'regex' }
  const trailing = text.match(RE_TRAILING_PERCENT)
  if (trailing?.[1]) return { value: cleanValue(trailing[1]), source: 'regex' }
  const bare = text.match(RE_FIBERS_NO_PERCENT)
  if (bare?.[1]) {
    const value = cleanValue(bare[1])
    const fiberCount = Array.from(
      value.toLowerCase().matchAll(new RegExp(`\\b(?:${FIBER_LIST})\\b`, 'g')),
    ).length
    if (fiberCount >= 2) return { value, source: 'regex' }
  }
  return null
}

export function validateFiberValue(value: string): boolean {
  if (!value) return false
  if (value.length > 240) return false

  const fiberCount = Array.from(
    value.toLowerCase().matchAll(new RegExp(`\\b(?:${FIBER_LIST})\\b`, 'g')),
  ).length
  if (fiberCount === 0) return false

  const pcts = Array.from(value.matchAll(/(\d{1,3})\s*%/g)).map((m) => parseFloat(m[1]!))
  if (pcts.some((p) => p <= 0 || p > 100)) return false

  if (pcts.length === 0 && fiberCount < 2 && value.length > 40) return false

  if (pcts.length > 0) {
    const segments = value.split(/;\s*/)
    for (const seg of segments) {
      const segPcts = Array.from(seg.matchAll(/(\d{1,3})\s*%/g)).map((m) => parseFloat(m[1]!))
      if (segPcts.length === 0) continue
      const sum = segPcts.reduce((a, b) => a + b, 0)
      if (sum < 90 || sum > 110) return false
    }
  }
  return true
}

export function parseCompositionBlock(block: string): string | null {
  if (!block) return null
  const normalized = block.replace(/\r/g, '\n')

  const partsPattern = PART_LABELS
    .map((l) => l.replace(/\s+/g, '\\s+'))
    .join('|')
  const partRe = new RegExp(
    `(?<![a-zA-Z])(${partsPattern})\\s*[:\\-–—]\\s*`,
    'gi',
  )

  const matches = Array.from(normalized.matchAll(partRe))
  const segments: string[] = []

  if (matches.length > 0) {
    const prefix = normalized.slice(0, matches[0]!.index ?? 0).trim()
    if (prefix) {
      const pf = extractFiberFromText(prefix)
      if (pf) segments.push(pf.value)
    }
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]!
      const partName = m[1]!
      const start = (m.index ?? 0) + m[0].length
      const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? normalized.length) : normalized.length
      const segment = normalized.slice(start, end).trim()
      const fiber = extractFiberFromText(segment)
      if (fiber) segments.push(`${titleCase(partName.trim())}: ${fiber.value}`)
    }
  }

  if (segments.length > 1) return segments.join('; ')
  if (segments.length === 1) return segments[0]!
  return extractFiberFromText(normalized)?.value ?? null
}

function findCompositionBlock(text: string): string | null {
  if (!text) return null
  const compLabelRe = /\b(composition|material composition|materials composition|fiber content|fibre content|fabric content|materials)\b/i
  const m = text.match(compLabelRe)
  if (!m || m.index === undefined) return null
  const start = m.index + m[0].length

  const stopPattern = STOP_LABELS
    .map((l) => l.replace(/\s+/g, '\\s+').replace('&', '\\&'))
    .join('|')
  const stopRe = new RegExp(`\\b(${stopPattern})\\b`, 'i')
  const rest = text.slice(start + 5)
  const stopMatch = rest.match(stopRe)
  let end = text.length
  if (stopMatch && stopMatch.index !== undefined) {
    end = start + 5 + stopMatch.index
  }
  end = Math.min(end, start + 800)
  return text.slice(start, end).replace(/^[:\-–—\s]+/, '').trim()
}

function valueFromLabeled(raw: string): FiberMatch {
  const parsed = parseCompositionBlock(raw)
  if (parsed && /[,;:]/.test(parsed)) {
    return { value: parsed, source: 'composition' }
  }
  const inner = extractFiberFromText(raw)
  return inner ?? { value: cleanValue(raw), source: 'labeled' }
}

function validatedOrNull(match: FiberMatch | null): FiberMatch | null {
  if (!match) return null
  if (match.source === 'jsonld') return match
  return validateFiberValue(match.value) ? match : null
}

function parseListItems(list: Element): string | null {
  const items = Array.from(list.querySelectorAll(':scope > li'))
  if (items.length === 0) return null
  const segments: string[] = []
  for (const li of items) {
    const spans = Array.from(li.querySelectorAll(':scope > span, :scope > strong, :scope > b, :scope > em'))
    let label: string | undefined
    let value: string | undefined
    if (spans.length >= 2) {
      label = spans[0]!.textContent?.trim().replace(/[:：\-–—\s]+$/, '')
      value = spans.slice(1).map((s) => s.textContent?.trim() ?? '').join(' ').trim()
    } else {
      const full = li.textContent?.trim() ?? ''
      const m = full.match(/^([^:：\-–—]{2,40})[:：\-–—]\s*(.+)$/)
      if (m) { label = m[1]!.trim(); value = m[2]!.trim() }
      else { value = full }
    }
    if (!value) continue
    const fiber = extractFiberFromText(value)
    if (!fiber) continue
    if (label && PART_LABELS.some((p) => p.toLowerCase() === label!.toLowerCase())) {
      segments.push(`${titleCase(label)}: ${fiber.value}`)
    } else {
      segments.push(fiber.value)
    }
  }
  if (segments.length === 0) return null
  return segments.join('; ')
}

function parseHeadingSiblings(heading: Element): string | null {
  let sib: Element | null = heading.nextElementSibling
  for (let i = 0; i < 5 && sib; i++) {
    if (sib.tagName === 'UL' || sib.tagName === 'OL') {
      const parsed = parseListItems(sib)
      if (parsed) return parsed
    }
    const inner = sib.querySelector('ul, ol')
    if (inner) {
      const parsed = parseListItems(inner)
      if (parsed) return parsed
    }
    sib = sib.nextElementSibling
  }
  const parent = heading.parentElement
  if (parent) {
    const nested = parent.querySelector('ul, ol')
    if (nested && nested !== heading) {
      const parsed = parseListItems(nested)
      if (parsed) return parsed
    }
  }
  return null
}

function extractFromAttrRows(scope: ParentNode): FiberMatch | null {
  const valueNodes = Array.from(
    scope.querySelectorAll(
      '[class*="attr-list-textval" i], [class*="attr-value" i], [class*="AttrValue" i], [class*="attribute-value" i], [class*="attr-val" i]',
    ),
  )
  const labelSelectors =
    '[class*="attr-list-textname" i], [class*="attr-name" i], [class*="attr-list-cell" i]:not([class*="textval" i]), [class*="attr-label" i], [class*="AttrLabel" i], [class*="attribute-label" i], [class*="attr-key" i], [class*="label" i], dt, strong, b'

  const labelMatches = (raw: string): boolean => {
    const t = raw.trim().toLowerCase().replace(/[:：*\s]+$/, '')
    if (!t) return false
    return isLabelMatch(t) || isCompositionHeader(t)
  }

  for (const valEl of valueNodes) {
    let row: Element | null = valEl.closest(
      '[class*="attr-list-textli" i], [class*="attr-list-row" i], [class*="attr-row" i], [class*="attr-item" i], [class*="attr-li" i], [class*="attribute-row" i]',
    )
    if (!row) row = valEl.parentElement
    let labelText = ''
    for (let depth = 0; depth < 3 && row && !labelText; depth++) {
      const labelEl = Array.from(row.querySelectorAll(labelSelectors)).find(
        (el) => el !== valEl && !valEl.contains(el) && !el.contains(valEl) && labelMatches(el.textContent ?? ''),
      )
      if (labelEl) { labelText = labelEl.textContent ?? ''; break }
      const prev = valEl.previousElementSibling
      if (prev && labelMatches(prev.textContent ?? '')) { labelText = prev.textContent ?? ''; break }
      row = row.parentElement
    }
    if (!labelText) continue
    const raw = valEl.textContent?.trim() ?? ''
    if (!raw) continue
    const v = validatedOrNull(valueFromLabeled(raw))
    if (v) return v
  }
  return null
}

export function extractFiberFromDom(root: Element | Document = document): FiberMatch | null {
  const scope: ParentNode = root
  const bodyText = visibleText(root)

  const attrMatch = extractFromAttrRows(scope)
  if (attrMatch) return attrMatch

  const headings = Array.from(scope.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))
  for (const h of headings) {
    const txt = h.textContent ?? ''
    if (!isCompositionHeader(txt) && !isLabelMatch(txt)) continue
    const parsed = parseHeadingSiblings(h)
    if (parsed) {
      const candidate: FiberMatch = { value: parsed, source: parsed.includes(':') ? 'composition' : 'labeled' }
      const v = validatedOrNull(candidate)
      if (v) return v
    }
  }

  for (const dt of Array.from(scope.querySelectorAll('dt'))) {
    const label = dt.textContent ?? ''
    if (!isCompositionHeader(label) && !isLabelMatch(label)) continue

    const ddParts: string[] = []
    let sib = dt.nextElementSibling
    while (sib && sib.tagName !== 'DT') {
      if (sib.tagName === 'DD') ddParts.push(sib.textContent?.trim() ?? '')
      sib = sib.nextElementSibling
    }
    const combined = ddParts.join('\n').trim()
    if (combined) {
      const parsed = parseCompositionBlock(combined)
      if (parsed) {
        const candidate: FiberMatch = { value: parsed, source: parsed.includes(':') ? 'composition' : 'labeled' }
        const v = validatedOrNull(candidate)
        if (v) return v
      }
    }

    const dl = dt.closest('dl')
    if (dl) {
      const dlText = dl.textContent?.trim() ?? ''
      if (dlText) {
        const parsed = parseCompositionBlock(dlText)
        if (parsed) {
          const candidate: FiberMatch = { value: parsed, source: parsed.includes(':') ? 'composition' : 'labeled' }
          const v = validatedOrNull(candidate)
          if (v) return v
        }
      }
    }
  }

  for (const th of Array.from(scope.querySelectorAll('th'))) {
    if (!isCompositionHeader(th.textContent ?? '') && !isLabelMatch(th.textContent ?? '')) continue
    const val = th.nextElementSibling?.textContent?.trim()
      ?? th.parentElement?.querySelector('td')?.textContent?.trim()
    if (val) {
      const parsed = parseCompositionBlock(val)
      if (parsed) {
        const candidate: FiberMatch = { value: parsed, source: parsed.includes(':') ? 'composition' : 'labeled' }
        const v = validatedOrNull(candidate)
        if (v) return v
      }
    }
  }

  const block = findCompositionBlock(bodyText)
  if (block) {
    const parsed = parseCompositionBlock(block)
    if (parsed) {
      const candidate: FiberMatch = { value: parsed, source: parsed.includes(':') ? 'composition' : 'labeled' }
      const v = validatedOrNull(candidate)
      if (v) return v
    }
  }

  const hints = scope.querySelectorAll('[class*="label" i], [class*="Label" i], [data-testid*="label" i], [aria-label]')
  for (const el of Array.from(hints)) {
    const key = (el.textContent?.trim() || el.getAttribute('aria-label') || '').toLowerCase()
    if (!isLabelMatch(key) && !isCompositionHeader(key)) continue
    const sibling = el.nextElementSibling?.textContent?.trim()
    if (sibling) {
      const v = validatedOrNull(valueFromLabeled(sibling))
      if (v) return v
    }
    const parentText = el.parentElement?.textContent?.trim() ?? ''
    const remainder = parentText.replace(el.textContent ?? '', '').trim()
    if (remainder) {
      const v = validatedOrNull(valueFromLabeled(remainder))
      if (v) return v
    }
  }

  for (const lbl of LABELS) {
    const re = new RegExp(`\\b${lbl}\\b\\s*[:\\-–—]\\s*([^\\n\\r]{3,160})`, 'i')
    const m = bodyText.match(re)
    if (m?.[1]) {
      const v = validatedOrNull(valueFromLabeled(m[1]))
      if (v) return v
    }
  }

  return validatedOrNull(extractFiberFromText(bodyText))
}
