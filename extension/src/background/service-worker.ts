import type { Msg, Res } from '../lib/messages'
import type { ScrapedItem } from '../types/item'
import { scoreItem } from '../lib/api'
import { getStatus, setStatus, getCached, setCached, setCurrentItem, getCurrentItem } from '../lib/storage'

async function handleItemDetected(item: ScrapedItem): Promise<void> {
  await setCurrentItem(item)
  await chrome.action.setBadgeBackgroundColor({ color: '#6040c0' })
  await chrome.action.setBadgeText({ text: '•' })

  const cached = await getCached(item.url)
  if (cached) return

  const breakdown = await scoreItem(item)
  await setCached(item, breakdown)
  await chrome.action.setBadgeText({ text: String(breakdown.score) })
  const color = breakdown.score >= 65 ? '#1a8040' : breakdown.score >= 35 ? '#906000' : '#a02020'
  await chrome.action.setBadgeBackgroundColor({ color })
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
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
          await setCurrentItem(null)
        }
        return { kind: 'STATUS', status: next }
      }
      case 'ITEM_DETECTED': {
        await handleItemDetected(msg.item)
        const cached = await getCached(msg.item.url)
        return { kind: 'CURRENT_ITEM', item: msg.item, breakdown: cached?.breakdown ?? null }
      }
      case 'GET_CURRENT_ITEM': {
        const item = await getCurrentItem()
        if (!item) return { kind: 'CURRENT_ITEM', item: null, breakdown: null }
        const cached = await getCached(item.url)
        return { kind: 'CURRENT_ITEM', item, breakdown: cached?.breakdown ?? null }
      }
      case 'SCORE_ITEM': {
        const cached = await getCached(msg.item.url)
        if (cached) return { kind: 'SCORED', breakdown: cached.breakdown }
        const breakdown = await scoreItem(msg.item)
        await setCached(msg.item, breakdown)
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

chrome.tabs.onActivated.addListener(async () => {
  const item = await getCurrentItem()
  if (!item) {
    await chrome.action.setBadgeText({ text: '' })
    return
  }
  const cached = await getCached(item.url)
  if (cached) {
    await chrome.action.setBadgeText({ text: String(cached.breakdown.score) })
  }
})
