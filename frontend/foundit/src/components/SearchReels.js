import React, {useState} from 'react';

export default function SearchReels() {
  const [userId, setUserId] = useState('default');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

  const search = async () => {
    setResults('Searching...');
    try {
      const res = await fetch('http://localhost:8000/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, query, top_k: 5 })
      });
      const data = await res.json();
      setResults(data.results);
    } catch (e) {
      setResults('Search error: ' + e.message);
    }
  };

  return (
    <div style={{padding:20}}>
      <h3>Search Reels</h3>
      <div>
        <label>User ID: </label>
        <input value={userId} onChange={e=>setUserId(e.target.value)} />
      </div>
      <div>
        <label>Query: </label>
        <input value={query} onChange={e=>setQuery(e.target.value)} style={{width:400}} />
        <button onClick={search} style={{marginLeft:8}}>Search</button>
      </div>
      <div style={{marginTop:12}}>
        <strong>Results:</strong>
        <pre>{results ? JSON.stringify(results, null, 2) : 'No results yet'}</pre>
      </div>
    </div>
  );
}
