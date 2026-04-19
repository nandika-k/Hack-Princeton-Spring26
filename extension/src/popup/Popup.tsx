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
    if (res.kind === 'STATUS') setState((p) => ({ ...p, status: res.status }))
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
      {/* Topbar */}
      <div className="ext-topbar">
        <img src="/logo.png" alt="EcoThread" />
        <span className="ext-logo">EcoThread</span>
      </div>

      <div className="p-3 space-y-3">
        <ToggleRow enabled={state.status.enabled} onToggle={toggle} />

        {state.status.enabled && !state.item && !state.loading && (
          <div className="ext-panel p-3" style={{ fontSize: 11, color: 'var(--forest-sage)', letterSpacing: '0.05em' }}>
            Visit a product page on Depop, Vinted, Zara, Shein, H&amp;M, ASOS, or any supported shop to see a sustainability score.
          </div>
        )}

        {!state.status.enabled && (
          <div className="ext-panel p-3" style={{ fontSize: 11, color: 'var(--forest-sage)', letterSpacing: '0.05em' }}>
            Scanner is off. Flip the switch to check items on shopping sites.
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
          <div className="ext-panel p-2" style={{ fontSize: 11, color: 'var(--red)' }}>
            Error: {state.error}
          </div>
        )}

        <Footer />
      </div>
    </div>
  )
}

function ToggleRow({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }): JSX.Element {
  return (
    <div className="ext-panel p-3 flex items-center justify-between">
      <div>
        <div className="ext-label" style={{ marginBottom: 4 }}>Scanner</div>
        <div style={{ fontSize: 12, color: 'var(--deep-navy)' }}>
          {enabled ? 'ON — scanning pages' : 'OFF — idle'}
        </div>
      </div>
      <button type="button" className={`ext-btn${enabled ? '' : ' ext-btn-primary'}`} onClick={onToggle}>
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
    <div className="ext-panel p-3 space-y-3">
      <div className="flex gap-3">
        {item.image_url && (
          <img
            src={item.image_url}
            alt=""
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ext-label" style={{ marginBottom: 2 }}>{item.retailer}</div>
          <div style={{ fontSize: 12, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title}
          </div>
          {item.brand && (
            <div style={{ fontSize: 11, color: 'var(--forest-sage)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              by {item.brand}
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ fontSize: 11, color: 'var(--forest-sage)', letterSpacing: '0.1em' }}>Scoring…</div>
      )}

      {!loading && !breakdown && (
        <button type="button" className="ext-btn ext-btn-primary" style={{ width: '100%' }} onClick={onScore}>
          Check Sustainability
        </button>
      )}

      {breakdown && <Breakdown data={breakdown} />}
    </div>
  )
}

function Breakdown({ data }: { data: SustainabilityBreakdown }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Score header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className={`score-dial grade-${data.grade}`}>{data.score}</div>
        <div>
          <div className="ext-label" style={{ marginBottom: 2 }}>Sustainability</div>
          <div style={{ fontSize: 12, color: 'var(--deep-navy)' }}>
            Grade {data.grade} · {labelFor(data.fast_fashion_risk)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--forest-sage)', marginTop: 2 }}>
            {data.source === 'live' ? 'Live score' : 'Offline estimate'}
          </div>
        </div>
      </div>

      {/* Data rows */}
      <div className="ext-panel p-3">
        <div className="ext-row">
          <span className="ext-row-label">Price</span>
          <span>{data.price_display}</span>
        </div>
        <div className="ext-row">
          <span className="ext-row-label">Made in</span>
          <span>{data.origin}</span>
        </div>
        <div className="ext-row">
          <span className="ext-row-label">Fiber</span>
          <span>{data.fiber.material} · <em>{data.fiber.quality}</em></span>
        </div>
        <div className="ext-row">
          <span className="ext-row-label">Carbon</span>
          <span>{data.carbon.kg_co2e !== null ? `${data.carbon.kg_co2e} kg CO₂e` : '—'}</span>
        </div>
        <div className="ext-row">
          <span className="ext-row-label">Fast fashion</span>
          <span>{riskLabel(data.fast_fashion_risk)}</span>
        </div>
      </div>

      {/* Notes */}
      <div className="ext-panel p-3" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
        {[
          ['Fiber notes', data.fiber.notes],
          ['Carbon footprint', data.carbon.comparison],
          ['Environmental notes', data.environmental_notes],
          ['Summary', data.explanation],
        ].map(([label, text]) => (
          <div key={label}>
            <div className="ext-label" style={{ marginBottom: 2 }}>{label}</div>
            <div style={{ color: 'var(--deep-navy)', lineHeight: 1.5 }}>{text}</div>
          </div>
        ))}
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
    <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--forest-sage)', letterSpacing: '0.2em', paddingTop: 4, borderTop: '0.5px solid var(--sage-mist)' }}>
      EcoThread · HackPrinceton 2026
    </div>
  )
}
