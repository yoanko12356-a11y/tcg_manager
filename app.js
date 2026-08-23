let allCards = [];
let currentPriceType = '買取価格';
let priceData = {};
let displayedCount = 25; // 最初は25枚表示！

async function loadCards() {
  try {
    const response = await fetch('./all_cards.json');
    const rawCards = await response.json();
    
    // ★事前に各カードに正規化済みプロパティ（インデックス）を付与して高速化する！
    allCards = rawCards.map(card => {
      const civs = card.civilizations || [];
      let civList = [];
      civs.forEach(c => {
        if (typeof c === 'string') {
          civList.push(...c.split('/'));
        } else {
          civList.push(c);
        }
      });
      civList = [...new Set(civList)];

      return {
        ...card,
        _nameNorm: normalizeQuery(card.name || ""),
        _codeNorm: normalizeQuery(card.product_code || ""),
        _raceNorm: normalizeQuery(card.race || ""),
        _textNorm: normalizeQuery(card.card_text || card.text || ""),
        _civList: civList,
        _isMulti: civList.length > 1,
        _isMono: civList.length === 1
      };
    });
    
    renderRankings();
    renderSearchResults();
    if (typeof renderDrawerSearchResults === 'function') {
      renderDrawerSearchResults();
    }
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
    if (typeof renderDrawerSearchResults === 'function') {
      renderDrawerSearchResults();
    }
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
  const collectionView = document.getElementById('collection-view');
  const marketView = document.getElementById('market-view'); // ★追加：相場用のビュー
  
  // アイコンをIDで取得
  const favoriteIcon = document.getElementById('favorite-icon');
  const marketIcon = document.getElementById('market-icon');

  // ビュー切り替え時にドロワーが開いていれば閉じる
  const drawer = document.getElementById('search-drawer');
  if (drawer) {
    drawer.classList.remove('show');
  }

  if (!homeView || !searchView) return;

  // いったんすべてのビューを非表示にする
  homeView.style.display = 'none';
  searchView.style.display = 'none';
  if (collectionView) collectionView.style.display = 'none';
  if (marketView) marketView.style.display = 'none';

  // モードごとに表示とアイコン・classを切り替える
  if (viewName === 'search') {
    searchView.style.display = 'block';
    document.body.classList.remove('home-mode', 'collection-mode', 'market-mode');
    document.body.classList.add('search-mode');
    
    // 検索モード：active画像をセット
    if (favoriteIcon) favoriteIcon.src = 'images/nav-favorite-active.svg';
    if (marketIcon) marketIcon.src = 'images/nav-market-active.svg';

  } else if (viewName === 'collection') {
    if (collectionView) {
      collectionView.style.display = 'block';
      renderCollectionCards();
    }
    document.body.classList.remove('home-mode', 'search-mode', 'market-mode');
    document.body.classList.add('collection-mode');
    
  } else if (viewName === 'market') { // ★追加：相場モードの処理
    if (marketView) {
      marketView.style.display = 'block';
      renderMarketRankings(); // 相場画面を開いたときに全カードの上昇・下落ランキングを描画！
    }
    document.body.classList.remove('home-mode', 'search-mode', 'collection-mode');
    document.body.classList.add('market-mode');
    if (marketIcon) marketIcon.src = 'images/nav-market-active.svg';

  } else {
    // ホームモード
    homeView.style.display = 'block';
    document.body.classList.remove('search-mode', 'collection-mode', 'market-mode');
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
    displayedCount = 25; 
  }

  const rawKeywords = filterText.trim().split(/\s+/).filter(Boolean);
  const normalizedKeywords = rawKeywords.map(kw => normalizeQuery(kw)).filter(Boolean);
  
  // サブ検索の種別と値を取得
  // 1. ヘッダー側のサブ検索やパワーの取得（既存）
  const subType = document.getElementById("sub-search-type") ? document.getElementById("sub-search-type").value : "text";
  const subQueryInput = document.getElementById("sub-search-input");
  const subQueryRaw = subQueryInput ? subQueryInput.value.trim() : "";
  const subQueryKeywords = subQueryRaw.split(/\s+/).map(kw => normalizeQuery(kw)).filter(Boolean);
  const powerMin = document.getElementById("power-min-input") ? parseInt(document.getElementById("power-min-input").value, 10) : NaN;
  const powerMax = document.getElementById("power-max-input") ? parseInt(document.getElementById("power-max-input").value, 10) : NaN;

// ★スライドメニュー内にあるサブ検索の行を、最初からある1個目も含めてぜんぶまとめて取得する！
  const slideSubRows = document.querySelectorAll(".sub-search-row");
  const slideConditions = Array.from(slideSubRows).map(row => {
    const typeSelect = row.querySelector(".slide-sub-type");
    const inputEl = row.querySelector(".slide-sub-input");
    const rawVal = inputEl ? inputEl.value.trim() : "";
    const keywords = rawVal.split(/\s+/).map(kw => normalizeQuery(kw)).filter(Boolean);
    return {
      type: typeSelect ? typeSelect.value : "free",
      keywords: keywords
    };
  }).filter(cond => cond.keywords.length > 0);

  // 選択中の文明ボタンを取得
  const selectedCivs = Array.from(document.querySelectorAll('.civ-btn.active')).map(b => b.dataset.civ);

 const filtered = allCards.filter(card => {
    // 1. メイン検索（カード名・型番・種族） - 事前正規化済みプロパティを利用して爆速化！
    const nameNorm = card._nameNorm;
    const codeNorm = card._codeNorm;
    const raceNorm = card._raceNorm;
    const textNorm = card._textNorm;

    // すべてのキーワードが、カード名・型番・種族・テキストのいずれかに含まれているか (AND検索)
    const matchesMain = normalizedKeywords.length === 0 || normalizedKeywords.every(kw => {
      return nameNorm.includes(kw) || 
             codeNorm.includes(kw) || 
             raceNorm.includes(kw) ||
             textNorm.includes(kw);
    });
                          
    if (!matchesMain) return false;

// 2. 文明フィルターの判定
    if (selectedCivs.length > 0) {
      const civs = card._civList || [];
      const isMulti = card._isMulti;
      const isMono = card._isMono;

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


    // 3. サブ検索（フリーワード・テキスト・種族） - ヘッダー側の既存処理
    if (subQueryKeywords.length > 0) {
      const cardNameNorm = card._nameNorm;
      const cardTextNorm = card._textNorm;
      const cardRaceNorm = normalizeQuery(card.race || "");

      if (subType === 'free') {
        const matchesAll = subQueryKeywords.every(kw => {
          return cardNameNorm.includes(kw) || 
                 cardTextNorm.includes(kw) || 
                 cardRaceNorm.includes(kw);
        });
        if (!matchesAll) return false;
      } else if (subType === 'text') {
        const matchesAll = subQueryKeywords.every(kw => cardTextNorm.includes(kw));
        if (!matchesAll) return false;
      } else if (subType === 'race') {
        const matchesAll = subQueryKeywords.every(kw => cardRaceNorm.includes(kw));
        if (!matchesAll) return false;
      }
    }

    // ★スライドメニュー内で「＋」から増やしたサブ検索の条件をぜんぶチェックする処理
    for (const cond of slideConditions) {
      const cardNameNorm = normalizeQuery(card.name || "");
      const cardTextNorm = normalizeQuery(card.text || "");
      const cardRaceNorm = normalizeQuery(card.race || "");

      if (cond.type === 'free') {
        const matchesAll = cond.keywords.every(kw => {
          return cardNameNorm.includes(kw) || cardTextNorm.includes(kw) || cardRaceNorm.includes(kw);
        });
        if (!matchesAll) return false;
      } else if (cond.type === 'text') {
        const matchesAll = cond.keywords.every(kw => cardTextNorm.includes(kw));
        if (!matchesAll) return false;
      } else if (cond.type === 'race') {
        const matchesAll = cond.keywords.every(kw => cardRaceNorm.includes(kw));
        if (!matchesAll) return false;
      }
    }

    // ★サブ検索の種類に関係なく、詳細オプションのパワー範囲指定が入力されていればここで絞り込む！
    if (!isNaN(powerMin) || !isNaN(powerMax)) {
      const rawPower = card.power ? String(card.power).replace(/[^0-9]/g, "") : "";
      const cardPowerNum = rawPower ? parseInt(rawPower, 10) : 0;
      const hasNumericPower = rawPower !== "";

      if (!isNaN(powerMin)) {
        if (!hasNumericPower || cardPowerNum < powerMin) return false;
      }
      if (!isNaN(powerMax)) {
        if (!hasNumericPower || cardPowerNum > powerMax) return false;
      }
    }


    // ★追加：詳細オプションのコスト範囲指定が入力されていればここで絞り込む！
    const costMin = document.getElementById("cost-min-input") ? parseInt(document.getElementById("cost-min-input").value, 10) : NaN;
    const costMax = document.getElementById("cost-max-input") ? parseInt(document.getElementById("cost-max-input").value, 10) : NaN;

    if (!isNaN(costMin) || !isNaN(costMax)) {
      const cardCostNum = (card.cost !== undefined && card.cost !== null) ? parseInt(card.cost, 10) : NaN;
      const hasNumericCost = !isNaN(cardCostNum);

      if (!isNaN(costMin)) {
        if (!hasNumericCost || cardCostNum < costMin) return false;
      }
      if (!isNaN(costMax)) {
        if (!hasNumericCost || cardCostNum > costMax) return false;
      }
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

// ▼▼▼ 並び替え（ソート）処理の更新 ▼▼▼
  const sortOrderSelect = document.getElementById('sort-order-select');
  const sortOrder = sortOrderSelect ? sortOrderSelect.value : 'release-new';

  if (sortOrder === 'release-new') {
    // 発売日(新)：IDが大きい（新しい）順
    displayCards.sort((a, b) => {
      const idA = a.id !== undefined ? Number(a.id) : 0;
      const idB = b.id !== undefined ? Number(b.id) : 0;
      return idB - idA;
    });
  } else if (sortOrder === 'release-old') {
    // 発売日(古)：IDが小さい（古い）順
    displayCards.sort((a, b) => {
      const idA = a.id !== undefined ? Number(a.id) : 0;
      const idB = b.id !== undefined ? Number(b.id) : 0;
      return idA - idB;
    });
  } else if (sortOrder === 'cost-desc') {
    // コスト(高)：コストが大きい順
    displayCards.sort((a, b) => {
      const costA = (a.cost !== undefined && a.cost !== null) ? parseInt(a.cost, 10) : -1;
      const costB = (b.cost !== undefined && b.cost !== null) ? parseInt(b.cost, 10) : -1;
      return costB - costA;
    });
  } else if (sortOrder === 'cost-asc') {
    // コスト(低)：コストが小さい順
    displayCards.sort((a, b) => {
      const costA = (a.cost !== undefined && a.cost !== null) ? parseInt(a.cost, 10) : 999;
      const costB = (b.cost !== undefined && b.cost !== null) ? parseInt(b.cost, 10) : 999;
      return costA - costB;
    });
  }
  // ▲▲▲ ここまで ▲▲▲


  if (displayCards.length === 0) {
    container.innerHTML = `<p style="padding: 20px; color: #666; font-size: 0.9rem; grid-column: 1 / -1; text-align: center;">一致するカードが見つかりませんでした...</p>`;
    return;
  }

container.innerHTML = "";

displayCards.forEach(card => {
  const cardEl = document.createElement('div');

  // ★ コレクションカードをドラッグ可能にする
  cardEl.className = 'card-item draggable-card';
  cardEl.setAttribute('draggable', 'true');

  // ★ userCollectionのキーになる正式なカード名
  cardEl.dataset.cardName = card.name;

  cardEl.style.position = 'relative';

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

    cardEl.dataset.cardName = card.name;

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
      
      // ★いまコレクション画面が開いているかどうかをチェックするんだ！
      const collectionView = document.getElementById('collection-view');
      if (collectionView && collectionView.style.display !== 'none') {
        renderCollectionCards(); // コレクション画面ならコレクション用を再描画！
      } else {
        switchView('search');
        const searchInput = document.getElementById("search-input");
        renderSearchResults(searchInput ? searchInput.value : "", true);
      }
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
  ['sub-search-input', 'power-min-input', 'power-max-input', 'cost-min-input', 'cost-max-input'].forEach(id => {
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
  const rawKeywords = filterText.trim().split(/\s+/).filter(Boolean);
  const normalizedKeywords = rawKeywords.map(kw => normalizeQuery(kw)).filter(Boolean);

  // コレクションに入っているカード名（枚数が1枚以上）を抽出
  const collectedCardNames = Object.keys(userCollection).filter(name => userCollection[name] > 0);

  // 1. まずは検索キーワードでフィルタリング ＆ コレクション内のカードのみに絞り込む
  const filtered = allCards.filter(card => {
    // コレクションに含まれているかチェック
    if (!collectedCardNames.includes(card.name)) {
      return false;
    }

    const nameNorm = normalizeQuery(card.name);
    const codeNorm = normalizeQuery(card.product_code);
    const textNorm = normalizeQuery(card.card_text || card.text || ""); // テキストも検索できるように
    const raceNorm = normalizeQuery(card.race || ""); // ★ここを追加！種族も正規化して検索対象に

    return normalizedKeywords.length === 0 || normalizedKeywords.every(kw => {
      return nameNorm.includes(kw) || 
             codeNorm.includes(kw) || 
             textNorm.includes(kw) || 
             raceNorm.includes(kw);
    });
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
    container.innerHTML = `<p style="padding: 10px; color: #666; font-size: 0.85rem;">該当するカードが見当たりません</p>`;
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
    
    cardEl.dataset.cardName = card.name;

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
    let searchDebounceTimer = null;
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value;
      switchView('search');
      
      // デバウンス処理（200ms）を適用して連続入力をスムーズにする
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        renderSearchResults(query, true);
      }, 200);
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

  // ★ここに追加するよ！コレクションタブがクリックされたときの処理
  document.querySelectorAll('[data-tab="collection"]').forEach(btn => {
    btn.addEventListener("click", () => {
      switchView('collection');
    });
  });

  // ★ここに追加！相場タブがクリックされたときの処理
  document.querySelectorAll('[data-tab="market"]').forEach(btn => {
    btn.addEventListener("click", () => {
      switchView('market');
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
        displayedCount += 25;
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
      shopsHtml = `<li class="shop-item" style="justify-content: center; color: #888;">現在取り扱いのあるショップ情報が見当たりません</li>`;
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
  loadPrices();


  // ▼ 並び替えセレクトボックスの変更検知 ▼
  const sortOrderSelect = document.getElementById('sort-order-select');
  if (sortOrderSelect) {
    sortOrderSelect.addEventListener('change', () => {
      switchView('search');
      const searchInput = document.getElementById("search-input");
      renderSearchResults(searchInput ? searchInput.value : "", true);
    });
  }

  // ▼ チェックボックスの切り替えで再描画する処理 ▼
  const uniqueCheckbox = document.getElementById('uniqueModeCheckbox');
  if (uniqueCheckbox) {
    uniqueCheckbox.addEventListener('change', () => {
      switchView('search');
      const searchInput = document.getElementById("search-input");
      renderSearchResults(searchInput ? searchInput.value : "", true);
    });
  }

  // ▼ AND/ORの切り替えで再描画する処理
  const matchModeSelect = document.getElementById('civMatchMode');
  if (matchModeSelect) {
    matchModeSelect.addEventListener('change', () => {
      switchView('search');
      const searchInput = document.getElementById("search-input");
      renderSearchResults(searchInput ? searchInput.value : "", true);
    });
  }

  // ▼ カード画像を大きくする処理 ▼
  const modalImg = document.getElementById('modal-card-img');
  const zoomModal = document.getElementById('image-zoom-modal');
  const zoomedImg = document.getElementById('zoomed-card-img');

  if (modalImg && zoomModal && zoomedImg) {
    modalImg.style.cursor = 'zoom-in';
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

  // --- ★【重要】最初から存在する1個目のサブ検索欄に対するイベント設定・共通化関数 ---
  function bindSubSearchRowEvents(row) {
    const inputEl = row.querySelector(".slide-sub-input");
    const typeSelect = row.querySelector(".slide-sub-type");
    const removeBtn = row.querySelector(".remove-sub-search-btn");

    if (inputEl) {
      inputEl.addEventListener("input", () => {
        switchView('search');
        const searchInput = document.getElementById("search-input");
        renderSearchResults(searchInput ? searchInput.value : "", true);
      });
    }

    if (typeSelect) {
      typeSelect.addEventListener("change", () => {
        switchView('search');
        const searchInput = document.getElementById("search-input");
        renderSearchResults(searchInput ? searchInput.value : "", true);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        // 1個目しかない場合は削除させずに中身をクリアにするか、そのまま消すかの制御
        const container = document.getElementById("dynamic-sub-search-container");
        if (container && container.querySelectorAll(".sub-search-row").length > 1) {
          row.remove();
        } else {
          if (inputEl) inputEl.value = "";
        }
        switchView('search');
        const searchInput = document.getElementById("search-input");
        renderSearchResults(searchInput ? searchInput.value : "", true);
      });
    }
  }

  // 1. まず、最初からHTMLにある1個目のサブ検索行にイベントをバインド！[cite: 7]
  document.querySelectorAll(".sub-search-row").forEach(row => {
    bindSubSearchRowEvents(row);
  });

  // 2. スライドメニュー内の「＋」ボタンでサブ検索行を増やす処理
  const addSubBtn = document.getElementById("add-sub-search-btn");
  const dynamicContainer = document.getElementById("dynamic-sub-search-container");

  if (addSubBtn && dynamicContainer) {
    addSubBtn.addEventListener("click", () => {
      const newRow = document.createElement("div");
      newRow.className = "sub-search-row";
      newRow.style.cssText = "display: flex; gap: 6px; align-items: center; margin-top: 6px;";
      newRow.innerHTML = `
        <select class="slide-sub-type" style="padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; background: #fff; outline: none;">
          <option value="free">フリー</option>
          <option value="text">テキスト</option>
          <option value="race">種族</option>
        </select>
        <div style="position: relative; flex: 1; display: flex; align-items: center;">
          <input type="text" class="slide-sub-input" placeholder="追加キーワード..." style="width: 100%; padding: 6px 26px 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; outline: none; background: #fff;" />
          <button type="button" class="remove-sub-search-btn" style="position: absolute; right: 6px; background: transparent; border: none; color: #94a3b8; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px;" title="削除">✕</button>
        </div>
      `;

      // 作成した新しい行にも同じイベントを適用！
      bindSubSearchRowEvents(newRow);

      dynamicContainer.appendChild(newRow);
    });
  }

// ▼「条件をリセット」ボタンの処理
  const resetFiltersBtn = document.getElementById("reset-filters-btn");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      // ★すでにある searchInput 変数があればそのまま中身を空にする！
      const searchInputEl = document.getElementById("search-input");
      if (searchInputEl) searchInputEl.value = "";

      // パワー・コスト入力クリア
      ['power-min-input', 'power-max-input', 'cost-min-input', 'cost-max-input', 'sub-search-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      // スライド内のサブ検索欄も1個目以外を削除し、1個目の中身を空にする
      const container = document.getElementById("dynamic-sub-search-container");
      if (container) {
        container.innerHTML = `
          <div class="sub-search-row" style="display: flex; gap: 6px; align-items: center;">
            <select class="slide-sub-type" style="padding: 6px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; background: #fff; outline: none;">
              <option value="free">フリー</option>
              <option value="text">テキスト</option>
              <option value="race">種族</option>
            </select>
            <div style="position: relative; flex: 1; display: flex; align-items: center;">
              <input type="text" class="slide-sub-input" placeholder="追加キーワード..." style="width: 100%; padding: 6px 26px 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.85rem; outline: none; background: #fff;" />
              <button class="remove-sub-search-btn" style="position: absolute; right: 6px; background: transparent; border: none; color: #94a3b8; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px;" title="削除">✕</button>
            </div>
          </div>
        `;
        const firstNewRow = container.querySelector(".sub-search-row");
        if (firstNewRow) bindSubSearchRowEvents(firstNewRow);
      }

      // 文明ボタンのアクティブも全部外す
      document.querySelectorAll('.civ-btn').forEach(b => b.classList.remove('active'));

      switchView('search');
      renderSearchResults("", true); // 空文字を渡して全カードを再表示！
    });
  }
});

function saveCollection() {
  localStorage.setItem('tcg_collection', JSON.stringify(userCollection));
}

let userCollection = JSON.parse(localStorage.getItem('tcg_collection')) || {};

// ==========================
// ★ 相場モード（全カード対象の上昇・下落ランキング）のロジック
// ==========================
let marketUpLimit = 15;
let marketDownLimit = 15;
let cachedMarketValidCards = { up: [], down: [] };

function renderMarketRankings(filterText = "") {
  const rawKeywords = filterText.trim().split(/\s+/).filter(Boolean);
  const normalizedKeywords = rawKeywords.map(kw => normalizeQuery(kw)).filter(Boolean);

  const filtered = allCards.filter(card => {
    const nameNorm = normalizeQuery(card.name);
    const codeNorm = normalizeQuery(card.product_code);
    const textNorm = normalizeQuery(card.card_text || card.text || "");
    const raceNorm = normalizeQuery(card.race || "");

    return normalizedKeywords.length === 0 || normalizedKeywords.every(kw => {
      return nameNorm.includes(kw) || 
             codeNorm.includes(kw) || 
             textNorm.includes(kw) || 
             raceNorm.includes(kw);
    });
  });

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

  const validCards = cardsWithDiff.filter(item => item.hasPriceData);

  const upSorted = [...validCards].sort((a, b) => b.diffPercent - a.diffPercent);
  const downSorted = [...validCards].sort((a, b) => a.diffPercent - b.diffPercent);

  cachedMarketValidCards.up = upSorted.length > 0 ? upSorted.map(item => item.card) : filtered;
  cachedMarketValidCards.down = downSorted.length > 0 ? downSorted.map(item => item.card) : filtered.slice(15);

  const finalUpCards = cachedMarketValidCards.up.slice(0, marketUpLimit);
  const finalDownCards = cachedMarketValidCards.down.slice(0, marketDownLimit);

  renderMarketCardsWithRanking(finalUpCards, 'market-up-ranking-list', 'up');
  renderMarketCardsWithRanking(finalDownCards, 'market-down-ranking-list', 'down');
}

function renderMarketCardsWithRanking(cards, targetId, type) {
  const container = document.getElementById(targetId);
  if (!container) return;
  
  container.innerHTML = '';

  if (cards.length === 0) {
    container.innerHTML = `<p style="padding: 10px; color: #666; font-size: 0.85rem;">該当するカードが見当たりません</p>`;
    return;
  }

  cards.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    
    const cardName = card.name;
    let priceText = '¥—';
    let changeText = '（—）';

    if (priceData && priceData[cardName]) {
      const dates = Object.keys(priceData[cardName]).sort();
      if (dates.length >= 2) {
        const prevDate = dates[dates.length - 2];
        const latestDate = dates[dates.length - 1];
        
        const prevPrices = priceData[cardName][prevDate];
        const latestPrices = priceData[cardName][latestDate];
        
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
          priceText = `¥${Number(prevPrice).toLocaleString()}➔¥${Number(latestPrice).toLocaleString()}`;
          const diff = latestPrice - prevPrice;
          const percent = Math.round((diff / prevPrice) * 100);
          if (diff > 0) changeText = `（▲ +${percent}%）`;
          else if (diff < 0) changeText = `（▼ ${percent}%）`;
          else changeText = `（±0%）`;
        } else if (latestPrice !== null) {
          priceText = `¥${Number(latestPrice).toLocaleString()}`;
        }
      }
    }

    const changeClass = type === 'up' ? 'up' : 'down';
    const imageUrl = card.image_url || card.image || card.img || '';
    
    let displayName = card.name || 'カード名';
    let displayCode = card.product_code || '';
    const match = card.name ? card.name.match(/^(.*?)\((.*?)\)$/) : null;
    if (match) {
      displayName = match[1].trim();
      displayCode = match[2].trim();
    }

    // 何位かを表示するバッジ（1位金、2位銀、3位銅、4位以降グレー）
    const badgeColors = ['#f59e0b', '#94a3b8', '#b45309'];
    const bgColor = index < 3 ? badgeColors[index] : '#64748b';
    const rankBadgeHtml = `
      <div style="
        position: absolute;
        top: 6px;
        left: 6px;
        background: ${bgColor};
        color: #fff;
        padding: 2px 8px;
        font-size: 0.75rem;
        font-weight: bold;
        border-radius: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        z-index: 2;
      ">${index + 1}位</div>
    `;

    cardEl.innerHTML = `
      ${rankBadgeHtml}
      <img src="${imageUrl}" alt="${displayName}" loading="lazy">
      <div class="card-code">${displayCode}</div>
      <div class="card-title" title="${displayName}">${displayName}</div>
      <div class="price-container">
        <div class="price-transition">${priceText}</div>
        <div class="price-change ${changeClass}">${changeText}</div>
      </div>
    `;
    
    cardEl.style.position = 'relative';

    cardEl.addEventListener('click', () => {
      openCardModal({
        image: imageUrl,
        name: card.name || 'カード名',
        code: displayCode,
        price: priceText
      });
    });

    container.appendChild(cardEl);
  });
}

// 相場画面での横スクロール追加読み込みの設定
document.addEventListener("DOMContentLoaded", () => {
  const upListEl = document.getElementById('market-up-ranking-list');
  const downListEl = document.getElementById('market-down-ranking-list');

  const handleHorizontalScroll = (container, type) => {
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    // 右端からあと 150px 以内に入ったら追加読み込み
    if (scrollLeft + clientWidth >= scrollWidth - 150) {
      let updated = false;
      if (type === 'up' && marketUpLimit < cachedMarketValidCards.up.length) {
        marketUpLimit += 15;
        updated = true;
      } else if (type === 'down' && marketDownLimit < cachedMarketValidCards.down.length) {
        marketDownLimit += 15;
        updated = true;
      }

      if (updated) {
        if (type === 'up') {
          renderMarketCardsWithRanking(cachedMarketValidCards.up.slice(0, marketUpLimit), 'market-up-ranking-list', 'up');
        } else {
          renderMarketCardsWithRanking(cachedMarketValidCards.down.slice(0, marketDownLimit), 'market-down-ranking-list', 'down');
        }
      }
    }
  };

  if (upListEl) {
    upListEl.addEventListener('scroll', () => handleHorizontalScroll(upListEl, 'up'));
  }
  if (downListEl) {
    downListEl.addEventListener('scroll', () => handleHorizontalScroll(downListEl, 'down'));
  }
});




function renderCollectionCards() {
  const container = document.getElementById("collection-results-grid");
  if (!container) return;

  console.log("【デバッグ】現在の userCollection のキー一覧:", Object.keys(userCollection));
  console.log("【デバッグ】全カードデータの最初の1件の name:", allCards[0] ? allCards[0].name : "データなし");
  

  // 1. コレクションに入っているカード名（枚数が1枚以上）を抽出
  const collectedCardNames = Object.keys(userCollection).filter(name => userCollection[name] > 0);
  
  // 2. そのまま完全一致するカードだけを表示用に絞り込むよ！
  let displayCards = allCards.filter(card => collectedCardNames.includes(card.name));

  // 2. コレクション専用の検索キーワード適用
  const searchInput = document.getElementById("collection-search-input");
  const keyword = searchInput ? normalizeQuery(searchInput.value) : "";

  if (keyword) {
    displayCards = displayCards.filter(card => {
      const nameNorm = normalizeQuery(card.name || "");
      const codeNorm = normalizeQuery(card.product_code || "");
      const raceNorm = normalizeQuery(card.race || "");
      const textNorm = normalizeQuery(card.text || "");
      return nameNorm.includes(keyword) || codeNorm.includes(keyword) || raceNorm.includes(keyword) || textNorm.includes(keyword);
    });
  }

  // 3. 検索画面と共通の文明フィルターが選ばれていれば連動させる
  const selectedCivs = Array.from(document.querySelectorAll('.civ-btn.active')).map(b => b.dataset.civ);
  if (selectedCivs.length > 0) {
    displayCards = displayCards.filter(card => {
      const rawCivs = card.civilizations || [];
      let civs = [];
      rawCivs.forEach(c => {
        if (typeof c === 'string') civs.push(...c.split('/'));
        else civs.push(c);
      });
      civs = [...new Set(civs)];

      const isMulti = civs.length > 1;
      const isMono = !isMulti && civs.length === 1;
      const civButtons = selectedCivs.filter(c => !['単色', '多色'].includes(c));
      const hasMultiSelected = selectedCivs.includes('多色');
      const hasMonoSelected = selectedCivs.includes('単色');

      let matchesCiv = true;
      if (civButtons.length === 0) {
        if (hasMultiSelected && !hasMonoSelected && !isMulti) matchesCiv = false;
        if (hasMonoSelected && !hasMultiSelected && !isMono) matchesCiv = false;
      } else {
        const hasMatchedCiv = civs.some(c => civButtons.includes(c));
        const hasExtraCivs = civs.some(c => !civButtons.includes(c));
        if (civButtons.length === 1) {
          if (!civs.includes(civButtons[0])) matchesCiv = false;
        } else {
          if (!hasMatchedCiv || hasExtraCivs) matchesCiv = false;
        }
      }
      return matchesCiv;
    });
  }

  // 4. 並べ替え（ソート）処理
  const sortSelect = document.getElementById('collection-sort-select');
  const sortOrder = sortSelect ? sortSelect.value : 'release-new';

  if (sortOrder === 'release-new') {
    displayCards.sort((a, b) => (b.id !== undefined ? Number(b.id) : 0) - (a.id !== undefined ? Number(a.id) : 0));
  } else if (sortOrder === 'release-old') {
    displayCards.sort((a, b) => (a.id !== undefined ? Number(a.id) : 0) - (b.id !== undefined ? Number(b.id) : 0));
  } else if (sortOrder === 'cost-desc') {
    displayCards.sort((a, b) => (parseInt(b.cost, 10) || -1) - (parseInt(a.cost, 10) || -1));
  } else if (sortOrder === 'cost-asc') {
    displayCards.sort((a, b) => (parseInt(a.cost, 10) || 999) - (parseInt(b.cost, 10) || 999));
  }

  if (displayCards.length === 0) {
    container.innerHTML = `<p style="padding: 20px; color: #666; font-size: 0.9rem; grid-column: 1 / -1; text-align: center;">条件に一致するコレクションカードがありません...</p>`;
    return;
  }

  container.innerHTML = "";
  displayCards.forEach(card => {
  const cardEl = document.createElement('div');

  cardEl.className = 'card-item draggable-card';
  cardEl.setAttribute('draggable', 'true');

  // userCollectionのキーになる正式名称を保存
  cardEl.dataset.cardName = card.name;

  cardEl.style.position = 'relative';
    
    const imageUrl = card.image_url || card.image || card.img || '';
    const productCode = card.product_code || '';
    let displayName = card.name || 'カード名';
    let displayCode = productCode;
    
    const match = card.name ? card.name.match(/^(.*?)\((.*?)\)$/) : null;
    if (match) {
      displayName = match[1].trim();
      displayCode = match[2].trim();
    }

    const count = userCollection[card.name] || 1;

    // 最新価格の取得
    let todayStr = "2026-08-22";
    let lowestPrice = null;
    if (priceData && priceData[card.name] && priceData[card.name][todayStr]) {
      const cardPrices = priceData[card.name][todayStr];
      const pricesArr = [];
      if (cardPrices.cardrush && Array.isArray(cardPrices.cardrush)) {
        const p = cardPrices.cardrush[0];
        if (p !== "×" && typeof p === 'number' && p > 0) pricesArr.push(p);
      }
      if (cardPrices.torecolo && Array.isArray(cardPrices.torecolo)) {
        const p = cardPrices.torecolo[0];
        if (p !== "×" && typeof p === 'number' && p > 0) pricesArr.push(p);
      }
      if (pricesArr.length > 0) lowestPrice = Math.min(...pricesArr);
    }
    const currentPriceText = lowestPrice !== null ? `¥${Number(lowestPrice).toLocaleString()}` : "¥—";

    cardEl.innerHTML = `
      <div style="
        position: absolute;
        top: -8px;
        right: -8px;
        background: #ff4757;
        color: #fff;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: bold;
        border-radius: 50%;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        z-index: 2;
      ">×${count}</div>
      <img src="${imageUrl}" alt="${displayName}" loading="lazy">
      <div class="card-code">${displayCode}</div>
      <div class="card-title" title="${displayName}">${displayName}</div>
      <div class="price-container">
        <div class="price-transition" style="color: #3b82f6;">${currentPriceText}</div>
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





document.addEventListener("DOMContentLoaded", () => {
  // 1. 画面右下のフローティングボタン作成
  const existingBtn = document.getElementById('floating-add-card-btn');
  if (existingBtn) existingBtn.remove();

  const floatingBtn = document.createElement('button');
  floatingBtn.id = 'floating-add-card-btn';
  floatingBtn.title = 'カードを追加';
  floatingBtn.innerHTML = `<span>＋ カードを追加</span>`;
  floatingBtn.style.cssText = `
    position: fixed;
    bottom: 28px;
    right: 28px;
    height: 52px;
    padding: 0 22px;
    border-radius: 26px;
    background: #3b82f6;
    color: #fff;
    border: none;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.95rem;
    font-weight: bold;
    z-index: 1998;
    transition: transform 0.2s ease, background 0.2s ease;
  `;

  floatingBtn.onmouseover = () => { 
    floatingBtn.style.transform = 'scale(1.05)'; 
    floatingBtn.style.background = '#2563eb'; 
  };
  floatingBtn.onmouseout = () => { 
    floatingBtn.style.transform = 'scale(1)'; 
    floatingBtn.style.background = '#3b82f6'; 
  };

  document.body.appendChild(floatingBtn);

  const drawer = document.getElementById('search-drawer');
  const backdrop = document.getElementById('search-drawer-backdrop');
  const closeBtn = document.getElementById('search-drawer-close');

  // 💡 裏のぼかし（バックドロップ）を表示させないように非表示に固定
  if (backdrop) {
    backdrop.style.display = 'none';
  }

  // --- ★ドロワー内の検索窓やボタンのイベント設定 ---
  const drawerSearchInput = document.getElementById('drawer-search-input');
  if (drawerSearchInput) {
    drawerSearchInput.addEventListener('input', renderDrawerSearchResults);
  }

  const drawerCivButtons = document.querySelectorAll('.drawer-civ-btn');
  drawerCivButtons.forEach(button => {
    button.addEventListener('click', () => {
      button.classList.toggle('active');
      renderDrawerSearchResults();
    });
  });

  // ドロワー内の同名カードまとめチェックボックス・ソートセレクト・詳細オプションのイベント登録
  const drawerUniqueCheckbox = document.getElementById('drawerUniqueModeCheckbox');
  if (drawerUniqueCheckbox) {
    drawerUniqueCheckbox.addEventListener('change', renderDrawerSearchResults);
  }

  const drawerSortSelect = document.getElementById('drawer-sort-order-select');
  if (drawerSortSelect) {
    drawerSortSelect.addEventListener('change', renderDrawerSearchResults);
  }

  // ドロワー用詳細オプションの開閉・リセット・入力変更イベント
  const drawerFilterBtn = document.getElementById('drawer-filter-toggle-btn');
  const drawerOptionsPopup = document.getElementById('drawer-options-popup');
  const drawerOptionsCloseBtn = document.getElementById('drawer-options-close-btn');
  const drawerOptionsBackdrop = document.getElementById('drawer-options-backdrop');

  if (drawerFilterBtn && drawerOptionsPopup) {
    const toggleDrawerMenu = () => {
      const isOpen = drawerOptionsPopup.classList.toggle('show');
      if (drawerOptionsBackdrop) drawerOptionsBackdrop.classList.toggle('show', isOpen);
    };

    drawerFilterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDrawerMenu();
    });

    if (drawerOptionsCloseBtn) {
      drawerOptionsCloseBtn.addEventListener('click', () => {
        drawerOptionsPopup.classList.remove('show');
        if (drawerOptionsBackdrop) drawerOptionsBackdrop.classList.remove('show');
      });
    }

    if (drawerOptionsBackdrop) {
      drawerOptionsBackdrop.addEventListener('click', () => {
        drawerOptionsPopup.classList.remove('show');
        drawerOptionsBackdrop.classList.remove('show');
      });
    }
  }

  // ドロワー内の詳細オプション入力欄・条件変更の監視
  ['drawer-sub-search-input', 'drawer-power-min-input', 'drawer-power-max-input', 'drawer-cost-min-input', 'drawer-cost-max-input', 'drawer-sub-search-type', 'drawer-civMatchMode'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", renderDrawerSearchResults);
      el.addEventListener("change", renderDrawerSearchResults);
    }
  });

  const drawerResetFiltersBtn = document.getElementById("drawer-reset-filters-btn");
  if (drawerResetFiltersBtn) {
    drawerResetFiltersBtn.addEventListener("click", () => {
      if (drawerSearchInput) drawerSearchInput.value = "";
      ['drawer-power-min-input', 'drawer-power-max-input', 'drawer-cost-min-input', 'drawer-cost-max-input', 'drawer-sub-search-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      document.querySelectorAll('.drawer-civ-btn').forEach(b => b.classList.remove('active'));
      renderDrawerSearchResults();
    });
  }

  // --- ★ドロワー内の検索結果を描画する関数（修正版：検索モードと完全同等のロジック） ---
  function renderDrawerSearchResults() {
    const drawerResultsGrid = document.getElementById('drawer-search-results');
    const drawerSearchInput = document.getElementById('drawer-search-input');
    if (!drawerResultsGrid) return;

    // ドロップ受け入れの初期化（一度だけ）
    if (!drawerResultsGrid.dataset.dropInitialized) {
      drawerResultsGrid.dataset.dropInitialized = "true";
      drawerResultsGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        drawerResultsGrid.classList.add('drag-over');
      });
      drawerResultsGrid.addEventListener('dragleave', () => {
        drawerResultsGrid.classList.remove('drag-over');
      });
      drawerResultsGrid.addEventListener('drop', (e) => {
        e.preventDefault();
        drawerResultsGrid.classList.remove('drag-over');
        // ドロワー上でのドロップは、どこにドロップされてもコレクションから減算する（ドロワーにカードを戻す/移動する挙動）
        let cardName = e.dataTransfer.getData('card/name') || e.dataTransfer.getData('text/plain');
        const sourceArea = e.dataTransfer.getData('source/area');
        console.log("ドロワーにドロップされたよ - カード:", cardName, " / エリア:", sourceArea);
        if (sourceArea === 'collection' && typeof userCollection !== 'undefined' && cardName) {
          if (userCollection[cardName] && userCollection[cardName] > 0) {
            userCollection[cardName] -= 1;
            if (userCollection[cardName] <= 0) delete userCollection[cardName];
          } else {
            userCollection[cardName] = (userCollection[cardName] || 1) - 1;
            if (userCollection[cardName] <= 0) delete userCollection[cardName];
          }
          saveCollection();
          if (document.getElementById('collection-view').style.display !== 'none') renderCollectionCards();
          renderDrawerSearchResults();
        }
      });
    }

    const rawKeywords = drawerSearchInput ? drawerSearchInput.value.trim().split(/\s+/).filter(Boolean) : [];
    const normalizedKeywords = rawKeywords.map(kw => normalizeQuery(kw)).filter(Boolean);
    const drawerSelectedCivs = Array.from(document.querySelectorAll('.drawer-civ-btn.active')).map(btn => btn.dataset.civ);

    // 詳細オプション条件の取得
    const subType = document.getElementById("drawer-sub-search-type") ? document.getElementById("drawer-sub-search-type").value : "free";
    const subQueryInput = document.getElementById("drawer-sub-search-input");
    const subQueryRaw = subQueryInput ? subQueryInput.value.trim() : "";
    const subQueryKeywords = subQueryRaw.split(/\s+/).map(kw => normalizeQuery(kw)).filter(Boolean);
    const powerMin = document.getElementById("drawer-power-min-input") ? parseInt(document.getElementById("drawer-power-min-input").value, 10) : NaN;
    const powerMax = document.getElementById("drawer-power-max-input") ? parseInt(document.getElementById("drawer-power-max-input").value, 10) : NaN;
    const costMin = document.getElementById("drawer-cost-min-input") ? parseInt(document.getElementById("drawer-cost-min-input").value, 10) : NaN;
    const costMax = document.getElementById("drawer-cost-max-input") ? parseInt(document.getElementById("drawer-cost-max-input").value, 10) : NaN;
    const matchMode = document.getElementById('drawer-civMatchMode') ? document.getElementById('drawer-civMatchMode').value : 'or';

    const filtered = allCards.filter(card => {
      const nameNorm = card._nameNorm;
      const codeNorm = card._codeNorm;
      const raceNorm = card._raceNorm;
      const textNorm = card._textNorm;

      // 1. メイン検索（複数キーワードAND：各キーワードが名前・型番・種族・テキストのいずれかに含まれる）
      const matchesMain = normalizedKeywords.length === 0 || normalizedKeywords.every(kw => {
        return nameNorm.includes(kw) || 
               codeNorm.includes(kw) || 
               raceNorm.includes(kw) ||
               textNorm.includes(kw);
      });
      if (!matchesMain) return false;

      // 2. 文明フィルターの判定
      if (drawerSelectedCivs.length > 0) {
        const civs = card._civList || [];
        const isMulti = card._isMulti;
        const isMono = card._isMono;

        const civButtons = drawerSelectedCivs.filter(c => !['単色', '多色'].includes(c));
        const hasMultiSelected = drawerSelectedCivs.includes('多色');
        const hasMonoSelected = drawerSelectedCivs.includes('単色');

        let matchesCiv = true;

        if (civButtons.length === 0) {
          if (hasMultiSelected && !hasMonoSelected) {
            if (!isMulti) matchesCiv = false;
          } else if (hasMonoSelected && !hasMultiSelected) {
            if (!isMono) matchesCiv = false;
          }
        } else if (civButtons.length > 0) {
          if (matchMode === 'and') {
            const hasAllCivs = civButtons.every(bCiv => civs.includes(bCiv));
            const hasExtraCivs = civs.some(c => !civButtons.includes(c));
            if (!hasAllCivs || hasExtraCivs) matchesCiv = false;
          } else {
            const hasMatchedCiv = civs.some(c => civButtons.includes(c));
            const hasExtraCivs = civs.some(c => !civButtons.includes(c));
            if (civButtons.length === 1) {
              if (!civs.includes(civButtons[0])) matchesCiv = false;
            } else {
              if (!hasMatchedCiv || hasExtraCivs) matchesCiv = false;
            }
          }

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

      // 3. サブ検索
      if (subQueryKeywords.length > 0) {
        if (subType === 'free') {
          const matchesAll = subQueryKeywords.every(kw => {
            return nameNorm.includes(kw) || textNorm.includes(kw) || raceNorm.includes(kw);
          });
          if (!matchesAll) return false;
        } else if (subType === 'text') {
          const matchesAll = subQueryKeywords.every(kw => textNorm.includes(kw));
          if (!matchesAll) return false;
        } else if (subType === 'race') {
          const matchesAll = subQueryKeywords.every(kw => raceNorm.includes(kw));
          if (!matchesAll) return false;
        }
      }

      // 4. パワー範囲指定
      if (!isNaN(powerMin) || !isNaN(powerMax)) {
        const rawPower = card.power ? String(card.power).replace(/[^0-9]/g, "") : "";
        const cardPowerNum = rawPower ? parseInt(rawPower, 10) : 0;
        const hasNumericPower = rawPower !== "";

        if (!isNaN(powerMin)) {
          if (!hasNumericPower || cardPowerNum < powerMin) return false;
        }
        if (!isNaN(powerMax)) {
          if (!hasNumericPower || cardPowerNum > powerMax) return false;
        }
      }

      // 5. コスト範囲指定
      if (!isNaN(costMin) || !isNaN(costMax)) {
        const cardCostNum = (card.cost !== undefined && card.cost !== null) ? parseInt(card.cost, 10) : NaN;
        const hasNumericCost = !isNaN(cardCostNum);

        if (!isNaN(costMin)) {
          if (!hasNumericCost || cardCostNum < costMin) return false;
        }
        if (!isNaN(costMax)) {
          if (!hasNumericCost || cardCostNum > costMax) return false;
        }
      }

      return true;
    });

    // 同名カードを1枚にまとめる処理
    const uniqueCheckbox = document.getElementById('drawerUniqueModeCheckbox');
    const isUniqueMode = uniqueCheckbox ? uniqueCheckbox.checked : false;

    let displayCards = filtered;
    if (isUniqueMode) {
      const seenNames = new Set();
      displayCards = filtered.filter(card => {
        if (!card.name) return false;
        let baseName = card.name.split(/[(（]/)[0].trim();
        if (seenNames.has(baseName)) return false;
        seenNames.add(baseName);
        return true;
      });
    }

    // 並び替え（ソート）処理
    const sortOrderSelect = document.getElementById('drawer-sort-order-select');
    const sortOrder = sortOrderSelect ? sortOrderSelect.value : 'release-new';

    if (sortOrder === 'release-new') {
      displayCards.sort((a, b) => (b.id !== undefined ? Number(b.id) : 0) - (a.id !== undefined ? Number(a.id) : 0));
    } else if (sortOrder === 'release-old') {
      displayCards.sort((a, b) => (a.id !== undefined ? Number(a.id) : 0) - (b.id !== undefined ? Number(b.id) : 0));
    } else if (sortOrder === 'cost-desc') {
      displayCards.sort((a, b) => (parseInt(b.cost, 10) || -1) - (parseInt(a.cost, 10) || -1));
    } else if (sortOrder === 'cost-asc') {
      displayCards.sort((a, b) => (parseInt(a.cost, 10) || 999) - (parseInt(b.cost, 10) || 999));
    }

    drawerResultsGrid.innerHTML = "";

    if (displayCards.length === 0) {
      drawerResultsGrid.innerHTML = `<p style="padding: 20px; color: #666; font-size: 0.9rem; grid-column: 1 / -1; text-align: center;">一致するカードが見つかりませんでした...</p>`;
      return;
    }

    const cardsToDisplay = displayCards.slice(0, 100);

    cardsToDisplay.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card-item draggable-card';
      cardEl.setAttribute('draggable', 'true');
      
      const imageUrl = card.image_url || card.image || card.img || '';
      let displayName = card.name || 'カード名';
      let displayCode = card.product_code || '';
      
      const match = card.name ? card.name.match(/^(.*?)\((.*?)\)$/) : null;
      if (match) {
        displayName = match[1].trim();
        displayCode = match[2].trim();
      }

      cardEl.innerHTML = `
        <img src="${imageUrl}" alt="${displayName}" loading="lazy">
        <div class="card-code">${displayCode}</div>
        <div class="card-title" title="${displayName}">${displayName}</div>
      `;

      cardEl.dataset.cardName = card.name;

      cardEl.addEventListener('dragstart', (e) => {
        const targetName = cardEl.dataset.cardName || card.name;
        e.dataTransfer.setData('text/plain', targetName);
        e.dataTransfer.setData('card/name', targetName);
        e.dataTransfer.setData('card/code', displayCode);
        e.dataTransfer.setData('source/area', 'drawer');
      });

      cardEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const cardName = card.name;
        userCollection[cardName] = (userCollection[cardName] || 0) + 1;
        console.log("ドロワーからクリックでカードを追加:", cardName, " / 現在の数:", userCollection[cardName]);
        if (typeof saveCollection === 'function') saveCollection();
        if (document.getElementById('collection-view').style.display !== 'none') {
          if (typeof renderCollectionCards === 'function') renderCollectionCards();
        }
      });

      drawerResultsGrid.appendChild(cardEl);
    });
  }

  // 検索窓に入力があったらリアルタイムで絞り込む
  // ※重複設定を削除するためここを削除


  function openDrawer() {
    if (drawer) {
      drawer.classList.add('show');
      if (typeof renderDrawerSearchResults === 'function') {
        renderDrawerSearchResults();
      }
    }
  }

  function closeDrawer() {
    if (drawer) drawer.classList.remove('show');
  }

  floatingBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);


  // 2. ドロワー内のカードのドラッグ開始設定（イベント委譲で確実にするよ）
// 2. ドロワー内のカードのドラッグ開始設定（イベント委譲で確実にするよ）
const drawerResults = document.getElementById('drawer-search-results');
  if (drawerResults) {
    drawerResults.addEventListener('dragstart', (e) => {
      const cardItem = e.target.closest('.draggable-card');
      if (!cardItem) return;

      // ★覚えさせておいた正式な card.name を最優先で取得するよ！
      const cardName = cardItem.dataset.cardName || cardItem.querySelector('.card-title').textContent;
      
      const codeEl = cardItem.querySelector('.card-code');
      const cardCode = codeEl ? codeEl.textContent : '';

      dragStartY = e.clientY;
      e.dataTransfer.setData('text/plain', cardName);
      e.dataTransfer.setData('card/name', cardName);
      e.dataTransfer.setData('card/code', cardCode);
      e.dataTransfer.setData('source/area', 'drawer');
      console.log("ドロワーからドラッグ開始:", cardName);
    });
  }

  // コレクション内のカードをドラッグしたときの開始位置記録
  const collectionGridEl = document.getElementById('collection-results-grid');
  if (collectionGridEl) {
    collectionGridEl.addEventListener('dragstart', (e) => {
      const cardItem = e.target.closest('.card-item');
      if (!cardItem) return;

      // ★ここを cardItem.dataset.cardName（型番入りの正式名）を最優先で取得するようにするよ！
      const cardName = cardItem.dataset.cardName || (cardItem.querySelector('.card-title') ? cardItem.querySelector('.card-title').textContent : '');
      const codeEl = cardItem.querySelector('.card-code');
      const cardCode = codeEl ? codeEl.textContent : '';

      dragStartY = e.clientY;
      e.dataTransfer.setData('text/plain', cardName);
      e.dataTransfer.setData('card/name', cardName);
      e.dataTransfer.setData('card/code', cardCode);
      e.dataTransfer.setData('source/area', 'collection');
      console.log("コレクションからドラッグ開始:", cardName);
    });

    collectionGridEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      collectionGridEl.classList.add('drag-over');
    });

    collectionGridEl.addEventListener('dragleave', () => {
      collectionGridEl.classList.remove('drag-over');
    });

    collectionGridEl.addEventListener('drop', (e) => {
      e.preventDefault();
      collectionGridEl.classList.remove('drag-over');
      console.log("ドロップされたよ！");

      let cardName = e.dataTransfer.getData('card/name') || e.dataTransfer.getData('text/plain');
      const sourceArea = e.dataTransfer.getData('source/area');

      console.log("取得データ - カード名:", cardName, " / エリア:", sourceArea);

      if (!cardName) return;

      const dropEndY = e.clientY;
      const moveDistance = dropEndY - dragStartY;

      if (typeof userCollection !== 'undefined') {
        console.log("ドロップ前の保有数:", userCollection[cardName]);

        // ★ コレクションの中からドラッグを始めた場合、ドロワーにドロップされた場合は必ず枚数を減算する！
        if (sourceArea === 'collection') {
          if (userCollection[cardName] && userCollection[cardName] > 0) {
            userCollection[cardName] -= 1;
            if (userCollection[cardName] <= 0) {
              delete userCollection[cardName];
            }
          }
        } else if (sourceArea === 'drawer') {
          // ドロワーから持ってきた場合はプラス！
          userCollection[cardName] = (userCollection[cardName] || 0) + 1;
        }

        console.log("ドロップ後の保有数:", userCollection[cardName]);
        
        if (typeof saveCollection === 'function') saveCollection();
        
        if (typeof renderCollectionCards === 'function') {
          console.log("renderCollectionCards を実行するよ！");
          renderCollectionCards();
        }
      }
    });
  }


// ★検索結果を表示するグリッドなどでもドロップを確実に許可するよ！
  const searchResultsGrid = document.getElementById('search-results-grid');
  if (searchResultsGrid) {
    searchResultsGrid.addEventListener('dragover', (e) => {
      e.preventDefault(); // これがないとdropイベントが発火しないんだよ！
    });

    searchResultsGrid.addEventListener('drop', (e) => {
      e.preventDefault();

      let cardName = e.dataTransfer.getData('card/name') || e.dataTransfer.getData('text/plain');
      const sourceArea = e.dataTransfer.getData('source/area');

      console.log("検索グリッドにドロップされたよ - カード:", cardName, " / エリア:", sourceArea);

      if (!cardName) return;

      // コレクションから引っ張ってきた場合のみ減算！
      if (sourceArea === 'collection' && typeof userCollection !== 'undefined') {
        if (userCollection[cardName] && userCollection[cardName] > 0) {
          userCollection[cardName] -= 1;
          if (userCollection[cardName] <= 0) {
            delete userCollection[cardName];
          }
          console.log("減算後の保有数:", userCollection[cardName]);

          if (typeof saveCollection === 'function') saveCollection();
          
          const collectionView = document.getElementById('collection-view');
          if (collectionView && collectionView.style.display !== 'none') {
            if (typeof renderCollectionCards === 'function') renderCollectionCards();
          }
        }
      }
    });
  }
  // ★ここまで追加！


  // 4. コレクション用の検索・ソート用インプットのイベントリスナー
  const colSearchInput = document.getElementById("collection-search-input");
  if (colSearchInput) {
    colSearchInput.addEventListener("input", () => {
      if (typeof renderCollectionCards === 'function') renderCollectionCards();
    });
  }

  const colSortSelect = document.getElementById("collection-sort-select");
  if (colSortSelect) {
    colSortSelect.addEventListener("change", () => {
      if (typeof renderCollectionCards === 'function') renderCollectionCards();
    });
  }
});