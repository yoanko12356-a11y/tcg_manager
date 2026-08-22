let allCards = [];
let currentPriceType = '買取価格';

async function loadCards() {
  try {
    const response = await fetch('./all_cards.json');
    allCards = await response.json();
    
    renderRankings();
    renderSearchResults();
  } catch (error) {
    console.error('カードデータの読み込みに失敗したよ:', error);
  }
}

function normalizeQuery(str) {
  if (!str) return "";
  return str.toLowerCase()
    .replace(/[・＝\s\-_・ー]/g, "")
    .trim();
}

function switchView(viewName) {
  const homeView = document.getElementById('home-view');
  const searchView = document.getElementById('search-view');

  if (!homeView || !searchView) return;

  if (viewName === 'search') {
    homeView.style.display = 'none';
    searchView.style.display = 'block';
    document.body.classList.remove('home-mode');
    document.body.classList.add('search-mode');
  } else {
    homeView.style.display = 'block';
    searchView.style.display = 'none';
    document.body.classList.remove('search-mode');
    document.body.classList.add('home-mode');
  }
}

function renderSearchResults(filterText = "") {
  const container = document.getElementById("search-results-grid");
  if (!container) return;

  container.innerHTML = "";

  const normalizedQuery = normalizeQuery(filterText);

  const filtered = allCards.filter(card => {
    const nameNorm = normalizeQuery(card.name);
    const codeNorm = normalizeQuery(card.product_code);
    return nameNorm.includes(normalizedQuery) || codeNorm.includes(normalizedQuery);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p style="padding: 20px; color: #666; font-size: 0.9rem; grid-column: 1 / -1; text-align: center;">一致するカードが見つからなかったんだ...</p>`;
    return;
  }

  filtered.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    
    const imageUrl = card.image_url || card.image || card.img || '';
    const productCode = card.product_code || '26EX2 70/89';
    const currentPriceText = currentPriceType === '買取価格' ? '¥1,200' : '¥1,800';

    cardEl.innerHTML = `
      <img src="${imageUrl}" alt="${card.name || 'カード'}" loading="lazy">
      <div class="card-code">${productCode}</div>
      <div class="card-title" title="${card.name || ''}">${card.name || 'カード名'}</div>
      <div class="price-container">
        <div class="price-transition">${currentPriceText}</div>
      </div>
    `;

    cardEl.addEventListener('click', () => {
      openCardModal({
        image: imageUrl,
        name: card.name || 'カード名',
        code: productCode,
        price: currentPriceText
      });
    });

    container.appendChild(cardEl);
  });
}

function renderRankings(filterText = "") {
  const normalizedQuery = normalizeQuery(filterText);

  const filtered = allCards.filter(card => {
    const nameNorm = normalizeQuery(card.name);
    const codeNorm = normalizeQuery(card.product_code);
    return nameNorm.includes(normalizedQuery) || codeNorm.includes(normalizedQuery);
  });

  const upCards = filtered.slice(0, 15);
  const downCards = filtered.slice(15, 30);

  renderCards(upCards, 'up-ranking-list', 'up');
  renderCards(downCards, 'down-ranking-list', 'down');
}

function renderCards(cards, targetId, type) {
  const container = document.getElementById(targetId);
  if (!container) return;
  
  container.innerHTML = '';

  if (cards.length === 0) {
    container.innerHTML = `<p style="padding: 10px; color: #666; font-size: 0.85rem;">該当するカードがないんだ...</p>`;
    return;
  }

  cards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    
    let priceText, changeText;
    if (currentPriceType === '買取価格') {
      priceText = type === 'up' ? '¥1200➔¥1500' : '¥1500➔¥1200';
      changeText = type === 'up' ? '（▲ +25%）' : '（▼ -20%）';
    } else {
      priceText = type === 'up' ? '¥1800➔¥2200' : '¥2200➔¥1800';
      changeText = type === 'up' ? '（▲ +22%）' : '（▼ -18%）';
    }

    const changeClass = type === 'up' ? 'up' : 'down';
    const imageUrl = card.image_url || card.image || card.img || '';
    const productCode = card.product_code || '26EX2 70/89';

    cardEl.innerHTML = `
      <img src="${imageUrl}" alt="${card.name || 'カード'}" loading="lazy">
      <div class="card-code">${productCode}</div>
      <div class="card-title" title="${card.name || ''}">${card.name || 'カード名'}</div>
      <div class="price-container">
        <div class="price-transition">${priceText}</div>
        <div class="price-change ${changeClass}">${changeText}</div>
      </div>
    `;

    cardEl.addEventListener('click', () => {
      const currentPriceNum = currentPriceType === '買取価格' ? (type === 'up' ? '¥1,500' : '¥1,200') : (type === 'up' ? '¥2,200' : '¥1,800');
      
      openCardModal({
        image: imageUrl,
        name: card.name || 'カード名',
        code: productCode,
        price: currentPriceNum
      });
    });

    container.appendChild(cardEl);
  });
}

function setupNavigationAndSearch() {
  const searchInput = document.getElementById("search-input");
  const searchIcon = document.getElementById("search-trigger-icon");
  const logoHome = document.getElementById("logo-home");
  const headerHomeBtn = document.getElementById("header-home-btn");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value;
      switchView('search');
      renderSearchResults(query);
    });

    searchInput.addEventListener("focus", () => {
      switchView('search');
    });
  }

  if (searchIcon) {
    searchIcon.addEventListener("click", () => {
      switchView('search');
    });
  }

  document.querySelectorAll('[data-tab="search"]').forEach(btn => {
    btn.addEventListener("click", () => {
      switchView('search');
    });
  });

  if (logoHome) {
    logoHome.addEventListener("click", () => {
      switchView('home');
      if (searchInput) searchInput.value = "";
      renderRankings();
    });
  }

  if (headerHomeBtn) {
    headerHomeBtn.addEventListener("click", () => {
      switchView('home');
      if (searchInput) searchInput.value = "";
      renderRankings();
    });
  }
}

const modal = document.getElementById('card-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

function openCardModal(cardData) {
  if (!modal) return;
  document.getElementById('modal-card-img').src = cardData.image;
  document.getElementById('modal-card-title').textContent = cardData.name;
  document.getElementById('modal-card-code').textContent = cardData.code;
  document.getElementById('modal-card-price').textContent = cardData.price;
  
  modal.classList.add('active');
}

if (modalCloseBtn) {
  modalCloseBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });
}

if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

const toggleBtn = document.getElementById('toggle-price-btn');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    const label = document.getElementById('price-type-label');
    const searchInput = document.getElementById("search-input");
    const currentQuery = searchInput ? searchInput.value : "";

    if (currentPriceType === '買取価格') {
      currentPriceType = '販売価格';
      if (label) {
        label.textContent = '販売価格';
        label.classList.remove('buy');
        label.classList.add('sell');
      }
    } else {
      currentPriceType = '買取価格';
      if (label) {
        label.textContent = '買取価格';
        label.classList.remove('sell');
        label.classList.add('buy');
      }
    }
    renderRankings(currentQuery);
    renderSearchResults(currentQuery);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupNavigationAndSearch();
  loadCards();
});