/* Deck data is independent from DOM and visual placement. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TCGDeckCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'tcg_decks_v1';
  function id() {
    return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  // Scraping regenerates numeric IDs; official detail URLs remain stable across catalog updates.
  function cardKey(card) { return card.detail_url ? 'url:' + card.detail_url : card.id != null ? 'id:' + card.id : 'name:' + card.name; }
  function title(card) { return String(card.name || '').split(/[(（]/)[0].trim(); }
  function cost(card) {
    const values = (Array.isArray(card.cost) ? card.cost : [card.cost]).map(v => parseInt(v, 10)).filter(Number.isFinite);
    return values.length ? Math.min(...values) : Number.MAX_SAFE_INTEGER;
  }
  function snapshot(card) {
    const match = String(card.name || '').match(/[(（](.*?)[)）]\s*$/);
    return { id: card.id ?? null, detail_url: card.detail_url || '', name: String(card.name || '不明なカード'), image_url: card.image_url || card.image || card.img || '',
      product_code: match ? match[1] : card.product_code || '', cost: card.cost ?? [] };
  }
  function create(name = '新しいデッキ') {
    return { schemaVersion: 1, id: id(), name, format: 'standard', coverCardKey: null, cards: [], cardSnapshots: {},
      layout: { order: [], positions: {} }, sort: 'cost-asc', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }
  function clone(deck) { return JSON.parse(JSON.stringify(deck)); }
  function count(deck, key) { return deck.cards.filter(c => c.cardKey === key).length; }
  function add(deck, card) {
    const key = cardKey(card), copy = { id: id(), cardKey: key };
    deck.cardSnapshots[key] = snapshot(card);
    deck.cards.push(copy);
    deck.layout.order.push(copy.id);
    return copy;
  }
  function remove(deck, copyId) {
    const copy = deck.cards.find(c => c.id === copyId);
    if (!copy) return;
    deck.cards = deck.cards.filter(c => c.id !== copyId);
    deck.layout.order = deck.layout.order.filter(v => v !== copyId);
    delete deck.layout.positions[copyId];
    if (!count(deck, copy.cardKey)) {
      delete deck.cardSnapshots[copy.cardKey];
      if (deck.coverCardKey === copy.cardKey) deck.coverCardKey = null;
    }
  }
  function setQuantity(deck, card, quantity) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) throw new Error('枚数は0〜999の整数で指定してください。');
    const key = cardKey(card);
    while (count(deck, key) > quantity) remove(deck, deck.cards.findLast(c => c.cardKey === key).id);
    while (count(deck, key) < quantity) add(deck, card);
  }
  function orderedCopies(deck) {
    const order = new Map(deck.layout.order.map((v, i) => [v, i]));
    return deck.cards.slice().sort((a, b) => {
      if (deck.sort === 'manual') return (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity);
      const ca = cost(deck.cardSnapshots[a.cardKey]), cb = cost(deck.cardSnapshots[b.cardKey]);
      const delta = ca === cb ? 0 : (ca - cb) * (deck.sort === 'cost-desc' ? -1 : 1);
      return delta || (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity);
    });
  }
  function status(deck) {
    const n = deck.cards.length;
    return { count: n, isForty: n === 40, excess: Math.max(0, n - 40), label: n === 40 ? '40枚・ルール未検証' : n > 40 ? `${n - 40}枚超過・下書き` : `あと${40 - n}枚・下書き` };
  }
  function cover(deck) { return deck.cardSnapshots[deck.coverCardKey] || deck.cardSnapshots[deck.cards[0]?.cardKey] || null; }
  function validate(deck) {
    if (!deck || deck.schemaVersion !== 1 || typeof deck.id !== 'string' || typeof deck.name !== 'string' || !deck.name.trim() ||
      !Array.isArray(deck.cards) || deck.cards.length > 10000 || !deck.cardSnapshots || typeof deck.cardSnapshots !== 'object' ||
      !deck.layout || !Array.isArray(deck.layout.order) || !deck.layout.positions || typeof deck.layout.positions !== 'object' ||
      !['cost-asc', 'cost-desc', 'manual'].includes(deck.sort)) throw new Error('デッキの保存形式が不正、または未対応のバージョンです。');
    const ids = new Set();
    for (const copy of deck.cards) {
      if (!copy || typeof copy.id !== 'string' || ids.has(copy.id) || typeof copy.cardKey !== 'string' || !Object.hasOwn(deck.cardSnapshots, copy.cardKey)) throw new Error('カードの保存形式が不正です。');
      const card = deck.cardSnapshots[copy.cardKey];
      if (!card || typeof card.name !== 'string' || !card.name) throw new Error('カード情報が不正です。');
      ids.add(copy.id);
    }
    if (deck.coverCardKey != null && (typeof deck.coverCardKey !== 'string' || !deck.cards.some(c => c.cardKey === deck.coverCardKey))) throw new Error('主役カードの保存形式が不正です。');
    if (deck.layout.order.length !== ids.size || new Set(deck.layout.order).size !== ids.size || deck.layout.order.some(v => !ids.has(v))) throw new Error('カード表示順の保存形式が不正です。');
    return deck;
  }
  function read(storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw == null) return [];
    const data = JSON.parse(raw);
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.decks)) throw new Error('デッキ一覧の保存形式を読み込めません。');
    data.decks.forEach(validate);
    if (new Set(data.decks.map(d => d.id)).size !== data.decks.length) throw new Error('デッキIDが重複しています。');
    return data.decks;
  }
  function write(storage, decks) {
    decks.forEach(validate);
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, decks }));
  }
  return { STORAGE_KEY, id, cardKey, title, cost, snapshot, create, clone, count, add, remove, setQuantity, orderedCopies, status, cover, validate, read, write };
});
