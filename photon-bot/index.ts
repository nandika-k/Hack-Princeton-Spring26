// Photon AI — iMessage bot via Spectrum-TS
// Receives clothing tag photos over iMessage, calls the analyze-tag
// Supabase edge function (K2-Think v2 vision + Dedalus), replies with score.
//
// Run: bun run index.ts

import { Spectrum, text, responding } from 'spectrum-ts'
import { imessage } from 'spectrum-ts/providers/imessage'

const PHOTON_PROJECT_ID     = process.env.PHOTON_PROJECT_ID!
const PHOTON_PROJECT_SECRET = process.env.PHOTON_PROJECT_SECRET!
const SUPABASE_URL          = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY     = process.env.SUPABASE_ANON_KEY!

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

console.log('[Photon] Bot online — listening for iMessages...')

for await (const [space, message] of app.messages) {
  const content = message.content

  if (content.type === 'attachment' && content.mimeType?.startsWith('image/')) {
    // Show typing indicator while K2-Think v2 processes
    await space.send(responding())

    try {
      const result = await callAnalyzeTag(content.url, message.sender.id)
      await space.send(text(result.formattedReply))
    } catch (err) {
      console.error('[Bot] analyze-tag error:', err)
      await space.send(
        text("Couldn't read that tag — try a clearer, well-lit photo of the label."),
      )
    }
  } else if (content.type === 'text') {
    const body = content.text?.trim().toLowerCase() ?? ''
    const rawBody = content.text?.trim() ?? ''

    if (body === 'help' || body === 'hi' || body === 'hello' || body === '') {
      await space.send(
        text(
          '👋 Photon AI — Sustainability Scorer\n\n' +
          'Text your brand + fabric composition and I\'ll score its sustainability.\n\n' +
          'Examples:\n' +
          '  • Patagonia, 100% recycled polyester\n' +
          '  • brand: H&M fabric: 50% cotton 50% polyester\n' +
          '  • Zara polyester\n\n' +
          '🌿 Score 70+  Highly sustainable\n' +
          '🟡 Score 40–69  Moderate\n' +
          '🔴 Score <40  Low sustainability',
        ),
      )
    } else {
      await space.send(responding())
      try {
        const result = await callAnalyzeText(rawBody, message.sender.id)
        await space.send(text(result.formattedReply))
      } catch (err) {
        console.error('[Bot] analyze-text error:', err)
        await space.send(
          text('Could not score that. Try: "Brand, 100% fabric type"\nExample: "Patagonia, 100% recycled polyester"'),
        )
      }
    }
  }
}

// ─── Supabase edge function call ─────────────────────────────

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

async function callAnalyzeTag(imageUrl: string, phoneNumber?: string): Promise<AnalyzeTagResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-tag`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrl, phoneNumber }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`analyze-tag ${res.status}: ${body.slice(0, 200)}`)
  }

  return res.json()
}

type AnalyzeTextResult = {
  extraction: {
    brand: string
    materials: Array<{ name: string; percentage: number }>
  }
  score: number
  explanation: string
  reasoning: string
  comparison: string
  certifications: string[]
  brandRating: string
  formattedReply: string
}

async function callAnalyzeText(textQuery: string, phoneNumber?: string): Promise<AnalyzeTextResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-text`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: textQuery, phoneNumber }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`analyze-text ${res.status}: ${body.slice(0, 200)}`)
  }

  return res.json()
}
