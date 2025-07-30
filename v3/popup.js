(function() {
  console.log("popup.js loaded");

  const newsFeed = document.getElementById("news-feed");
  const reloadButton = document.getElementById("reload-button");
  const modal = document.getElementById("modal");
  const modalCloseButton = document.getElementById("modal-close");
  const modalBody = document.getElementById("modal-body");
  const newsModeToggle = document.getElementById("news-mode-toggle");
  const apiKeyInput = document.getElementById("api-key");
  const searchInput = document.getElementById("search-input");
  const searchButton = document.getElementById("search-button");
  const bookmarksButton = document.getElementById("bookmarks-button");
  const logoButton = document.getElementById("logo-button");
  const themeToggle = document.getElementById("theme-toggle");

  if (!newsFeed) {
    console.error("Element #news-feed not found. Core functionality impacted.");
    return;
  }

  // Theme logic
  function applyTheme(isDarkMode) {
    document.body.classList.toggle("dark-mode", isDarkMode);
  }

  chrome.storage.local.get("isDarkMode", (data) => {
    const isDarkMode = data.isDarkMode === true;
    if (themeToggle) {
      themeToggle.checked = isDarkMode;
    }
    applyTheme(isDarkMode);
  });

  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      const newMode = themeToggle.checked;
      applyTheme(newMode);
      chrome.storage.local.set({ isDarkMode: newMode });
      console.log(`Theme toggled to ${newMode ? 'Dark' : 'Light'}`);
    });
  } else {
    console.error("Theme toggle switch not found.");
  }

  // Modal logic
  function showModal(contentHTML, title = "Details") {
    modalBody.innerHTML = `<h2>${title}</h2>`;
    modal.style.display = "flex";
  }

  function hideModal() {
    modal.style.display = "none";
    modalBody.innerHTML = "";
  }

  if (modalCloseButton) {
    modalCloseButton.addEventListener("click", hideModal);
  } else {
    console.error("Modal close button not found.");
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        hideModal();
      }
    });
  }

  // Render articles in the feed
  function displayArticles(articles, append = false) {
    if (!append) newsFeed.innerHTML = "";

    if (!articles || articles.length === 0) {
      newsFeed.innerHTML = "<p>No news available</p>";
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
          <div class="sentiment-details">
            Positive: ${pos.toFixed(1)}% | Neutral: ${neu.toFixed(1)}% | Negative: ${neg.toFixed(1)}%
          </div>
          <div class="sentiment-bar" style="background: ${gradientStyle};"></div>
        </a>
      `;

      newsFeed.insertAdjacentHTML("beforeend", articleHTML);
    });
  }

  // Fetch news articles
  function fetchNews(action = "getNews") {
    console.log("fetchNews called with action:", action);
    chrome.runtime.sendMessage({ action }, function(response) {
      if (chrome.runtime.lastError) {
        console.warn("Message error:", chrome.runtime.lastError.message);
        newsFeed.innerHTML = "<p>Failed to fetch news</p>";
        return;
      }
      if (response && response.articles && response.articles.length > 0) {
        displayArticles(response.articles);
      } else {
        newsFeed.innerHTML = "<p>No news available</p>";
      }
    });
  }

  // Reload news
  if (reloadButton) {
    reloadButton.addEventListener("click", () => {
      fetchNews("reload");
    });
  } else {
    console.error("Reload button not found");
  }

  // News mode toggle (RSS/API)
  if (newsModeToggle && apiKeyInput) {
    chrome.storage.local.get("newsMode", (data) => {
      const isAPI = data.newsMode === "api";
      newsModeToggle.checked = isAPI;
      apiKeyInput.style.display = isAPI ? "block" : "none";
    });

    newsModeToggle.addEventListener("change", () => {
      const isAPI = newsModeToggle.checked;
      apiKeyInput.style.display = isAPI ? "block" : "none";
      chrome.storage.local.set({ newsMode: isAPI ? "api" : "rss" });
    });
  } else {
    console.error("News mode toggle or API key input not found.");
  }

  // Search news
  if (searchButton) {
    searchButton.addEventListener("click", () => {
      const query = searchInput.value.trim();
      if (query) {
        newsFeed.innerHTML = `<p>Searching for "${query}"...</p>`;
      } else {
        fetchNews("getNews");
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("keypress", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchButton.click();
      }
    });
  }

  // Bookmarks (placeholder)
  if (bookmarksButton) {
    bookmarksButton.addEventListener("click", () => {
      newsFeed.innerHTML = "<p>Displaying bookmarked articles (feature coming soon!).</p>";
    });
  }

  // Home/reset button
  if (logoButton) {
    logoButton.addEventListener("click", () => {
      searchInput.value = "";
      fetchNews("getNews");
    });
  }

  // Infinite scroll for loading more articles
  newsFeed.addEventListener("scroll", handleScroll);
  function handleScroll() {
    if (newsFeed.scrollTop + newsFeed.clientHeight >= newsFeed.scrollHeight - 20) {
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

  // Initial load
  fetchNews();

  // Auto-reload news every 30 seconds
  setInterval(() => fetchNews("reload"), 30000);

})();
