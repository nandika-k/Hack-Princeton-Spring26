import { supabase } from '../integrations/supabase/client'
import { MOCK_PRODUCTS } from './mockProducts'
import type { Board, Pin } from '../types/board'
import type { Product, SustainabilityResult } from '../types/product'
import type { Profile, StylePreference } from '../types/profile'

export const FEED_PAGE_SIZE = 20
export const RETAILER_OPTIONS = ['all', 'depop', 'vinted', 'thredup', 'vestiaire', 'ebay', 'whatnot'] as const
export const DEMO_LOGINS = [
  { email: 'y2k@rewear.dev', password: 'rewear-demo', label: 'Y2K girlhood' },
  { email: 'academia@rewear.dev', password: 'rewear-demo', label: 'Dark academia' },
  { email: 'streetwear@rewear.dev', password: 'rewear-demo', label: 'Streetwear' },
] as const

type StylePreferenceInput = Pick<StylePreference, 'style_tags' | 'occasions' | 'style_text'>
type CreateBoardInput = Pick<Board, 'name' | 'description' | 'occasion'>
type QueryInput = {
  userId: string
  search?: string
  retailer?: string
  page?: number
}

type AccountSnapshot = {
  boards: number
  pins: number
}

type DemoSeed = {
  displayName: string
  preference: StylePreferenceInput
  boards: Array<{
    name: string
    description: string
    occasion: string
    productIds: string[]
  }>
}

const DEMO_SEEDS: Record<string, DemoSeed> = {
  'y2k@rewear.dev': {
    displayName: 'Y2K Girlhood',
    preference: {
      style_tags: ['Y2K', 'Vintage 90s'],
      occasions: ['Date Night'],
      style_text: 'Butterflies, rhinestones, playful denim, and glossy going-out pieces.',
    },
    boards: [
      {
        name: 'Date Night Drop',
        description: 'Glossy Y2K hits for a fun night out.',
        occasion: 'Date Night',
        productIds: ['depop:mock-001', 'depop:mock-015'],
      },
    ],
  },
  'academia@rewear.dev': {
    displayName: 'Dark Academia',
    preference: {
      style_tags: ['Dark Academia', 'Minimalist'],
      occasions: ['Everyday', 'Work'],
      style_text: 'Plaid layers, wool textures, sharp tailoring, and quiet neutrals.',
    },
    boards: [
      {
        name: 'Library.exe',
        description: 'Soft tailoring, corduroy, and plaid layers.',
        occasion: 'Everyday',
        productIds: ['thredup:mock-003', 'vinted:mock-017'],
      },
    ],
  },
  'streetwear@rewear.dev': {
    displayName: 'Streetwear',
    preference: {
      style_tags: ['Streetwear'],
      occasions: ['Everyday'],
      style_text: 'Wide silhouettes, track jackets, cargos, washed black, and sport references.',
    },
    boards: [
      {
        name: 'Weekend Rotation',
        description: 'Cargos, outerwear, and vintage sportswear.',
        occasion: 'Everyday',
        productIds: ['depop:mock-008', 'ebay:mock-013'],
      },
    ],
  },
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Unknown error'
}

function normalizeStylePreference(row: StylePreference | null): StylePreference | null {
  if (!row) return null

  return {
    ...row,
    style_tags: row.style_tags ?? [],
    occasions: row.occasions ?? [],
  }
}

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    description: product.description ?? null,
    price: product.price ?? null,
    currency: product.currency ?? 'USD',
    image_urls: product.image_urls ?? [],
    metadata: product.metadata ?? null,
    last_updated: product.last_updated ?? new Date().toISOString(),
  }
}

function normalizePin(pin: Pin): Pin {
  return {
    ...pin,
    product_data: normalizeProduct(pin.product_data),
  }
}

function getDemoSeed(email: string): DemoSeed | null {
  return DEMO_SEEDS[email] ?? null
}

function getProductOrThrow(productId: string): Product {
  const product = MOCK_PRODUCTS.find((entry) => entry.id === productId)
  if (!product) {
    throw new Error(`Unknown demo product: ${productId}`)
  }
  return normalizeProduct(product)
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    throw new Error(error.message)
  }
  return data.user
}

async function fetchProfileByUserId(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function ensureProfileForCurrentUser(displayName?: string | null): Promise<Profile> {
  const user = await getAuthenticatedUser()
  if (!user) {
    throw new Error('No authenticated Supabase user. Sign in again and retry.')
  }

  let profile: Profile | null = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    profile = await fetchProfileByUserId(user.id)
    if (profile) break
    await wait(120)
  }

  if (!profile) {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        user_id: user.id,
        email: user.email ?? '',
        display_name: displayName ?? null,
      } as never)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    profile = data
  }

  if (displayName && profile.display_name !== displayName) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', profile.id)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    profile = data
  }

  return profile
}

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })

  if (error) {
    throw new Error(
      `${name} failed: ${error.message}. Make sure local Supabase is running and \`supabase functions serve --no-verify-jwt\` is active.`,
    )
  }

  return data as T
}

async function bootstrapDemoProfile(profile: Profile, email: string): Promise<void> {
  const seed = getDemoSeed(email)
  if (!seed) return

  if (profile.display_name !== seed.displayName) {
    await updateProfileLocal(profile.id, { display_name: seed.displayName })
  }

  const preference = await getStylePreference(profile.id)
  if (!preference) {
    await upsertStylePreference(profile.id, seed.preference)
  }

  const existingBoards = await listBoards(profile.id)
  const existingPins = await listPins(profile.id)

  for (const boardSeed of seed.boards) {
    let board = existingBoards.find((entry) => entry.name === boardSeed.name) ?? null

    if (!board) {
      board = await createBoardLocal(profile.id, {
        name: boardSeed.name,
        description: boardSeed.description,
        occasion: boardSeed.occasion,
      })
      existingBoards.push(board)
    }

    const boardPins = existingPins.filter((pin) => pin.board_id === board.id)

    for (const productId of boardSeed.productIds) {
      if (boardPins.some((pin) => pin.product_id === productId)) {
        continue
      }

      const pin = await addPinToBoard(profile.id, board.id, getProductOrThrow(productId))
      existingPins.push(pin)
    }
  }
}

export async function getSessionProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw new Error(error.message)
  }

  if (!data.session) {
    return null
  }

  return ensureProfileForCurrentUser()
}

export async function signInLocal(email: string, password: string): Promise<Profile> {
  const normalizedEmail = email.trim().toLowerCase()
  const demoSeed = getDemoSeed(normalizedEmail)

  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (error) {
    if (demoSeed && password === 'rewear-demo') {
      return signUpLocal({
        email: normalizedEmail,
        password,
        displayName: demoSeed.displayName,
      })
    }

    throw new Error(error.message)
  }

  const profile = await ensureProfileForCurrentUser(demoSeed?.displayName ?? null)

  if (demoSeed) {
    await bootstrapDemoProfile(profile, normalizedEmail)
  }

  return ensureProfileForCurrentUser(demoSeed?.displayName ?? null)
}

export async function signUpLocal(input: {
  email: string
  password: string
  displayName?: string
}): Promise<Profile> {
  const normalizedEmail = input.email.trim().toLowerCase()
  const displayName = input.displayName?.trim() || getDemoSeed(normalizedEmail)?.displayName || null

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: input.password,
    options: {
      data: {
        display_name: displayName,
      },
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data.session) {
    const signInResult = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: input.password,
    })

    if (signInResult.error) {
      throw new Error(signInResult.error.message)
    }
  }

  const profile = await ensureProfileForCurrentUser(displayName)
  const demoSeed = getDemoSeed(normalizedEmail)

  if (demoSeed) {
    await bootstrapDemoProfile(profile, normalizedEmail)
  }

  return ensureProfileForCurrentUser(displayName)
}

export async function signOutLocal(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw new Error(error.message)
  }
}

export async function updateProfileLocal(
  userId: string,
  patch: Partial<Pick<Profile, 'display_name' | 'avatar_url'>>,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: patch.display_name ?? undefined,
      avatar_url: patch.avatar_url ?? undefined,
    })
    .eq('id', userId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function getStylePreference(userId: string): Promise<StylePreference | null> {
  const { data, error } = await supabase
    .from('style_preferences')
    .select('*')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  return normalizeStylePreference((data?.[0] as StylePreference | undefined) ?? null)
}

export async function upsertStylePreference(
  userId: string,
  input: StylePreferenceInput,
): Promise<StylePreference> {
  const existing = await getStylePreference(userId)

  if (existing) {
    const { data, error } = await supabase
      .from('style_preferences')
      .update({
        style_tags: input.style_tags,
        occasions: input.occasions,
        style_text: input.style_text,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return normalizeStylePreference(data as StylePreference)!
  }

  const { data, error } = await supabase
    .from('style_preferences')
    .insert({
      profile_id: userId,
      style_tags: input.style_tags,
      occasions: input.occasions,
      style_text: input.style_text,
    } as never)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return normalizeStylePreference(data as StylePreference)!
}

export async function getRecommendationsLocal(input: QueryInput): Promise<Product[]> {
  const data = await invokeFunction<Product[]>('get-recommendations', {
    page: input.page ?? 0,
    search: input.search?.trim() ?? '',
    retailer: input.retailer ?? 'all',
  })

  return data.map((product) => normalizeProduct(product))
}

export async function getSustainabilityLocal(product: string | Product): Promise<SustainabilityResult> {
  const inputProduct = typeof product === 'string' ? null : normalizeProduct(product)
  const productId = typeof product === 'string' ? product : product.id

  try {
    return await invokeFunction<SustainabilityResult>('calculate-sustainability', {
      productId,
      product: inputProduct,
    })
  } catch (error) {
    if (inputProduct) {
      return {
        score: inputProduct.sustainability_score ?? 65,
        explanation: inputProduct.score_explanation ?? 'Fallback sustainability estimate from local product data.',
        reasoning: inputProduct.score_explanation ?? 'Local backend scoring was unavailable, so the UI is showing a cached estimate.',
        comparison: 'Estimated locally while the backend score warms up.',
      }
    }

    throw new Error(getErrorMessage(error))
  }
}

export async function listBoards(userId: string): Promise<Board[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as Board[]
}

export async function getBoard(userId: string, boardId: string): Promise<Board | null> {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('profile_id', userId)
    .eq('id', boardId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as Board | null
}

export async function createBoardLocal(userId: string, input: CreateBoardInput): Promise<Board> {
  const { data, error } = await supabase
    .from('boards')
    .insert({
      profile_id: userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      occasion: input.occasion?.trim() || null,
    } as never)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as Board
}

export async function listPins(userId: string, boardId?: string): Promise<Pin[]> {
  let query = supabase
    .from('pins')
    .select('*')
    .eq('profile_id', userId)
    .order('created_at', { ascending: false })

  if (boardId) {
    query = query.eq('board_id', boardId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as Pin[]).map((pin) => normalizePin(pin))
}

export async function addPinToBoard(userId: string, boardId: string, product: Product): Promise<Pin> {
  const normalizedProduct = normalizeProduct(product)
  const existingPins = await listPins(userId, boardId)

  if (existingPins.some((pin) => pin.product_id === normalizedProduct.id)) {
    throw new Error('That item is already pinned to this board.')
  }

  const sustainability = await getSustainabilityLocal(normalizedProduct)

  const { data, error } = await supabase
    .from('pins')
    .insert({
      profile_id: userId,
      board_id: boardId,
      product_id: normalizedProduct.id,
      product_data: normalizedProduct as never,
      sustainability_score: sustainability.score,
    } as never)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return normalizePin(data as Pin)
}

export async function removePinFromBoard(userId: string, pinId: string): Promise<void> {
  const { error } = await supabase
    .from('pins')
    .delete()
    .eq('profile_id', userId)
    .eq('id', pinId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function getPinnedProductIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('pins')
    .select('product_id')
    .eq('profile_id', userId)

  if (error) {
    throw new Error(error.message)
  }

  return Array.from(new Set((data ?? []).map((entry) => entry.product_id)))
}

export async function getAccountSnapshot(userId: string): Promise<AccountSnapshot> {
  const [{ count: boardCount, error: boardsError }, { count: pinCount, error: pinsError }] = await Promise.all([
    supabase
      .from('boards')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', userId),
    supabase
      .from('pins')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', userId),
  ])

  if (boardsError) {
    throw new Error(boardsError.message)
  }

  if (pinsError) {
    throw new Error(pinsError.message)
  }

  return {
    boards: boardCount ?? 0,
    pins: pinCount ?? 0,
  }
}

export function getDemoCredentials(): typeof DEMO_LOGINS {
  return DEMO_LOGINS
}
