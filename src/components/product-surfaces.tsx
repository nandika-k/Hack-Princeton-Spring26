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
  const score = product.sustainability_score ?? 0
  const primaryImage = product.image_urls?.[0] ?? null
  const description = product.description ?? 'Description loading from the archive cache.'
  const priceLabel = formatPrice(product.price, product.currency)

  return (
    <article className="product-card">
      <button className="image-stage" onClick={onOpen} type="button">
        <CornerBrackets />
        <span className={`eco-badge ${ecoBadgeClass(score)}`}>ECO {score || '--'}</span>
        <span className="pixel-flourish pixel-flourish-a">*</span>
        <span className="pixel-flourish pixel-flourish-b">+</span>
        {primaryImage ? (
          <img alt={product.title} className="product-image" src={primaryImage} />
        ) : (
          <span className="text-xs text-text-silver">Image cache warming...</span>
        )}
      </button>
      <div className="space-y-3 p-3">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.25em] text-text-silver">{product.retailer}</p>
          <button className="block text-left text-[15px] leading-snug text-text-dark" onClick={onOpen} type="button">
            {product.title}
          </button>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-text-silver">{description}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] text-blue">{priceLabel}</span>
          <div className="flex items-center gap-2">
            {secondaryAction ? (
              <button className="btn-secondary" onClick={secondaryAction.onClick} type="button">
                {secondaryAction.label}
              </button>
            ) : null}
            <button className={pinned ? 'btn-save btn-save-active' : 'btn-save'} onClick={onSave} type="button">
              SAVE_IT
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export function ProductDetailModal({
  product,
  result,
  loading,
  onClose,
  onSave,
}: ProductDetailModalProps): JSX.Element {
  const primaryImage = product.image_urls?.[0] ?? null
  const description = product.description ?? 'Description not available yet for this archived listing.'
  const priceLabel = formatPrice(product.price, product.currency)
  const productLookupUrl = resolveProductLookupUrl(product)

  return (
    <ModalShell onClose={onClose}>
      <div className="modal-panel max-w-4xl">
        <div className="titlebar">
          <span>{product.title}</span>
          <button className="titlebar-close" onClick={onClose} type="button">
            x
          </button>
        </div>
        <div className="pixel-bar" />
        <div className="grid gap-5 p-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="image-stage min-h-[360px]">
            <CornerBrackets />
            {primaryImage ? (
              <img alt={product.title} className="product-image" src={primaryImage} />
            ) : (
              <span className="text-sm text-text-silver">Image unavailable</span>
            )}
          </div>
          <div className="space-y-4">
            <div className="panel-flat space-y-2 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-text-silver">{product.retailer}</p>
              <h2 className="text-xl text-text-dark">{product.title}</h2>
              <p className="text-[13px] leading-relaxed text-text-silver">{description}</p>
              <div className="text-lg text-blue">{priceLabel}</div>
            </div>

            <div className={`eco-block ${ecoBlockClass(result?.score ?? 0)}`}>
              {loading ? (
                <p className="text-sm">Running K2-style reasoning...</p>
              ) : (
                <>
                  <p className="text-[11px] uppercase tracking-[0.25em]">ECO_SCORE: {result?.score ?? '--'} / 100</p>
                  <p className="text-sm leading-relaxed">{result?.explanation}</p>
                  <p className="text-xs leading-relaxed opacity-90">{result?.reasoning}</p>
                  <p className="text-xs uppercase tracking-[0.2em] opacity-80">{result?.comparison}</p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="btn-save btn-save-wide" onClick={onSave} type="button">
                SAVE_IT
              </button>
              <a className="btn-secondary" href={productLookupUrl} rel="noreferrer" target="_blank">
                OPEN
              </a>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  )
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
