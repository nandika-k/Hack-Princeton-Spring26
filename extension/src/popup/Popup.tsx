import { useEffect, useState } from 'react'
import type { ExtensionStatus, ScrapedItem, SustainabilityBreakdown } from '../types/item'
import type { Msg, Res } from '../lib/messages'
import { send } from '../lib/messages'

async function getActiveTabItem(): Promise<ScrapedItem | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return null
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id!, { kind: 'GET_CURRENT_ITEM' } satisfies Msg, (res: Res | undefined) => {
      void chrome.runtime.lastError
      if (res?.kind === 'CURRENT_ITEM') resolve(res.item)
      else resolve(null)
    })
  })
}

type State = {
  status: ExtensionStatus
  item: ScrapedItem | null
  breakdown: SustainabilityBreakdown | null
  loading: boolean
  error: string | null
}

export function Popup(): JSX.Element {
  const [state, setState] = useState<State>({
    status: { enabled: true, last_toggled_at: Date.now() },
    item: null,
    breakdown: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    void refresh()
  }, [])

  async function refresh(): Promise<void> {
    try {
      const s = await send({ kind: 'GET_STATUS' })
      const status = s.kind === 'STATUS' ? s.status : state.status

      const item = await getActiveTabItem()
      if (!item) {
        setState((p) => ({ ...p, status, item: null, breakdown: null, loading: false }))
        return
      }

      const scored = await send({ kind: 'SCORE_ITEM', item })
      const breakdown = scored.kind === 'SCORED' ? scored.breakdown : null
      setState({ status, item, breakdown, loading: false, error: null })
    } catch (err) {
      setState((p) => ({ ...p, loading: false, error: err instanceof Error ? err.message : String(err) }))
    }
  }

  async function toggle(): Promise<void> {
    const res = await send({ kind: 'SET_ENABLED', enabled: !state.status.enabled })
    if (res.kind === 'STATUS') {
      setState((p) => ({ ...p, status: res.status }))
    }
  }

  async function scoreNow(): Promise<void> {
    if (!state.item) return
    setState((p) => ({ ...p, loading: true }))
    const res = await send({ kind: 'SCORE_ITEM', item: state.item })
    if (res.kind === 'SCORED') {
      setState((p) => ({ ...p, breakdown: res.breakdown, loading: false }))
    } else if (res.kind === 'ERROR') {
      setState((p) => ({ ...p, loading: false, error: res.message }))
    }
  }

  return (
    <div>
      <div className="titlebar">
        <span>EcoThread</span>
        <span>_ □ ×</span>
      </div>
      <div className="pixel-bar" />

      <div className="p-3 space-y-3">
        <ToggleRow enabled={state.status.enabled} onToggle={toggle} />

        {!state.status.enabled && (
          <div className="panel p-3 text-xs">
            Scanner is off. Flip the switch to check items on shopping sites for sustainability info.
          </div>
        )}

        {state.status.enabled && !state.item && !state.loading && (
          <div className="panel p-3 text-xs">
            Visit a product page on Depop, Vinted, Zara, Shein, H&amp;M, ASOS, or any supported shop to see a score.
          </div>
        )}

        {state.status.enabled && state.item && (
          <ItemCard
            item={state.item}
            breakdown={state.breakdown}
            loading={state.loading}
            onScore={scoreNow}
          />
        )}

        {state.error && (
          <div className="panel p-2 text-xs text-red">Error: {state.error}</div>
        )}

        <Footer />
      </div>
    </div>
  )
}

function ToggleRow({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }): JSX.Element {
  return (
    <div className="panel p-2 flex items-center justify-between">
      <div>
        <div className="text-xs uppercase text-text-silver">Scanner</div>
        <div className="text-sm">{enabled ? 'ON — scanning pages' : 'OFF — idle'}</div>
      </div>
      <button type="button" className="btn" onClick={onToggle}>
        {enabled ? 'Turn Off' : 'Turn On'}
      </button>
    </div>
  )
}

function ItemCard({
  item,
  breakdown,
  loading,
  onScore,
}: {
  item: ScrapedItem
  breakdown: SustainabilityBreakdown | null
  loading: boolean
  onScore: () => void
}): JSX.Element {
  return (
    <div className="panel p-3 space-y-3">
      <div className="flex gap-3">
        {item.image_url && (
          <img src={item.image_url} alt="" className="w-16 h-16 object-cover border border-border-dim" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text-silver truncate">{item.retailer}</div>
          <div className="text-sm font-bold truncate">{item.title}</div>
          {item.brand && <div className="text-xs text-text-silver truncate">by {item.brand}</div>}
        </div>
      </div>

      {loading && <div className="text-xs">Scoring…</div>}

      {!loading && !breakdown && (
        <button type="button" className="btn w-full" onClick={onScore}>
          Check Sustainability
        </button>
      )}

      {breakdown && <Breakdown data={breakdown} />}
    </div>
  )
}

function Breakdown({ data }: { data: SustainabilityBreakdown }): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className={`score-dial grade-${data.grade}`}>{data.score}</div>
        <div className="flex-1">
          <div className="text-xs uppercase text-text-silver">Sustainability</div>
          <div className="text-sm">Grade {data.grade} · {labelFor(data.fast_fashion_risk)}</div>
          <div className="text-xs text-text-silver">
            {data.source === 'live' ? 'Live score' : 'Offline estimate'}
          </div>
        </div>
      </div>

      <div className="bevel-out p-2">
        <div className="row">
          <span className="label">Price</span>
          <span>{data.price_display}</span>
        </div>
        <div className="row">
          <span className="label">Made in</span>
          <span>{data.origin}</span>
        </div>
        <div className="row">
          <span className="label">Fiber</span>
          <span>
            {data.fiber.material} · <em>{data.fiber.quality}</em>
          </span>
        </div>
        <div className="row">
          <span className="label">Carbon</span>
          <span>
            {data.carbon.kg_co2e !== null ? `${data.carbon.kg_co2e} kg CO₂e` : '—'}
          </span>
        </div>
        <div className="row">
          <span className="label">Fast fashion</span>
          <span>{riskLabel(data.fast_fashion_risk)}</span>
        </div>
      </div>

      <div className="panel p-2 text-xs space-y-2">
        <div>
          <div className="label text-text-silver uppercase">Fiber notes</div>
          <div>{data.fiber.notes}</div>
        </div>
        <div>
          <div className="label text-text-silver uppercase">Carbon footprint</div>
          <div>{data.carbon.comparison}</div>
        </div>
        <div>
          <div className="label text-text-silver uppercase">Environmental notes</div>
          <div>{data.environmental_notes}</div>
        </div>
        <div>
          <div className="label text-text-silver uppercase">Summary</div>
          <div>{data.explanation}</div>
        </div>
      </div>
    </div>
  )
}

function labelFor(risk: 'low' | 'medium' | 'high'): string {
  if (risk === 'low') return 'Low-impact pick'
  if (risk === 'high') return 'Fast-fashion risk'
  return 'Mid-market'
}

function riskLabel(risk: 'low' | 'medium' | 'high'): string {
  return risk === 'low' ? 'Low risk' : risk === 'high' ? 'High risk' : 'Medium risk'
}

function Footer(): JSX.Element {
  return (
    <div className="text-center text-xs text-text-silver pt-1">
      <div className="pixel-bar mb-2" />
      EcoThread · HackPrinceton 2026
    </div>
  )
}
