/* Local-only deck builder; legacy collection/favorite storage is never written here. */
(function () {
  'use strict';
  const C = window.TCGDeckCore;
  const $ = id => document.getElementById(id);
  let decks = [], draft = null, savedSignature = null, loadedVersion = null, selected = null;
  let catalog = new Map(), limit = 60, queryTimer, storageError = '', activeDrag = null;
  const DRAG_TYPE = 'application/x-tcg-deck-transfer';
  const civilizationIcons = [['光','light'],['水','water'],['火','fire'],['自然','nature'],['闇','dark'],['ゼロ','zero'],['多色','multi'],['単色','monochrome']];
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, cls, action, label) {
    const b = el('button', cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', action);
    return b;
  }
  function image(card, cls = '') {
    const img = el('img', cls);
    img.alt = C.title(card);
    img.loading = 'lazy';
    img.draggable = false;
    if (card.image_url || card.image || card.img) img.src = card.image_url || card.image || card.img;
    else img.classList.add('deck-image-missing');
    img.addEventListener('error', () => { img.removeAttribute('src'); img.classList.add('deck-image-missing'); }, { once: true });
    return img;
  }
  let feedbackTimer;
  function feedback(message, error = false) {
    const node = $('deck-feedback');
    node.textContent = message;
    node.classList.toggle('is-error', error);
    node.classList.remove('is-faded');
    clearTimeout(feedbackTimer);
    // Fade instead of clearing so the live-region text stays readable; errors stay longer.
    if (message) feedbackTimer = setTimeout(() => node.classList.add('is-faded'), error ? 6000 : 2500);
  }
  function isDirty() { return draft && JSON.stringify(draft) !== savedSignature; }
  function updateSaveState() {
    const dirty = Boolean(isDirty());
    $('deck-save-state').textContent = dirty ? '● 未保存' : '保存済み';
    $('deck-save-state').classList.toggle('is-dirty', dirty);
  }
  function confirmLeave() { return !isDirty() || window.confirm('未保存の変更があります。保存せずに移動しますか？'); }
  function closeDialog() { if ($('deck-card-dialog').open) $('deck-card-dialog').close(); selected = null; }
  function beforeNavigation() {
    if (!draft) return true;
    if (!confirmLeave()) return false;
    closeDialog(); clearDrag(); draft = null; $('deck-header-save').hidden = true; document.body.classList.remove('deck-editing');
    return true;
  }
  function loadStore() {
    try { decks = C.read(localStorage); storageError = ''; }
    catch (e) { storageError = '保存データを読み込めません。元のデータを保護するため保存・削除を停止しています。' + e.message; decks = []; }
    $('deck-storage-error').hidden = !storageError;
    $('deck-storage-error').textContent = storageError;
    $('deck-create').disabled = Boolean(storageError);
  }
  function openList() {
    clearDrag();
    draft = null; selected = null;
    $('deck-list-view').hidden = false; $('deck-editor-view').hidden = true;
    $('deck-header-save').hidden = true;
    document.body.classList.remove('deck-editing');
    feedback(''); loadStore(); renderList();
  }
  function renderList() {
    const grid = $('deck-list-grid'); grid.replaceChildren();
    if (!decks.length) {
      grid.append(el('p', 'deck-list-empty', storageError ? '保存データをご確認ください。' : 'まだデッキがありません。「＋ 新しいデッキ」から作成できます。'));
      return;
    }
    for (const deck of decks.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))) {
      const article = el('article', 'deck-list-item');
      const open = button('', 'deck-open', () => openEditor(deck), deck.name + 'を編集');
      const fan = el('div', 'deck-cover-fan'), card = C.cover(deck);
      if (card) for (let i = 0; i < 3; i++) { const img = image(card); img.alt = ''; fan.append(img); }
      else fan.append(el('span', 'deck-empty-cover', '＋'));
      const icon = el('img', 'deck-cover-icon'); icon.src = 'images/nav-deck.svg'; icon.alt = ''; fan.append(icon);
      open.append(fan, el('h3', 'deck-list-name', deck.name));
      const state = C.status(deck);
      open.append(el('p', 'deck-list-meta', `${state.count}/40枚　${state.label}`));
      if (deck.coverCardKey) open.append(el('p', 'deck-cover-label', '★ ' + C.title(card)));
      article.append(open, button('削除', 'deck-delete', () => deleteDeck(deck), deck.name + 'を削除'));
      grid.append(article);
    }
  }
  function deleteDeck(deck) {
    if (!window.confirm(`「${deck.name}」を削除しますか？この操作は元に戻せません。`)) return;
    try {
      const current = C.read(localStorage).filter(d => d.id !== deck.id);
      C.write(localStorage, current); decks = current; renderList(); feedback('デッキを削除しました。');
    } catch (e) { feedback('削除できませんでした。' + e.message, true); }
  }
  function openEditor(deck) {
    draft = deck ? C.clone(deck) : C.create();
    loadedVersion = deck ? JSON.stringify(deck) : null;
    savedSignature = deck ? JSON.stringify(draft) : null;
    $('deck-list-view').hidden = true; $('deck-editor-view').hidden = false;
    $('deck-header-save').hidden = false; document.body.classList.add('deck-editing');
    $('deck-name').value = draft.name; $('deck-sort').value = draft.sort;
    $('deck-query').value = ''; $('search-input').value = '';
    $('deck-reset-filters').click();
    feedback(''); renderEditor();
    $('deck-name').focus();
  }
  function resolved(key) { return catalog.get(key) || draft.cardSnapshots[key]; }
  function save() {
    if (!draft) return;
    const name = $('deck-name').value.trim();
    if (!name) { feedback('デッキ名を入力してください。', true); $('deck-name').focus(); return; }
    try {
      if (storageError) throw new Error(storageError);
      const current = C.read(localStorage), existing = current.find(d => d.id === draft.id);
      if ((loadedVersion && JSON.stringify(existing) !== loadedVersion) || (!loadedVersion && existing)) throw new Error('別のタブで変更されています。一覧から最新のデッキを開き直してください。');
      const next = C.clone(draft); next.name = name; next.updatedAt = new Date().toISOString();
      const index = current.findIndex(d => d.id === next.id);
      if (index < 0) current.push(next); else current[index] = next;
      C.write(localStorage, current);
      draft = next; decks = current; loadedVersion = JSON.stringify(next); savedSignature = JSON.stringify(next);
      $('deck-name').value = name; renderEditor();
      feedback(C.status(next).isForty ? '保存しました。40枚です（殿堂などのルールは未検証）。' : '下書きとして保存しました。' + C.status(next).label);
    } catch (e) { feedback('保存できませんでした。編集中の内容はそのまま残っています。' + e.message, true); }
  }
  function renderEditor() {
    if (!draft) return;
    const state = C.status(draft);
    $('deck-count').textContent = `${state.count}/40枚`;
    $('deck-count').title = state.label;
    $('deck-count').setAttribute('aria-label', `${state.count}/40枚、${state.label}`);
    $('deck-count').classList.toggle('is-over', state.excess > 0);
    $('deck-state').textContent = state.label;
    $('deck-state').classList.toggle('is-over', state.excess > 0);
    updateSaveState();
    const baseCounts = new Map();
    draft.cards.forEach(copy => { const name = C.title(draft.cardSnapshots[copy.cardKey]); baseCounts.set(name, (baseCounts.get(name) || 0) + 1); });
    const many = [...baseCounts].filter(([, n]) => n > 4);
    $('deck-rule-warning').textContent = (many.length ? '同名カードが5枚以上あります。' : '') + '40枚未満・超過でも下書き保存できます。殿堂・同名制限・カード固有ルールは未判定です。';
    $('deck-rule-alert').hidden = !many.length;
    $('deck-rule-alert').textContent = many.length ? '同名5枚以上' : '';
    $('deck-rule-alert').title = many.map(([name, n]) => `${name}：${n}枚`).join('\n');
    const grid = $('deck-copies'); grid.replaceChildren();
    if (!draft.cards.length) grid.append(el('p', 'deck-empty', '右のカードをここにドラッグして追加'));
    for (const copy of C.orderedCopies(draft)) {
      const card = resolved(copy.cardKey), tile = el('div', 'deck-copy'); tile.dataset.copyId = copy.id;
      const open = button('', 'deck-copy-open', () => showCard(copy.cardKey), C.title(card) + 'の詳細を表示');
      open.append(image(card));
      makeDraggable(open, { kind: 'deck', copyId: copy.id, deckId: draft.id });
      tile.append(open);
      grid.append(tile);
    }
    updateSearchBadges();
  }
  function updateSearchBadges() {
    if (!draft) return;
    $('deck-search-results').querySelectorAll('[data-card-key]').forEach(node => {
      node.title = `${C.count(draft, node.dataset.cardKey)}枚採用中。左へドラッグして追加、クリックで詳細`;
    });
  }
  function clearDrag() {
    activeDrag = null;
    $('deck-copies').classList.remove('is-drag-over');
    $('deck-catalog').classList.remove('is-remove-over');
  }
  function makeDraggable(node, data) {
    node.draggable = true;
    node.addEventListener('dragstart', e => {
      activeDrag = { ...data, deckId: draft.id };
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(activeDrag));
      e.dataTransfer.effectAllowed = data.kind === 'catalog' ? 'copy' : 'move';
    });
    node.addEventListener('dragend', clearDrag);
  }
  function dragData(e) {
    if (!draft) return null;
    try {
      const raw = e.dataTransfer.getData(DRAG_TYPE);
      const data = raw ? JSON.parse(raw) : activeDrag;
      return data && data.deckId === draft.id ? data : null;
    } catch { return null; }
  }
  function showCard(key) {
    selected = key;
    const card = resolved(key), dialog = $('deck-card-dialog');
    $('deck-dialog-title').textContent = C.title(card);
    $('deck-dialog-code').textContent = C.snapshot(card).product_code;
    const img = $('deck-dialog-image'); img.src = card.image_url || card.image || card.img || ''; img.alt = C.title(card);
    const faces = card._faces || buildCardFaces(card), specs = $('deck-dialog-specs'); specs.replaceChildren();
    const civ = civilizationIcons.find(([name]) => name === faces[0]?.civilizations?.[0]);
    $('deck-dialog-civ').src = `images/icon-civ-${civ?.[1] || 'zero'}.svg`;
    $('deck-dialog-civ').alt = faces[0]?.civilizations?.join(' / ') || '文明';
    faces.forEach((face, i) => {
      const table = el('table', 'deck-spec-table');
      if (faces.length > 1) table.append(el('caption', '', `第${i + 1}面`));
      const row = values => {
        const tr = el('tr');
        values.forEach(([tag, value, span]) => { const cell = el(tag, '', String(value || '—')); if (span) cell.colSpan = span; tr.append(cell); });
        table.append(tr);
      };
      row([['th','タイプ'],['td',face.card_type],['th','パワー'],['td',face.power]]);
      row([['th','レアリティ'],['td',face.rarity],['th','コスト'],['td',face.cost]]);
      row([['th','種族'],['td',face.race,3]]);
      specs.append(table);
    });
    $('deck-dialog-text').textContent = faces.map(f => f.text || '').filter(Boolean).join('\n\n') || 'テキスト情報がありません。';
    refreshQuantity();
    if (!dialog.open) dialog.showModal();
  }
  function refreshQuantity() {
    if (!draft || !selected) return;
    const n = C.count(draft, selected); $('deck-quantity').value = n;
    $('deck-quantity-minus').disabled = n === 0;
    $('deck-set-cover').disabled = n === 0;
    const active = draft.coverCardKey === selected;
    $('deck-set-cover').textContent = active ? '★' : '☆';
    $('deck-set-cover').title = active ? '主役に設定済み' : '主役に設定';
    $('deck-set-cover').setAttribute('aria-pressed', String(active));
  }
  function changeQuantity(n) {
    if (!draft || !selected) return;
    const card = resolved(selected);
    try { C.setQuantity(draft, card, n); renderEditor(); refreshQuantity(); feedback(C.title(card) + 'の採用枚数を変更しました。'); }
    catch (e) { feedback(e.message, true); refreshQuantity(); }
  }
  function filters() {
    const number = id => $('deck-' + id).value === '' ? NaN : parseInt($('deck-' + id).value, 10);
    const keywords = s => s.trim().split(/\s+/).map(normalizeQuery).filter(Boolean);
    return { normalizedKeywords: keywords($('deck-query').value), subQueryKeywords: keywords($('deck-extra-query').value),
      selectedCivs: [...$('deck-civ-filters').querySelectorAll('[aria-pressed="true"]')].map(b => b.dataset.civ),
      matchMode: $('deck-civ-match').value, costMin: number('cost-min'), costMax: number('cost-max'), powerMin: number('power-min'), powerMax: number('power-max') };
  }
  function renderSearch() {
    if (!draft) return;
    const results = $('deck-search-results'); results.replaceChildren();
    if (!allCards.length) { $('deck-search-count').textContent = 'カードデータを読み込み中'; results.append(el('p', 'deck-search-empty', '読み込みが終わらない場合は、ページを再読み込みしてください。')); return; }
    const f = filters();
    if ((!Number.isNaN(f.costMin) && !Number.isNaN(f.costMax) && f.costMin > f.costMax) || (!Number.isNaN(f.powerMin) && !Number.isNaN(f.powerMax) && f.powerMin > f.powerMax)) {
      $('deck-search-count').textContent = '範囲を確認してください'; results.append(el('p','deck-search-empty','下限が上限を超えています。')); $('deck-search-more').hidden = true; return;
    }
    let filtered = allCards.filter(card => matchesCardSearchFilters(card, f)).sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    if ($('deck-unique').checked) { const seen = new Set(); filtered = filtered.filter(card => { const name = C.title(card); if (seen.has(name)) return false; seen.add(name); return true; }); }
    $('deck-search-count').textContent = `${filtered.length.toLocaleString()}件`;
    $('deck-search-more').hidden = filtered.length <= limit;
    if (!filtered.length) results.append(el('p', 'deck-search-empty', '一致するカードがありません。'));
    filtered.slice(0, limit).forEach(card => {
      const key = C.cardKey(card), item = el('div', 'deck-search-card'); item.dataset.cardKey = key;
      const add = button('', 'deck-search-add', () => showCard(key), C.title(card) + 'の詳細を表示');
      makeDraggable(add, { kind: 'catalog', key });
      add.append(image(card), el('span', 'deck-search-code', C.snapshot(card).product_code), el('span', 'deck-search-name', C.title(card)));
      item.append(add);
      results.append(item);
    });
    updateSearchBadges();
  }
  function requestSearch() { limit = 60; clearTimeout(queryTimer); queryTimer = setTimeout(renderSearch, 160); }
  function setQuery(query) { $('deck-query').value = query; requestSearch(); }
  function indexCatalog() { catalog = new Map(allCards.map(card => [C.cardKey(card), card])); if (draft) { renderSearch(); renderEditor(); } }
  function init() {
    document.querySelectorAll('[data-tab="deck"]').forEach(b => b.addEventListener('click', () => switchView('deck')));
    civilizationIcons.forEach(([name, icon]) => {
      const b = button('', 'deck-civ-btn', () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); requestSearch(); }, name);
      b.dataset.civ = name; b.setAttribute('aria-pressed','false');
      const img = el('img'); img.src = `images/icon-civ-${icon}.svg`; img.alt = ''; b.append(img); $('deck-civ-filters').append(b);
    });
    $('deck-create').addEventListener('click', () => openEditor());
    $('deck-header-save').addEventListener('click', save);
    $('deck-back').addEventListener('click', () => { if (confirmLeave()) { closeDialog(); openList(); } });
    $('deck-name').addEventListener('input', () => { draft.name = $('deck-name').value; updateSaveState(); });
    $('deck-sort').addEventListener('change', () => { draft.sort = $('deck-sort').value; renderEditor(); });
    $('deck-options-toggle').addEventListener('click', () => { const open = $('deck-filter-options').hidden; $('deck-filter-options').hidden = !open; $('deck-options-toggle').setAttribute('aria-expanded', String(open)); });
    ['query','extra-query','cost-min','cost-max','power-min','power-max'].forEach(name => $('deck-'+name).addEventListener('input', () => { if (name === 'query') $('search-input').value = $('deck-query').value; requestSearch(); }));
    ['civ-match','unique'].forEach(name => $('deck-'+name).addEventListener('change', requestSearch));
    $('deck-reset-filters').addEventListener('click', () => {
      ['query','extra-query','cost-min','cost-max','power-min','power-max'].forEach(name => $('deck-'+name).value = '');
      $('search-input').value = ''; $('deck-unique').checked = false; $('deck-civ-match').value = 'or';
      $('deck-civ-filters').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed','false'));
      limit = 60; renderSearch();
    });
    $('deck-search-more').addEventListener('click', () => { limit += 60; renderSearch(); });
    $('deck-dialog-close').addEventListener('click', closeDialog);
    $('deck-card-dialog').addEventListener('close', () => { selected = null; });
    $('deck-card-dialog').addEventListener('click', e => { if (e.target === $('deck-card-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(); } });
    $('deck-quantity-minus').addEventListener('click', () => changeQuantity(C.count(draft, selected) - 1));
    $('deck-quantity-plus').addEventListener('click', () => changeQuantity(C.count(draft, selected) + 1));
    $('deck-quantity').addEventListener('change', e => changeQuantity(e.target.value === '' ? NaN : Number(e.target.value)));
    $('deck-set-cover').addEventListener('click', () => { draft.coverCardKey = selected; renderEditor(); refreshQuantity(); });
    const grid = $('deck-copies'), catalogPane = $('deck-catalog');
    grid.addEventListener('dragover', e => {
      if (activeDrag?.kind === 'catalog') { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; grid.classList.add('is-drag-over'); }
    });
    grid.addEventListener('dragleave', e => { if (!grid.contains(e.relatedTarget)) grid.classList.remove('is-drag-over'); });
    grid.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      const data = dragData(e), card = data?.kind === 'catalog' ? catalog.get(data.key) : null;
      clearDrag();
      if (card && draft) { C.add(draft, card); renderEditor(); feedback(C.title(card) + 'を1枚追加しました。'); }
    });
    catalogPane.addEventListener('dragover', e => {
      if (activeDrag?.kind === 'deck') { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; catalogPane.classList.add('is-remove-over'); }
    });
    catalogPane.addEventListener('dragleave', e => { if (!catalogPane.contains(e.relatedTarget)) catalogPane.classList.remove('is-remove-over'); });
    catalogPane.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      const data = dragData(e);
      const copy = data?.kind === 'deck' ? draft?.cards.find(c => c.id === data.copyId) : null;
      clearDrag();
      if (copy) { const name = C.title(resolved(copy.cardKey)); C.remove(draft, copy.id); renderEditor(); feedback(name + 'を1枚外しました。'); }
    });
    document.addEventListener('tcg:cards-loaded', indexCatalog);
    window.addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
    window.addEventListener('storage', e => { if (e.key === C.STORAGE_KEY || e.key === null) { if (draft) feedback('別のタブで保存データが変更されました。保存時に競合を確認します。', true); else { loadStore(); renderList(); } } });
    document.addEventListener('keydown', e => { if (draft && document.body.classList.contains('deck-mode') && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
    indexCatalog(); loadStore();
  }
  window.TCGDeckUI = { beforeNavigation, openList, isEditing: () => Boolean(draft), setQuery };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
