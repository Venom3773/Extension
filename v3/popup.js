console.log("popup.js loaded");

let currentMode = "news"; // "news" or "bookmarks"
let currentQuery = null;

// Load saved settings
chrome.storage.local.get(['newsMode', 'apiKey'], (result) => {
  const mode = result.newsMode || 'rss';
  document.getElementById('news-mode-toggle').checked = mode === 'api';
  document.getElementById('api-key').style.display = mode === 'api' ? 'block' : 'none';
  document.getElementById('api-key').value = result.apiKey || '';
  console.log('Loaded settings:', result);
});

// Toggle between RSS and API
document.getElementById('news-mode-toggle').addEventListener('change', (e) => {
  const mode = e.target.checked ? 'api' : 'rss';
  chrome.storage.local.set({ newsMode: mode }, () => {
    console.log('News mode set to:', mode);
  });
  document.getElementById('api-key').style.display = mode === 'api' ? 'block' : 'none';
  loadNews(currentQuery);
});

// Save API key when typed
document.getElementById('api-key').addEventListener('input', (e) => {
  const apiKey = e.target.value;
  chrome.storage.local.set({ apiKey: apiKey }, () => {
    console.log('API key saved:', apiKey);
  });
});

function displayArticles(articles, mode = "news") {
  const feed = document.getElementById("news-feed");
  feed.innerHTML = "";
  if (!articles || articles.length === 0) {
    feed.innerHTML = "<p style='text-align:center;'>No articles available</p>";
    return;
  }

  console.log('Displaying articles:', articles);
  articles.forEach(article => {
    const card = document.createElement("div");
    card.className = "news-item";

    const titleElem = document.createElement("h3");
    titleElem.textContent = article.title || "No title";
    card.appendChild(titleElem);

    const descElem = document.createElement("p");
    descElem.textContent = article.description || "No description available";
    card.appendChild(descElem);

    const sentimentDetails = document.createElement("div");
    sentimentDetails.className = "sentiment-details";
    // Ensure values are numbers with fallback
    const pos = typeof article.sentiment?.positive === 'number' ? article.sentiment.positive : 0;
    const neu = typeof article.sentiment?.neutral === 'number' ? article.sentiment.neutral : 100;
    const neg = typeof article.sentiment?.negative === 'number' ? article.sentiment.negative : 0;
    sentimentDetails.textContent = `Positive: ${pos.toFixed(1)}% | Neutral: ${neu.toFixed(1)}% | Negative: ${neg.toFixed(1)}%`; // Fixed syntax with backticks
    card.appendChild(sentimentDetails);

    const sentimentBar = document.createElement("div");
    sentimentBar.className = "sentiment-bar";
    const gradientStyle = `linear-gradient(to right, #4dff4d 0%, #4dff4d ${pos}%, #d3d3d3 ${pos}%, #d3d3d3 ${pos + neu}%, #ff4d4d ${pos + neu}%, #ff4d4d 100%)`; // Fixed syntax with backticks
    sentimentBar.style.background = gradientStyle;
    card.appendChild(sentimentBar);

    const btnContainer = document.createElement("div");
    btnContainer.className = "action-buttons";

    const openBtn = document.createElement("button");
    openBtn.title = "Open article";
    openBtn.addEventListener("click", () => {
      window.open(article.url, "_blank");
    });
    openBtn.textContent = "↗";
    btnContainer.appendChild(openBtn);

    const detailsBtn = document.createElement("button");
    detailsBtn.title = "View details";
    detailsBtn.addEventListener("click", () => {
      openModal(article);
    });
    detailsBtn.textContent = "ℹ";
    btnContainer.appendChild(detailsBtn);

    if (mode === "news") {
      const bookmarkBtn = document.createElement("button");
      bookmarkBtn.title = "Bookmark article";
      bookmarkBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "bookmarkArticle", article: article }, (response) => {
          if (response?.success) {
            alert("Article bookmarked!");
          } else {
            alert(response?.message || "Failed to bookmark");
          }
        });
      });
      bookmarkBtn.textContent = "★";
      btnContainer.appendChild(bookmarkBtn);
    } else if (mode === "bookmarks") {
      const removeBtn = document.createElement("button");
      removeBtn.title = "Remove bookmark";
      removeBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "removeBookmark", url: article.url }, (response) => {
          if (response?.success) {
            loadBookmarks();
          } else {
            alert("Failed to remove bookmark");
          }
        });
      });
      removeBtn.textContent = "✖";
      btnContainer.appendChild(removeBtn);
    }

    card.appendChild(btnContainer);
    feed.appendChild(card);
  });
}

function openModal(article) {
  const modal = document.getElementById("modal");
  const modalBody = document.getElementById("modal-body");
  // Ensure values are numbers with fallback
  const pos = typeof article.sentiment?.positive === 'number' ? article.sentiment.positive : 0;
  const neu = typeof article.sentiment?.neutral === 'number' ? article.sentiment.neutral : 100;
  const neg = typeof article.sentiment?.negative === 'number' ? article.sentiment.negative : 0;
  modalBody.innerHTML = `
    <h2>${article.title}</h2>
    <p>${article.fullDescription || article.description}</p>
    <p><a href="${article.url}" target="_blank">Read full article</a></p>
    <p><strong>Sentiment:</strong> Positive: ${pos.toFixed(1)}%, Neutral: ${neu.toFixed(1)}%, Negative: ${neg.toFixed(1)}%</p>
  `; // Fixed syntax with backticks and proper HTML
  modal.style.display = "flex";
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
}

document.getElementById("modal-close").addEventListener("click", closeModal);
window.addEventListener("click", (event) => {
  const modal = document.getElementById("modal");
  if (event.target === modal) {
    closeModal();
  }
});

function loadNews(query = null) {
  currentQuery = query; // Update currentQuery
  console.log('Loading news with query:', currentQuery);
  chrome.runtime.sendMessage({ action: "getNews", query: currentQuery }, response => {
    if (response && response.articles) {
      displayArticles(response.articles, "news");
    } else {
      console.error('Failed to load news:', response);
      document.getElementById("news-feed").innerHTML = "<p style='text-align:center;'>Error loading news</p>";
    }
  });
}

function loadBookmarks() {
  console.log('Loading bookmarks');
  chrome.runtime.sendMessage({ action: "getBookmarks" }, response => {
    if (response && response.bookmarks) {
      displayArticles(response.bookmarks, "bookmarks");
    } else {
      console.error('Failed to load bookmarks:', response);
    }
  });
}

document.getElementById('logo-button').addEventListener('click', () => {
  currentMode = "news";
  loadNews(null); // Reset query when clicking home
});

document.getElementById('search-button').addEventListener('click', () => {
  const query = document.getElementById('search-input').value.trim();
  if (query) {
    currentMode = "news";
    loadNews(query);
  } else {
    console.log('No search query provided');
  }
});

document.getElementById('reload-button').addEventListener('click', () => {
  console.log('Reloading news with current query:', currentQuery);
  chrome.runtime.sendMessage({ action: "reload" }, response => {
    if (response && response.articles) {
      displayArticles(response.articles);
    } else {
      console.error('Reload failed:', response);
    }
  });
});

document.getElementById('bookmarks-button').addEventListener('click', () => {
  currentMode = "bookmarks";
  loadBookmarks();
});

// Initial load
loadNews();