if (globalThis.__wtrLibraryBridgeInstalled) {
  window.postMessage({ source: 'wtr-reel-library', type: 'GET_COMPLETED' }, window.location.origin);
} else {
globalThis.__wtrLibraryBridgeInstalled = true;

function deliverCompleted(items) {
  for (const item of items) {
    window.postMessage({ source: 'wtr-instagram-extension', type: 'INDEX_COMPLETE', item }, window.location.origin);
  }
}

function requestCompleted() {
  chrome.runtime.sendMessage({ type: 'GET_COMPLETED' }).then(deliverCompleted).catch(() => {});
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'DELIVER_COMPLETED') requestCompleted();
});

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.source !== 'wtr-reel-library') return;
  if (event.data.type === 'GET_COMPLETED') requestCompleted();
  if (event.data.type === 'ACK_COMPLETED') {
    chrome.runtime.sendMessage({ type: 'ACK_COMPLETED', url: event.data.url }).catch(() => {});
  }
});

requestCompleted();
}