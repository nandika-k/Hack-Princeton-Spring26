import { useQuery } from '@tanstack/react-query'
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getAccountSnapshot,
  getStylePreference,
  listBoards,
} from '../lib/rewear-store'
import { Component as GlowBackground } from './ui/background-components'

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
          <div className="panel max-w-lg p-6 text-sm">
            <div className="titlebar mb-4">EcoThread</div>
            <p style={{ color: 'var(--forest-sage)' }}>Loading wardrobe...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate replace state={{ from: location }} to="/auth" />
  }

  if (preferenceQuery.isError) {
    return (
      <div className="app-shell">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <div className="panel max-w-xl p-6 text-sm text-red">
            <div className="titlebar mb-4">EcoThread</div>
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
    return <Navigate replace to="/profile-setup" />
  }

  if (hasPreference && location.pathname === '/profile-setup') {
    return <Navigate replace to="/feed" />
  }

  return <ShellLayout />
}

function ShellLayout(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const searchValue =
    location.pathname === '/feed' ? (searchParams.get('q') ?? '') : ''

  function handleSearchChange(next: string): void {
    const params = new URLSearchParams()
    if (next.trim()) params.set('q', next.trim())
    const retailer = searchParams.get('retailer')
    if (retailer) params.set('retailer', retailer)
    const search = params.toString()
    navigate({ pathname: '/feed', search: search ? `?${search}` : '' })
  }

  return (
    <GlowBackground>
      <Navigation onSearchChange={handleSearchChange} searchValue={searchValue} />
      <div className="shell-body flex-1">
        <Sidebar />
        <main className="feed-main">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </GlowBackground>
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
    <header className="reworn-topbar">
      <div className="reworn-topbar-inner">
        <div className="reworn-logo flex items-center gap-3">
          <img src="/src/images/EcoThread_Logo.png" alt="EcoThread" style={{ height: 32, width: 'auto' }} />
          EcoThread
        </div>
        <div className="flex items-center gap-4">
          <nav className="reworn-nav">
            <NavLink
              className={({ isActive }) =>
                isActive ? 'nav-pill nav-pill-active' : 'nav-pill'
              }
              to="/feed"
            >
              discover
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                isActive ? 'nav-pill nav-pill-active' : 'nav-pill'
              }
              to="/boards"
            >
              saved
            </NavLink>
            <NavLink
              className={({ isActive }) =>
                isActive ? 'nav-pill nav-pill-active' : 'nav-pill'
              }
              to="/profile"
            >
              my.closet
            </NavLink>
          </nav>
          <SearchBar onChange={onSearchChange} value={searchValue} />
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
    const id = window.setTimeout(() => {
      if (draft !== value) onChange(draft)
    }, 300)
    return () => window.clearTimeout(id)
  }, [draft, onChange, value])

  return (
    <form
      className="search-shell"
      onSubmit={(e) => {
        e.preventDefault()
        onChange(draft)
      }}
    >
      <input
        aria-label="Search feed"
        className="search-input"
        onChange={(e) => setDraft(e.target.value)}
        placeholder="search..."
        value={draft}
      />
      <button className="search-button" type="submit">
        ↵
      </button>
    </form>
  )
}

const BOARD_ICONS = ['+', '❊', '♦', '◆', '✦', '·']

function Sidebar(): JSX.Element {
  const { user } = useAuth()
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

  const styleTags = preferenceQuery.data?.style_tags ?? []
  const boards = boardsQuery.data ?? []

  return (
    <aside className="reworn-sidebar">
      <div className="sidebar-section">
        <span className="sidebar-label">MY STYLE TAGS</span>
        <div className="sidebar-tags">
          {styleTags.map((tag) => (
            <span className="style-tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="sidebar-section">
        <span className="sidebar-label">MY BOARDS</span>
        <div className="sidebar-boards">
          {boards.map((board, i) => (
            <Link
              className="sidebar-board-item"
              key={board.id}
              to={`/boards/${board.id}`}
            >
              <span className="board-icon">
                {BOARD_ICONS[i % BOARD_ICONS.length]}
              </span>
              <span className="board-meta">
                <span className="board-name-text">{board.name}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </aside>
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
