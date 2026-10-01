(() => {
  if (window.__wtrGraphqlHookInstalled) return;
  window.__wtrGraphqlHookInstalled = true;

  function reportSuccessfulPayload(payload) {
    let parsed;
    try {
      parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch {
      return;
    }

    const serialized = JSON.stringify(parsed);
    const action = serialized.includes('xig_media_save')
      ? 'save'
      : serialized.includes('xig_media_like') ? 'like' : null;
    if (!action || parsed?.errors?.length) return;
    window.postMessage({ source: 'wtr-instagram-main', type: 'GRAPHQL_ACTION', action }, window.location.origin);
  }

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const result = originalFetch.apply(this, args);
    result.then((response) => {
      if (!response.ok || !/graphql/i.test(response.url)) return;
      response.clone().text().then(reportSuccessfulPayload).catch(() => {});
    }).catch(() => {});
    return result;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__wtrGraphqlRequest = /graphql/i.test(String(url));
    return originalOpen.call(this, method, url, ...args);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__wtrGraphqlRequest) {
      this.addEventListener('load', () => {
        if (this.status >= 200 && this.status < 300) reportSuccessfulPayload(this.responseText);
      }, { once: true });
    }
    return originalSend.apply(this, args);
  };
})();