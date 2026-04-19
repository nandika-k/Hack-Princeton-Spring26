// Photon AI — text-based brand + fabric sustainability scorer
// User texts brand + fabric composition; returns a sustainability score.
// No image required. Works via iMessage / SMS through Spectrum-TS / Photon Pro.
//
// POST application/json { text: string, phoneNumber?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const K2_MODEL_ID = Deno.env.get('IFM_MODEL_ID') ?? 'LLM360/K2-Think'

// ─── Known brands for prefix detection ───────────────────────

const KNOWN_BRANDS = [
  'patagonia', 'h&m', 'hm', 'zara', 'nike', 'adidas', 'uniqlo', 'gap', 'old navy',
  "levi's", 'levis', 'levi', 'ralph lauren', 'calvin klein', 'tommy hilfiger',
  'puma', 'reebok', 'north face', 'columbia', 'arcteryx', "arc'teryx",
  'everlane', 'reformation', 'eileen fisher', 'tentree', 'allbirds',
  'madewell', 'j.crew', 'jcrew', 'banana republic', 'forever 21', 'forever21',
  'shein', 'primark', 'urban outfitters', 'free people', 'asos',
  'vuori', 'lululemon', 'athleta', 'under armour', 'champion', 'carhartt',
  'wrangler', 'lee', 'dickies',
]

// ─── Types ───────────────────────────────────────────────────

type MaterialComponent = { name: string; percentage: number }
type ParsedQuery = { brand: string; materials: MaterialComponent[] }
type DedalusResult = { brand_rating: string; certifications: string[]; notes: string }

type TextScoreResult = {
  score: number
  explanation: string
  reasoning: string
}

// ─── Fiber normalization ──────────────────────────────────────

const FIBER_ALIASES: Record<string, string> = {
  'poly': 'Polyester',
  'rec. poly': 'Recycled Polyester',
  'recycled poly': 'Recycled Polyester',
  'recycled polyester': 'Recycled Polyester',
  'rec. nylon': 'Recycled Nylon',
  'recycled nylon': 'Recycled Nylon',
  'org. cotton': 'Organic Cotton',
  'organic cotton': 'Organic Cotton',
  'cotton': 'Cotton',
  'polyester': 'Polyester',
  'nylon': 'Nylon',
  'wool': 'Wool',
  'silk': 'Silk',
  'linen': 'Linen',
  'hemp': 'Hemp',
  'lyocell': 'Lyocell',
  'tencel': 'Tencel',
  'spandex': 'Spandex',
  'elastane': 'Spandex',
  'acrylic': 'Acrylic',
  'viscose': 'Viscose',
  'rayon': 'Rayon',
  'cashmere': 'Cashmere',
}

// Sorted longest-first so "recycled polyester" matches before "poly" / "polyester"
const FIBER_KEYWORDS = Object.keys(FIBER_ALIASES).sort((a, b) => b.length - a.length)

function normalizeFiber(raw: string): string {
  const lower = raw.trim().toLowerCase()
  return FIBER_ALIASES[lower] ?? (raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase())
}

// ─── Material parser ─────────────────────────────────────────

function parseMaterials(text: string): MaterialComponent[] {
  const results: MaterialComponent[] = []
  const regex = /(\d+)\s*%\s*([a-z][a-z\s\-.]*)/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const pct = parseInt(match[1], 10)
    const name = normalizeFiber(match[2].trim())
    if (pct > 0 && pct <= 100) results.push({ name, percentage: pct })
  }

  if (results.length > 0) return results

  // No percentages — look for naked fiber keyword
  const lower = text.toLowerCase()
  for (const keyword of FIBER_KEYWORDS) {
    if (lower.includes(keyword)) {
      return [{ name: normalizeFiber(keyword), percentage: 100 }]
    }
  }

  return []
}

// ─── Brand display names ──────────────────────────────────────

const BRAND_DISPLAY: Record<string, string> = {
  'h&m': 'H&M', 'hm': 'H&M',
  "levi's": "Levi's", 'levis': "Levi's", 'levi': "Levi's",
  'j.crew': 'J.Crew', 'jcrew': 'J.Crew',
  'north face': 'The North Face',
  'arcteryx': "Arc'teryx", "arc'teryx": "Arc'teryx",
  'old navy': 'Old Navy',
  'ralph lauren': 'Ralph Lauren',
  'calvin klein': 'Calvin Klein',
  'tommy hilfiger': 'Tommy Hilfiger',
  'under armour': 'Under Armour',
  'free people': 'Free People',
  'urban outfitters': 'Urban Outfitters',
  'banana republic': 'Banana Republic',
  'forever 21': 'Forever 21', 'forever21': 'Forever 21',
  'eileen fisher': 'Eileen Fisher',
}

function displayBrand(raw: string): string {
  const lower = raw.toLowerCase()
  return BRAND_DISPLAY[lower]
    ?? raw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// ─── Query parser ─────────────────────────────────────────────

function parseTextQuery(raw: string): ParsedQuery | null {
  const trimmed = raw.trim()

  // Stage 1: labeled format — "brand: X fabric: Y"
  const labeledMatch = trimmed.match(/brand\s*:\s*(.+?)(?:,\s*)?(?:fabric|material)\s*:\s*(.+)/i)
  if (labeledMatch) {
    const brand = labeledMatch[1].trim()
    const materials = parseMaterials(labeledMatch[2])
    if (brand) return { brand, materials }
  }

  // Stage 1b: brand-only label — "brand: X [optional fabric]"
  // Capture remainder after "brand:", then find where materials start.
  const brandLabelMatch = trimmed.match(/^brand\s*:\s*/i)
  if (brandLabelMatch) {
    const remainder = trimmed.slice(brandLabelMatch[0].length).trim()
    const materials = parseMaterials(remainder)
    // Brand ends at the first percentage sign or the first fiber keyword
    const pctIdx = remainder.search(/\d+\s*%/)
    if (pctIdx > 0) {
      const brand = remainder.slice(0, pctIdx).replace(/[,\s]+$/, '').trim() || 'Unknown'
      return { brand, materials }
    }
    const lowerR = remainder.toLowerCase()
    let fiberStart = remainder.length
    for (const kw of FIBER_KEYWORDS) {
      const idx = lowerR.indexOf(kw)
      if (idx !== -1 && idx < fiberStart) fiberStart = idx
    }
    if (fiberStart < remainder.length && fiberStart > 0) {
      const brand = remainder.slice(0, fiberStart).replace(/[,\s]+$/, '').trim() || 'Unknown'
      return { brand, materials }
    }
    return { brand: remainder, materials }
  }

  // Stage 2: comma split — "Patagonia, 100% recycled polyester"
  const commaIdx = trimmed.indexOf(',')
  if (commaIdx !== -1) {
    const beforeComma = trimmed.slice(0, commaIdx).trim()
    const afterComma = trimmed.slice(commaIdx + 1).trim()
    const wordCount = beforeComma.split(/\s+/).length
    const hasPercent = /\d+%/.test(beforeComma)
    if (wordCount <= 4 && !hasPercent) {
      const materials = parseMaterials(afterComma)
      return { brand: beforeComma, materials }
    }
  }

  // Stage 3: known-brand prefix
  const lower = trimmed.toLowerCase()
  for (const brand of KNOWN_BRANDS) {
    if (lower.startsWith(brand)) {
      const remainder = trimmed.slice(brand.length).trim().replace(/^[,\s]+/, '')
      const materials = parseMaterials(remainder)
      return { brand: displayBrand(brand), materials }
    }
  }

  // Stage 4: fiber-only (no brand)
  const materials = parseMaterials(trimmed)
  if (materials.length > 0) return { brand: 'Unknown', materials }

  return null
}

// ─── Heuristic scorer (no API) ────────────────────────────────

const MATERIAL_SCORES: Record<string, number> = {
  'Recycled Polyester': 75,
  'Recycled Nylon': 73,
  'Organic Cotton': 72,
  'Tencel': 70,
  'Lyocell': 70,
  'Hemp': 78,
  'Linen': 74,
  'Cotton': 52,
  'Wool': 48,
  'Silk': 45,
  'Cashmere': 42,
  'Polyester': 28,
  'Nylon': 26,
  'Acrylic': 22,
  'Spandex': 25,
  'Viscose': 38,
  'Rayon': 38,
}

function heuristicScore(materials: MaterialComponent[]): number {
  if (materials.length === 0) return 40
  let total = 0
  let covered = 0
  for (const m of materials) {
    const score = MATERIAL_SCORES[m.name] ?? 40
    total += score * m.percentage
    covered += m.percentage
  }
  return Math.min(100, Math.max(0, Math.round(total / Math.max(covered, 1))))
}

// ─── K2-Think text scorer ────────────────────────────────────

const K2_SYSTEM_PROMPT = `You are a sustainable fashion expert. Given a brand name and fabric composition, score the garment's sustainability (0-100).

Scoring guide:
- 70-100: Highly sustainable (recycled/organic/natural fibers, ethical brand, certifications)
- 40-69: Moderately sustainable
- 0-39: Low sustainability (virgin synthetics, fast fashion)

Material scoring signals:
- Recycled Polyester / Recycled Nylon: strong positive
- Organic Cotton, Tencel/Lyocell, Hemp, Linen: highly sustainable
- Conventional Cotton: moderate (water-intensive)
- Virgin Polyester, Nylon, Acrylic, Spandex: low sustainability
- Wool, Silk: moderate (natural but resource-intensive)

After your reasoning, output exactly one JSON object:
{"score": <0-100>, "explanation": "<one-sentence summary>", "reasoning": "<2-3 sentence detail>"}`

async function scoreFromText(parsed: ParsedQuery): Promise<TextScoreResult> {
  const endpoint = Deno.env.get('IFM_API_URL')
  if (!endpoint) {
    const score = heuristicScore(parsed.materials)
    return { score, explanation: 'Score estimated from fabric composition.', reasoning: 'K2-Think endpoint not configured; heuristic score applied.' }
  }

  const userPrompt = `Brand: ${parsed.brand}\nMaterials: ${
    parsed.materials.length > 0
      ? parsed.materials.map(m => `${m.percentage}% ${m.name}`).join(', ')
      : 'Unknown'
  }`

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('IFM_API_KEY') ?? 'dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: K2_MODEL_ID,
        messages: [
          { role: 'system', content: K2_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      console.warn(`[K2] ${res.status} — using heuristic`)
      const score = heuristicScore(parsed.materials)
      return { score, explanation: 'Score estimated from fabric composition.', reasoning: 'K2-Think unavailable; heuristic applied.' }
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    const matches = content.match(/\{[\s\S]*?"score"[\s\S]*?\}/g)
    if (!matches) {
      const score = heuristicScore(parsed.materials)
      return { score, explanation: 'Score estimated from fabric composition.', reasoning: 'Could not parse K2-Think response; heuristic applied.' }
    }

    const parsed2 = JSON.parse(matches[matches.length - 1])
    return {
      score: parsed2.score ?? heuristicScore(parsed.materials),
      explanation: parsed2.explanation ?? 'Score based on material composition.',
      reasoning: parsed2.reasoning ?? '',
    }
  } catch (err) {
    console.warn('[K2] error:', err)
    const score = heuristicScore(parsed.materials)
    return { score, explanation: 'Score estimated from fabric composition.', reasoning: 'K2-Think error; heuristic applied.' }
  }
}

// ─── Dedalus brand audit ──────────────────────────────────────

async function fetchDedalusBrandAudit(brand: string): Promise<DedalusResult> {
  const fallback: DedalusResult = { brand_rating: 'unknown', certifications: [], notes: '' }
  if (brand === 'Unknown') return fallback

  try {
    const res = await fetch('https://api.dedaluslabs.ai/v1/audit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('DEDALUS_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ brand, sources: ['goodonyou.eco', 'bcorporation.net', 'fairlabor.org'] }),
    })
    if (!res.ok) return fallback
    return await res.json()
  } catch {
    return fallback
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function buildComparison(score: number): string {
  if (score >= 70) return `saves ~${Math.round(score * 0.3)} kg CO₂ vs buying new`
  if (score >= 40) return `saves ~${Math.round(score * 0.15)} kg CO₂ vs buying new`
  return 'minimal CO₂ savings vs buying new'
}

function buildTextReply(
  brand: string,
  materials: MaterialComponent[],
  score: number,
  explanation: string,
  comparison: string,
  certifications: string[],
): string {
  const scoreEmoji = score >= 70 ? '🌿' : score >= 40 ? '🟡' : '🔴'
  const materialsLine = materials.length > 0
    ? materials.map(m => `${m.percentage}% ${m.name}`).join(', ')
    : 'Unknown'

  const lines = [
    `${scoreEmoji} Sustainability Score: ${score}/100`,
    `Brand: ${brand}`,
    `Materials: ${materialsLine}`,
    '',
    explanation,
    comparison,
  ]
  if (certifications.length > 0) lines.push(`Certs: ${certifications.join(', ')}`)
  lines.push('', 'Powered by Photon AI')
  return lines.join('\n')
}

const HELP_TEXT = `Sorry, I couldn't identify a brand or fabric from that message.

Try formats like:
  • Patagonia, 100% recycled polyester
  • brand: H&M fabric: 50% cotton 50% polyester
  • Zara polyester`

// ─── Entry point ──────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const rawText: string = (body.text ?? body.query ?? '').trim()
    const phoneNumber: string | null = body.phoneNumber ?? null

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: 'text is required', formattedReply: HELP_TEXT }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const parsed = parseTextQuery(rawText)

    if (!parsed) {
      return new Response(
        JSON.stringify({ formattedReply: HELP_TEXT }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const [k2Result, dedalus] = await Promise.all([
      scoreFromText(parsed),
      fetchDedalusBrandAudit(parsed.brand),
    ])

    const comparison = buildComparison(k2Result.score)
    const formattedReply = buildTextReply(
      parsed.brand,
      parsed.materials,
      k2Result.score,
      k2Result.explanation,
      comparison,
      dedalus.certifications,
    )

    // Persist scan (best-effort)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )
    supabase.from('tag_scans').insert({
      image_url: 'text-query',
      phone_number: phoneNumber,
      extracted_brand: parsed.brand,
      extracted_materials: parsed.materials.map(m => `${m.percentage}% ${m.name}`),
      sustainability_score: k2Result.score,
      score_explanation: k2Result.explanation,
    }).then(() => {}).catch(() => {})

    return new Response(JSON.stringify({
      extraction: { brand: parsed.brand, materials: parsed.materials },
      score: k2Result.score,
      explanation: k2Result.explanation,
      reasoning: k2Result.reasoning,
      comparison,
      certifications: dedalus.certifications,
      brandRating: dedalus.brand_rating,
      formattedReply,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[analyze-text] error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
