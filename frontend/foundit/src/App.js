import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import { createAccount, deleteReel, getReels, rankReels, saveReel, signIn } from './localLibrary';

const ACTIVE_USER_KEY = 'wheres-that-reel-active-user';
const API_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '');

function getTitle(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split('/').filter(Boolean).pop() || 'Untitled reel';
  } catch {
    return 'Untitled reel';
  }
}

function excerpt(text, length = 210) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length).trim()}...` : clean;
}

function matchesQuery(item, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${item.url} ${item.transcription}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function App() {
  const [username, setUsername] = useState(() => window.sessionStorage.getItem(ACTIVE_USER_KEY));
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [showIndexer, setShowIndexer] = useState(false);
  const [selected, setSelected] = useState(null);
  const [url, setUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [semanticResults, setSemanticResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [openActions, setOpenActions] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editTranscription, setEditTranscription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const handleExtensionMessage = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.source !== 'wtr-instagram-extension' || event.data.type !== 'INDEX_COMPLETE' || !event.data.item) return;
      if (!username) return;

      const item = { ...event.data.item, processing: false, progress: 100, status: 'Indexed' };
      saveReel(username, item)
        .then(() => {
          setItems((current) => [item, ...current.filter((savedItem) => savedItem.url !== item.url)]);
          window.postMessage({ source: 'wtr-reel-library', type: 'ACK_COMPLETED', url: item.url }, window.location.origin);
          setNotice('Instagram reel indexed and saved to this device.');
        })
        .catch(() => setNotice('Could not save the Instagram reel to this device.'));
    };

    window.addEventListener('message', handleExtensionMessage);
    window.postMessage({ source: 'wtr-reel-library', type: 'GET_COMPLETED' }, window.location.origin);
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, [username]);

  useEffect(() => {
    if (!username) {
      setHasLoaded(false);
      return;
    }

    getReels(username)
      .then((savedItems) => {
        setItems(savedItems.map((item) => item.processing
          ? { ...item, processing: false, status: 'Indexing interrupted. Add the reel again to retry.' }
          : item));
        setHasLoaded(true);
      })
      .catch(() => setNotice('Could not open this device’s library.'));
  }, [username]);

  useEffect(() => {
    if (!username || !hasLoaded) return;
    Promise.all(items.map((item) => saveReel(username, item))).catch(() => setNotice('Could not save your local library.'));
  }, [hasLoaded, items, username]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSemanticResults([]);
      setIsSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (!API_URL) {
        setSemanticResults(items.filter((item) => matchesQuery(item, trimmedQuery)).slice(0, 3));
        setNotice('Set REACT_APP_API_URL to a public Uvicorn URL for semantic search and indexing.');
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      fetch(`${API_URL}/embed`, {
        body: JSON.stringify({ text: trimmedQuery }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error('Semantic search is unavailable.');
          return response.json();
        })
        .then((data) => {
          setSemanticResults(rankReels(items, data.embedding, 3));
          setNotice('');
        })
        .catch((error) => {
          if (error.name === 'AbortError') return;
          setSemanticResults(items.filter((item) => matchesQuery(item, trimmedQuery)).slice(0, 3));
          setNotice('Semantic search is offline. Showing text matches instead.');
        })
        .finally(() => setIsSearching(false));
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [items, query]);

  const results = useMemo(() => {
    if (!query.trim()) return items;
    const visibleUrls = new Set(items.map((item) => item.url));
    return semanticResults.filter((item) => visibleUrls.has(item.url));
  }, [items, query, semanticResults]);

  const authenticate = async (event) => {
    event.preventDefault();
    setIsAuthenticating(true);
    try {
      const user = authMode === 'create'
        ? await createAccount(authUsername, authPassword)
        : await signIn(authUsername, authPassword);
      window.sessionStorage.setItem(ACTIVE_USER_KEY, user);
      setNotice('');
      setItems([]);
      setHasLoaded(false);
      setUsername(user);
      setAuthPassword('');
    } catch (error) {
      setNotice(error.message || 'Could not sign in on this device.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signOut = () => {
    window.sessionStorage.removeItem(ACTIVE_USER_KEY);
    setUsername(null);
    setItems([]);
    setQuery('');
    setNotice('');
  };

  const addItem = async (event) => {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) return setNotice('Add a reel URL to index it.');
    if (items.some((item) => item.url === normalizedUrl)) return setNotice('That reel is already in your library.');
    if (!API_URL) return setNotice('Set REACT_APP_API_URL to a reachable Uvicorn URL before indexing.');

    const processingItem = {
      url: normalizedUrl,
      transcription: 'Waiting to download...',
      embedding: [],
      addedAt: new Date().toISOString(),
      processing: true,
      progress: 18,
      status: 'Preparing content',
    };
    setItems((current) => [processingItem, ...current]);
    setUrl('');
    setShowIndexer(false);
    setNotice('Indexing started.');

    try {
      const response = await fetch(`${API_URL}/content/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      if (!response.ok) throw new Error('Indexing could not start. Check that the API is reachable.');
      const { job_id: jobId } = await response.json();
      const poll = window.setInterval(async () => {
        try {
          const statusResponse = await fetch(`${API_URL}/content/jobs/${jobId}`);
          if (!statusResponse.ok) throw new Error('Could not read indexing progress.');
          const status = await statusResponse.json();
          setItems((current) => current.map((item) => item.url === normalizedUrl ? {
            ...item,
            transcription: status.transcription || item.transcription,
            progress: status.progress,
            status: status.error ? `Indexing failed: ${status.error}` : status.status,
          } : item));
          if (status.complete) {
            window.clearInterval(poll);
            if (status.error) throw new Error(status.error);
            setItems((current) => current.map((item) => item.url === normalizedUrl ? { ...status.item, processing: false, progress: 100, status: 'Indexed' } : item));
            setNotice('Reel indexed and saved to this device.');
          }
        } catch (error) {
          window.clearInterval(poll);
          setItems((current) => current.map((item) => item.url === normalizedUrl ? { ...item, processing: false, status: 'Indexing failed' } : item));
          setNotice(error.message);
        }
      }, 700);
    } catch (error) {
      setItems((current) => current.map((item) => item.url === normalizedUrl ? { ...item, processing: false, status: 'Indexing failed' } : item));
      setNotice(error.message);
    }
  };

  const deleteItem = async (item) => {
    try {
      await deleteReel(username, item.url);
      setItems((current) => current.filter((entry) => entry.url !== item.url));
      setOpenActions(null);
      setSelected(null);
      setEditingItem(null);
      setNotice('Reel removed from this device.');
    } catch (error) {
      setNotice(error.message);
    }
  };

  const openItem = (item) => {
    setEditingItem(null);
    setOpenActions(null);
    setSelected(item);
  };

  const startEditing = (item) => {
    setEditingItem(item);
    setEditTranscription(item.transcription || '');
    setOpenActions(null);
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    const updatedTranscription = editTranscription.trim();
    if (!updatedTranscription) return setNotice('Add a transcription before saving.');
    if (!API_URL) return setNotice('Set REACT_APP_API_URL to a reachable Uvicorn URL to refresh this embedding.');

    setIsSavingEdit(true);
    try {
      const response = await fetch(`${API_URL}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: updatedTranscription }),
      });
      if (!response.ok) throw new Error('Could not regenerate this reel’s embedding.');
      const data = await response.json();
      const updatedItem = { ...editingItem, transcription: updatedTranscription, embedding: data.embedding };
      setItems((current) => current.map((item) => item.url === editingItem.url ? updatedItem : item));
      setSelected(updatedItem);
      setEditingItem(null);
      setNotice('Transcription and local embedding updated.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (!username) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <a className="brand" href="/" aria-label="Reel Library home"><span className="brand-mark" aria-hidden="true">◎</span><span>Reel Library</span></a>
          <p className="eyebrow">Private to this browser</p>
          <h1>{authMode === 'create' ? 'Find stuff instantly.' : 'Welcome back.'}</h1>
          <p className="auth-copy">Your reel transcripts and embeddings stay in this browser on this device.</p>
          <form className="auth-form" onSubmit={authenticate}>
            <label htmlFor="account-name">Username</label>
            <input id="account-name" autoComplete="username" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} required />
            <label htmlFor="account-password">Password</label>
            <input id="account-password" type="password" autoComplete={authMode === 'create' ? 'new-password' : 'current-password'} minLength="8" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required />
            {authMode === 'create' && <p className="auth-hint">Use at least 8 characters. Accounts are stored on this device only.</p>}
            {notice && <p className="auth-error" role="alert">{notice}</p>}
            <button className="primary-button full-width" type="submit" disabled={isAuthenticating}>{isAuthenticating ? 'Please wait...' : authMode === 'create' ? 'Create account' : 'Sign in'} <span aria-hidden="true">→</span></button>
          </form>
          <button className="auth-switch" type="button" onClick={() => { setAuthMode(authMode === 'create' ? 'signin' : 'create'); setNotice(''); }}>
            {authMode === 'create' ? 'Already have an account on this device? Sign in' : 'New here? Create an account'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Reel Library home"><span className="brand-mark" aria-hidden="true">◎</span><span>Reel Library</span></a>
        <nav className="topnav" aria-label="Primary navigation"><span className="nav-active">Library</span><span className="account-name">{username}</span><button className="signout-button" type="button" onClick={signOut}>Sign out</button></nav>
      </header>
      <main className="workspace">
        <section className="library-head"><div><p className="eyebrow">Private workspace</p><h1>Find stuff instantly.</h1><p className="subhead">Search across every reel you have liked or saved.</p></div><button className="primary-button" type="button" onClick={() => setShowIndexer(true)}><span aria-hidden="true">＋</span> Index new content</button></section>
        <section className="search-bar" aria-label="Search library"><span className="search-icon" aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sentences, topics, or even vibes" aria-label="Search transcripts, links, or moments" />{query && <button className="clear-button" onClick={() => setQuery('')} type="button">Clear</button>}<kbd>⌘ K</kbd></section>
        <div className="library-meta"><div><strong>{isSearching ? 'Searching semantically...' : query ? `${results.length} matches` : 'All indexed content'}</strong><span>{items.length} reels in this device’s library</span></div><span className="status"><i /> Semantic index</span></div>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} type="button">×</button></div>}
        <section className="reel-grid" aria-live="polite">
          {results.map((item, index) => <article className={`reel-card ${item.processing ? 'is-processing' : ''}`} key={`${item.url}-${index}`}><div className="card-topline"><span className="reel-type">{item.url.includes('youtu') ? 'YouTube' : 'Instagram'}</span>{!item.processing && <div className="actions-wrap"><button className="more-button" type="button" title="More actions" aria-expanded={openActions === item.url} onClick={() => setOpenActions(openActions === item.url ? null : item.url)}>•••</button>{openActions === item.url && <div className="action-menu"><button type="button" className="delete-action" onClick={() => deleteItem(item)}><span aria-hidden="true">🗑</span>Delete reel</button></div>}</div>}</div><button className="card-body" type="button" onFocus={() => openItem(item)} onClick={() => openItem(item)} disabled={item.processing}><h2>{getTitle(item.url)}</h2><p>{item.processing ? (item.transcription || item.status) : excerpt(item.transcription)}</p>{item.processing && <div className="progress-track"><span style={{ width: `${item.progress || 0}%` }} /></div>}</button><div className="card-footer"><span className="indexed-label"><span className={item.processing ? 'processing-dot' : 'dot'} /> {item.status || 'Indexed'}</span>{!item.processing && <a href={item.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open reel <span aria-hidden="true">↗</span></a>}</div></article>)}
        </section>
        {!results.length && <div className="empty-state"><span>⌕</span><h2>{query ? 'No reels found' : 'Your library is ready'}</h2><p>{query ? 'Try a broader search or index a new piece of content.' : 'Index a reel to start building your private library.'}</p></div>}
      </main>
      {showIndexer && <div className="modal-backdrop" onMouseDown={() => setShowIndexer(false)}><aside className="drawer" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="eyebrow">Library tools</p><h2>Index content</h2></div><button className="close-button" onClick={() => setShowIndexer(false)} type="button">×</button></div><p className="drawer-copy">Add a link and Reel Library will download the audio, transcribe it, and save its embedding to this device.</p><form onSubmit={addItem}><label htmlFor="reel-url">Reel URL</label><input id="reel-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.instagram.com/reel/..." autoFocus required /><button className="primary-button full-width" type="submit">Download and index <span aria-hidden="true">→</span></button></form></aside></div>}
      {selected && <div className="modal-backdrop" onMouseDown={() => { setEditingItem(null); setSelected(null); }}><div className="detail-modal" onMouseDown={(event) => event.stopPropagation()}><div className="card-topline"><span className="reel-type">{editingItem ? 'Edit transcription' : (selected.url.includes('youtu') ? 'YouTube' : 'Instagram')}</span><div className="detail-actions">{!editingItem && <button className="edit-icon" type="button" title="Edit transcription" onClick={() => startEditing(selected)}>✎</button>}<button className="close-button" type="button" onClick={() => { setEditingItem(null); setSelected(null); }}>×</button></div></div>{editingItem ? <form className="detail-edit-form" onSubmit={saveEdit}><h2>Edit transcription</h2><p className="drawer-copy">Saving regenerates and stores this reel’s embedding on this device.</p><textarea id="edit-transcription" value={editTranscription} onChange={(event) => setEditTranscription(event.target.value)} rows="12" autoFocus required /><button className="primary-button full-width" type="submit" disabled={isSavingEdit}>{isSavingEdit ? 'Re-indexing...' : 'Save and re-index'} <span aria-hidden="true">→</span></button></form> : <><h2>{getTitle(selected.url)}</h2><p className="detail-text">{selected.transcription}</p><a className="primary-button link-button" href={selected.url} target="_blank" rel="noreferrer">Open original <span>↗</span></a></>}</div></div>}
    </div>
  );
}

export default App;