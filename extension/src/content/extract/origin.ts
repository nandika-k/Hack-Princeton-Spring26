import { normalizeCountry } from './countries'
import { visibleText } from './visible-text'

const COUNTRY_WORD = '[A-Za-zÀ-ž\\.\\-\\s,]{2,60}'

const ORIGIN_LABEL_RE = new RegExp(
  `(?:country\\s*of\\s*origin|country|origin|made\\s*in|imported\\s*from|manufactured\\s*in)\\s*[:\\-–—]?\\s*(${COUNTRY_WORD})`,
  'i',
)

const MADE_IN_RE = new RegExp(`made\\s+in\\s+(${COUNTRY_WORD})`, 'i')

const LABELS = ['country of origin', 'origin', 'made in', 'imported from', 'manufactured in', 'country']

function isLabelMatch(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[:*\s]+$/, '')
  return LABELS.some((l) => t === l || t.startsWith(l + ':') || t === l + ':')
}

export function extractOriginFromDom(root: Element | Document = document): string | null {
  const scope: ParentNode = root

  for (const dt of Array.from(scope.querySelectorAll('dt'))) {
    if (!isLabelMatch(dt.textContent ?? '')) continue
    const val = dt.nextElementSibling?.textContent?.trim()
    const country = val ? normalizeCountry(val) : null
    if (country) return country
  }
  for (const th of Array.from(scope.querySelectorAll('th'))) {
    if (!isLabelMatch(th.textContent ?? '')) continue
    const val = th.nextElementSibling?.textContent?.trim()
      ?? th.parentElement?.querySelector('td')?.textContent?.trim()
    const country = val ? normalizeCountry(val) : null
    if (country) return country
  }

  const text = visibleText(root)
  const m1 = text.match(ORIGIN_LABEL_RE)
  if (m1?.[1]) {
    const country = normalizeCountry(m1[1])
    if (country) return country
  }
  const m2 = text.match(MADE_IN_RE)
  if (m2?.[1]) {
    const country = normalizeCountry(m2[1])
    if (country) return country
  }
  return null
}
