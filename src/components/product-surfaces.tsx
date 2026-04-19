import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { resolveProductLookupUrl } from '../lib/product-links'
import type { Board, Pin } from '../types/board'
import type { Product, SustainabilityResult } from '../types/product'

type ProductCardProps = {
  product: Product
  pinned?: boolean
  onOpen: () => void
  onSave: () => void
  secondaryAction?: {
    label: string
    onClick: () => void
  }
}

type ProductDetailModalProps = {
  product: Product
  result: SustainabilityResult | null
  loading: boolean
  onClose: () => void
  onSave: () => void
}

type BoardCardProps = {
  board: Board
  pins: Pin[]
}

type BoardSelectorModalProps = {
  boards: Board[]
  onClose: () => void
  onCreateNew: () => void
  onSelect: (boardId: string) => void
}

type CreateBoardModalProps = {
  onClose: () => void
  onCreate: (input: { name: string; description: string; occasion: string }) => void
}

export function MasonryGrid({ children }: { children: ReactNode }): JSX.Element {
  return <div className="masonry-grid">{children}</div>
}

export function ProductCard({
  product,
  pinned = false,
  onOpen,
  onSave,
  secondaryAction,
}: ProductCardProps): JSX.Element {
  const primaryImage = product.image_urls?.[0] ?? null

  return (
    <article
      className="pin-card"
      onClick={onOpen}
      role="button"
      style={{ background: pinBg(product.id), cursor: 'pointer' }}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <div className="pin-image-area" style={{ height: pinHeight(product.id) }}>
        {primaryImage ? (
          <img alt={product.title} className="pin-img" src={primaryImage} />
        ) : (
          <span className="pin-placeholder">{categoryEmoji(product.title)}</span>
        )}
        <div className="pin-hover-overlay" style={{ pointerEvents: 'none' }}>
          <span className="pin-title">{product.title}</span>
        </div>
        <button
          className={`pin-save-btn${pinned ? ' pin-save-btn-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onSave()
          }}
          type="button"
        >
          {pinned ? '★' : '☆'}
        </button>
        {secondaryAction ? (
          <button
            className="pin-save-btn"
            onClick={(e) => {
              e.stopPropagation()
              secondaryAction.onClick()
            }}
            style={{ top: 'auto', bottom: '0.75rem', fontSize: 10, width: 'auto', borderRadius: 4, padding: '2px 8px' }}
            type="button"
          >
            {secondaryAction.label}
          </button>
        ) : null}
      </div>
    </article>
  )
}

const PIN_BACKGROUNDS = [
  '#BCD4E9',
  '#C8D9E2',
  '#DDE9EA',
  '#CCDBD1',
  '#B8CFDE',
  '#D4E4E8',
  '#C2D8E6',
]

const PIN_HEIGHTS = ['220px', '280px', '240px', '320px', '200px', '260px', '300px', '180px']

function pinBg(id: string): string {
  const h = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return PIN_BACKGROUNDS[h % PIN_BACKGROUNDS.length]
}

function pinHeight(id: string): string {
  const h = id.split('').reduce((a, c) => a + c.charCodeAt(0) * 31, 0)
  return PIN_HEIGHTS[h % PIN_HEIGHTS.length]
}

function categoryEmoji(title: string): string {
  const t = title.toLowerCase()
  if (t.includes('jean') || t.includes('pant') || t.includes('denim')) return '👖'
  if (t.includes('dress') || t.includes('skirt')) return '👗'
  if (t.includes('coat') || t.includes('jacket') || t.includes('blazer') || t.includes('trench')) return '🧥'
  if (t.includes('shoe') || t.includes('boot') || t.includes('sneaker') || t.includes('heel')) return '👟'
  if (t.includes('bag') || t.includes('purse') || t.includes('tote') || t.includes('handbag')) return '👜'
  if (t.includes('shirt') || t.includes('tee') || t.includes('top') || t.includes('blouse')) return '👕'
  if (t.includes('hat') || t.includes('cap') || t.includes('beret')) return '🧢'
  if (t.includes('scarf')) return '🧣'
  if (t.includes('swim') || t.includes('bikini')) return '🩱'
  return '✦'
}

export function ProductDetailModal({
  product,
  result,
  loading,
  onClose,
  onSave,
}: ProductDetailModalProps): JSX.Element {
  const primaryImage = product.image_urls?.[0] ?? null
  const description = product.description ?? ''
  const priceLabel = formatPrice(product.price, product.currency)
  const score = result?.score ?? product.sustainability_score ?? null
  const ecoColor = score == null ? 'var(--forest-sage)' : score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)'

  return (
    <ModalShell onClose={onClose}>
      <div className="modal-panel max-w-3xl">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '0.5px solid var(--sage-mist)' }}
        >
          <span
            className="text-[9px] uppercase tracking-[4px]"
            style={{ color: 'var(--forest-sage)' }}
          >
            ECOTHREAD DETAIL
          </span>
          <button
            className="text-[18px] leading-none"
            onClick={onClose}
            style={{ color: 'var(--forest-sage)' }}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_1fr]">
          {/* Image */}
          <div
            className="flex min-h-[340px] items-center justify-center overflow-hidden"
            style={{ background: pinBg(product.id) }}
          >
            {primaryImage ? (
              <img alt={product.title} className="h-full w-full object-cover" src={primaryImage} />
            ) : (
              <span style={{ fontSize: 80 }}>{categoryEmoji(product.title)}</span>
            )}
          </div>

          {/* Info panel */}
          <div className="flex flex-col gap-5 p-6">
            {/* Title + retailer + price */}
            <div>
              <p
                className="mb-1 text-[9px] uppercase tracking-[3px]"
                style={{ color: 'var(--forest-sage)' }}
              >
                {product.retailer}
              </p>
              <h2
                className="mb-3 text-xl leading-snug"
                style={{ color: 'var(--deep-navy)' }}
              >
                {product.title}
              </h2>
              <p
                className="text-2xl"
                style={{ color: 'var(--midnight-blue)' }}
              >
                {priceLabel}
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              <StatBlock label="ECO SCORE" value={loading ? '—' : `${score ?? '—'}/100`} accent={ecoColor} />
              <StatBlock
                label="FABRIC"
                value={loading ? '—' : (result?.fabric_type ?? inferFabric(description))}
                accent="var(--midnight-blue)"
              />
              <StatBlock
                label="CONDITION"
                value={loading ? '—' : (result?.condition ?? 'Good')}
                accent="var(--forest-sage)"
              />
            </div>

            {/* CO2 saving */}
            {!loading && result?.carbon_kg != null && (
              <div
                className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[2px]"
                style={{
                  background: 'var(--seafoam)',
                  borderRadius: 6,
                  color: 'var(--forest-sage)',
                }}
              >
                <span>☁</span>
                <span>saves ~{result.carbon_kg} kg CO₂ vs buying new</span>
              </div>
            )}

            {/* Description */}
            {description ? (
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--forest-sage)' }}>
                {description}
              </p>
            ) : null}

            {/* K2 reasoning */}
            {!loading && result?.reasoning && (
              <p
                className="border-l-2 pl-3 text-[11px] leading-relaxed"
                style={{
                  borderColor: 'var(--sky-mist)',
                  color: 'var(--forest-sage)',
                  opacity: 0.85,
                }}
              >
                {result.reasoning}
              </p>
            )}

            {loading && (
              <p className="text-[11px] uppercase tracking-[2px]" style={{ color: 'var(--sage-mist)' }}>
                Analyzing sustainability...
              </p>
            )}

            {/* Actions */}
            <div className="mt-auto flex gap-3">
              <button className="btn-save btn-save-wide" onClick={onSave} type="button">
                ★ PIN IT
              </button>
              <a className="btn-secondary" href={product.product_url} rel="noreferrer" target="_blank">
                OPEN ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

function StatBlock({
  label,
  value,
  accent,
}: {
  label: string
  value: string | null | undefined
  accent: string
}): JSX.Element {
  return (
    <div
      className="flex flex-col gap-1 px-3 py-2"
      style={{ background: 'var(--frost-white)', borderRadius: 6 }}
    >
      <span className="text-[8px] uppercase tracking-[2px]" style={{ color: 'var(--forest-sage)' }}>
        {label}
      </span>
      <span className="text-[13px] uppercase tracking-[1px]" style={{ color: accent }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function inferFabric(description: string): string | null {
  const t = description.toLowerCase()
  const fabrics = ['cashmere', 'wool', 'silk', 'linen', 'cotton', 'denim', 'polyester', 'viscose', 'rayon', 'nylon', 'leather', 'suede', 'velvet', 'corduroy', 'satin', 'chiffon']
  for (const f of fabrics) {
    if (t.includes(f)) return f.charAt(0).toUpperCase() + f.slice(1)
  }
  return null
}

export function BoardCard({ board, pins }: BoardCardProps): JSX.Element {
  return (
    <Link className="board-card" to={`/boards/${board.id}`}>
      <div className="board-card-stripe" />
      <div className="flex-1 space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-text-silver">{board.occasion ?? 'Mood board'}</p>
            <h3 className="text-lg text-text-dark">{board.name}</h3>
          </div>
          <span className="text-[11px] uppercase tracking-[0.2em] text-blue">{pins.length} saves</span>
        </div>
        <div className="board-mosaic">
          {Array.from({ length: 4 }).map((_, index) => {
            const pin = pins[index]
            const imageUrl = pin?.product_data.image_urls?.[0] ?? null
            return imageUrl ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                key={`${board.id}-${pin.id}`}
                src={imageUrl}
              />
            ) : (
              <div className="board-mosaic-fallback" key={`${board.id}-${index}`} />
            )
          })}
        </div>
        <p className="text-[12px] leading-relaxed text-text-silver">
          {board.description ?? 'Pin a few pieces and this board becomes your executable outfit plan.'}
        </p>
      </div>
    </Link>
  )
}

export function BoardSelectorModal({
  boards,
  onClose,
  onCreateNew,
  onSelect,
}: BoardSelectorModalProps): JSX.Element {
  return (
    <ModalShell onClose={onClose}>
      <div className="modal-panel max-w-xl">
        <div className="titlebar">
          <span>board_selector.exe</span>
          <button className="titlebar-close" onClick={onClose} type="button">
            x
          </button>
        </div>
        <div className="pixel-bar" />
        <div className="space-y-3 p-4">
          {boards.length === 0 ? (
            <div className="panel-flat p-4 text-sm text-text-silver">
              No boards yet. Create one and keep the pin flow moving.
            </div>
          ) : (
            boards.map((board) => (
              <button className="board-picker" key={board.id} onClick={() => onSelect(board.id)} type="button">
                <span>
                  <span className="block text-[10px] uppercase tracking-[0.25em] text-text-silver">
                    {board.occasion ?? 'Open board'}
                  </span>
                  <span className="text-left text-base text-text-dark">{board.name}</span>
                </span>
                <span className="text-blue">{'>>'}</span>
              </button>
            ))
          )}
          <button className="new-board-tile" onClick={onCreateNew} type="button">
            new_board.exe
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

export function CreateBoardModal({ onClose, onCreate }: CreateBoardModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [occasion, setOccasion] = useState('')

  return (
    <ModalShell onClose={onClose}>
      <div className="modal-panel max-w-xl">
        <div className="titlebar">
          <span>new_board.exe</span>
          <button className="titlebar-close" onClick={onClose} type="button">
            x
          </button>
        </div>
        <div className="pixel-bar" />
        <form
          className="space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            onCreate({ name, description, occasion })
          }}
        >
          <label className="field-shell">
            <span>Board name</span>
            <input onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          <label className="field-shell">
            <span>Occasion</span>
            <input onChange={(event) => setOccasion(event.target.value)} placeholder="Date Night" value={occasion} />
          </label>
          <label className="field-shell">
            <span>Description</span>
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What belongs in this board?"
              rows={4}
              value={description}
            />
          </label>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={onClose} type="button">
              CANCEL
            </button>
            <button className="btn-save" type="submit">
              CREATE
            </button>
          </div>
        </form>
      </div>
    </ModalShell>
  )
}

function ModalShell({
  children,
  onClose,
}: {
  children: ReactNode
  onClose: () => void
}): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div onClick={(event) => event.stopPropagation()} role="presentation">
        {children}
      </div>
    </div>
  )
}

function CornerBrackets(): JSX.Element {
  return (
    <>
      <span className="corner corner-tl" />
      <span className="corner corner-tr" />
      <span className="corner corner-bl" />
      <span className="corner corner-br" />
    </>
  )
}

function ecoBadgeClass(score: number): string {
  if (score >= 70) return 'eco-good'
  if (score >= 40) return 'eco-mid'
  return 'eco-low'
}

function ecoBlockClass(score: number): string {
  if (score >= 70) return 'eco-block-good'
  if (score >= 40) return 'eco-block-mid'
  return 'eco-block-low'
}

function formatPrice(price: number | null, currency: string | null): string {
  if (price == null) {
    return 'Price TBD'
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency ?? 'USD',
      maximumFractionDigits: 2,
    }).format(price)
  } catch {
    return `$${price.toFixed(2)}`
  }
}
