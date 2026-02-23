// 1. Get all current reel links
const allLinks = Array.from(document.querySelectorAll('a'))
  .map(a => a.href)
  .filter(href => href.includes('/p/'));

const uniqueLinks = [...new Set(allLinks)];

// 2. Retrieve the last saved link from the previous session
const lastSavedLink = localStorage.getItem('lastDownloadedReel');

let newLinks = [];
if (lastSavedLink) {
    // Find where we left off
    const lastIndex = uniqueLinks.indexOf(lastSavedLink);
    
    // If the link exists in the current list, take everything after it
    if (lastIndex !== -1) {
        newLinks = uniqueLinks.slice(lastIndex + 1);
    } else {
        // If the anchor isn't found (maybe it was scrolled away), take everything
        newLinks = uniqueLinks;
    }
} else {
    // First time running? Take everything.
    newLinks = uniqueLinks;
}

// 3. Check if there's actually anything new to download
if (newLinks.length > 0) {
    // Update the anchor to the very last link in the NEW batch
    localStorage.setItem('lastDownloadedReel', newLinks[newLinks.length - 1]);

    console.log(`Found ${newLinks.length} new reels. Starting download...`);

    // 4. Download logic
    const blob = new Blob([newLinks.join('\n')], { type: 'text/plain' });
    const element = document.createElement('a');
    element.href = URL.createObjectURL(blob);
    element.download = `reelsjs.txt`; // Added timestamp to avoid overwriting files
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
} else {
    console.log("No new reels found since the last run.");
}