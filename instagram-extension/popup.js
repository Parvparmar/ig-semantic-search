const apiInput = document.querySelector('#api-url');
const appInput = document.querySelector('#app-url');
const statusOutput = document.querySelector('#status');
const countsOutput = document.querySelector('#counts');

function updateCounts() {
  chrome.runtime.sendMessage({ type: 'GET_COUNTS' }).then(({ indexed, pending }) => {
    countsOutput.textContent = `Indexed by extension: ${indexed} · Waiting for library: ${pending}`;
  }).catch(() => {
    countsOutput.textContent = 'Could not read capture counts.';
  });
}

updateCounts();

chrome.runtime.sendMessage({ type: 'GET_CONFIG' }).then(({ apiUrl, appUrl }) => {
  apiInput.value = apiUrl || '';
  appInput.value = appUrl || '';
}).catch(() => {
  statusOutput.textContent = 'Could not read extension settings.';
});

document.querySelector('#save').addEventListener('click', async () => {
  try {
    const apiUrl = new URL(apiInput.value.trim());
    const appUrl = new URL(appInput.value.trim());
    if (!['https:', 'http:'].includes(apiUrl.protocol) || !['https:', 'http:'].includes(appUrl.protocol)) {
      throw new Error('Enter valid HTTP or HTTPS URLs.');
    }
    if (apiUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(apiUrl.hostname)) {
      throw new Error('Use HTTPS for non-local backend URLs.');
    }
    if (appUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(appUrl.hostname)) {
      throw new Error('Use HTTPS for non-local app URLs.');
    }

    const apiOriginPattern = `${apiUrl.origin}/*`;
    const appOriginPattern = `${appUrl.origin}/*`;
    const granted = await chrome.permissions.request({ origins: [apiOriginPattern, appOriginPattern] });
    if (!granted) throw new Error('Permission to connect to the backend and library was not granted.');

    await chrome.runtime.sendMessage({ type: 'SAVE_CONFIG', apiUrl: apiUrl.origin, appUrl: appUrl.origin });
    await chrome.scripting.unregisterContentScripts({ ids: ['wtr-library-bridge'] }).catch(() => {});
    await chrome.scripting.registerContentScripts([{
      id: 'wtr-library-bridge',
      matches: [appOriginPattern],
      js: ['library-bridge.js'],
      runAt: 'document_start',
    }]);
    statusOutput.textContent = 'Saved. Like or save a reel on Instagram Web to index it.';
    updateCounts();
  } catch (error) {
    statusOutput.textContent = error.message || 'Could not save settings.';
  }
});

document.querySelector('#sync').addEventListener('click', async () => {
  statusOutput.textContent = 'Looking for an open library tab...';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SYNC_PENDING' });
    if (result.error) throw new Error(result.error);
    if (!result.matched) {
      statusOutput.textContent = 'No tab matches Library app URL. Open the app and check that URL in settings.';
    } else if (!result.injected) {
      statusOutput.textContent = 'Found a library tab, but could not connect. Reload the app tab and try again.';
    } else {
      statusOutput.textContent = `Connected to ${result.injected} library tab(s). Keep the app signed in while it imports.`;
      window.setTimeout(updateCounts, 1500);
      window.setTimeout(updateCounts, 5000);
    }
  } catch (error) {
    statusOutput.textContent = error.message || 'Could not sync waiting reels.';
  }
});