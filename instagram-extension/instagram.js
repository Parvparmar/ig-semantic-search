function getReelUrl(button) {
  const currentPath = window.location.pathname;
  if (/\/(reel|p)\/[^/]+/.test(currentPath)) return `${window.location.origin}${currentPath}`;

  const container = button.closest('article') || button.closest('[role="presentation"]') || document;
  const link = Array.from(container.querySelectorAll('a[href]')).find((anchor) => /\/(reel|p)\/[^/]+/.test(anchor.pathname));
  return link ? new URL(link.href, window.location.origin).href : null;
}

let pendingAction = null;

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.source !== 'wtr-instagram-main' || event.data.type !== 'GRAPHQL_ACTION') return;

  const action = event.data.action;
  if (!pendingAction || pendingAction.action !== action || Date.now() - pendingAction.timestamp > 15000) return;

  const { url } = pendingAction;
  pendingAction = null;
  chrome.runtime.sendMessage({ type: 'CAPTURE_REEL', url }).catch(() => {});
});

document.addEventListener('click', (event) => {
  const labeledControl = event.target.closest('[aria-label], [title]');
  const button = event.target.closest('button, [role="button"]') || labeledControl;
  if (!button) return;
  const label = `${labeledControl?.getAttribute('aria-label') || ''} ${labeledControl?.getAttribute('title') || ''} ${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.toLowerCase();
  const action = /(^|\s)like(\s|$)/.test(label)
    ? 'like'
    : /(^|\s)save(\s|$)/.test(label) ? 'save' : null;
  if (!action) return;

  const url = getReelUrl(button);
  if (!url) return;

  pendingAction = { action, url, timestamp: Date.now() };
}, true);