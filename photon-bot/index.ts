// Photon AI — iMessage bot via Spectrum-TS
// Receives clothing tag photos over iMessage, calls the analyze-tag
// Supabase edge function (K2-Think v2 vision + Dedalus), replies with score.
//
// Run: bun run index.ts

import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Spectrum, text } from 'spectrum-ts'
import { imessage } from 'spectrum-ts/providers/imessage'
import { fileURLToPath } from 'node:url'

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

const LOCK_PATH = join(dirname(fileURLToPath(import.meta.url)), '.photon-bot.lock')

type OwnershipAnswer = 'first-hand' | 'second-hand'

const pendingOwnershipBySender = new Map<string, { score: number }>()

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function acquireBotLock(): void {
  const writeLock = () => {
    const fd = openSync(LOCK_PATH, 'wx')
    writeFileSync(fd, String(process.pid))
    closeSync(fd)
  }

  try {
    writeLock()
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'EEXIST') throw error

    const existingPid = Number.parseInt(readFileSync(LOCK_PATH, 'utf8').trim(), 10)
    if (Number.isFinite(existingPid) && isProcessAlive(existingPid)) {
      throw new Error(`Another Photon bot instance is already running (pid ${existingPid}).`)
    }

    rmSync(LOCK_PATH, { force: true })
    writeLock()
  }

  const releaseLock = () => {
    try {
      rmSync(LOCK_PATH, { force: true })
    } catch {
      // Ignore lock cleanup failures during shutdown.
    }
  }

  process.on('exit', releaseLock)
  process.on('SIGINT', () => {
    releaseLock()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    releaseLock()
    process.exit(143)
  })
}

function parseOwnershipAnswer(raw: string): OwnershipAnswer | null {
  const normalized = raw.trim().toLowerCase()

  if (/^(first|first-hand|first hand|new|brand new)\b/.test(normalized)) {
    return 'first-hand'
  }

  if (/^(second|second-hand|second hand|preowned|pre-owned|used|thrifted|resale)\b/.test(normalized)) {
    return 'second-hand'
  }

  return null
}

function buildOwnershipReply(score: number, ownership: OwnershipAnswer): string {
  const scoreLine = `The sustainability score stays ${score}/100 based on the item's materials and brand.`

  if (ownership === 'second-hand') {
    const savingsLine = score >= 70
      ? `Because it's second-hand, it saves about ${Math.round(score * 0.3)} kg CO2 compared with buying a similar new item.`
      : score >= 40
        ? `Because it's second-hand, it saves about ${Math.round(score * 0.15)} kg CO2 compared with buying a similar new item.`
        : `Because it's second-hand, it still avoids the impact of producing a similar new item, but the estimated CO2 savings are modest.`

    return `${savingsLine}\n${scoreLine}\n\nPowered by Photon AI`
  }

  return `Got it. If you're buying it first-hand, there isn't an extra resale CO2 saving versus buying new.\n${scoreLine}\n\nPowered by Photon AI`
}

acquireBotLock()

const app = await Spectrum({
  projectId: PHOTON_PROJECT_ID,
  projectSecret: PHOTON_PROJECT_SECRET,
  providers: [imessage.config({ mode: 'cloud' })],
})

console.log('[Photon] Bot online — listening for iMessages...')

for await (const [space, message] of app.messages) {
  const content = message.content
  const senderId = message.sender.id

  if (content.type === 'attachment' && content.mimeType?.startsWith('image/')) {
    try {
      const result = await space.responding(() => callAnalyzeTag(content.url, message.sender.id))
      pendingOwnershipBySender.set(senderId, { score: result.score })
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
    const ownershipAnswer = parseOwnershipAnswer(rawBody)

    if (ownershipAnswer) {
      const pending = pendingOwnershipBySender.get(senderId)

      if (!pending) {
        await space.send(
          text(
            'Send me a product score or tag photo first, then reply "first-hand" or "second-hand" and I\'ll estimate the CO2 comparison.\n\nPowered by Photon AI',
          ),
        )
        continue
      }

      pendingOwnershipBySender.delete(senderId)
      await space.send(text(buildOwnershipReply(pending.score, ownershipAnswer)))
      continue
    }

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
      try {
        const result = await space.responding(() => callAnalyzeText(rawBody, message.sender.id))
        pendingOwnershipBySender.set(senderId, { score: result.score })
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
