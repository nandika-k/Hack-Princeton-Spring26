import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useDeferredValue, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { Component as GlowBackground } from './components/ui/background-components'
import {
  addPinToBoard,
  createBoardLocal,
  getBoard,
  getDemoCredentials,
  getPinnedProductIds,
  getStylePreference,
  listBoards,
  listPins,
  removePinFromBoard,
  RETAILER_OPTIONS,
  getSustainabilityLocal,
  updateProfileLocal,
  upsertStylePreference,
} from './lib/rewear-store'
import { OCCASIONS, STYLE_TAGS } from './types/profile'
import type { Product } from './types/product'
import {
  BoardCard,
  BoardSelectorModal,
  CreateBoardModal,
  MasonryGrid,
  ProductCard,
  ProductDetailModal,
} from './components/product-surfaces'
import { useProductFeed } from './hooks/useProductFeed'

export function AuthPage(): JSX.Element {
  const navigate = useNavigate()
  const { user, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      navigate('/feed', { replace: true })
    }
  }, [navigate, user])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    try {
      const profile =
        mode === 'sign-in'
          ? await signIn(email, password)
          : await signUp({ email, password, displayName })
      const preference = await getStylePreference(profile.id)
      navigate(preference ? '/feed' : '/profile-setup', { replace: true })
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to sign in.')
    }
  }

  const demoCredentials = getDemoCredentials()

  return (
    <GlowBackground className="flex items-center justify-center px-6 py-12"
    >
      <div className="w-full max-w-4xl">
        {/* Logo */}
        <div className="mb-10 text-center">
          <img
            src="/src/images/EcoThread_Logo.png"
            alt="EcoThread logo"
            className="mx-auto mb-4"
            style={{ height: 80, width: 'auto' }}
          />
          <h1
            className="mb-2"
            style={{ fontSize: 28, letterSpacing: 8, color: 'var(--deep-navy)' }}
          >
            EcoThread
          </h1>
          <p style={{ fontSize: 10, letterSpacing: 4, color: 'var(--forest-sage)', textTransform: 'uppercase' }}>
            sustainable secondhand fashion · hackprinceton 2026
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Left — form */}
          <div
            className="space-y-5 rounded-xl p-8"
            style={{ background: 'white', border: '0.5px solid var(--sage-mist)' }}
          >
            {/* Tabs */}
            <div className="flex gap-2">
              <button
                className={mode === 'sign-in' ? 'tab-button tab-button-active' : 'tab-button'}
                onClick={() => setMode('sign-in')}
                type="button"
              >
                Sign in
              </button>
              <button
                className={mode === 'sign-up' ? 'tab-button tab-button-active' : 'tab-button'}
                onClick={() => setMode('sign-up')}
                type="button"
              >
                Sign up
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === 'sign-up' ? (
                <label className="field-shell">
                  <span>Display name</span>
                  <input onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
                </label>
              ) : null}

              <label className="field-shell">
                <span>Email</span>
                <input
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@ecothread.dev"
                  type="email"
                  value={email}
                />
              </label>

              <label className="field-shell">
                <span>Password</span>
                <input onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
              </label>

              {error ? (
                <div
                  className="p-3 text-sm"
                  style={{ border: '0.5px solid var(--red)', color: 'var(--red)', borderRadius: 4 }}
                >
                  {error}
                </div>
              ) : null}

              <button className="btn-save btn-save-wide w-full justify-center" type="submit">
                {mode === 'sign-in' ? 'ENTER FEED' : 'CREATE ACCOUNT'}
              </button>
            </form>
          </div>

          {/* Right — demo accounts */}
          <div
            className="space-y-4 rounded-xl p-8"
            style={{ background: 'var(--seafoam)', border: '0.5px solid var(--sage-mist)' }}
          >
            <p style={{ fontSize: 9, letterSpacing: 4, color: 'var(--forest-sage)', textTransform: 'uppercase' }}>
              Try a demo account
            </p>
            <div className="space-y-2">
              {demoCredentials.map((account) => (
                <button
                  className="demo-login w-full"
                  key={account.email}
                  onClick={() => {
                    setMode('sign-in')
                    setEmail(account.email)
                    setPassword(account.password)
                  }}
                  type="button"
                >
                  <span className="text-left">
                    <span
                      className="block text-[11px] uppercase tracking-[0.2em]"
                      style={{ color: 'var(--deep-navy)' }}
                    >
                      {account.label}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--forest-sage)' }}>
                      {account.email}
                    </span>
                  </span>
                  <span style={{ color: 'var(--steel-blue)' }}>→</span>
                </button>
              ))}
            </div>
            <div
              className="mt-4 space-y-2 pt-4 text-[11px] leading-relaxed"
              style={{ borderTop: '0.5px solid var(--sage-mist)', color: 'var(--forest-sage)' }}
            >
              <p>Pinterest-style feed with sustainability scoring.</p>
              <p>Pin items to boards, track your carbon savings.</p>
              <p>Works offline — mock data always available.</p>
            </div>
          </div>
        </div>
      </div>
    </GlowBackground>
  )
}

export function ProfileSetupPage(): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, refreshUser } = useAuth()
  const preferenceQuery = useQuery({
    queryKey: ['style-preference', user?.id],
    queryFn: () => getStylePreference(user!.id),
    enabled: Boolean(user),
  })

  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [styleTags, setStyleTags] = useState<string[]>([])
  const [occasions, setOccasions] = useState<string[]>([])
  const [styleText, setStyleText] = useState('')

  useEffect(() => {
    if (preferenceQuery.data) {
      setStyleTags(preferenceQuery.data.style_tags)
      setOccasions(preferenceQuery.data.occasions)
      setStyleText(preferenceQuery.data.style_text ?? '')
    }
  }, [preferenceQuery.data])

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updateProfileLocal(user!.id, { display_name: displayName.trim() || null })
      await upsertStylePreference(user!.id, {
        style_tags: styleTags,
        occasions,
        style_text: styleText.trim() || null,
      })
    },
    onSuccess: async () => {
      await refreshUser()
      await queryClient.invalidateQueries({ queryKey: ['style-preference', user?.id] })
      navigate('/feed')
    },
  })

  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="panel overflow-hidden">
        <div className="titlebar">
          <span>profile_setup.exe</span>
          <span className="text-[10px] uppercase tracking-[0.25em]">phase 03</span>
        </div>
        <div className="pixel-bar" />
        <form
          className="grid gap-6 p-6 lg:grid-cols-[0.75fr_1.25fr]"
          onSubmit={(event) => {
            event.preventDefault()
            void saveMutation.mutateAsync()
          }}
        >
          <div className="space-y-5">
            <div className="panel-flat p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-text-silver">Identity cache</p>
              <label className="field-shell mt-3">
                <span>Display name</span>
                <input onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
              </label>
            </div>

            <div className="panel-flat p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-text-silver">Moodboard prompt</p>
              <label className="field-shell mt-3">
                <span>Free-form style note</span>
                <textarea
                  onChange={(event) => setStyleText(event.target.value)}
                  placeholder="Chrome hearts meets library-core with a little thrift-store sparkle..."
                  rows={6}
                  value={styleText}
                />
              </label>
            </div>
          </div>

          <div className="space-y-6">
            <PickerSection
              helpText="Choose the aesthetics that should steer your feed."
              options={STYLE_TAGS}
              selected={styleTags}
              title="Style tags"
              toggle={(nextValue) => setStyleTags(toggleValue(styleTags, nextValue))}
            />
            <PickerSection
              helpText="Occasions shape the kinds of pieces we surface first."
              options={OCCASIONS}
              selected={occasions}
              title="Occasions"
              toggle={(nextValue) => setOccasions(toggleValue(occasions, nextValue))}
            />

            <div className="flex justify-end">
              <button className="btn-save btn-save-wide" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? 'SAVING...' : 'BOOT_FEED'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}

export function FeedPage(): JSX.Element {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [savingProduct, setSavingProduct] = useState<Product | null>(null)
  const [showCreateBoard, setShowCreateBoard] = useState(false)
  const deferredSearch = useDeferredValue(searchParams.get('q') ?? '')
  const retailer = searchParams.get('retailer') ?? 'all'

  const feedQuery = useProductFeed({ search: deferredSearch, retailer })
  const boardsQuery = useQuery({
    queryKey: ['boards', user?.id],
    queryFn: () => listBoards(user!.id),
    enabled: Boolean(user),
  })
  const pinnedIdsQuery = useQuery({
    queryKey: ['pinned-products', user?.id],
    queryFn: () => getPinnedProductIds(user!.id),
    enabled: Boolean(user),
  })
  const sustainabilityQuery = useQuery({
    queryKey: ['sustainability', selectedProduct?.id],
    queryFn: () => getSustainabilityLocal(selectedProduct!),
    enabled: Boolean(selectedProduct),
  })

  const createBoardMutation = useMutation({
    mutationFn: (input: { name: string; description: string; occasion: string }) => createBoardLocal(user!.id, input),
    onSuccess: async (board) => {
      await queryClient.invalidateQueries({ queryKey: ['boards', user?.id] })
      setShowCreateBoard(false)
      if (savingProduct) {
        await addPinMutation.mutateAsync({ boardId: board.id, product: savingProduct })
      }
    },
  })

  const addPinMutation = useMutation({
    mutationFn: ({ boardId, product }: { boardId: string; product: Product }) =>
      addPinToBoard(user!.id, boardId, product),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['boards', user?.id] })
      await queryClient.invalidateQueries({ queryKey: ['board-pins', user?.id] })
      await queryClient.invalidateQueries({ queryKey: ['pinned-products', user?.id] })
      setSavingProduct(null)
    },
  })

  const products = feedQuery.data?.pages.flatMap((page) => page) ?? []
  const pinnedIds = new Set(pinnedIdsQuery.data ?? [])

  return (
    <div>
      <div className="feed-header">
        <span className="feed-title">+ PICKED FOR YOU — {products.length} ITEMS</span>
        <span className="feed-hint">click to explore ·  ★ to pin</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {RETAILER_OPTIONS.map((option) => (
          <button
            className={option === retailer ? 'chip chip-active' : 'chip'}
            key={option}
            onClick={() => {
              const params = new URLSearchParams(searchParams)
              if (option === 'all') params.delete('retailer')
              else params.set('retailer', option)
              setSearchParams(params)
            }}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>

      {feedQuery.isError ? (
        <div className="panel p-6 text-sm text-red">
          {feedQuery.error instanceof Error ? feedQuery.error.message : 'Unable to load recommendations.'}
        </div>
      ) : feedQuery.isLoading ? (
        <div className="panel p-6 text-sm" style={{ color: 'var(--forest-sage)' }}>
          Loading...
        </div>
      ) : (
        <>
          <MasonryGrid>
            {products.map((product) => (
              <ProductCard
                key={product.id}
                onOpen={() => setSelectedProduct(product)}
                onSave={() => setSavingProduct(product)}
                pinned={pinnedIds.has(product.id)}
                product={product}
              />
            ))}
          </MasonryGrid>

          <div className="flex justify-center mt-6">
            {feedQuery.hasNextPage ? (
              <button className="btn-secondary" onClick={() => void feedQuery.fetchNextPage()} type="button">
                LOAD MORE
              </button>
            ) : (
              <span className="text-[10px] uppercase tracking-[0.24em]" style={{ color: 'var(--forest-sage)' }}>
                End of archive
              </span>
            )}
          </div>
        </>
      )}

      {selectedProduct ? (
        <ProductDetailModal
          loading={sustainabilityQuery.isLoading}
          onClose={() => setSelectedProduct(null)}
          onSave={() => {
            setSavingProduct(selectedProduct)
            setSelectedProduct(null)
          }}
          product={selectedProduct}
          result={sustainabilityQuery.data ?? null}
        />
      ) : null}

      {savingProduct ? (
        <BoardSelectorModal
          boards={boardsQuery.data ?? []}
          onClose={() => setSavingProduct(null)}
          onCreateNew={() => setShowCreateBoard(true)}
          onSelect={(boardId) => void addPinMutation.mutateAsync({ boardId, product: savingProduct })}
        />
      ) : null}

      {showCreateBoard ? (
        <CreateBoardModal
          onClose={() => {
            setShowCreateBoard(false)
            if (!savingProduct) {
              setSavingProduct(null)
            }
          }}
          onCreate={(input) => void createBoardMutation.mutateAsync(input)}
        />
      ) : null}
    </div>
  )
}

export function BoardsPage(): JSX.Element {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showCreateBoard, setShowCreateBoard] = useState(false)
  const boardsQuery = useQuery({
    queryKey: ['boards', user?.id],
    queryFn: () => listBoards(user!.id),
    enabled: Boolean(user),
  })
  const pinsQuery = useQuery({
    queryKey: ['board-pins', user?.id],
    queryFn: () => listPins(user!.id),
    enabled: Boolean(user),
  })

  const createBoardMutation = useMutation({
    mutationFn: (input: { name: string; description: string; occasion: string }) => createBoardLocal(user!.id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['boards', user?.id] })
      setShowCreateBoard(false)
    },
  })

  const boardPins = pinsQuery.data ?? []

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden">
        <div className="titlebar">
          <span>boards.exe</span>
          <span className="text-[10px] uppercase tracking-[0.25em]">pinning workflow</span>
        </div>
        <div className="pixel-bar" />
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl text-text-dark">Saved boards</h1>
            <p className="mt-1 text-sm text-text-silver">Alternate purple and blue stripes keep each board distinct at a glance.</p>
          </div>
          <button className="btn-save" onClick={() => setShowCreateBoard(true)} type="button">
            NEW_BOARD
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {(boardsQuery.data ?? []).map((board) => (
          <BoardCard
            board={board}
            key={board.id}
            pins={boardPins.filter((pin) => pin.board_id === board.id).slice(0, 4)}
          />
        ))}
      </div>

      {showCreateBoard ? (
        <CreateBoardModal
          onClose={() => setShowCreateBoard(false)}
          onCreate={(input) => void createBoardMutation.mutateAsync(input)}
        />
      ) : null}
    </div>
  )
}

export function BoardDetailPage(): JSX.Element {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const boardQuery = useQuery({
    queryKey: ['board', user?.id, id],
    queryFn: () => getBoard(user!.id, id),
    enabled: Boolean(user && id),
  })
  const pinsQuery = useQuery({
    queryKey: ['board-pins', user?.id, id],
    queryFn: () => listPins(user!.id, id),
    enabled: Boolean(user && id),
  })
  const sustainabilityQuery = useQuery({
    queryKey: ['sustainability', selectedProduct?.id],
    queryFn: () => getSustainabilityLocal(selectedProduct!),
    enabled: Boolean(selectedProduct),
  })
  const removePinMutation = useMutation({
    mutationFn: (pinId: string) => removePinFromBoard(user!.id, pinId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['board-pins', user?.id] })
      await queryClient.invalidateQueries({ queryKey: ['pinned-products', user?.id] })
    },
  })

  const board = boardQuery.data
  const pins = pinsQuery.data ?? []

  if (!board) {
    return (
      <div className="panel p-6 text-sm text-text-silver">
        Board not found. <Link className="text-purple underline" to="/boards">Return to boards</Link>.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden">
        <div className="titlebar">
          <span>{board.name}.exe</span>
          <span className="text-[10px] uppercase tracking-[0.25em]">{board.occasion ?? 'open board'}</span>
        </div>
        <div className="pixel-bar" />
        <div className="space-y-3 p-4">
          <p className="text-xs uppercase tracking-[0.28em] text-text-silver">
            C:\users\boards\{board.name.toLowerCase().replace(/\s+/g, '-')}\_<span className="status-cursor">|</span>
          </p>
          <p className="text-sm leading-relaxed text-text-silver">
            {board.description ?? 'This board is ready for a few more pins and a quick demo walkthrough.'}
          </p>
        </div>
      </section>

      <MasonryGrid>
        {pins.map((pin) => (
          <ProductCard
            key={pin.id}
            onOpen={() => setSelectedProduct(pin.product_data)}
            onSave={() => setSelectedProduct(pin.product_data)}
            product={pin.product_data}
            secondaryAction={{
              label: 'REMOVE',
              onClick: () => void removePinMutation.mutateAsync(pin.id),
            }}
          />
        ))}
      </MasonryGrid>

      {selectedProduct ? (
        <ProductDetailModal
          loading={sustainabilityQuery.isLoading}
          onClose={() => setSelectedProduct(null)}
          onSave={() => setSelectedProduct(null)}
          product={selectedProduct}
          result={sustainabilityQuery.data ?? null}
        />
      ) : null}
    </div>
  )
}

export function ProfilePage(): JSX.Element {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const preferenceQuery = useQuery({
    queryKey: ['style-preference', user?.id],
    queryFn: () => getStylePreference(user!.id),
    enabled: Boolean(user),
  })
  const boardsQuery = useQuery({
    queryKey: ['boards', user?.id],
    queryFn: () => listBoards(user!.id),
    enabled: Boolean(user),
  })
  const pinsQuery = useQuery({
    queryKey: ['board-pins', user?.id],
    queryFn: () => listPins(user!.id),
    enabled: Boolean(user),
  })

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="panel overflow-hidden">
        <div className="titlebar">
          <span>profile.exe</span>
          <span className="text-[10px] uppercase tracking-[0.25em]">account shell</span>
        </div>
        <div className="pixel-bar" />
        <div className="space-y-4 p-5">
          <div className="avatar-shell">{(user?.display_name ?? user?.email ?? '?').slice(0, 1).toUpperCase()}</div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-text-silver">Display name</p>
            <h1 className="text-2xl text-text-dark">{user?.display_name ?? 'Anonymous curator'}</h1>
            <p className="mt-1 text-sm text-text-silver">{user?.email}</p>
          </div>

          <div className="panel-flat grid gap-3 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-silver">Boards</span>
              <span className="text-blue">{boardsQuery.data?.length ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-silver">Pins</span>
              <span className="text-blue">{pinsQuery.data?.length ?? 0}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn-secondary" onClick={() => navigate('/profile-setup')} type="button">
              EDIT_PREFERENCES
            </button>
            <button
              className="btn-save"
              onClick={() => {
                void signOut().then(() => navigate('/auth'))
              }}
              type="button"
            >
              SIGN_OUT
            </button>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="titlebar">
          <span>taste_profile.exe</span>
          <span className="text-[10px] uppercase tracking-[0.25em]">style cache</span>
        </div>
        <div className="pixel-bar" />
        <div className="space-y-5 p-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-text-silver">Style tags</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {preferenceQuery.data?.style_tags.map((tag) => (
                <span className="chip chip-active" key={tag}>
                  {tag}
                </span>
              )) ?? <span className="text-sm text-text-silver">No preferences saved yet.</span>}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-text-silver">Occasions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {preferenceQuery.data?.occasions.map((occasion) => (
                <span className="chip" key={occasion}>
                  {occasion}
                </span>
              )) ?? null}
            </div>
          </div>

          <div className="panel-flat p-4 text-sm leading-7 text-text-silver">
            {preferenceQuery.data?.style_text ??
              'Save a short taste note and the feed will use it as part of the local ranking signal until the generated Kizaki SDK lands.'}
          </div>
        </div>
      </section>
    </div>
  )
}

function PickerSection({
  title,
  options,
  selected,
  toggle,
  helpText,
}: {
  title: string
  options: readonly string[]
  selected: string[]
  toggle: (value: string) => void
  helpText: string
}): JSX.Element {
  return (
    <div className="panel-flat p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-text-silver">{title}</p>
      <p className="mt-2 text-sm text-text-silver">{helpText}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            className={selected.includes(option) ? 'chip chip-active' : 'chip'}
            key={option}
            onClick={() => toggle(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function toggleValue(values: string[], nextValue: string): string[] {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue]
}
