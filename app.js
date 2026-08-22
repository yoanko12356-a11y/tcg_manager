let allCards = [];
let currentPriceType = '買取価格';
let priceData = {};
let displayedCount = 50; // 最初は50枚表示！

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

async function loadPrices() {
  try {
    // GitHub Pagesやローカル環境に合わせてパスを調整してね
    const response = await fetch('https://raw.githubusercontent.com/yoanko12356-a11y/tcg_manager/refs/heads/main/data/prices_2026_08.json');
    priceData = await response.json();
    console.log("価格データの読み込み成功！", priceData);
    
    // データが読み込めたら、ランキングや検索結果を再描画して最新価格を反映させる
    renderRankings();
    renderSearchResults();
  } catch (error) {
    console.error('価格データの読み込みに失敗したよ:', error);
  }
}

function normalizeQuery(str) {
  if (!str) return "";
  return str.toLowerCase()
    // 1. カタカナをひらがなに統一
    .replace(/[\u30a1-\u30f6]/g, match => String.fromCharCode(match.charCodeAt(0) - 0x60))
    // 2. 全角数字（０〜９）を半角数字（0〜9）に変換する！
    .replace(/[０-９]/g, match => String.fromCharCode(match.charCodeAt(0) - 0xFEE0))
    // 3. 「」『』、中黒やスペース、記号をごっそり削る
    .replace(/[「」『』・＝\s\-_・ー]/g, "")
    .trim();
}

// --- ここから書き換え ---
function switchView(viewName) {
  const homeView = document.getElementById('home-view');
  const searchView = document.getElementById('search-view');
  
  // アイコンをIDで取得
  const favoriteIcon = document.getElementById('favorite-icon');
  const marketIcon = document.getElementById('market-icon');

  if (!homeView || !searchView) return;

  if (viewName === 'search') {
    homeView.style.display = 'none';
    searchView.style.display = 'block';
    document.body.classList.remove('home-mode');
    document.body.classList.add('search-mode');
    
    // 検索モード：active画像をセット
    if (favoriteIcon) favoriteIcon.src = 'images/nav-favorite-active.svg';
    if (marketIcon) marketIcon.src = 'images/nav-market-active.svg';
  } else {
    homeView.style.display = 'block';
    searchView.style.display = 'none';
    document.body.classList.remove('search-mode');
    document.body.classList.add('home-mode');
    
    // ホームモード：通常画像に戻す
    if (favoriteIcon) favoriteIcon.src = 'images/nav-favorite.svg';
    if (marketIcon) marketIcon.src = 'images/nav-market.svg';
  }
}
// --- ここまで ---

// --- 検索・フィルター・ランキング処理を統合したメイン関数 ---
function renderSearchResults(filterText = "", reset = false) {
  const container = document.getElementById("search-results-grid");
  if (!container) return;

  if (reset) {
    displayedCount = 50; 
  }

  const normalizedQuery = normalizeQuery(filterText);
  
  // サブ検索の種別と値を取得
  const subType = document.getElementById("sub-search-type") ? document.getElementById("sub-search-type").value : "text";
  const subQuery = document.getElementById("sub-search-input") ? normalizeQuery(document.getElementById("sub-search-input").value) : "";
  const powerMin = document.getElementById("power-min-input") ? parseInt(document.getElementById("power-min-input").value, 10) : NaN;
  const powerMax = document.getElementById("power-max-input") ? parseInt(document.getElementById("power-max-input").value, 10) : NaN;

  // 選択中の文明ボタンを取得
  const selectedCivs = Array.from(document.querySelectorAll('.civ-btn.active')).map(b => b.dataset.civ);

 const filtered = allCards.filter(card => {
    // 1. メイン検索（カード名・型番・種族）
    const nameNorm = normalizeQuery(card.name);
    const codeNorm = normalizeQuery(card.product_code);
    const raceNorm = normalizeQuery(card.race || ""); // ★種族も追加！
    
    const matchesMain = nameNorm.includes(normalizedQuery) || 
                          codeNorm.includes(normalizedQuery) || 
                          raceNorm.includes(normalizedQuery); // ★どれかに含まれていればOK！
                          
    if (!matchesMain) return false;

// 2. 文明フィルターの判定
    if (selectedCivs.length > 0) {
      const rawCivs = card.civilizations || []; 
      
      let civs = [];
      rawCivs.forEach(c => {
        if (typeof c === 'string') {
          civs.push(...c.split('/'));
        } else {
          civs.push(c);
        }
      });
      civs = [...new Set(civs)];

      const isMulti = civs.length > 1;
      const isMono = !isMulti && civs.length === 1;

      const civButtons = selectedCivs.filter(c => !['単色', '多色'].includes(c));
      const hasMultiSelected = selectedCivs.includes('多色');
      const hasMonoSelected = selectedCivs.includes('単色');

      // HTMLから「ANDかORか」のセレクトボックスの値を取得する（デフォルトは 'or'）
      const matchModeSelect = document.getElementById('civMatchMode');
      const matchMode = matchModeSelect ? matchModeSelect.value : 'or';

      let matchesCiv = true;

      if (civButtons.length === 0) {
        // --- 【パターン0】個別の文明ボタン未選択で「多色」「単色」だけの場合 ---
        if (hasMultiSelected && !hasMonoSelected) {
          if (!isMulti) matchesCiv = false;
        } else if (hasMonoSelected && !hasMultiSelected) {
          if (!isMono) matchesCiv = false;
        }

      } else if (civButtons.length > 0) {
        // --- 【パターンA＆B共通】文明ボタンが選ばれている場合 ---
        
        if (matchMode === 'and') {
          // ▼【AND条件】選んだ文明を「すべて」含んでいること
          const hasAllCivs = civButtons.every(bCiv => civs.includes(bCiv));
          
          // ▼【追加】選んでいない文明（余計な文明）がカードに含まれていないこと
          const hasExtraCivs = civs.some(c => !civButtons.includes(c));

          // すべて含んでいて、かつ余計な文明が入っていなければOK！
          if (!hasAllCivs || hasExtraCivs) {
            matchesCiv = false;
          }
        } else {
          // ▼【OR条件】選んだ文明の「いずれか」を含んでいること ＋ 余計な文明が入っていないかの判定
          const hasMatchedCiv = civs.some(c => civButtons.includes(c));
          const hasExtraCivs = civs.some(c => !civButtons.includes(c));

          if (civButtons.length === 1) {
            // 文明ボタンが1つのときは、余計な文明の制限は気にせず、その文明が含まれていればOK
            if (!civs.includes(civButtons[0])) matchesCiv = false;
          } else {
            // 文明ボタンが複数の（2つ以上の）とき
            if (!hasMatchedCiv || hasExtraCivs) {
              matchesCiv = false;
            }
          }
        }

        // 単色・多色の追加フィルターが選ばれている場合の絞り込み
        if (matchesCiv) {
          if (hasMultiSelected && !hasMonoSelected) {
            if (!isMulti) matchesCiv = false;
          } else if (hasMonoSelected && !hasMultiSelected) {
            if (!isMono) matchesCiv = false;
          }
        }
      }

      if (!matchesCiv) return false;
    }


    // 3. サブ検索（テキスト・パワー・種族）
    if (subType === 'text' && subQuery) {
      const cardTextNorm = normalizeQuery(card.text);
      if (!cardTextNorm.includes(subQuery)) return false;
    } else if (subType === 'race' && subQuery) {
      const cardRaceNorm = normalizeQuery(card.race);
      if (!cardRaceNorm.includes(subQuery)) return false;
    } else if (subType === 'power') {
      // パワーの数値比較（無限アタックや「+」付きの数値も考慮）
      const rawPower = card.power ? String(card.power).replace(/[^0-9]/g, "") : "";
      const cardPowerNum = rawPower ? parseInt(rawPower, 10) : 0;

      if (!isNaN(powerMin) && cardPowerNum < powerMin) return false;
      if (!isNaN(powerMax) && cardPowerNum > powerMax) return false;
    }

    return true;
  });

  // ▼▼▼ 【ここに入れる！】 ▼▼▼
const uniqueCheckbox = document.getElementById('uniqueModeCheckbox');
  const isUniqueMode = uniqueCheckbox ? uniqueCheckbox.checked : false;

  let displayCards = filtered; 
  
  if (isUniqueMode) {
    const seenNames = new Set();
    displayCards = filtered.filter(card => {
      if (!card.name) return false;
      let baseName = card.name.split(/[(（]/)[0].trim();
      if (seenNames.has(baseName)) {
        return false; 
      }
      seenNames.add(baseName);
      return true;
    });
  }

  if (displayCards.length === 0) {
    container.innerHTML = `<p style="padding: 20px; color: #666; font-size: 0.9rem; grid-column: 1 / -1; text-align: center;">一致するカードが見つからなかったんだ...</p>`;
    return;
  }

  container.innerHTML = "";
  const cardsToDisplay = displayCards.slice(0, displayedCount);

  cardsToDisplay.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    
    const imageUrl = card.image_url || card.image || card.img || '';
    const productCode = card.product_code || '26EX2 70/89';

    const cardName = card.name;
    let todayStr = "2026-08-22";
    let lowestPrice = null;
    
    if (priceData && priceData[cardName] && priceData[cardName][todayStr]) {
      const cardPrices = priceData[cardName][todayStr];
      const pricesArr = [];
      if (cardPrices.cardrush && Array.isArray(cardPrices.cardrush)) {
        const p = cardPrices.cardrush[0];
        if (p !== "×" && typeof p === 'number' && p > 0) pricesArr.push(p);
      }
      if (cardPrices.torecolo && Array.isArray(cardPrices.torecolo)) {
        const p = cardPrices.torecolo[0];
        if (p !== "×" && typeof p === 'number' && p > 0) pricesArr.push(p);
      }
      if (pricesArr.length > 0) {
        lowestPrice = Math.min(...pricesArr);
      }
    }

    const currentPriceText = lowestPrice !== null ? `¥${Number(lowestPrice).toLocaleString()}` : "¥—";
    
    let displayName = card.name || 'カード名';
    let displayCode = card.product_code || '26EX2 70/89';
    const match = card.name ? card.name.match(/^(.*?)\((.*?)\)$/) : null;
    if (match) {
      displayName = match[1].trim();
      displayCode = match[2].trim();
    }

    cardEl.innerHTML = `
      <img src="${imageUrl}" alt="${displayName}" loading="lazy">
      <div class="card-code">${displayCode}</div>
      <div class="card-title" title="${displayName}">${displayName}</div>
      <div class="price-container">
        <div class="price-transition">${currentPriceText}</div>
      </div>
    `;

    cardEl.addEventListener('click', () => {
      openCardModal({
        image: imageUrl,
        name: card.name,
        code: productCode,
        price: currentPriceText
      });
    });

    container.appendChild(cardEl);
  });
}

// --- イベント設定（文明ボタン・サブ検索切り替え） ---
document.addEventListener("DOMContentLoaded", () => {
  const civButtons = document.querySelectorAll('.civ-btn');
  
  civButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active'); // 複数選択のためにトグルするよ！
      switchView('search');
      const searchInput = document.getElementById("search-input");
      renderSearchResults(searchInput ? searchInput.value : "", true);
    });
  });

  const subSearchType = document.getElementById("sub-search-type");
  const singleWrapper = document.getElementById("single-input-wrapper");
  const powerWrapper = document.getElementById("power-input-wrapper");

  if (subSearchType) {
    subSearchType.addEventListener("change", (e) => {
      if (e.target.value === 'power') {
        if (singleWrapper) singleWrapper.style.display = 'none';
        if (powerWrapper) powerWrapper.style.display = 'flex';
      } else {
        if (singleWrapper) singleWrapper.style.display = 'flex';
        if (powerWrapper) powerWrapper.style.display = 'none';
      }
      switchView('search');
      const searchInput = document.getElementById("search-input");
      renderSearchResults(searchInput ? searchInput.value : "", true);
    });
  }

  // 入力時のイベント
  ['sub-search-input', 'power-min-input', 'power-max-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        switchView('search');
        const searchInput = document.getElementById("search-input");
        renderSearchResults(searchInput ? searchInput.value : "", true);
      });
    }
  });
});

function renderRankings(filterText = "") {
  const normalizedQuery = normalizeQuery(filterText);

// 1. まずは検索キーワードでフィルタリング
  const filtered = allCards.filter(card => {
    const nameNorm = normalizeQuery(card.name);
    const codeNorm = normalizeQuery(card.product_code);
    const textNorm = normalizeQuery(card.text || ""); // テキストも検索できるように
    const raceNorm = normalizeQuery(card.race || ""); // ★ここを追加！種族も正規化して検索対象に

    // どれか一つにでもキーワードが含まれていればヒットさせる！
    return nameNorm.includes(normalizedQuery) || 
           codeNorm.includes(normalizedQuery) || 
           textNorm.includes(normalizedQuery) || 
           raceNorm.includes(normalizedQuery);
  });

  // 2. 23,310枚の中から、価格変動率を計算できるカードをすべて計算する
  const cardsWithDiff = filtered.map(card => {
    const cardName = card.name;
    let diffPercent = 0;
    let hasPriceData = false;

    if (priceData && priceData[cardName]) {
      const dates = Object.keys(priceData[cardName]).sort();
      if (dates.length >= 2) {
        const prevDates = dates[dates.length - 2];
        const latestDate = dates[dates.length - 1];
        
        const getLowest = (dayData) => {
          if (!dayData) return null;
          const arr = [];
          if (dayData.cardrush && Array.isArray(dayData.cardrush)) {
            const p = dayData.cardrush[0];
            if (p !== "×" && typeof p === 'number' && p > 0) arr.push(p);
          }
          if (dayData.torecolo && Array.isArray(dayData.torecolo)) {
            const p = dayData.torecolo[0];
            if (p !== "×" && typeof p === 'number' && p > 0) arr.push(p);
          }
          return arr.length > 0 ? Math.min(...arr) : null;
        };

        const prevPrice = getLowest(priceData[cardName][prevDates]);
        const latestPrice = getLowest(priceData[cardName][latestDate]);

        if (prevPrice !== null && latestPrice !== null && prevPrice > 0) {
          diffPercent = ((latestPrice - prevPrice) / prevPrice) * 100;
          hasPriceData = true;
        }
      }
    }

    return {
      card: card,
      diffPercent: diffPercent,
      hasPriceData: hasPriceData
    };
  });

  // 価格データがあるものだけに絞り込む（あるいは全体でソート）
  const validCards = cardsWithDiff.filter(item => item.hasPriceData);

  // 3. 値上がりランキング用（変動率が高い順）
  const upSorted = [...validCards].sort((a, b) => b.diffPercent - a.diffPercent);
  const upCards = upSorted.slice(0, 15).map(item => item.card);

  // 4. 値下がりランキング用（変動率が低い順）
  const downSorted = [...validCards].sort((a, b) => a.diffPercent - b.diffPercent);
  const downCards = downSorted.slice(0, 15).map(item => item.card);

  // もし価格データ付きのカードが少なければ、通常のカードでフォールバック
  const finalUpCards = upCards.length > 0 ? upCards : filtered.slice(0, 15);
  const finalDownCards = downCards.length > 0 ? downCards : filtered.slice(15, 30);

  renderCards(finalUpCards, 'up-ranking-list', 'up');
  renderCards(finalDownCards, 'down-ranking-list', 'down');
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
    
    const cardName = card.name;
    let priceText = '¥—';
    let changeText = '（—）';
    let latestPriceNum = 0;

    // === 実際の価格データと前日比を計算する処理 ===
    if (priceData && priceData[cardName]) {
      const dates = Object.keys(priceData[cardName]).sort(); // 日付を古い順に並べる
      
      if (dates.length >= 2) {
        const prevDate = dates[dates.length - 2]; // 前日
        const latestDate = dates[dates.length - 1]; // 最新日
        
        const prevPrices = priceData[cardName][prevDate];
        const latestPrices = priceData[cardName][latestDate];
        
        // 最安値をそれぞれ計算する関数
        const getLowest = (dayData) => {
          if (!dayData) return null;
          const arr = [];
          if (dayData.cardrush && Array.isArray(dayData.cardrush)) {
            const p = dayData.cardrush[0];
            if (p !== "×" && typeof p === 'number' && p > 0) arr.push(p);
          }
          if (dayData.torecolo && Array.isArray(dayData.torecolo)) {
            const p = dayData.torecolo[0];
            if (p !== "×" && typeof p === 'number' && p > 0) arr.push(p);
          }
          return arr.length > 0 ? Math.min(...arr) : null;
        };

        const prevPrice = getLowest(prevPrices);
        const latestPrice = getLowest(latestPrices);

        if (prevPrice !== null && latestPrice !== null) {
          latestPriceNum = latestPrice;
          priceText = `¥${Number(prevPrice).toLocaleString()}➔¥${Number(latestPrice).toLocaleString()}`;
          
          const diff = latestPrice - prevPrice;
          const percent = Math.round((diff / prevPrice) * 100);
          
          if (diff > 0) {
            changeText = `（▲ +${percent}%）`;
          } else if (diff < 0) {
            changeText = `（▼ ${percent}%）`;
          } else {
            changeText = `（±0%）`;
          }
        } else if (latestPrice !== null) {
          latestPriceNum = latestPrice;
          priceText = `¥${Number(latestPrice).toLocaleString()}`;
        }
      } else if (dates.length === 1) {
        const latestDate = dates[0];
        const latestPrices = priceData[cardName][latestDate];
        const arr = [];
        if (latestPrices.cardrush && Array.isArray(latestPrices.cardrush)) {
          const p = latestPrices.cardrush[0];
          if (p !== "×" && typeof p === 'number' && p > 0) arr.push(p);
        }
        if (latestPrices.torecolo && Array.isArray(latestPrices.torecolo)) {
          const p = latestPrices.torecolo[0];
          if (p !== "×" && typeof p === 'number' && p > 0) arr.push(p);
        }
        if (arr.length > 0) {
          latestPriceNum = Math.min(...arr);
          priceText = `¥${Number(latestPriceNum).toLocaleString()}`;
        }
      }
    }

    const changeClass = type === 'up' ? 'up' : 'down';
    const imageUrl = card.image_url || card.image || card.img || '';
    
    // カード名とコードを綺麗に分ける処理
    let displayName = card.name || 'カード名';
    let displayCode = card.product_code || '26EX2 70/89';
    const match = card.name ? card.name.match(/^(.*?)\((.*?)\)$/) : null;
    if (match) {
      displayName = match[1].trim();
      displayCode = match[2].trim();
    }

    cardEl.innerHTML = `
      <img src="${imageUrl}" alt="${displayName}" loading="lazy">
      <div class="card-code">${displayCode}</div>
      <div class="card-title" title="${displayName}">${displayName}</div>
      <div class="price-container">
        <div class="price-transition">${priceText}</div>
        <div class="price-change ${changeClass}">${changeText}</div>
      </div>
    `;

    cardEl.addEventListener('click', () => {
      openCardModal({
        image: imageUrl,
        name: card.name || 'カード名',
        code: displayCode,
        price: `¥${Number(latestPriceNum).toLocaleString()}`
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
      renderSearchResults(query, true); // trueを渡して50枚目からリセット！
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

  window.addEventListener('scroll', () => {
  const searchView = document.getElementById('search-view');
  // 検索画面が表示されているときだけ発火させる
  if (searchView && searchView.style.display !== 'none') {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    // ページの一番下からあと 200px くらいの位置に来たら次の50枚をロード！
    if (scrollTop + clientHeight >= scrollHeight - 200) {
      displayedCount += 50;
      const searchInput = document.getElementById("search-input");
      const query = searchInput ? searchInput.value : "";
      renderSearchResults(query, false);
    }
  }
});
}

const modal = document.getElementById('card-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

function openCardModal(cardData) {
  if (!modal) return;
  
  console.log("クリックされたカード名:", JSON.stringify(cardData.name));
  console.log("priceDataにあるか？:", priceData[cardData.name] ? "あるよ！" : "ないよ！");

  document.getElementById('modal-card-img').src = cardData.image;
  document.getElementById('modal-card-title').textContent = cardData.name;
  document.getElementById('modal-card-code').textContent = cardData.code;
  document.getElementById('modal-card-price').textContent = cardData.price;
  
  // === ここからショップ情報を動的に組み立てるよ！ ===
  const cardName = cardData.name;


// === 平均価格・販売数・Chart.jsグラフの描画処理 ===
  const priceHistory = priceData && priceData[cardName] ? priceData[cardName] : {};
  const allDates = Object.keys(priceHistory).sort();
  
  // 全データの平均価格と販売数を計算
  let totalSum = 0;
  let validCount = 0;
  
  allDates.forEach(d => {
    const dayPrices = priceHistory[d];
    if (dayPrices) {
      if (dayPrices.cardrush && Array.isArray(dayPrices.cardrush) && typeof dayPrices.cardrush[0] === 'number') {
        totalSum += dayPrices.cardrush[0];
        validCount++;
      }
      if (dayPrices.torecolo && Array.isArray(dayPrices.torecolo) && typeof dayPrices.torecolo[0] === 'number') {
        totalSum += dayPrices.torecolo[0];
        validCount++;
      }
    }
  });

  const overallAvg = validCount > 0 ? Math.round(totalSum / validCount) : null;
  const avgPriceEl = document.getElementById('modal-avg-price');
  const salesCountEl = document.getElementById('modal-sales-count');
  
  if (avgPriceEl) avgPriceEl.textContent = overallAvg !== null ? `¥${overallAvg.toLocaleString()}` : '¥—';
  if (salesCountEl) salesCountEl.textContent = validCount > 0 ? validCount : '—';

  // チャート用データを構築する関数
  function getChartData(datesToUse) {
    const labels = [];
    const dataPrices = [];
    
    datesToUse.forEach(d => {
      const dayPrices = priceHistory[d];
      const arr = [];
      if (dayPrices) {
        if (dayPrices.cardrush && Array.isArray(dayPrices.cardrush) && dayPrices.cardrush[0] !== "×" && typeof dayPrices.cardrush[0] === 'number') {
          arr.push(dayPrices.cardrush[0]);
        }
        if (dayPrices.torecolo && Array.isArray(dayPrices.torecolo) && dayPrices.torecolo[0] !== "×" && typeof dayPrices.torecolo[0] === 'number') {
          arr.push(dayPrices.torecolo[0]);
        }
      }
      if (arr.length > 0) {
        const avg = arr.reduce((sum, val) => sum + val, 0) / arr.length;
        const parts = d.split('-');
        const shortDate = parts.length >= 3 ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : d;
        labels.push(shortDate);
        dataPrices.push(avg);
      }
    });
    return { labels, dataPrices };
  }

  const canvasEl = document.getElementById('priceChart');
  if (canvasEl) {
    if (window.myCardChart instanceof Chart) {
      window.myCardChart.destroy();
    }

    const initialData = getChartData(allDates);

    window.myCardChart = new Chart(canvasEl, {
      type: 'line',
      data: {
        labels: initialData.labels,
        datasets: [{
          data: initialData.dataPrices,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: '#3b82f6'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                return ` 平均価格: ¥${context.parsed.y.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: { font: { size: 10 } }
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 }, maxTicksLimit: 10 }
          }
        }
      }
    });

    // 期間ボタンの切り替え処理（全期間、90日、60日、30日、7日）
    const buttons = {
      'chart-btn-all': allDates,
      'chart-btn-90d': allDates.slice(-90),
      'chart-btn-60d': allDates.slice(-60),
      'chart-btn-30d': allDates.slice(-30),
      'chart-btn-7d': allDates.slice(-7)
    };

    Object.keys(buttons).forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.onclick = () => {
          document.querySelectorAll('.chart-filter-btn').forEach(b => {
            b.style.background = '#f1f5f9';
            b.style.color = '#666';
          });
          btn.style.background = '#3b82f6';
          btn.style.color = '#fff';

          const filtered = getChartData(buttons[btnId]);
          window.myCardChart.data.labels = filtered.labels;
          window.myCardChart.data.datasets[0].data = filtered.dataPrices;
          window.myCardChart.update();
        };
      }
    });
  }


  
  // JSONの中にある日付キーの一覧をコンソールに表示して確認するよ！
  if (priceData && priceData[cardName]) {
    console.log("このカードで持っている日付のキー一覧:", Object.keys(priceData[cardName]));
  }
  
  let todayStr = "2026-08-22";
  if (priceData && priceData[cardName]) {
    const dates = Object.keys(priceData[cardName]);
    if (dates.length > 0) {
      todayStr = dates[dates.length - 1]; // 一番後ろ（最新）の日付を自動選択！
      console.log("実際に使う日付キー:", todayStr);
    }
  }
  
  const shopListContainer = document.querySelector('.shop-list'); // HTMLのショップリストの要素
  
  if (shopListContainer) {
    let shopsHtml = '';
    
    // priceDataから該当カードのデータを取り出す
    if (priceData && priceData[cardName] && priceData[cardName][todayStr]) {
      const cardPrices = priceData[cardName][todayStr];
      
      // 1. カードラッシュの処理（配列 [価格, 在庫数] に対応！）
      if (cardPrices.cardrush && Array.isArray(cardPrices.cardrush)) {
        const rushPrice = cardPrices.cardrush[0];
        const rushStock = cardPrices.cardrush[1];
        
        if (rushPrice !== "×" && rushPrice > 0) {
          const stockText = (rushStock <= 10) ? 'わずか' : '在庫あり';
          const stockClass = (rushStock <= 10) ? 'shop-link-btn few' : 'shop-link-btn';
          
          shopsHtml += `
            <li class="shop-item">
              <span class="shop-name">カードラッシュ</span>
              <span class="shop-price">¥${Number(rushPrice).toLocaleString()}</span>
              <span class="${stockClass}">${stockText}</span>
            </li>
          `;
        }
      }
      
      // 2. トレコロの処理（配列 [価格, 在庫数] に対応！）
      if (cardPrices.torecolo && Array.isArray(cardPrices.torecolo)) {
        const torecoloPrice = cardPrices.torecolo[0];
        const torecoloStock = cardPrices.torecolo[1];
        
        if (torecoloPrice !== "×" && torecoloPrice > 0) {
          const stockText = (torecoloStock <= 10) ? 'わずか' : '在庫あり';
          const stockClass = (torecoloStock <= 10) ? 'shop-link-btn few' : 'shop-link-btn';
          
          shopsHtml += `
            <li class="shop-item">
              <span class="shop-name">トレコロ</span>
              <span class="shop-price">¥${Number(torecoloPrice).toLocaleString()}</span>
              <span class="${stockClass}">${stockText}</span>
            </li>
          `;
        }
      }
    }
    
    // データが取れなかったときの保険
    if (!shopsHtml) {
      shopsHtml = `<li class="shop-item" style="justify-content: center; color: #888;">現在取り扱いのあるショップ情報がないんだ…！</li>`;
    }
    
    shopListContainer.innerHTML = shopsHtml;
  }
  // ===============================================

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
  loadPrices(); // ここで価格データも一緒に読み込む！

  // ▼ チェックボックスの切り替えで再描画する処理 ▼
  const uniqueCheckbox = document.getElementById('uniqueModeCheckbox');
  if (uniqueCheckbox) {
    uniqueCheckbox.addEventListener('change', () => {
      switchView('search');
      const searchInput = document.getElementById("search-input");
      renderSearchResults(searchInput ? searchInput.value : "", true);
    });
  }

  // ▼【ここも追加！】AND/ORの切り替えで再描画する処理
  const matchModeSelect = document.getElementById('civMatchMode');
  if (matchModeSelect) {
    matchModeSelect.addEventListener('change', () => {
      switchView('search');
      const searchInput = document.getElementById("search-input");
      renderSearchResults(searchInput ? searchInput.value : "", true);
    });
  }
  

  // ▼【ここも追加！】カード画像を大きくする処理 ▼
  const modalImg = document.getElementById('modal-card-img');
  const zoomModal = document.getElementById('image-zoom-modal');
  const zoomedImg = document.getElementById('zoomed-card-img');

  if (modalImg && zoomModal && zoomedImg) {
    modalImg.style.cursor = 'zoom-in'; // カーソルを虫眼鏡っぽくする
    modalImg.addEventListener('click', () => {
      zoomedImg.src = modalImg.src;
      zoomModal.style.display = 'flex';
    });

    zoomModal.addEventListener('click', () => {
      zoomModal.style.display = 'none';
    });
  }


  // --- ⚙️ 詳細オプション（右からスライドするメニュー）の開閉処理 ---
  const filterBtn = document.getElementById('filter-toggle-btn');
  const optionsPopup = document.getElementById('options-popup');
  const optionsCloseBtn = document.getElementById('options-close-btn');
  const optionsBackdrop = document.getElementById('options-backdrop');

  if (filterBtn && optionsPopup) {
    const toggleMenu = () => {
      const isOpen = optionsPopup.classList.toggle('show');
      if (optionsBackdrop) optionsBackdrop.classList.toggle('show', isOpen);
    };

    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    if (optionsCloseBtn) {
      optionsCloseBtn.addEventListener('click', () => {
        optionsPopup.classList.remove('show');
        if (optionsBackdrop) optionsBackdrop.classList.remove('show');
      });
    }

    if (optionsBackdrop) {
      optionsBackdrop.addEventListener('click', () => {
        optionsPopup.classList.remove('show');
        optionsBackdrop.classList.remove('show');
      });
    }
  }
});