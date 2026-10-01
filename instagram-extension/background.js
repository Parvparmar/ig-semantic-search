const COMPLETED_KEY = 'completedItems';
const activeUrls = new Set();

async function getConfig() {
  const { apiUrl = '', appUrl = '' } = await chrome.storage.local.get(['apiUrl', 'appUrl']);
  return { apiUrl: apiUrl.replace(/\/$/, ''), appUrl: appUrl.replace(/\/$/, '') };
}

async function saveCompleted(item) {
  const { [COMPLETED_KEY]: completedItems = [] } = await chrome.storage.local.get(COMPLETED_KEY);
  if (!completedItems.some((record) => record.url === item.url)) {
    completedItems.push(item);
  }
  const { indexedUrls = [] } = await chrome.storage.local.get('indexedUrls');
  if (!indexedUrls.includes(item.url)) indexedUrls.push(item.url);
  await chrome.storage.local.set({ [COMPLETED_KEY]: completedItems, indexedUrls });
  await notifyLibraryTabs();
}

async function notifyLibraryTabs() {
  const { appUrl } = await getConfig();
  if (!appUrl) return { matched: 0, injected: 0 };
  const appOrigin = new URL(appUrl).origin;
  const tabs = await chrome.tabs.query({ url: `${appOrigin}/*` });
  let injected = 0;
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['library-bridge.js'] });
      injected += 1;
    } catch (error) {
      console.warn('Could not inject Reel Library bridge:', error);
    }
  }
  return { matched: tabs.length, injected };
}

async function reportCapture(tabId, url, state, detail = '') {
  if (tabId === undefined) return;
  await chrome.tabs.sendMessage(tabId, {
    type: 'CAPTURE_STATUS',
    url,
    state,
    detail,
  }).catch(() => {});
}

async function indexReel(url, tabId) {
  if (activeUrls.has(url)) {
    await reportCapture(tabId, url, 'working', 'This reel is already being indexed.');
    return;
  }
  activeUrls.add(url);
  try {
    await runIndexJob(url, tabId);
  } finally {
    activeUrls.delete(url);
  }
}

async function runIndexJob(url, tabId) {
  const { apiUrl } = await getConfig();
  if (!apiUrl) throw new Error('Configure the backend URL in the extension first.');
  const { [COMPLETED_KEY]: completedItems = [] } = await chrome.storage.local.get(COMPLETED_KEY);
  const { indexedUrls = [] } = await chrome.storage.local.get('indexedUrls');
  if (completedItems.some((item) => item.url === url) || indexedUrls.includes(url)) {
    await notifyLibraryTabs();
    await reportCapture(tabId, url, 'done', 'Already indexed by this extension.');
    return;
  }

  const response = await fetch(`${apiUrl}/content/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error(`Backend rejected the reel (${response.status}).`);
  const { job_id: jobId } = await response.json();
  await reportCapture(tabId, url, 'working', 'Indexing started. Keep the backend running.');
  let previousStatus = '';
  let lastHeartbeat = 0;

  for (let attempt = 0; attempt < 2400; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusResponse = await fetch(`${apiUrl}/content/jobs/${jobId}`);
    if (!statusResponse.ok) throw new Error('Could not read backend indexing status.');
    const status = await statusResponse.json();
    if (status.status !== previousStatus) {
      previousStatus = status.status;
      lastHeartbeat = Date.now();
      await reportCapture(tabId, url, 'working', `${status.status || 'Indexing reel'} (0s).`);
    } else if (Date.now() - lastHeartbeat >= 15000) {
      lastHeartbeat = Date.now();
      const elapsed = status.elapsed_seconds || 0;
      const elapsedLabel = elapsed >= 60
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : `${elapsed}s`;
      await reportCapture(tabId, url, 'working', `${status.status || 'Indexing reel'} (${elapsedLabel}).`);
    }
    if (status.complete) {
      if (status.error) throw new Error(status.error);
      await saveCompleted({ ...status.item, addedAt: new Date().toISOString(), status: 'Indexed' });
      await reportCapture(tabId, url, 'done', 'Indexed. Open Reel Library to add it to your local account.');
      return;
    }
  }
  throw new Error('Indexing timed out.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_REEL') {
    sendResponse({ ok: true, status: 'Capture received.' });
    indexReel(message.url, sender.tab?.id)
      .catch((error) => reportCapture(sender.tab?.id, message.url, 'error', error.message));
    return false;
  }

  if (message.type === 'GET_COMPLETED') {
    chrome.storage.local.get(COMPLETED_KEY).then((stored) => sendResponse(stored[COMPLETED_KEY] || []));
    return true;
  }

  if (message.type === 'ACK_COMPLETED') {
    chrome.storage.local.get(COMPLETED_KEY).then(async (stored) => {
      const completedItems = (stored[COMPLETED_KEY] || []).filter((item) => item.url !== message.url);
      await chrome.storage.local.set({ [COMPLETED_KEY]: completedItems });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'SAVE_CONFIG') {
    chrome.storage.local.set({ apiUrl: message.apiUrl, appUrl: message.appUrl })
      .then(async () => {
        const tabs = await chrome.tabs.query({ url: `${message.appUrl}/*` });
        await Promise.all(tabs.filter((tab) => tab.id !== undefined).map((tab) => chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['library-bridge.js'],
        }).catch(() => {})));
        sendResponse({ ok: true });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'GET_CONFIG') {
    getConfig().then(sendResponse);
    return true;
  }

  if (message.type === 'GET_COUNTS') {
    Promise.all([chrome.storage.local.get(COMPLETED_KEY), chrome.storage.local.get('indexedUrls')])
      .then(([completed, indexed]) => sendResponse({
        pending: (completed[COMPLETED_KEY] || []).length,
        indexed: (indexed.indexedUrls || []).length,
      }));
    return true;
  }

  if (message.type === 'SYNC_PENDING') {
    notifyLibraryTabs()
      .then(sendResponse)
      .catch((error) => sendResponse({ matched: 0, injected: 0, error: error.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('autoIndex').then(({ autoIndex }) => {
    if (autoIndex === undefined) chrome.storage.local.set({ autoIndex: true });
  });
});