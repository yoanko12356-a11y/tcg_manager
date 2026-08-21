let allCards = [];
let currentPriceType = '買取価格'; // 初期値

async function loadCards() {
  try {
    const response = await fetch('./all_cards.json');
    allCards = await response.json();
    
    renderRankings();

  } catch (error) {
    console.error('カードデータの読み込みに失敗したよ:', error);
  }
}

function renderRankings() {
  // 上昇ランキングは 0番目から15番目まで（計15枚）
  renderCards(allCards.slice(0, 15), 'up-ranking-list', 'up');
  // 下落ランキングは 15番目から30番目まで（計15枚）
  renderCards(allCards.slice(15, 30), 'down-ranking-list', 'down');
}

function renderCards(cards, targetId, type) {
  const container = document.getElementById(targetId);
  if (!container) return;
  
  container.innerHTML = '';

  cards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    
    // 買取価格と販売価格で数値を切り替える演出
    let priceText, changeText;
    if (currentPriceType === '買取価格') {
      priceText = type === 'up' ? '¥1200➔¥1500' : '¥1500➔¥1200';
      changeText = type === 'up' ? '（▲ +25%）' : '（▼ -20%）';
    } else {
      priceText = type === 'up' ? '¥1800➔¥2200' : '¥2200➔¥1800';
      changeText = type === 'up' ? '（▲ +22%）' : '（▼ -18%）';
    }

    const changeClass = type === 'up' ? 'up' : 'down';

    // JSON側の画像プロパティ名（image_url以外にも対応できるように安全に取得）
    const imageUrl = card.image_url || card.image || card.img || '';

    cardEl.innerHTML = `
      <img src="${imageUrl}" alt="${card.name || 'カード'}" loading="lazy">
      <div class="card-code">${card.product_code || '26EX2 70/89'}</div>
      <div class="price-container">
        <div class="price-transition">${priceText}</div>
        <div class="price-change ${changeClass}">${changeText}</div>
      </div>
    `;

    // カードをクリックしたときに相場モーダルを開く処理
    cardEl.addEventListener('click', () => {
      // 現在の価格テキストから最後の金額などを抽出してモーダルに渡す例
      const currentPriceNum = currentPriceType === '買取価格' ? (type === 'up' ? '¥1,500' : '¥1,200') : (type === 'up' ? '¥2,200' : '¥1,800');
      
      openCardModal({
        image: imageUrl,
        name: card.name || 'カード名',
        code: card.product_code || '26EX2 70/89',
        price: currentPriceNum
      });
    });

    container.appendChild(cardEl);
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
    if (currentPriceType === '買取価格') {
      currentPriceType = '販売価格';
      label.textContent = '販売価格';
      label.classList.remove('buy');
      label.classList.add('sell'); // 青色にする
    } else {
      currentPriceType = '買取価格';
      label.textContent = '買取価格';
      label.classList.remove('sell');
      label.classList.add('buy'); // 赤色にする
    }
    renderRankings();
  });
}

loadCards();