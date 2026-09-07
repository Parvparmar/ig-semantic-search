import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

const STORAGE_KEY = 'wheres-that-reel-library';

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
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [showIndexer, setShowIndexer] = useState(false);
  const [selected, setSelected] = useState(null);
  const [url, setUrl] = useState('');
  const [transcription, setTranscription] = useState('');
  const [notice, setNotice] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [semanticResults, setSemanticResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [openActions, setOpenActions] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editTranscription, setEditTranscription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setItems(JSON.parse(saved));
      setHasLoaded(true);
      return;
    }

    fetch('/content.json')
      .then((response) => response.json())
      .then((data) => {
        setItems(data);
        setHasLoaded(true);
      })
      .catch(() => setNotice('Could not load the indexed library.'));
  }, []);

  useEffect(() => {
    if (hasLoaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [hasLoaded, items]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSemanticResults([]);
      setIsSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearching(true);
      fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/search`, {
        body: JSON.stringify({ query: trimmedQuery, top_k: 3 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error('Semantic search is unavailable.');
          return response.json();
        })
        .then((data) => {
          setSemanticResults(data.results || []);
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

  const addItem = async (event) => {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) return setNotice('Add a reel URL to index it.');
    if (items.some((item) => item.url === normalizedUrl)) return setNotice('That reel is already in your library.');

    const processingItem = {
      url: normalizedUrl,
      transcription: transcription.trim() || 'No transcription added yet.',
      embedding: [],
      addedAt: new Date().toISOString(),
      processing: true,
      progress: 18,
      status: 'Preparing content',
    };
    setItems((current) => [processingItem, ...current]);
    setUrl('');
    setTranscription('');
    setShowIndexer(false);
    setNotice('Indexing started.');

    const progressTimer = window.setInterval(() => {
      setItems((current) => current.map((item) => item.url === normalizedUrl && item.processing
        ? { ...item, progress: Math.min((item.progress || 18) + 16, 82), status: 'Generating semantic embedding' }
        : item));
    }, 350);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl, transcription: processingItem.transcription }),
      });
      if (!response.ok) throw new Error('Indexing failed. Keep the tile and try again when the API is available.');
      const data = await response.json();
      setItems((current) => current.map((item) => item.url === normalizedUrl ? { ...data.item, processing: false, progress: 100, status: 'Indexed' } : item));
      setNotice('Reel indexed and ready for semantic search.');
    } catch (error) {
      setItems((current) => current.map((item) => item.url === normalizedUrl ? { ...item, processing: false, status: 'Indexing failed' } : item));
      setNotice(error.message);
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const deleteItem = (item) => {
    setItems((current) => current.filter((entry) => entry.url !== item.url));
    setOpenActions(null);
    setSelected(null);
    setNotice('Reel removed from your library.');
  };

  const startEditing = (item) => {
    setEditingItem(item);
    setEditTranscription(item.transcription || '');
    setOpenActions(null);
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    const updatedTranscription = editTranscription.trim();
    if (!updatedTranscription) {
      setNotice('Add a transcription before saving.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: editingItem.url, transcription: updatedTranscription }),
      });
      if (!response.ok) throw new Error('Could not re-index this reel.');
      const data = await response.json();
      setItems((current) => current.map((item) => item.url === editingItem.url ? data.item : item));
      setSelected(data.item);
      setEditingItem(null);
      setNotice('Transcription updated and semantic index refreshed.');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Reel Library home"><span className="brand-mark" aria-hidden="true">◎</span><span>Reel Library</span></a>
        <nav className="topnav" aria-label="Primary navigation"><span className="nav-active">Library</span><button className="avatar" type="button" title="Account">P</button></nav>
      </header>
      <main className="workspace">
        <section className="library-head"><div><p className="eyebrow">Private workspace</p><h1>Find the moment.</h1><p className="subhead">Search across every reel you have indexed.</p></div><button className="primary-button" type="button" onClick={() => setShowIndexer(true)}><span aria-hidden="true">＋</span> Index new content</button></section>
        <section className="search-bar" aria-label="Search library"><span className="search-icon" aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transcripts, links, or moments" aria-label="Search transcripts, links, or moments" />{query && <button className="clear-button" onClick={() => setQuery('')} type="button">Clear</button>}<kbd>⌘ K</kbd></section>
        <div className="library-meta"><div><strong>{isSearching ? 'Searching semantically...' : query ? `${results.length} matches` : 'All indexed content'}</strong><span>{items.length} reels in library</span></div><span className="status"><i /> Semantic index</span></div>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} type="button">×</button></div>}
        <section className="reel-grid" aria-live="polite">
          {results.map((item, index) => <article className={`reel-card ${item.processing ? 'is-processing' : ''}`} key={`${item.url}-${index}`}><div className="card-topline"><span className="reel-type">{item.url.includes('youtu') ? 'YouTube' : 'Instagram'}</span>{!item.processing && <div className="actions-wrap"><button className="more-button" type="button" title="More actions" aria-expanded={openActions === item.url} onClick={() => setOpenActions(openActions === item.url ? null : item.url)}>•••</button>{openActions === item.url && <div className="action-menu"><button type="button" className="delete-action" onClick={() => deleteItem(item)}><span aria-hidden="true">🗑</span>Delete reel</button></div>}</div>}</div><button className="card-body" type="button" onFocus={() => setSelected(item)} onClick={() => setSelected(item)} disabled={item.processing}><h2>{getTitle(item.url)}</h2><p>{excerpt(item.transcription)}</p>{item.processing && <div className="progress-track"><span style={{ width: `${item.progress || 0}%` }} /></div>}</button><div className="card-footer"><span className="indexed-label"><span className={item.processing ? 'processing-dot' : 'dot'} /> {item.status || 'Indexed'}</span>{!item.processing && <a href={item.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open reel <span aria-hidden="true">↗</span></a>}</div></article>)}
        </section>
        {!results.length && <div className="empty-state"><span>⌕</span><h2>No reels found</h2><p>Try a broader search or index a new piece of content.</p></div>}
      </main>
      {showIndexer && <div className="modal-backdrop" onMouseDown={() => setShowIndexer(false)}><aside className="drawer" onMouseDown={(event) => event.stopPropagation()}><div className="drawer-head"><div><p className="eyebrow">Library tools</p><h2>Index content</h2></div><button className="close-button" onClick={() => setShowIndexer(false)} type="button">×</button></div><p className="drawer-copy">Add a link and its transcript so it becomes searchable in your private library.</p><form onSubmit={addItem}><label htmlFor="reel-url">Reel URL</label><input id="reel-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.instagram.com/reel/..." autoFocus required /><label htmlFor="reel-transcript">Transcript <span>Optional</span></label><textarea id="reel-transcript" value={transcription} onChange={(event) => setTranscription(event.target.value)} placeholder="Paste a transcript or a few searchable notes..." rows="7" /><button className="primary-button full-width" type="submit">Add to library <span aria-hidden="true">→</span></button></form></aside></div>}
      {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><div className="detail-modal" onMouseDown={(event) => event.stopPropagation()}><div className="card-topline"><span className="reel-type">{editingItem ? 'Edit transcription' : (selected.url.includes('youtu') ? 'YouTube' : 'Instagram')}</span><div className="detail-actions">{!editingItem && <button className="edit-icon" type="button" title="Edit transcription" onClick={() => startEditing(selected)}>✎</button>}<button className="close-button" type="button" onClick={() => { setEditingItem(null); setSelected(null); }}>×</button></div></div>{editingItem ? <form className="detail-edit-form" onSubmit={saveEdit}><h2>Edit transcription</h2><p className="drawer-copy">Saving regenerates this reel's semantic embedding.</p><textarea id="edit-transcription" value={editTranscription} onChange={(event) => setEditTranscription(event.target.value)} rows="12" autoFocus required /><button className="primary-button full-width" type="submit" disabled={isSavingEdit}>{isSavingEdit ? 'Re-indexing...' : 'Save and re-index'} <span aria-hidden="true">→</span></button></form> : <><h2>{getTitle(selected.url)}</h2><p className="detail-text">{selected.transcription}</p><a className="primary-button link-button" href={selected.url} target="_blank" rel="noreferrer">Open original <span>↗</span></a></>}</div></div>}
    </div>
  );
}

export default App;