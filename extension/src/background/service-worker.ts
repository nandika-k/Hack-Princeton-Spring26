import type { Msg, Res } from '../lib/messages'
import type { ScrapedItem } from '../types/item'
import { scoreItem } from '../lib/api'
import { getStatus, setStatus, getCached, setCached } from '../lib/storage'

function badgeColor(score: number): string {
  return score >= 65 ? '#1a8040' : score >= 35 ? '#906000' : '#a02020'
}

async function setBadge(tabId: number | undefined, score: number | null): Promise<void> {
  if (tabId === undefined) return
  if (score === null) {
    await chrome.action.setBadgeText({ text: '', tabId })
    return
  }
  await chrome.action.setBadgeBackgroundColor({ color: badgeColor(score), tabId })
  await chrome.action.setBadgeText({ text: String(score), tabId })
}

async function handleItemDetected(item: ScrapedItem, tabId: number | undefined): Promise<number | null> {
  await chrome.action.setBadgeBackgroundColor({ color: '#6040c0', tabId: tabId ?? 0 })
  await chrome.action.setBadgeText({ text: '•', tabId: tabId ?? 0 })

  const cached = await getCached(item.url)
  if (cached) {
    await setBadge(tabId, cached.breakdown.score)
    return cached.breakdown.score
  }

  const breakdown = await scoreItem(item)
  await setCached(item, breakdown)
  await setBadge(tabId, breakdown.score)
  return breakdown.score
}

chrome.runtime.onMessage.addListener((msg: Msg, sender, reply) => {
  const handle = async (): Promise<Res> => {
    switch (msg.kind) {
      case 'GET_STATUS': {
        const status = await getStatus()
        return { kind: 'STATUS', status }
      }
      case 'SET_ENABLED': {
        const next = { enabled: msg.enabled, last_toggled_at: Date.now() }
        await setStatus(next)
        if (!msg.enabled) {
          await chrome.action.setBadgeText({ text: '' })
        }
        return { kind: 'STATUS', status: next }
      }
      case 'ITEM_DETECTED': {
        await handleItemDetected(msg.item, sender.tab?.id)
        const cached = await getCached(msg.item.url)
        return { kind: 'CURRENT_ITEM', item: msg.item, breakdown: cached?.breakdown ?? null }
      }
      case 'GET_CURRENT_ITEM': {
        return { kind: 'CURRENT_ITEM', item: null, breakdown: null }
      }
      case 'SCORE_ITEM': {
        const cached = await getCached(msg.item.url)
        if (cached) {
          await setBadge(sender.tab?.id, cached.breakdown.score)
          return { kind: 'SCORED', breakdown: cached.breakdown }
        }
        const breakdown = await scoreItem(msg.item)
        await setCached(msg.item, breakdown)
        await setBadge(sender.tab?.id, breakdown.score)
        return { kind: 'SCORED', breakdown }
      }
    }
  }

  handle()
    .then(reply)
    .catch((err: unknown) => {
      reply({ kind: 'ERROR', message: err instanceof Error ? err.message : String(err) } satisfies Res)
    })
  return true
})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeText({ text: '' })
})
