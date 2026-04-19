// Photon AI iMessage bot via Spectrum-TS.
// Receives clothing tag photos over iMessage, calls the analyze-tag
// Supabase edge function, and replies with the sustainability score.

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

for await (const [space, message] of app.messages) {
  const content = message.content

  if (content.type === 'attachment' && content.mimeType?.startsWith('image/')) {
    await space.responding(async () => {
      try {
        const imageDataUrl = await attachmentToDataUrl(content)
        const result = await callAnalyzeTag({
          imageDataUrl,
          phoneNumber: message.sender.id,
        })

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
    const body = content.text?.trim().toLowerCase() ?? ''

    if (body === 'help' || body === 'hi' || body === 'hello' || body === '') {
      await sendText(
        space,
        'Photon AI - Sustainability Scanner\n\n' +
          'Send a photo of any clothing tag or fabric label and I will score its ' +
          'materials and sustainability.\n\n' +
          'Score 70+: Highly sustainable\n' +
          'Score 40-69: Moderate\n' +
          'Score below 40: Low sustainability',
      )
    } else {
      await sendText(space, "Send me a photo of the clothing tag and I'll handle the rest.")
    }
  }
}

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
  phoneNumber?: string
}

type ImageAttachment = {
  mimeType?: string
  read: () => Promise<Buffer>
}

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
