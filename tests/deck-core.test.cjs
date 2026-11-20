const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../deck-core.js');
const card = { id: 10, name: 'テスト(DM01 1/10)', cost: ['5'], image_url: 'test.jpg' };
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), data }; };
test('four copies are four independently identified cards, not a single badge', () => {
  const d = C.create(); C.setQuantity(d, card, 4);
  assert.equal(d.cards.length, 4); assert.equal(new Set(d.cards.map(c=>c.id)).size, 4);
  assert.equal(C.orderedCopies(d).length, 4); assert.equal(C.count(d, C.cardKey(card)), 4); C.validate(d);
});
test('quantity reduction removes exactly the selected number and preserves other cards', () => {
  const d=C.create();C.setQuantity(d,card,4);C.add(d,{...card,id:11});
  C.setQuantity(d,card,2); assert.equal(d.cards.length,3);assert.equal(C.count(d,'id:11'),1);C.validate(d);
});
test('cost sort, including cost zero, does not mutate stored order or ownership',()=>{
  const d=C.create(); C.add(d,card);C.add(d,{...card,id:11,cost:['0']});C.add(d,{...card,id:12,cost:['8','2']});
  const raw=JSON.stringify(d.cards),order=JSON.stringify(d.layout.order);
  assert.deepEqual(C.orderedCopies(d).map(c=>c.cardKey),['id:11','id:12','id:10']);
  d.sort='cost-desc';assert.deepEqual(C.orderedCopies(d).map(c=>c.cardKey),['id:10','id:12','id:11']);
  assert.equal(JSON.stringify(d.cards),raw);assert.equal(JSON.stringify(d.layout.order),order);
  d.sort='manual';assert.deepEqual(C.orderedCopies(d).map(c=>c.cardKey),['id:10','id:11','id:12']);
});
test('draft saves at 0, 39 and 41; 40 is count-complete, not certified legal',()=>{
  const storage=memory(),d=C.create();
  for(const n of [0,39,40,41]) { C.setQuantity(d,card,n);C.write(storage,[d]); const [loaded]=C.read(storage);assert.equal(loaded.cards.length,n);assert.equal(C.status(loaded).isForty,n===40);assert.equal(C.status(loaded).excess,Math.max(0,n-40)); }
  assert.match(C.status({...d,cards:d.cards.slice(0,40)}).label,/未検証/);
});
test('stable id distinguishes alternate printings and does not merge same-name records',()=>{
  const d=C.create();C.add(d,card);C.add(d,{...card,id:11});assert.equal(Object.keys(d.cardSnapshots).length,2);
});
test('chosen cover survives roundtrip and falls back when the last copy is removed',()=>{
  const storage=memory(),d=C.create();C.add(d,card);C.add(d,{...card,id:11});d.coverCardKey='id:11';C.write(storage,[d]);
  const [loaded]=C.read(storage);assert.equal(C.cover(loaded).id,11);C.remove(loaded,loaded.cards.find(c=>c.cardKey==='id:11').id);assert.equal(loaded.coverCardKey,null);assert.equal(C.cover(loaded).id,10);C.validate(loaded);
});
test('catalog-independent snapshots survive data availability changes',()=>{
 const s=memory(),d=C.create();C.add(d,card);C.write(s,[d]);const [loaded]=C.read(s);assert.equal(C.cover(loaded).name,card.name);assert.equal(C.orderedCopies(loaded).length,1);
});
test('malformed and future storage versions fail closed without overwriting',()=>{
 for(const raw of ['{bad',JSON.stringify({schemaVersion:2,decks:[]}),JSON.stringify({schemaVersion:1,decks:[{id:'bad'}]})]){
  const s=memory();s.setItem(C.STORAGE_KEY,raw);assert.throws(()=>C.read(s));assert.equal(s.getItem(C.STORAGE_KEY),raw);
 }
});
test('duplicate card instances, missing snapshots and bad visual order are rejected',()=>{
 const d=C.create();C.add(d,card);
 for(const alter of [x=>x.cards.push({...x.cards[0]}),x=>delete x.cardSnapshots['id:10'],x=>x.layout.order.push('missing'),x=>x.coverCardKey='missing']){
  const bad=C.clone(d);alter(bad);assert.throws(()=>C.validate(bad));
 }
});
test('only deck storage key changes; collection and wishlist are untouched',()=>{
 const s=memory();s.setItem('tcg_collection','{"existing":3}');s.setItem('tcg_favorite','{"wanted":2}');C.write(s,[C.create()]);
 assert.equal(s.getItem('tcg_collection'),'{"existing":3}');assert.equal(s.getItem('tcg_favorite'),'{"wanted":2}');
});
test('storage-full error reaches caller and existing data stays available',()=>{
 const s=memory(),d=C.create();C.write(s,[d]);const old=s.getItem(C.STORAGE_KEY);s.setItem=()=>{throw new Error('QuotaExceededError')};
 C.add(d,card);assert.throws(()=>C.write(s,[d]),/Quota/);assert.equal(s.getItem(C.STORAGE_KEY),old);
});
test('invalid quantities do not mutate a deck',()=>{
 for(const n of [-1,1.5,NaN,Infinity,1000]){const d=C.create();assert.throws(()=>C.setQuantity(d,card,n));assert.equal(d.cards.length,0);}
});
test('official detail URL preserves identity when catalog numeric IDs are regenerated',()=>{
 const original={...card,detail_url:'https://dm.takaratomy.co.jp/card/detail/?id=unique'};
 const d=C.create();C.add(d,original);const updated={...original,id:999};C.add(d,updated);
 assert.equal(Object.keys(d.cardSnapshots).length,1);assert.equal(C.count(d,C.cardKey(updated)),2);
 assert.equal(C.cardKey(C.cover(d)),C.cardKey(original));C.validate(d);
});
