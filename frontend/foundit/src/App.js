import React, { useState } from 'react';
import './App.css';
import ScriptBox from './components/ScriptBox';
import UploadReels from './components/UploadReels';
import SearchReels from './components/SearchReels';

const App = () => {
  const [activeTab, setActiveTab] = useState('saved'); // saved, liked, search
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleAction = async (mode) => {
    setLoading(true);
    let endpoint = `http://localhost:8000/fetch?mode=${mode}`;
    
    // If it's a search, we hit the search endpoint instead
    if (mode === 'search') {
      endpoint = `http://localhost:8000/search?q=${searchQuery}`;
    }

    try {
      const response = await fetch(endpoint);
      const data = await response.json();
      setResults(data.urls || []);
    } catch (err) {
      console.error("Failed to fetch:", err);
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen bg-slate-900 text-white font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-slate-800 border-r border-slate-700 p-6 flex flex-col">
        <h1 className="text-xl font-bold mb-8 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
          ReelVault
        </h1>
        
        <nav className="space-y-4 flex-1">
          <button 
            onClick={() => setActiveTab('saved')}
            className={`w-full text-left p-3 rounded-lg transition ${activeTab === 'saved' ? 'bg-purple-600' : 'hover:bg-slate-700'}`}
          >
            📂 Saved Reels
          </button>
          <button 
            onClick={() => setActiveTab('liked')}
            className={`w-full text-left p-3 rounded-lg transition ${activeTab === 'liked' ? 'bg-purple-600' : 'hover:bg-slate-700'}`}
          >
            ❤️ Liked Reels
          </button>
          <button 
            onClick={() => setActiveTab('search')}
            className={`w-full text-left p-3 rounded-lg transition ${activeTab === 'search' ? 'bg-purple-600' : 'hover:bg-slate-700'}`}
          >
            🔍 Search Redis
          </button>
        </nav>

        <div className="text-xs text-slate-500 italic">
          Connected via Browser Session
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-y-auto">
        <header className="mb-10">
          <h2 className="text-3xl font-bold capitalize">{activeTab} Content</h2>
          <p className="text-slate-400">Manage and search your synced Instagram content.</p>
        </header>

        {/* Search Bar (Only shows when on search tab) */}
        {activeTab === 'search' && (
          <div className="mb-8 flex gap-4">
            <input 
              type="text"
              placeholder="Search captions or keywords..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button 
              onClick={() => handleAction('search')}
              className="bg-purple-600 px-8 py-4 rounded-xl font-bold hover:bg-purple-500 transition"
            >
              Search
            </button>
          </div>
        )}

        {/* Action Button (For Liked/Saved) */}
        {activeTab !== 'search' && (
          <button 
            onClick={() => handleAction(activeTab)}
            className="mb-8 bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 rounded-xl font-bold hover:opacity-90 transition"
          >
            Sync Recent {activeTab}
          </button>
        )}

        {/* Results Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-20 text-slate-500">Processing...</div>
          ) : results.length > 0 ? (
            results.map((url, i) => (
              <div key={i} className="bg-slate-800 border border-slate-700 p-4 rounded-2xl hover:border-purple-500 transition group">
                <div className="aspect-[9/16] bg-slate-700 rounded-lg mb-4 flex items-center justify-center text-slate-500">
                  {/* Real apps would use an iframe or thumbnail here */}
                  Reel Preview
                </div>
                <a 
                  href={url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-sm text-purple-400 truncate block hover:underline"
                >
                  {url}
                </a>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-20 text-slate-500 border-2 border-dashed border-slate-800 rounded-3xl">
              No content found. Start syncing!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;