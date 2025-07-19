try {
  importScripts('sentiment.min.js');
  console.log("Sentiment library loaded");
} catch (e) {
  console.error("Failed to load sentiment.min.js:", e);
}

const sentiment = new Sentiment();
const DEFAULT_API_KEY = 'your_actual_api_key_here'; // Replace with your NewsAPI key

let currentQuery = null;
let generalPage = 1;
let generalArticles = [];

function truncateDescription(text) {
  return text.length > 150 ? text.substring(0, 147) + '...' : text;
}

function showBreakingNotification(article) {
  chrome.notifications.create(article.url, {
    type: "basic",
    iconUrl: "icon.png",
    title: "Breaking News: " + article.title,
    message: article.description,
    priority: 2
  });
}

async function fetchFromRSS(query = null, page = 1, forceRefresh = false) {
  const cacheKey = query ? `rss_${query}_${page}` : `rss_general_${page}`;
  const cached = await new Promise(resolve =>
    chrome.storage.local.get(cacheKey, result => resolve(result[cacheKey]))
  );

  if (!forceRefresh && cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
    console.log(`Returning cached RSS data for ${cacheKey}`);
    return cached.data;
  }

  const rssFeeds = [
    'https://www.reuters.com/arc/outboundfeeds/news-rss/category/business/?format=xml',
    'https://finance.yahoo.com/news/rssindex',
    'https://feeds.marketwatch.com/marketwatch/topstories/',
    'https://www.nasdaq.com/feed/rssoutbound?category=Stocks'
  ];

  let allArticles = [];
  try {
    const fetchPromises = rssFeeds.map(async feedUrl => {
      try {
        const response = await fetch(feedUrl, {
          headers: { 'User-Agent': 'StockNewsExtension/1.0 (Chrome Extension)' }
        });
        if (!response.ok) {
          console.error(`RSS feed ${feedUrl} failed with status: ${response.status}`);
          return [];
        }
        const xmlText = await response.text();
        const items = xmlText.split(/<item>/i).slice(1);
        return items.map(item => {
          const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
          const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
          const linkMatch = item.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
          const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
          let description = descMatch ? descMatch[1].trim() : '';
          const url = linkMatch ? linkMatch[1].trim() : '#';
          description = description.replace(/<[^>]+>/g, '').trim();
          const effectiveText = description.length > 0 ? description : title;
          return { title, description: truncateDescription(effectiveText), fullDescription: effectiveText, url };
        });
      } catch (error) {
        console.error(`Error fetching ${feedUrl}:`, error);
        return [];
      }
    });

    const articlesArrays = await Promise.all(fetchPromises);
    allArticles = articlesArrays.flat().slice(0, 100);

    if (query) {
      console.log(`Filtering RSS articles for query: ${query}`);
      allArticles = allArticles.filter(article => 
        article.title.toLowerCase().includes(query.toLowerCase()) ||
        article.description.toLowerCase().includes(query.toLowerCase())
      );
    }

    const start = (page - 1) * 10;
    const paginatedArticles = allArticles.slice(start, start + 10).map(article => {
      try {
        const sentimentData = sentiment.analyze(article.fullDescription);
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

        console.log(`Sentiment for "${article.title}":`, { positive: pos, neutral: neu, negative: neg });
        return { ...article, sentiment: { positive: pos, neutral: neu, negative: neg } };
      } catch (error) {
        console.error('Sentiment error for article:', article.title, error);
        return { ...article, sentiment: { positive: 0, neutral: 100, negative: 0 } };
      }
    });

    chrome.storage.local.set({ [cacheKey]: { data: paginatedArticles, timestamp: Date.now() } });
    return paginatedArticles;
  } catch (error) {
    console.error('RSS fetch error:', error);
    return cached ? cached.data : [];
  }
}

async function fetchFromAPI(query = null, page = 1, apiKey, forceRefresh = false) {
  const cacheKey = query ? `api_${query}_${page}` : `api_general_${page}`;
  const cached = await new Promise(resolve =>
    chrome.storage.local.get(cacheKey, result => resolve(result[cacheKey]))
  );

  if (!forceRefresh && cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
    console.log(`Returning cached API data for ${cacheKey}`);
    return cached.data;
  }

  const url = query
    ? `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&page=${page}&apiKey=${apiKey}`
    : `https://newsapi.org/v2/top-headlines?category=business&page=${page}&apiKey=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    const data = await response.json();
    const articles = data.articles.map(article => {
      const description = article.description || article.content || 'No description';
      try {
        const sentimentData = sentiment.analyze(description);
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

        console.log(`Sentiment for "${article.title}":`, { positive: pos, neutral: neu, negative: neg });
        return {
          title: article.title,
          description: truncateDescription(description),
          fullDescription: description,
          url: article.url,
          sentiment: { positive: pos, neutral: neu, negative: neg }
        };
      } catch (error) {
        console.error('Sentiment error for article:', article.title, error);
        return {
          title: article.title,
          description: truncateDescription(description),
          fullDescription: description,
          url: article.url,
          sentiment: { positive: 0, neutral: 100, negative: 0 }
        };
      }
    });

    chrome.storage.local.set({ [cacheKey]: { data: articles, timestamp: Date.now() } });
    return articles;
  } catch (error) {
    console.error('API fetch error:', error);
    console.log('Falling back to RSS...');
    return fetchFromRSS(query, page, forceRefresh);
  }
}

async function fetchNews(query = null, page = 1, forceRefresh = false) {
  console.log('Fetching news with query:', query, 'page:', page, 'forceRefresh:', forceRefresh);
  const settings = await new Promise(resolve =>
    chrome.storage.local.get(['newsMode', 'apiKey'], result => resolve(result))
  );
  console.log('Settings loaded:', settings);
  const mode = settings.newsMode || 'rss';
  const apiKey = settings.apiKey || DEFAULT_API_KEY;
  console.log('Mode:', mode, 'API Key:', apiKey);
  currentQuery = query;

  if (mode === 'api') {
    console.log('Fetching from API...');
    return fetchFromAPI(query, page, apiKey, forceRefresh);
  } else {
    console.log('Fetching from RSS...');
    return fetchFromRSS(query, page, forceRefresh);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getNews") {
    fetchNews(request.query, request.page || 1, request.forceRefresh || false).then(articles => {
      sendResponse({ articles });
    });
    return true;
  } else if (request.action === "reload") {
    fetchNews(currentQuery, 1, true).then(articles => {
      sendResponse({ articles });
    });
    return true;
  } else if (request.action === "loadMore") {
    fetchNews(currentQuery, generalPage + 1).then(articles => {
      generalPage++;
      sendResponse({ articles });
    });
    return true;
  } else if (request.action === "bookmarkArticle") {
    chrome.storage.local.get('bookmarks', result => {
      const bookmarks = result.bookmarks || [];
      bookmarks.push(request.article);
      chrome.storage.local.set({ bookmarks }, () => sendResponse({ success: true }));
    });
    return true;
  } else if (request.action === "getBookmarks") {
    chrome.storage.local.get('bookmarks', result => {
      sendResponse({ bookmarks: result.bookmarks || [] });
    });
    return true;
  } else if (request.action === "removeBookmark") {
    chrome.storage.local.get('bookmarks', result => {
      const bookmarks = (result.bookmarks || []).filter(b => b.url !== request.url);
      chrome.storage.local.set({ bookmarks }, () => sendResponse({ success: true }));
    });
    return true;
  }
});