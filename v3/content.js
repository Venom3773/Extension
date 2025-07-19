chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getStock") {
    const url = window.location.href;
    let ticker = null;

    const tickerRegex = /[A-Z]{1,5}/;
    const match = url.match(tickerRegex) || document.body.innerText.match(tickerRegex);
    if (match) ticker = match[0];

    sendResponse({ ticker: ticker ? ticker.toUpperCase() : null });
  }
});