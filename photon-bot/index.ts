// Photon AI iMessage bot via Spectrum-TS.
// Accepts clothing tag photos OR typed brand + fabric composition.
// Smart text detection: routes based on what info is in the first message —
//   all info → analyze immediately
//   partial info → ask for what's missing
//   no info → guided brand → materials flow

import { Spectrum, text } from 'spectrum-ts'
import { imessage } from 'spectrum-ts/providers/imessage'

const PHOTON_PROJECT_ID = process.env.PHOTON_PROJECT_ID!
const PHOTON_PROJECT_SECRET = process.env.PHOTON_PROJECT_SECRET!
const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

if (!PHOTON_PROJECT_ID || !PHOTON_PROJECT_SECRET) {
  throw new Error('PHOTON_PROJECT_ID and PHOTON_PROJECT_SECRET are required')
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
}

const app = await Spectrum({
  projectId: PHOTON_PROJECT_ID,
  projectSecret: PHOTON_PROJECT_SECRET,
  providers: [imessage.config({ mode: 'cloud' })],
})

console.log('[Photon] Bot online - listening for iMessages...')

// ─── Conversation state ───────────────────────────────────────

type ConversationState =
  | { step: 'awaiting_brand'; materialsText?: string }  // may already have materials
  | { step: 'awaiting_materials'; brand: string }

const conversations = new Map<string, ConversationState>()

// ─── Constants ───────────────────────────────────────────────

const FIBER_KEYWORDS = [
  'cotton', 'polyester', 'nylon', 'wool', 'silk', 'linen', 'rayon',
  'viscose', 'acrylic', 'spandex', 'elastane', 'lycra', 'tencel',
  'lyocell', 'hemp', 'bamboo', 'modal', 'cashmere', 'fleece',
  'recycled', 'organic', 'poly',
]

const STOP_WORDS = new Set([
  'hi', 'hello', 'hey', 'yo', 'help', 'scan', 'check', 'analyze',
  'start', 'this', 'for', 'me', 'please', 'want', 'need', 'can',
  'you', 'the', 'a', 'and', 'or', 'is', 'it', 'what', 'how',
])

const HELP_MESSAGE =
  'Photon AI - Sustainability Scanner\n\n' +
  'Options:\n' +
  '• Send a photo of any clothing tag\n' +
  '• Type the brand + fabric composition in one message\n' +
  '  e.g. "Nike, 60% Cotton 40% Polyester"\n' +
  '• Or just send the brand or materials and I\'ll ask for the rest\n\n' +
  'Score 70+: Highly sustainable\n' +
  'Score 40-69: Moderate\n' +
  'Score below 40: Low sustainability'

const ASK_BRAND = 'What brand is on the garment?'
const ASK_MATERIALS = 'What materials are listed on the fabric tag?\n\nExample: "60% Cotton, 40% Polyester"'

// ─── Message loop ─────────────────────────────────────────────

for await (const [space, message] of app.messages) {
  const content = message.content
  const senderId = message.sender.id

  if (content.type === 'attachment' && content.mimeType?.startsWith('image/')) {
    conversations.delete(senderId)

    await space.responding(async () => {
      try {
        const imageDataUrl = await attachmentToDataUrl(content)
        const result = await callAnalyzeTag({ imageDataUrl, phoneNumber: senderId })
        await sendText(space, result.formattedReply)
      } catch (err) {
        console.error('[Bot] analyze-tag error:', err)
        await sendText(space, "Couldn't read that tag. Try a clearer, well-lit photo of the label.")
      }
    })

    continue
  }

  if (content.type === 'text') {
    const body = content.text?.trim() ?? ''
    const state = conversations.get(senderId)

    // ── In-progress: waiting for brand ──
    if (state?.step === 'awaiting_brand') {
      if (!body) {
        await sendText(space, ASK_BRAND)
        continue
      }
      const brand = body.trim()
      if (state.materialsText) {
        // Already have materials from first message — analyze now
        conversations.delete(senderId)
        await runAnalysis(space, senderId, brand, state.materialsText)
      } else {
        conversations.set(senderId, { step: 'awaiting_materials', brand })
        await sendText(space, `Got it: "${brand}"\n\n${ASK_MATERIALS}`)
      }
      continue
    }

    // ── In-progress: waiting for materials ──
    if (state?.step === 'awaiting_materials') {
      if (!body) {
        await sendText(space, ASK_MATERIALS)
        continue
      }
      const { brand } = state
      conversations.delete(senderId)
      await runAnalysis(space, senderId, brand, body)
      continue
    }

    // ── No active state — smart parse of first message ──

    if (isGreeting(body)) {
      await sendText(space, HELP_MESSAGE)
      continue
    }

    const { brand, materialsText } = parseFirstMessage(body)

    if (brand && materialsText) {
      // All info provided — analyze immediately
      await runAnalysis(space, senderId, brand, materialsText)
    } else if (brand && !materialsText) {
      // Brand only — ask for materials
      conversations.set(senderId, { step: 'awaiting_materials', brand })
      await sendText(space, `Got it: "${brand}"\n\n${ASK_MATERIALS}`)
    } else if (!brand && materialsText) {
      // Materials only — ask for brand
      conversations.set(senderId, { step: 'awaiting_brand', materialsText })
      await sendText(space, ASK_BRAND)
    } else {
      // No recognizable info — start from scratch
      conversations.set(senderId, { step: 'awaiting_brand' })
      await sendText(space, ASK_BRAND)
    }
  }
}

// ─── Detection helpers ────────────────────────────────────────

function containsMaterialInfo(body: string): boolean {
  const lower = body.toLowerCase()
  return /\d+\s*(%|percent)/i.test(lower) || FIBER_KEYWORDS.some((k) => lower.includes(k))
}

function isGreeting(body: string): boolean {
  if (!body) return true
  const words = body.toLowerCase().trim().split(/\s+/)
  return words.every((w) => ['hi', 'hello', 'hey', 'yo', 'help'].includes(w))
}

// Returns whatever brand + material info can be extracted from a single message.
// Brand is identified as 1–3 non-stop words remaining after stripping fiber patterns.
function parseFirstMessage(body: string): { brand: string | null; materialsText: string | null } {
  const hasMaterials = containsMaterialInfo(body)
  let brand: string | null = null

  if (hasMaterials) {
    // Strip percentage+fiber patterns to isolate any brand text
    const stripped = body
      .replace(/\d+(?:\.\d+)?\s*%\s*[A-Za-z][A-Za-z\s]*/g, '')
      .replace(new RegExp(`\\b(${FIBER_KEYWORDS.join('|')})\\b`, 'gi'), '')
      .replace(/[,;:\/\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const words = stripped.split(/\s+/).filter((w) => w && !STOP_WORDS.has(w.toLowerCase()))
    if (words.length >= 1 && words.length <= 3) {
      brand = words.join(' ')
    }
  } else {
    // No material info — short non-stop-word text is likely a brand name
    const words = body.trim().split(/\s+/)
    const meaningful = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()))
    if (meaningful.length >= 1 && meaningful.length <= 3 && !body.includes('?')) {
      brand = body.trim()
    }
  }

  return { brand, materialsText: hasMaterials ? body : null }
}

// ─── Analysis ─────────────────────────────────────────────────

async function runAnalysis(
  space: { send: (...content: ReturnType<typeof text>[]) => Promise<void> },
  phoneNumber: string,
  brand: string,
  materialsText: string,
) {
  await space.responding(async () => {
    try {
      const result = await callAnalyzeTag({ brand, materialsText, phoneNumber })
      await sendText(space, result.formattedReply)
    } catch (err) {
      console.error('[Bot] text analyze-tag error:', err)
      await sendText(space, "Couldn't analyze that. Please try again.")
    }
  })
}

// ─── Types ───────────────────────────────────────────────────

type AnalyzeTagResult = {
  extraction: {
    brand: string
    materials: Array<{ name: string; percentage: number }>
    countryOfOrigin: string | null
    careInstructions: string[]
    rawText: string
  }
  score: number
  explanation: string
  reasoning: string
  comparison: string
  certifications: string[]
  brandRating: string
  formattedReply: string
}

type AnalyzeTagInput = {
  imageUrl?: string
  imageDataUrl?: string
  brand?: string
  materialsText?: string
  phoneNumber?: string
}

type ImageAttachment = {
  mimeType?: string
  read: () => Promise<Buffer>
}

// ─── Helpers ─────────────────────────────────────────────────

async function callAnalyzeTag(input: AnalyzeTagInput): Promise<AnalyzeTagResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-tag`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`analyze-tag ${res.status}: ${body.slice(0, 200)}`)
  }

  return res.json()
}

async function attachmentToDataUrl(content: ImageAttachment): Promise<string> {
  const bytes = await content.read()
  const mimeType = content.mimeType || 'image/jpeg'
  return `data:${mimeType};base64,${bytes.toString('base64')}`
}

async function sendText(
  space: { send: (...content: ReturnType<typeof text>[]) => Promise<void> },
  value: string,
) {
  await space.send(text(value))
}
