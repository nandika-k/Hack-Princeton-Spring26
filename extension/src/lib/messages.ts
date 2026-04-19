import type { ScrapedItem, SustainabilityBreakdown, ExtensionStatus } from '../types/item'

export type Msg =
  | { kind: 'GET_STATUS' }
  | { kind: 'SET_ENABLED'; enabled: boolean }
  | { kind: 'ITEM_DETECTED'; item: ScrapedItem }
  | { kind: 'GET_CURRENT_ITEM' }
  | { kind: 'SCORE_ITEM'; item: ScrapedItem }

export type Res =
  | { kind: 'STATUS'; status: ExtensionStatus }
  | { kind: 'CURRENT_ITEM'; item: ScrapedItem | null; breakdown: SustainabilityBreakdown | null }
  | { kind: 'SCORED'; breakdown: SustainabilityBreakdown }
  | { kind: 'ERROR'; message: string }

export function send<T extends Res = Res>(msg: Msg): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res: T | undefined) => {
      const err = chrome.runtime.lastError
      if (err) reject(new Error(err.message))
      else if (!res) reject(new Error('No response'))
      else resolve(res)
    })
  })
}
