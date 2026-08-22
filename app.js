let allCards = [];
let currentPriceType = '買取価格'; // 初期値

// 起動時にJSONを読み込むよ
async function loadCards() {
  try {
    const response = await fetch('./all_cards.json');
    allCards = await response.json();
    
    // 初期描画（全件表示）
    renderRankings();
  } catch (error) {
    console.error('カードデータの読み込みに失敗したよ:', error);
  }
}

// --- ランキングおよび一覧の描画（検索フィルター対応） ---
function renderRankings(filterText = "") {
  // 検索ワードでフィルタリング
  const filtered = allCards.filter(card => {
    const query = filterText.toLowerCase();
    const name = (card.name || "").toLowerCase();
    const code = (card.product_code || "").toLowerCase();
    return name.includes(query) || code.includes(query);
  });

  // 上昇と下落に振り分け（仮に前半を上昇、後半を下落とする例、または条件に応じて調整してね）
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
    
    // 買取価格と販売価格の切り替え演出
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
    
    // 型番を 「DM26EX3 ㊙1超/㊙20」 などの形式で正しく表示
    const productCode = card.product_code || 'DM26EX3 ㊙1超/㊙20';

    cardEl.innerHTML = `
      <img src="${imageUrl}" alt="${card.name || 'カード'}" loading="lazy">
      <div class="card-title" title="${card.name || ''}">${card.name || 'カード名'}</div>
      <div class="card-code">${productCode}</div>
      <div class="price-container">
        <div class="price-transition">${priceText}</div>
        <div class="price-change ${changeClass}">${changeText}</div>
      </div>
    `;

    // カードをクリックしたときに詳細モーダルを開く
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

// ==========================
// 検索バーのセットアップ
// ==========================
function setupSearch() {
  const searchInput = document.getElementById("search-input");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value;
    renderRankings(query);
  });
}

// ==========================
// モーダル（ポップアップ）制御
// ==========================
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

// 買取価格 ⇔ 販売価格 の切り替えボタンのイベント
const toggleBtn = document.getElementById('toggle-price-btn');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    const label = document.getElementById('price-type-label');
    const searchInput = document.getElementById("search-input");
    const currentQuery = searchInput ? searchInput.value : "";

    if (currentPriceType === '買取価格') {
      currentPriceType = '販売価格';
      label.textContent = '販売価格';
      label.classList.remove('buy');
      label.classList.add('sell'); 
    } else {
      currentPriceType = '買取価格';
      label.textContent = '買取価格';
      label.classList.remove('sell');
      label.classList.add('buy'); 
    }
    renderRankings(currentQuery);
  });
}

// 起動時に実行
document.addEventListener("DOMContentLoaded", () => {
  setupSearch();
  loadCards();
});