import type { ScrapedItem, SustainabilityBreakdown, FiberProfile, CarbonFootprint } from '../types/item'

const API_BASE = (import.meta.env.VITE_REWEAR_API_BASE as string | undefined) ?? ''

export async function scoreItem(item: ScrapedItem): Promise<SustainabilityBreakdown> {
  if (!API_BASE) return heuristicBreakdown(item)
  try {
    const res = await fetch(`${API_BASE}/calculate-sustainability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as Partial<SustainabilityBreakdown>
    return normalize(item, data, 'live')
  } catch {
    return heuristicBreakdown(item)
  }
}

function normalize(item: ScrapedItem, d: Partial<SustainabilityBreakdown>, source: 'live' | 'fallback'): SustainabilityBreakdown {
  const score = clamp(d.score ?? heuristicScore(item))
  return {
    score,
    grade: gradeFor(score),
    origin: d.origin ?? item.origin ?? 'Unknown',
    fiber: d.fiber ?? heuristicFiber(item),
    carbon: d.carbon ?? heuristicCarbon(item, score),
    fast_fashion_risk: d.fast_fashion_risk ?? riskFor(item.retailer),
    environmental_notes: d.environmental_notes ?? defaultNotes(item.retailer),
    price_display: d.price_display ?? formatPrice(item.price, item.currency),
    explanation: d.explanation ?? 'Estimated from retailer, material, and category heuristics.',
    source,
    generated_at: Date.now(),
  }
}

function heuristicBreakdown(item: ScrapedItem): SustainabilityBreakdown {
  const score = heuristicScore(item)
  return {
    score,
    grade: gradeFor(score),
    origin: item.origin ?? 'Unknown',
    fiber: heuristicFiber(item),
    carbon: heuristicCarbon(item, score),
    fast_fashion_risk: riskFor(item.retailer),
    environmental_notes: defaultNotes(item.retailer),
    price_display: formatPrice(item.price, item.currency),
    explanation: 'Offline estimate — live scorer unavailable. Based on retailer, material, and category.',
    source: 'fallback',
    generated_at: Date.now(),
  }
}

const SECONDHAND = ['depop', 'vinted', 'thredup', 'vestiairecollective', 'ebay', 'whatnot']
const FAST_FASHION = ['shein', 'hm', 'zara', 'asos', 'urbanoutfitters']

function heuristicScore(item: ScrapedItem): number {
  const r = item.retailer.toLowerCase()
  let base = 50
  if (SECONDHAND.some((s) => r.includes(s))) base = 78
  else if (FAST_FASHION.some((s) => r.includes(s))) base = 22
  const mat = (item.material ?? '').toLowerCase()
  if (/organic|linen|hemp|tencel|recycled|wool/.test(mat)) base += 8
  if (/polyester|nylon|acrylic/.test(mat)) base -= 8
  return clamp(base)
}

function heuristicFiber(item: ScrapedItem): FiberProfile {
  const mat = (item.material ?? '').toLowerCase()
  if (!mat) return { material: 'Unlisted', quality: 'unknown', notes: 'Material not found on product page.' }
  if (/organic cotton|linen|hemp|tencel|lyocell|wool/.test(mat)) {
    return { material: item.material!, quality: 'long-lasting', notes: 'Natural or regenerated fiber — durable and biodegradable.' }
  }
  if (/cotton|silk|cashmere/.test(mat)) {
    return { material: item.material!, quality: 'medium', notes: 'Natural fiber — durable but water-intensive to produce.' }
  }
  if (/polyester|nylon|acrylic|spandex|elastane/.test(mat)) {
    return { material: item.material!, quality: 'low-quality', notes: 'Synthetic fiber — sheds microplastics, does not biodegrade.' }
  }
  return { material: item.material!, quality: 'medium', notes: 'Blend or uncommon fiber.' }
}

function heuristicCarbon(item: ScrapedItem, score: number): CarbonFootprint {
  const r = item.retailer.toLowerCase()
  if (SECONDHAND.some((s) => r.includes(s))) {
    return { kg_co2e: 0.5, comparison: 'Saves ~10 kg CO₂ vs buying new.', confidence: 'medium' }
  }
  if (FAST_FASHION.some((s) => r.includes(s))) {
    return { kg_co2e: 15, comparison: 'Roughly 3× the impact of a secondhand equivalent.', confidence: 'medium' }
  }
  return { kg_co2e: score > 60 ? 6 : 10, comparison: 'Estimated lifecycle emissions for a mid-tier garment.', confidence: 'low' }
}

function riskFor(retailer: string): 'low' | 'medium' | 'high' {
  const r = retailer.toLowerCase()
  if (FAST_FASHION.some((s) => r.includes(s))) return 'high'
  if (SECONDHAND.some((s) => r.includes(s))) return 'low'
  return 'medium'
}

function defaultNotes(retailer: string): string {
  const r = retailer.toLowerCase()
  if (FAST_FASHION.some((s) => r.includes(s))) {
    return 'Fast-fashion retailer: high production volume, short garment lifespan, synthetic-heavy sourcing.'
  }
  if (SECONDHAND.some((s) => r.includes(s))) {
    return 'Secondhand marketplace: extending garment life is one of the highest-impact sustainability actions.'
  }
  return 'Mid-market retailer: impact varies by collection. Check for certifications or transparency reports.'
}

function formatPrice(price: number | undefined, currency: string | undefined): string {
  if (price === undefined) return '—'
  const c = currency ?? 'USD'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: c }).format(price)
  } catch {
    return `${c} ${price.toFixed(2)}`
  }
}

function gradeFor(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'F'
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}
