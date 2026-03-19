import React from 'react';
import './App.css';
import ScriptBox from './components/ScriptBox';
import UploadReels from './components/UploadReels';
import SearchReels from './components/SearchReels';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Where's that reel? — Admin Panel</h1>
        <p>Step 1: Copy script → Step 2: Upload file → Step 3: Search</p>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
        <ScriptBox />
        <hr style={{ margin: '30px 0' }} />
        <UploadReels />
        <hr style={{ margin: '30px 0' }} />
        <SearchReels />
      </main>
    </div>
  );
}

export default App;