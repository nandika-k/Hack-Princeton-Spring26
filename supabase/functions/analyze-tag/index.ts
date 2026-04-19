// Photon AI — in-store tag scanner via iMessage/SMS
// Accepts either a clothing tag image OR brand + materials text typed from the label.
// K2-Think v2: extract brand/materials + score sustainability in one call.
// Dedalus brand audit runs in parallel to enrich certifications.
//
// Twilio MMS webhook: POST application/x-www-form-urlencoded
//   From, Body, NumMedia, MediaUrl0, MediaContentType0
// Direct API (image): POST application/json { imageUrl, phoneNumber? }
// Direct API (text):  POST application/json { brand, materialsText, phoneNumber? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// K2-Think v2 — multimodal reasoning model (vision + text)
const K2_V2_MODEL_ID = Deno.env.get('IFM_MODEL_ID') ?? 'LLM360/K2-Think-v2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const contentType = req.headers.get('content-type') ?? ''
    let phoneNumber: string | null = null
    let isTwilio = false
    let analysisResult: K2VisionResult
    let imageSourceForDb: string | null = null

    if (contentType.includes('application/x-www-form-urlencoded')) {
      isTwilio = true
      const form = await req.formData()
      phoneNumber = form.get('From') as string | null
      const numMedia = parseInt(form.get('NumMedia') as string ?? '0', 10)

      if (numMedia === 0) {
        return twilioReply('Please send a photo of the clothing tag — no image was received.')
      }

      const imageSource = form.get('MediaUrl0') as string
      if (!imageSource) {
        return twilioReply('Could not read the image. Please try again.')
      }

      imageSourceForDb = imageSource
      analysisResult = await analyzeTagWithK2Vision(imageSource)
    } else {
      const body = await req.json()
      phoneNumber = body.phoneNumber ?? null

      if (body.brand !== undefined || body.materialsText !== undefined) {
        // Text input path — user typed brand + materials from the fabric tag
        const brand = (body.brand as string | undefined) ?? 'Unknown'
        const materialsText = (body.materialsText as string | undefined) ?? ''
        analysisResult = await analyzeTagWithText(brand, materialsText)
      } else {
        // Image input path
        const imageSource: string = body.imageDataUrl ?? body.imageUrl
        if (!imageSource) {
          return new Response(
            JSON.stringify({ error: 'Provide imageUrl/imageDataUrl or brand+materialsText' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
        imageSourceForDb = imageSource.startsWith('data:') ? '[inline-upload]' : imageSource
        analysisResult = await analyzeTagWithK2Vision(imageSource)
      }
    }

    const dedalus = await fetchDedalusBrandAudit(analysisResult.brand)
    const comparison = buildComparison(analysisResult.score)

    // Persist scan (best-effort, don't await)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )
    supabase.from('tag_scans').insert({
      image_url: imageSourceForDb,
      phone_number: phoneNumber,
      extracted_brand: analysisResult.brand,
      extracted_materials: analysisResult.materials.map((m: MaterialComponent) => `${m.percentage}% ${m.name}`),
      country_of_origin: analysisResult.countryOfOrigin,
      sustainability_score: analysisResult.score,
      score_explanation: analysisResult.explanation,
    }).then(() => {}).catch(() => {})

    const extraction: TagExtraction = {
      brand: analysisResult.brand,
      materials: analysisResult.materials,
      countryOfOrigin: analysisResult.countryOfOrigin,
      careInstructions: analysisResult.careInstructions,
      rawText: analysisResult.rawText,
    }

    const smsReply = buildSmsReply({
      extraction,
      score: analysisResult.score,
      explanation: analysisResult.explanation,
      comparison,
      certifications: dedalus.certifications,
    })

    if (isTwilio) return twilioReply(smsReply)

    return new Response(JSON.stringify({
      extraction,
      score: analysisResult.score,
      explanation: analysisResult.explanation,
      reasoning: analysisResult.reasoning,
      comparison,
      certifications: dedalus.certifications,
      brandRating: dedalus.brand_rating,
      formattedReply: smsReply,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[analyze-tag] error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ─── Types ───────────────────────────────────────────────────

type MaterialComponent = { name: string; percentage: number }

type TagExtraction = {
  brand: string
  materials: MaterialComponent[]
  countryOfOrigin: string | null
  careInstructions: string[]
  rawText: string
}

type K2VisionResult = TagExtraction & {
  score: number
  explanation: string
  reasoning: string
}

// ─── K2-Think v2 vision: extract tag + score in one call ─────

const K2_SYSTEM_PROMPT = `You are a sustainable fashion expert with vision capabilities. When shown a clothing tag or care label image:

1. Extract all visible text and data from the tag
2. Score the garment's sustainability (0–100) based on materials, brand, and origin

Scoring guide:
- 70–100: Highly sustainable (recycled/organic/natural fibers, ethical brand, certifications)
- 40–69: Moderately sustainable
- 0–39: Low sustainability (virgin synthetics, fast fashion)

Material scoring signals:
- Recycled Polyester / Recycled Nylon: strong positive (+15 vs virgin equivalent)
- Organic Cotton, Tencel/Lyocell, Hemp, Linen: highly sustainable
- Conventional Cotton: moderate (water-intensive cultivation)
- Virgin Polyester, Nylon, Acrylic, Spandex: low sustainability
- Wool, Silk: moderate (natural but resource-intensive)

After your step-by-step reasoning, output exactly one JSON object on its own line:
{
  "brand": "<brand name or 'Unknown'>",
  "materials": [{"name": "<normalized fiber name>", "percentage": <0-100>}],
  "countryOfOrigin": "<country or null>",
  "careInstructions": ["<instruction>"],
  "rawText": "<all visible text on the tag>",
  "score": <0-100>,
  "explanation": "<one-sentence summary for a product card>",
  "reasoning": "<2-3 sentence detail explaining the score>"
}

Normalize fiber names: e.g. "POLY" → "Polyester", "REC. POLY" → "Recycled Polyester", "ORG. COTTON" → "Organic Cotton".
Percentages in materials must sum to 100.`

async function analyzeTagWithK2Vision(imageUrl: string): Promise<K2VisionResult> {
  const endpoint = Deno.env.get('IFM_API_URL')
  if (!endpoint) return visionFallback()

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('IFM_API_KEY') ?? 'dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: K2_V2_MODEL_ID,
        messages: [
          { role: 'system', content: K2_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              { type: 'text', text: 'Analyze this clothing tag and score its sustainability.' },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      console.warn(`[K2v2] ${res.status} — using fallback`)
      return visionFallback()
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    if (!content) return visionFallback()

    // K2-Think emits chain-of-thought before the JSON verdict — grab the last match
    const matches = content.match(/\{[\s\S]*?"score"[\s\S]*?\}/g)
    if (!matches) return visionFallback()

    const parsed = JSON.parse(matches[matches.length - 1])
    return {
      brand: parsed.brand ?? 'Unknown',
      materials: (parsed.materials ?? []) as MaterialComponent[],
      countryOfOrigin: parsed.countryOfOrigin ?? null,
      careInstructions: parsed.careInstructions ?? [],
      rawText: parsed.rawText ?? '',
      score: parsed.score ?? 50,
      explanation: parsed.explanation ?? 'Score estimated from fabric composition.',
      reasoning: parsed.reasoning ?? parsed.explanation ?? '',
    }
  } catch (err) {
    console.warn('[K2v2] error:', err)
    return visionFallback()
  }
}

function visionFallback(): K2VisionResult {
  return {
    brand: 'Unknown',
    materials: [],
    countryOfOrigin: null,
    careInstructions: [],
    rawText: '',
    score: 50,
    explanation: 'Could not analyze tag — live K2-Think v2 scoring unavailable.',
    reasoning: 'K2-Think v2 endpoint unreachable; score is a neutral fallback.',
  }
}

// ─── K2-Think v2 text: score from typed brand + materials ─────

const K2_TEXT_SYSTEM_PROMPT = `You are a sustainable fashion expert. Given a brand name and fabric composition typed from a clothing care label, score the garment's sustainability.

Scoring guide:
- 70–100: Highly sustainable (recycled/organic/natural fibers, ethical brand, certifications)
- 40–69: Moderately sustainable
- 0–39: Low sustainability (virgin synthetics, fast fashion)

Material scoring signals:
- Recycled Polyester / Recycled Nylon: strong positive (+15 vs virgin equivalent)
- Organic Cotton, Tencel/Lyocell, Hemp, Linen: highly sustainable
- Conventional Cotton: moderate (water-intensive cultivation)
- Virgin Polyester, Nylon, Acrylic, Spandex: low sustainability
- Wool, Silk: moderate (natural but resource-intensive)

Normalize fiber names: e.g. "POLY" → "Polyester", "REC. POLY" → "Recycled Polyester", "ORG. COTTON" → "Organic Cotton".
Percentages in materials must sum to 100.

After your step-by-step reasoning, output exactly one JSON object on its own line:
{
  "brand": "<brand name or 'Unknown'>",
  "materials": [{"name": "<normalized fiber name>", "percentage": <0-100>}],
  "score": <0-100>,
  "explanation": "<one-sentence summary for a product card>",
  "reasoning": "<2-3 sentence detail explaining the score>"
}`

async function analyzeTagWithText(brand: string, materialsText: string): Promise<K2VisionResult> {
  const endpoint = Deno.env.get('IFM_API_URL')
  if (!endpoint) return textFallback(brand, materialsText)

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('IFM_API_KEY') ?? 'dummy'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: K2_V2_MODEL_ID,
        messages: [
          { role: 'system', content: K2_TEXT_SYSTEM_PROMPT },
          { role: 'user', content: `Brand: ${brand}\nMaterials: ${materialsText}` },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      console.warn(`[K2v2-text] ${res.status} — using fallback`)
      return textFallback(brand, materialsText)
    }

    const data = await res.json()
    const content: string = data.choices?.[0]?.message?.content ?? ''
    if (!content) return textFallback(brand, materialsText)

    const matches = content.match(/\{[\s\S]*?"score"[\s\S]*?\}/g)
    if (!matches) return textFallback(brand, materialsText)

    const parsed = JSON.parse(matches[matches.length - 1])
    return {
      brand: parsed.brand ?? brand,
      materials: (parsed.materials ?? parseMaterialsText(materialsText)) as MaterialComponent[],
      countryOfOrigin: null,
      careInstructions: [],
      rawText: materialsText,
      score: parsed.score ?? 50,
      explanation: parsed.explanation ?? 'Score estimated from fabric composition.',
      reasoning: parsed.reasoning ?? parsed.explanation ?? '',
    }
  } catch (err) {
    console.warn('[K2v2-text] error:', err)
    return textFallback(brand, materialsText)
  }
}

function parseMaterialsText(text: string): MaterialComponent[] {
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%\s*([A-Za-z][A-Za-z\s]*)/g)]
  return matches.map((m) => ({ percentage: parseFloat(m[1]), name: m[2].trim() }))
}

function textFallback(brand: string, materialsText: string): K2VisionResult {
  return {
    brand: brand || 'Unknown',
    materials: parseMaterialsText(materialsText),
    countryOfOrigin: null,
    careInstructions: [],
    rawText: materialsText,
    score: 50,
    explanation: 'Score estimated from fabric composition.',
    reasoning: 'Text-based scoring — live K2-Think v2 unavailable; neutral fallback applied.',
  }
}

// ─── Dedalus Labs — brand audit (certifications) ─────────────

type DedalusResult = { brand_rating: string; certifications: string[]; notes: string }

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

function buildSmsReply(input: {
  extraction: TagExtraction
  score: number
  explanation: string
  comparison: string
  certifications: string[]
}): string {
  const { extraction, score, explanation, comparison, certifications } = input
  const scoreEmoji = score >= 70 ? '🌿' : score >= 40 ? '🟡' : '🔴'
  const materialsLine = extraction.materials.length > 0
    ? extraction.materials.map((m) => `${m.percentage}% ${m.name}`).join(', ')
    : 'Unknown'

  const lines = [
    `${scoreEmoji} Sustainability Score: ${score}/100`,
    `Brand: ${extraction.brand}`,
    `Materials: ${materialsLine}`,
  ]
  if (extraction.countryOfOrigin) lines.push(`Made in: ${extraction.countryOfOrigin}`)
  lines.push('', explanation, comparison)
  if (certifications.length > 0) lines.push(`Certs: ${certifications.join(', ')}`)
  lines.push('', 'Powered by Photon AI')
  return lines.join('\n')
}

function twilioReply(message: string): Response {
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { headers: { 'Content-Type': 'text/xml' } },
  )
}
