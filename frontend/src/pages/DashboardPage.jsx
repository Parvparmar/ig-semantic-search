import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ingestReels, searchReels, listReels, deleteReel } from '../lib/api'
import styles from './DashboardPage.module.css'

const SEARCH_HISTORY_KEY = 'rs_search_history'

function getHistory() {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]') } catch { return [] }
}
function pushHistory(q) {
  const h = [q, ...getHistory().filter(x => x !== q)].slice(0, 10)
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(h))
}

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const [tab, setTab] = useState('search')          // 'search' | 'library' | 'add'

  // Search state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [history, setHistory] = useState(getHistory)
  const [showHistory, setShowHistory] = useState(false)

  // Library state
  const [reels, setReels] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  // Add state
  const [urlInput, setUrlInput] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [ingestResult, setIngestResult] = useState(null)

  const searchRef = useRef(null)

  // Load library when switching to library tab
  useEffect(() => {
    if (tab === 'library') loadLibrary()
  }, [tab])

  async function loadLibrary() {
    setLibraryLoading(true)
    try {
      const data = await listReels()
      setReels(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLibraryLoading(false)
    }
  }

  async function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true); setSearchError(''); setResults([])
    pushHistory(query.trim()); setHistory(getHistory()); setShowHistory(false)
    try {
      const data = await searchReels(query.trim())
      setResults(data)
    } catch (err) {
      setSearchError(err.message)
    } finally {
      setSearching(false)
    }
  }

  async function handleIngest(e) {
    e.preventDefault()
    const urls = urlInput.split('\n').map(s => s.trim()).filter(Boolean)
    if (!urls.length) return
    setIngesting(true); setIngestResult(null)
    try {
      const data = await ingestReels(urls)
      setIngestResult(data)
      setUrlInput('')
    } catch (err) {
      setIngestResult({ error: err.message })
    } finally {
      setIngesting(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Remove this reel?')) return
    setDeletingId(id)
    try {
      await deleteReel(id)
      setReels(r => r.filter(x => x.id !== id))
    } catch (e) { alert(e.message) }
    finally { setDeletingId(null) }
  }

  function scoreBar(score) {
    const pct = Math.round(score * 100)
    return (
      <div className={styles.scoreBar} title={`${pct}% match`}>
        <div className={styles.scoreFill} style={{ width: `${pct}%` }} />
        <span className={styles.scoreLabel}>{pct}%</span>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.wordmark}>
          <span className={styles.reel}>Reel</span><span className={styles.search}>Search</span>
        </div>
        <nav className={styles.nav}>
          {[
            { id: 'search',  label: 'Search',  icon: '⌕' },
            { id: 'library', label: 'Library', icon: '◫' },
            { id: 'add',     label: 'Add Reels', icon: '+' },
          ].map(({ id, label, icon }) => (
            <button key={id} className={`${styles.navBtn} ${tab === id ? styles.active : ''}`}
              onClick={() => setTab(id)}>
              <span className={styles.navIcon}>{icon}</span> {label}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <p className={styles.userEmail}>{user?.email}</p>
          <button className={styles.signOut} onClick={signOut}>Sign out</button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className={styles.main}>

        {/* ── SEARCH TAB ─────────────────────────────────────────────────── */}
        {tab === 'search' && (
          <section className={styles.section}>
            <h1 className={styles.heading}>Search your reels</h1>
            <p className={styles.sub}>Describe what you remember — not hashtags, just meaning.</p>

            <form onSubmit={handleSearch} className={styles.searchForm}>
              <div className={styles.searchBox}>
                <input
                  ref={searchRef}
                  className={styles.searchInput}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => setShowHistory(true)}
                  onBlur={() => setTimeout(() => setShowHistory(false), 150)}
                  placeholder="that pasta recipe with butter and anchovies…"
                  autoComplete="off"
                />
                {showHistory && history.length > 0 && (
                  <ul className={styles.historyList}>
                    {history.map((h, i) => (
                      <li key={i}>
                        <button type="button" onMouseDown={() => { setQuery(h); setShowHistory(false) }}
                          className={styles.historyItem}>
                          ↑ {h}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button type="submit" disabled={searching || !query.trim()} className={styles.searchBtn}>
                {searching ? '…' : 'Search'}
              </button>
            </form>

            {searchError && <p className={styles.error}>{searchError}</p>}

            {results.length > 0 && (
              <ul className={styles.results}>
                {results.map((r, i) => (
                  <li key={r.id} className={styles.resultCard} style={{ animationDelay: `${i * 60}ms` }}>
                    <div className={styles.resultTop}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className={styles.resultUrl}>
                        {r.url.replace('https://www.instagram.com/reels/', '').replace(/\/$/, '')}
                      </a>
                      {scoreBar(r.score)}
                    </div>
                    <p className={styles.transcription}>{r.transcription}</p>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className={styles.openLink}>
                      Open reel ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {!searching && results.length === 0 && query && !searchError && (
              <p className={styles.empty}>No results found. Try different words, or add more reels.</p>
            )}
          </section>
        )}

        {/* ── LIBRARY TAB ────────────────────────────────────────────────── */}
        {tab === 'library' && (
          <section className={styles.section}>
            <h1 className={styles.heading}>Your library</h1>
            <p className={styles.sub}>{reels.length} reel{reels.length !== 1 ? 's' : ''} indexed</p>

            {libraryLoading && <p className={styles.loading}>Loading…</p>}

            {!libraryLoading && reels.length === 0 && (
              <div className={styles.emptyState}>
                <p>No reels yet.</p>
                <button className={styles.ctaLink} onClick={() => setTab('add')}>Add your first reel →</button>
              </div>
            )}

            {!libraryLoading && reels.length > 0 && (
              <ul className={styles.libraryList}>
                {reels.map(r => (
                  <li key={r.id} className={styles.libraryItem}>
                    <div className={styles.libraryMeta}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className={styles.resultUrl}>
                        {r.url}
                      </a>
                      <time className={styles.date}>
                        {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </time>
                    </div>
                    <p className={styles.transcriptionSmall}>{r.transcription.slice(0, 160)}{r.transcription.length > 160 ? '…' : ''}</p>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                    >
                      {deletingId === r.id ? 'Removing…' : 'Remove'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── ADD TAB ─────────────────────────────────────────────────────── */}
        {tab === 'add' && (
          <section className={styles.section}>
            <h1 className={styles.heading}>Add reels</h1>
            <p className={styles.sub}>Paste Instagram reel URLs — one per line. The audio will be transcribed and made searchable.</p>

            <form onSubmit={handleIngest} className={styles.addForm}>
              <textarea
                className={styles.urlTextarea}
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder={`https://www.instagram.com/reels/ABC123/\nhttps://www.instagram.com/reels/XYZ789/`}
                rows={6}
                disabled={ingesting}
              />
              <button type="submit" disabled={ingesting || !urlInput.trim()} className={styles.ingestBtn}>
                {ingesting ? 'Processing… (this can take a minute)' : 'Transcribe & index'}
              </button>
            </form>

            {ingestResult && !ingestResult.error && (
              <div className={styles.ingestReport}>
                {ingestResult.processed?.length > 0 && (
                  <div className={styles.reportSection}>
                    <h3>✓ Processed ({ingestResult.processed.length})</h3>
                    <ul>
                      {ingestResult.processed.map((p, i) => (
                        <li key={i} className={styles.reportItem}>
                          <span className={styles.reportUrl}>{p.url}</span>
                          {p.status === 'already_indexed'
                            ? <span className={styles.badge}>Already indexed</span>
                            : <p className={styles.snippet}>{p.transcription}</p>
                          }
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ingestResult.errors?.length > 0 && (
                  <div className={styles.reportSection}>
                    <h3>✗ Errors ({ingestResult.errors.length})</h3>
                    <ul>
                      {ingestResult.errors.map((e, i) => (
                        <li key={i} className={styles.reportItem}>
                          <span className={styles.reportUrl}>{e.url}</span>
                          <span className={styles.reportError}>{e.error}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {ingestResult?.error && <p className={styles.error}>{ingestResult.error}</p>}

            <div className={styles.cookieNote}>
              <strong>Note on cookies:</strong> Instagram requires authentication to download reels.
              Export your cookies from your logged-in browser using a tool like <em>Get cookies.txt</em>,
              save as <code>cookies.txt</code> in the backend folder, and restart the server.
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
