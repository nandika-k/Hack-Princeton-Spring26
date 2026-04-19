// Photon AI iMessage bot via Spectrum-TS.
// Accepts clothing tag photos OR a guided text flow (brand → materials).
// Calls the analyze-tag Supabase edge function and replies with the sustainability score.

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

// Per-sender conversation state for the text-input scan flow
type ConversationStep = 'awaiting_brand' | 'awaiting_materials'
type ConversationState = { step: ConversationStep; brand?: string }
const conversations = new Map<string, ConversationState>()

const HELP_MESSAGE =
  'Photon AI - Sustainability Scanner\n\n' +
  'Options:\n' +
  '• Send a photo of any clothing tag\n' +
  '• Or reply "scan" to enter the tag details manually\n\n' +
  'Score 70+: Highly sustainable\n' +
  'Score 40-69: Moderate\n' +
  'Score below 40: Low sustainability'

for await (const [space, message] of app.messages) {
  const content = message.content
  const senderId = message.sender.id

  if (content.type === 'attachment' && content.mimeType?.startsWith('image/')) {
    // Clear any in-progress text flow when a photo arrives
    conversations.delete(senderId)

    await space.responding(async () => {
      try {
        const imageDataUrl = await attachmentToDataUrl(content)
        const result = await callAnalyzeTag({ imageDataUrl, phoneNumber: senderId })
        await sendText(space, result.formattedReply)
      } catch (err) {
        console.error('[Bot] analyze-tag error:', err)
        await sendText(
          space,
          "Couldn't read that tag. Try a clearer, well-lit photo of the label.",
        )
      }
    })

    continue
  }

  if (content.type === 'text') {
    const body = content.text?.trim() ?? ''
    const lower = body.toLowerCase()
    const state = conversations.get(senderId)

    // Step 1 — waiting for brand name
    if (state?.step === 'awaiting_brand') {
      if (!body) {
        await sendText(space, 'What brand is listed on the fabric tag?')
        continue
      }
      conversations.set(senderId, { step: 'awaiting_materials', brand: body })
      await sendText(
        space,
        `Got it: "${body}"\n\nWhat materials are listed on the tag?\n\nExample: "60% Cotton, 40% Polyester"`,
      )
      continue
    }

    // Step 2 — waiting for materials
    if (state?.step === 'awaiting_materials') {
      if (!body) {
        await sendText(
          space,
          'Please type the fabric composition from the tag (e.g. "60% Cotton, 40% Polyester").',
        )
        continue
      }
      const brand = state.brand!
      conversations.delete(senderId)

      await space.responding(async () => {
        try {
          const result = await callAnalyzeTag({ brand, materialsText: body, phoneNumber: senderId })
          await sendText(space, result.formattedReply)
        } catch (err) {
          console.error('[Bot] text analyze-tag error:', err)
          await sendText(space, "Couldn't analyze that. Please try again.")
        }
      })
      continue
    }

    // No active conversation state
    if (lower === 'help' || lower === 'hi' || lower === 'hello' || lower === '') {
      await sendText(space, HELP_MESSAGE)
    } else {
      // Any other text starts the guided text-input flow
      conversations.set(senderId, { step: 'awaiting_brand' })
      await sendText(space, 'What brand is listed on the fabric tag?')
    }
  }
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

async function sendText(space: { send: (...content: ReturnType<typeof text>[]) => Promise<void> }, value: string) {
  await space.send(text(value))
}
