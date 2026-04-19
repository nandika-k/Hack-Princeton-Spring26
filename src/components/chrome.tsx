import { useQuery } from '@tanstack/react-query'
import {
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAccountSnapshot, getStylePreference } from '../lib/rewear-store'

export function AuthGate(): JSX.Element {
  const location = useLocation()
  const { user, loading } = useAuth()
  const preferenceQuery = useQuery({
    queryKey: ['style-preference', user?.id],
    queryFn: () => getStylePreference(user!.id),
    enabled: Boolean(user),
  })

  if (loading || preferenceQuery.isLoading) {
    return (
      <div className="app-shell">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <div className="panel max-w-lg p-6 text-sm text-text-dark">
            <div className="titlebar mb-4">rewear.exe</div>
            <p>Booting wardrobe shell...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />
  }

  if (preferenceQuery.isError) {
    return (
      <div className="app-shell">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <div className="panel max-w-xl p-6 text-sm text-red">
            <div className="titlebar mb-4">rewear.exe</div>
            <p>
              {preferenceQuery.error instanceof Error
                ? preferenceQuery.error.message
                : 'Unable to reach the local Supabase backend.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const hasPreference = Boolean(preferenceQuery.data)
  if (!hasPreference && location.pathname !== '/profile-setup') {
    return <Navigate to="/profile-setup" replace />
  }

  if (hasPreference && location.pathname === '/profile-setup') {
    return <Navigate to="/feed" replace />
  }

  return <ShellLayout />
}

function ShellLayout(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const searchValue = location.pathname === '/feed' ? searchParams.get('q') ?? '' : ''

  function handleSearchChange(next: string): void {
    const params = new URLSearchParams()
    if (next.trim()) {
      params.set('q', next.trim())
    }
    const retailer = searchParams.get('retailer')
    if (retailer) {
      params.set('retailer', retailer)
    }
    const search = params.toString()
    navigate({
      pathname: '/feed',
      search: search ? `?${search}` : '',
    })
  }

  return (
    <div className="app-shell">
      <Navigation searchValue={searchValue} onSearchChange={handleSearchChange} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <StatusBar />
    </div>
  )
}

function Navigation({
  searchValue,
  onSearchChange,
}: {
  searchValue: string
  onSearchChange: (next: string) => void
}): JSX.Element {
  return (
    <header className="border-b border-border-dim bg-bg-2/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
        <div className="titlebar">
          <span className="flex items-center gap-2">
            <span className="pixel-gem" />
            rewear.exe
          </span>
          <span className="titlebar-controls">
            <button type="button">_</button>
            <button type="button">[]</button>
            <button type="button">x</button>
          </span>
        </div>
        <div className="pixel-bar" />
        <div className="flex flex-col gap-3 border-x border-border-dim bg-bg-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="wordmark">[] [] []</div>
            <nav className="flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.25em]">
              <NavLink className={({ isActive }) => navLinkClass(isActive)} to="/feed">
                Feed
              </NavLink>
              <NavLink className={({ isActive }) => navLinkClass(isActive)} to="/boards">
                Boards
              </NavLink>
              <NavLink className={({ isActive }) => navLinkClass(isActive)} to="/profile">
                Profile
              </NavLink>
            </nav>
          </div>
          <SearchBar value={searchValue} onChange={onSearchChange} />
        </div>
      </div>
    </header>
  )
}

function SearchBar({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}): JSX.Element {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (draft !== value) {
        onChange(draft)
      }
    }, 300)
    return () => window.clearTimeout(timeoutId)
  }, [draft, onChange, value])

  return (
    <form
      className="search-shell"
      onSubmit={(event) => {
        event.preventDefault()
        onChange(draft)
      }}
    >
      <input
        aria-label="Search feed"
        className="search-input"
        onChange={(event) => setDraft(event.target.value)}
        placeholder="search the archive..."
        value={draft}
      />
      <button className="search-button" type="submit">
        O-
      </button>
    </form>
  )
}

function StatusBar(): JSX.Element {
  const { user } = useAuth()
  const snapshotQuery = useQuery({
    queryKey: ['account-snapshot', user?.id],
    queryFn: () => getAccountSnapshot(user!.id),
    enabled: Boolean(user),
  })

  const snapshot = snapshotQuery.data ?? { boards: 0, pins: 0 }

  return (
    <footer className="status-bar">
      <span>USER: {user?.email ?? 'guest'}</span>
      <span>BOARDS: {snapshot.boards}</span>
      <span>PINS: {snapshot.pins}</span>
      <span>
        C:\users\boards\_<span className="status-cursor">|</span>
      </span>
    </footer>
  )
}

function navLinkClass(isActive: boolean): string {
  return isActive ? 'nav-link nav-link-active' : 'nav-link'
}
