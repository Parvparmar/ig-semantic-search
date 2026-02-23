import React from 'react';

const scriptContent = `// 1. Get all current reel links
const allLinks = Array.from(document.querySelectorAll('a'))
  .map(a => a.href)
  .filter(href => href.includes('/p/'));

const uniqueLinks = [...new Set(allLinks)];

// 2. Retrieve the last saved link from the previous session
const lastSavedLink = localStorage.getItem('lastDownloadedReel');

let newLinks = [];
if (lastSavedLink) {
    const lastIndex = uniqueLinks.indexOf(lastSavedLink);
    if (lastIndex !== -1) {
        newLinks = uniqueLinks.slice(lastIndex + 1);
    } else {
        newLinks = uniqueLinks;
    }
} else {
    newLinks = uniqueLinks;
}

if (newLinks.length > 0) {
    localStorage.setItem('lastDownloadedReel', newLinks[newLinks.length - 1]);
    const blob = new Blob([newLinks.join('\n')], { type: 'text/plain' });
    const element = document.createElement('a');
    element.href = URL.createObjectURL(blob);
    element.download = `reelsjs.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
} else {
    console.log("No new reels found since the last run.");
}
`;

export default function ScriptBox() {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(scriptContent);
      alert('Script copied to clipboard. Paste into Instagram console and run.');
    } catch (e) {
      alert('Copy failed: ' + e.message);
    }
  };

  return (
    <div style={{padding:20}}>
      <h3>Instagram Console Script</h3>
      <p>Click to copy the script; paste in your Instagram saved reels tab console and run. It will download <strong>reelsjs.txt</strong>.</p>
      <button onClick={copy}>Copy Script to Clipboard</button>
      <div style={{marginTop:12}}>
        <textarea readOnly value={scriptContent} rows={12} cols={80} />
      </div>
    </div>
  );
}
