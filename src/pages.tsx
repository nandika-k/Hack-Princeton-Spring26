import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useDeferredValue, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
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
import type { Board } from './types/board'
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
    <div className="mx-auto grid min-h-[calc(100vh-140px)] w-full max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="panel overflow-hidden">
        <div className="titlebar">
          <span>rewear_bootloader.exe</span>
          <span className="text-[10px] uppercase tracking-[0.25em]">auth shell</span>
        </div>
        <div className="pixel-bar" />
        <div className="grid gap-6 p-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-text-silver">HackPrinceton Spring 2026</p>
            <h1 className="text-4xl leading-tight text-text-dark">Discover secondhand looks with a bright, old-web pulse.</h1>
            <p className="text-sm leading-7 text-text-silver">
              EcoThread pairs a Pinterest-style feed with sustainability scoring, saved boards, and a glitchy Y2K desktop shell.
            </p>
            <div className="panel-flat grid gap-3 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-text-silver">Demo accounts auto-bootstrap on first sign-in</p>
              {demoCredentials.map((account) => (
                <button
                  className="demo-login"
                  key={account.email}
                  onClick={() => {
                    setMode('sign-in')
                    setEmail(account.email)
                    setPassword(account.password)
                  }}
                  type="button"
                >
                  <span className="text-left">
                    <span className="block text-[11px] uppercase tracking-[0.2em] text-purple">{account.label}</span>
                    <span className="block text-xs text-text-silver">
                      {account.email} / {account.password}
                    </span>
                  </span>
                  <span className="text-blue">{'>>'}</span>
                </button>
              ))}
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
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
                placeholder="you@rewear.dev"
                type="email"
                value={email}
              />
            </label>

            <label className="field-shell">
              <span>Password</span>
              <input onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
            </label>

            {error ? <div className="panel-flat border-red p-3 text-sm text-red">{error}</div> : null}

            <button className="btn-save btn-save-wide justify-center" type="submit">
              {mode === 'sign-in' ? 'ENTER_FEED' : 'CREATE_ACCOUNT'}
            </button>
          </form>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="titlebar">
          <span>status_panel.exe</span>
          <span className="text-[10px] uppercase tracking-[0.25em]">demo invariant</span>
        </div>
        <div className="pixel-bar" />
        <div className="space-y-4 p-6 text-sm leading-7 text-text-silver">
          <p>Feed stays populated even if live search is offline.</p>
          <p>ECO badges always render using cached or heuristic scores.</p>
          <p>Three demo personas are already seeded, so the story loop starts immediately.</p>
        </div>
      </section>
    </div>
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
  const preferenceQuery = useQuery({
    queryKey: ['style-preference', user?.id],
    queryFn: () => getStylePreference(user!.id),
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
    <div className="space-y-5">
      <section className="panel overflow-hidden">
        <div className="titlebar">
          <span>feed.exe</span>
          <span className="text-[10px] uppercase tracking-[0.25em]">personalized archive</span>
        </div>
        <div className="pixel-bar" />
        <div className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-text-silver">Current profile</p>
              <h1 className="text-2xl text-text-dark">
                {preferenceQuery.data?.style_tags.join(' / ') || 'Sustainable secondhand staples'}
              </h1>
              <p className="mt-1 text-sm text-text-silver">
                {preferenceQuery.data?.style_text ?? 'Mock-backed feed is ready while backend wiring catches up.'}
              </p>
            </div>
            <div className="panel-flat flex gap-3 p-3 text-xs uppercase tracking-[0.24em] text-text-silver">
              <span>{products.length} cached finds</span>
              <span>{feedQuery.hasNextPage ? 'more pages ready' : 'end of archive'}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
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
        </div>
      </section>

      {feedQuery.isError ? (
        <div className="panel p-6 text-sm text-red">
          {feedQuery.error instanceof Error ? feedQuery.error.message : 'Unable to load recommendations.'}
        </div>
      ) : feedQuery.isLoading ? (
        <div className="panel p-6 text-sm text-text-silver">Loading the thrift cloud...</div>
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

          <div className="flex justify-center">
            {feedQuery.hasNextPage ? (
              <button className="btn-secondary" onClick={() => void feedQuery.fetchNextPage()} type="button">
                LOAD_MORE
              </button>
            ) : (
              <div className="panel-flat px-4 py-2 text-xs uppercase tracking-[0.24em] text-text-silver">
                Archive fully indexed
              </div>
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
