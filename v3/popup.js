console.log("popup.js loaded");

function displayArticles(articles, append = false) {
  const feed = document.getElementById("news-feed");
  if (!feed) {
    console.error("Element #news-feed not found");
    return;
  }
  if (!append) feed.innerHTML = "";

  if (!articles || articles.length === 0) {
    feed.innerHTML = "<p>No news available</p>";
    return;
  }

  articles.forEach(article => {
    const pos = article.sentiment.positive || 0;
    const neu = article.sentiment.neutral || 0;
    const neg = article.sentiment.negative || 0;

    const posEnd = pos;
    const neuStart = posEnd;
    const neuEnd = posEnd + neu;
    const gradientStyle = `linear-gradient(to right, 
      #4dff4d 0%, #4dff4d ${posEnd}%, 
      #d3d3d3 ${neuStart}%, #d3d3d3 ${neuEnd}%, 
      #ff4d4d ${neuEnd}%, #ff4d4d 100%)`;

    const articleHTML = `
      <a class="news-item" href="${article.url}" target="_blank">
        <h3>${article.title || "No title"}</h3>
        <p>${article.description || "No description available"}</p>
        <div class="sentiment-details">
          Positive: ${pos.toFixed(1)}% | Neutral: ${neu.toFixed(1)}% | Negative: ${neg.toFixed(1)}%
        </div>
        <div class="sentiment-bar" style="background: ${gradientStyle};"></div>
      </a>
    `;

    feed.insertAdjacentHTML("beforeend", articleHTML);
  });
}

function fetchNews(action = "getNews") {
  console.log("fetchNews called with action:", action);
  chrome.runtime.sendMessage({ action }, function(response) {
    if (chrome.runtime.lastError) {
      console.warn("Message error:", chrome.runtime.lastError.message);
      const feed = document.getElementById("news-feed");
      if (feed) feed.innerHTML = "<p>Failed to fetch news</p>";
      return;
    }
    console.log("Received response:", response);
    if (response && response.articles && response.articles.length > 0) {
      displayArticles(response.articles);
    } else {
      const feed = document.getElementById("news-feed");
      if (feed) feed.innerHTML = "<p>No news available</p>";
      else console.error("Element #news-feed not found during fallback");
    }
  });
}

setInterval(() => fetchNews("reload"), 30000);

function handleScroll() {
  const feed = document.getElementById("news-feed");
  if (!feed) return;
  if (feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 20) {
    chrome.runtime.sendMessage({ action: "loadMore" }, (newArticles) => {
      if (chrome.runtime.lastError) {
        console.warn("Load more error:", chrome.runtime.lastError.message);
        return;
      }
      if (newArticles && newArticles.length > 0) {
        displayArticles(newArticles, true);
      }
    });
  }
}
document.getElementById("news-feed").addEventListener("scroll", handleScroll);

const reloadButton = document.getElementById("reload-button");
if (reloadButton) {
  reloadButton.addEventListener("click", () => {
    console.log("Reload button clicked");
    fetchNews("reload");
  });
} else {
  console.error("Reload button not found");
}

fetchNews();