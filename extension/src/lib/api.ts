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
    environmental_notes: d.environmental_notes ?? defaultNotes(item.retailer, item.brand),
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
    environmental_notes: defaultNotes(item.retailer, item.brand),
    price_display: formatPrice(item.price, item.currency),
    explanation: 'Offline estimate — live scorer unavailable. Based on retailer, material, and category.',
    source: 'fallback',
    generated_at: Date.now(),
  }
}

const SECONDHAND = ['depop', 'vinted', 'thredup', 'vestiairecollective', 'ebay', 'whatnot', 'poshmark', 'therealreal']

const ULTRA_FAST = [
  'shein', 'temu', 'romwe', 'zaful', 'cider', 'yesstyle',
  'boohoo', 'prettylittlething', 'nastygal', 'fashionnova', 'missguided',
]

const FAST_FASHION = [
  'hm.com', 'h&m', 'zara', 'mango', 'bershka', 'pullandbear', 'stradivarius',
  'uniqlo', 'forever21', 'primark',
]

const MALL = [
  'gap', 'oldnavy', 'bananarepublic', 'asos', 'urbanoutfitters', 'anthropologie',
  'freepeople', 'nordstrom', 'macys', 'revolve', 'amazon', 'target', 'walmart',
  'ae.com', 'americaneagle', 'aerie', 'quince',
]

const DURABLE = ['barbour', 'patagonia', 'filson', 'arcteryx', 'arc\'teryx']

type Tier = 'secondhand' | 'luxury' | 'durable' | 'mall' | 'fast' | 'ultrafast' | 'unknown'
type BrandTier = Exclude<Tier, 'secondhand' | 'unknown'>

const ULTRA_FAST_BRANDS = [
  'shein', 'temu', 'romwe', 'zaful', 'cider', 'yesstyle', 'boohoo',
  'prettylittlething', 'nasty gal', 'nastygal', 'fashion nova', 'fashionnova',
  'missguided', 'halara', 'zaful',
]
const FAST_BRANDS = [
  'h&m', 'hm', 'zara', 'mango', 'bershka', 'pull&bear', 'pull and bear',
  'stradivarius', 'uniqlo', 'forever 21', 'forever21', 'primark', 'shein',
]
const MALL_BRANDS = [
  'gap', 'old navy', 'banana republic', 'abercrombie', 'abercrombie & fitch',
  'hollister', 'american eagle', 'aerie', 'urban outfitters', 'anthropologie',
  'free people', 'j.crew', 'j crew', 'madewell', 'lululemon', 'nike', 'adidas',
  'puma', 'under armour', 'north face', 'the north face', 'columbia',
  'calvin klein', 'tommy hilfiger', 'ralph lauren', 'polo ralph lauren',
  'ted baker', 'reformation', 'everlane', 'cos', 'arket', 'weekday',
]
const DURABLE_BRANDS = [
  'barbour', 'patagonia', 'filson', 'arcteryx', 'arc\'teryx', 'carhartt',
  'levi\'s', 'levis', 'levi strauss', 'dr. martens', 'dr martens', 'doc martens',
  'birkenstock', 'red wing', 'wrangler', 'dickies', 'pendleton', 'l.l.bean',
  'll bean', 'orvis',
]
const LUXURY_BRANDS = [
  'gucci', 'prada', 'louis vuitton', 'hermes', 'hermès', 'chanel', 'burberry',
  'dior', 'saint laurent', 'ysl', 'celine', 'céline', 'loewe', 'bottega veneta',
  'the row', 'balenciaga', 'valentino', 'givenchy', 'fendi', 'miu miu',
  'versace', 'alexander mcqueen', 'stella mccartney', 'jil sander', 'lemaire',
  'acne studios', 'isabel marant', 'ganni', 'max mara', 'tom ford',
]

function brandMatches(brand: string, aliases: string[]): boolean {
  const b = brand.toLowerCase()
  return aliases.some((a) => {
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(b)
  })
}

function brandTier(brand: string | undefined): BrandTier | null {
  if (!brand) return null
  if (brandMatches(brand, ULTRA_FAST_BRANDS)) return 'ultrafast'
  if (brandMatches(brand, FAST_BRANDS)) return 'fast'
  if (brandMatches(brand, MALL_BRANDS)) return 'mall'
  if (brandMatches(brand, DURABLE_BRANDS)) return 'durable'
  if (brandMatches(brand, LUXURY_BRANDS)) return 'luxury'
  return null
}

function retailerTier(retailer: string): Tier {
  const r = retailer.toLowerCase()
  if (SECONDHAND.some((s) => r.includes(s))) return 'secondhand'
  if (DURABLE.some((s) => r.includes(s))) return 'durable'
  if (ULTRA_FAST.some((s) => r.includes(s))) return 'ultrafast'
  if (FAST_FASHION.some((s) => r.includes(s))) return 'fast'
  if (MALL.some((s) => r.includes(s))) return 'mall'
  return 'unknown'
}

function heuristicScore(item: ScrapedItem): number {
  const tier = retailerTier(item.retailer)
  const bTier = brandTier(item.brand)
  let base: number
  if (tier === 'secondhand') {
    switch (bTier) {
      case 'ultrafast': base = 52; break
      case 'fast': base = 66; break
      case 'mall': base = 74; break
      case 'durable': base = 86; break
      case 'luxury': base = 88; break
      default: base = 78
    }
  } else {
    switch (tier) {
      case 'durable': base = 55; break
      case 'mall': base = 40; break
      case 'fast': base = 25; break
      case 'ultrafast': base = 10; break
      default: base = 50
    }
  }
  const mat = (item.material ?? '').toLowerCase()
  if (/organic|linen|hemp|tencel|lyocell|recycled|wool/.test(mat)) base += 8
  if (/polyester|nylon|acrylic/.test(mat)) base -= 8
  if (/100%\s*polyester|100%\s*nylon|100%\s*acrylic/.test(mat)) base -= 4
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
  const tier = retailerTier(item.retailer)
  if (tier === 'secondhand') {
    return { kg_co2e: 0.5, comparison: 'Saves ~10 kg CO₂ vs buying new.', confidence: 'medium' }
  }
  if (tier === 'durable') {
    return { kg_co2e: 8, comparison: 'Per-wear footprint is low — heritage pieces with repair programs often last 20+ years.', confidence: 'medium' }
  }
  if (tier === 'ultrafast') {
    return { kg_co2e: 22, comparison: 'Roughly 4–5× the footprint of a secondhand equivalent; ultra-fast drops ship globally in tiny air-freighted parcels.', confidence: 'medium' }
  }
  if (tier === 'fast') {
    return { kg_co2e: 14, comparison: 'Roughly 3× the footprint of a secondhand equivalent.', confidence: 'medium' }
  }
  if (tier === 'mall') {
    return { kg_co2e: 10, comparison: 'Typical mid-market garment — ~2× a secondhand equivalent.', confidence: 'low' }
  }
  return { kg_co2e: score > 60 ? 6 : 10, comparison: 'Estimated lifecycle emissions for a mid-tier garment.', confidence: 'low' }
}

function riskFor(retailer: string): 'low' | 'medium' | 'high' {
  const tier = retailerTier(retailer)
  if (tier === 'ultrafast' || tier === 'fast') return 'high'
  if (tier === 'secondhand' || tier === 'durable') return 'low'
  return 'medium'
}

function defaultNotes(retailer: string, brand?: string): string {
  const tier = retailerTier(retailer)
  if (tier === 'secondhand') {
    const bt = brandTier(brand)
    if (bt === 'ultrafast') {
      return `Secondhand ${brand} — still the best choice vs buying it new, but the underlying garment is ultra-fast fashion: synthetic, short-lifespan, built to be replaced.`
    }
    if (bt === 'fast') {
      return `Secondhand ${brand} — fast-fashion origin means construction quality is middling; resale meaningfully extends its life.`
    }
    if (bt === 'mall') {
      return `Secondhand ${brand} — mainstream mid-market brand; decent build quality and a clear lifecycle extension.`
    }
    if (bt === 'durable') {
      return `Secondhand ${brand} — heritage / durable-goods brand built to last; resale is an excellent sustainability choice.`
    }
    if (bt === 'luxury') {
      return `Secondhand ${brand} — luxury garments are typically well-constructed and often re-wearable for decades.`
    }
    return 'Secondhand marketplace: extending garment life is one of the highest-impact sustainability actions.'
  }
  if (tier === 'ultrafast') {
    return 'Ultra-fast fashion: thousands of new SKUs per day, near-zero supply-chain transparency, synthetic-heavy, persistent labor and environmental-compliance concerns.'
  }
  if (tier === 'fast') {
    return 'Fast-fashion retailer: high volume and short lifespans, but publishes supplier lists and has science-based climate targets — better disclosure than ultra-fast peers.'
  }
  if (tier === 'mall') {
    return 'Mid-market retailer: impact varies by collection. Check for certifications, recycled-content claims, or transparency reports.'
  }
  if (tier === 'durable') {
    return 'Heritage / durable-goods brand: documented repair programs and long garment lifespans dramatically lower per-wear footprint.'
  }
  return 'Retailer not classified. Score reflects material and origin signals only.'
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
