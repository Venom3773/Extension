try {
  importScripts('sentiment.min.js');
  console.log("Sentiment library loaded");
} catch (e) {
  console.error("Failed to load sentiment.min.js:", e);
}

const sentiment = new Sentiment();

let currentTicker = null;
let generalPage = 1;
let generalArticles = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getNews") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "getStock" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Content script error:", chrome.runtime.lastError.message);
          fetchNews(null, 1, false).then(articles => {
            generalArticles = articles;
            sendResponse({ articles, isGeneral: true });
          });
        } else {
          const ticker = (response && response.ticker && response.ticker.trim()) ? response.ticker : null;
          if (ticker && ticker !== currentTicker) {
            currentTicker = ticker;
            generalPage = 1;
            generalArticles = [];
            fetchNews(ticker, 1, true).then(articles => {
              sendResponse({ articles, isGeneral: false });
            });
          } else {
            sendResponse({ articles: generalArticles, isGeneral: !ticker });
          }
        }
      });
    });
    return true; // Keep port open for async response
  } else if (request.action === "reload") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "getStock" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Content script error:", chrome.runtime.lastError.message);
          currentTicker = null;
          generalPage = 1;
          fetchNews(null, 1, true).then(articles => {
            generalArticles = articles;
            sendResponse({ articles, isGeneral: true });
          });
        } else {
          const ticker = (response && response.ticker && response.ticker.trim()) ? response.ticker : null;
          currentTicker = ticker;
          generalPage = 1;
          generalArticles = [];
          fetchNews(ticker || null, 1, true).then(articles => {
            sendResponse({ articles, isGeneral: !ticker });
          });
        }
      });
    });
    return true; // Keep port open for async response
  } else if (request.action === "loadMore" && !currentTicker) {
    generalPage++;
    fetchNews(null, generalPage).then(newArticles => {
      generalArticles = generalArticles.concat(newArticles);
      sendResponse(newArticles);
    });
    return true; // Keep port open for async response
  }
});

// Removed the chrome.tabs.onActivated.addListener block from here.

async function fetchNews(ticker = null, page = 1, forceRefresh = false) {
  const cacheKey = ticker ? `news_${ticker}_${page}` : `general_${page}`;
  const cached = await new Promise(resolve =>
    chrome.storage.local.get(cacheKey, result => resolve(result[cacheKey]))
  );

  if (!forceRefresh && cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
    console.log(`Returning cached data for ${cacheKey}:`, cached.data);
    return cached.data;
  }

  const rssFeeds = [
    'https://www.reuters.com/arc/outboundfeeds/news-rss/category/business/?format=xml',
    'https://finance.yahoo.com/news/rssindex',
    'https://feeds.marketwatch.com/marketwatch/topstories/',
    'https://www.nasdaq.com/feed/rssoutbound?category=Stocks',
    'https://www.wsj.com/xml/rss/3_7085.xml',
    'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    'https://seekingalpha.com/feed.xml',
    'https://www.investing.com/rss/news_25.rss',
    'https://www.ft.com/?format=rss',
    'https://feeds.bloomberg.com/markets/newsrss',
    'https://www.benzinga.com/feed',
    'https://www.fool.com/feed/index.rss',
    'https://www.thestreet.com/.rss',
    'https://www.zacks.com/rss/news',
    'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
    'https://www.financialexpress.com/feed/',
    'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms'
  ];

  let allArticles = [];
  try {
    for (const feedUrl of rssFeeds) {
      const response = await fetch(feedUrl, {
        headers: { 'User-Agent': 'StockNewsExtension/1.0 (Chrome Extension)' }
      });
      if (!response.ok) {
        console.warn(`Failed to fetch ${feedUrl}: ${response.status} ${response.statusText}`);
        continue;
      }
      const xmlText = await response.text();
      const items = xmlText.split(/<item>/i).slice(1);

      items.forEach(item => {
        const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
        const linkMatch = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);

        const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
        let description = descMatch ? descMatch[1].trim() : '';
        const url = linkMatch ? linkMatch[1].trim() : '#';
        description = description.replace(/<[^>]+>/g, '').trim();
        const effectiveText = description.length > 0 ? description : title;

        let includeArticle = true;
        if (ticker) {
          const tickerLower = ticker.toLowerCase();
          includeArticle = title.toLowerCase().includes(tickerLower) ||
                           effectiveText.toLowerCase().includes(tickerLower) ||
                           (ticker === "AAPL" && effectiveText.toLowerCase().includes("apple")) ||
                           (ticker === "GOOGL" && effectiveText.toLowerCase().includes("google")) ||
                           (ticker === "MSFT" && effectiveText.toLowerCase().includes("microsoft")) ||
                           (ticker === "TSLA" && effectiveText.toLowerCase().includes("tesla")) ||
                           (ticker === "LMT" && effectiveText.toLowerCase().includes("lockheed martin")) ||
                           effectiveText.toLowerCase().includes(tickerLower + " stock") ||
                           effectiveText.toLowerCase().includes(tickerLower + " shares") ||
                           effectiveText.toLowerCase().includes("stock") ||
                           effectiveText.toLowerCase().includes("shares");
          if (!includeArticle) {
            console.log('Excluded article for ticker', ticker, { title, effectiveText });
            return;
          }
        }

        const sentimentData = sentiment.analyze(effectiveText);
        const tokens = sentimentData.tokens;
        const totalWords = tokens.length || 1;
        let posScore = 0, negScore = 0;
        sentimentData.calculation.forEach(calc => {
          const word = Object.keys(calc)[0];
          const score = calc[word];
          if (score > 0) posScore += score;
          else if (score < 0) negScore += Math.abs(score);
        });

        const totalSentiment = posScore + negScore + (totalWords - sentimentData.words.length);
        const pos = totalSentiment > 0 ? (posScore / totalSentiment) * 100 : 0;
        const neg = totalSentiment > 0 ? (negScore / totalSentiment) * 100 : 0;
        const neu = totalSentiment > 0 ? ((totalWords - sentimentData.words.length) / totalSentiment) * 100 : 100;

        const articleData = {
          title,
          description: truncateDescription(effectiveText),
          url,
          sentiment: { positive: pos, neutral: neu, negative: neg }
        };
        console.log('Processed article:', articleData);
        allArticles.push(articleData);
      });
    }

    if (ticker) {
      allArticles.sort((a, b) => {
        const aMatch = a.title.toLowerCase().includes(ticker.toLowerCase()) ? 1 : 0;
        const bMatch = b.title.toLowerCase().includes(ticker.toLowerCase()) ? 1 : 0;
        return bMatch - aMatch;
      });
    }

    const start = (page - 1) * 10;
    const paginatedArticles = allArticles.slice(start, start + 10);

    if (paginatedArticles.length === 0 && ticker) {
      console.log(`No articles found for ticker "${ticker}"—returning general news`);
      return fetchNews(null, page, forceRefresh);
    }

    console.log('Scraped and processed articles:', paginatedArticles);
    chrome.storage.local.set({ [cacheKey]: { data: paginatedArticles, timestamp: Date.now() } });
    return paginatedArticles;
  } catch (error) {
    console.error('Scraper error:', error);
    return cached ? cached.data : [];
  }
}

function truncateDescription(text) {
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  return sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '...' : '.');
}