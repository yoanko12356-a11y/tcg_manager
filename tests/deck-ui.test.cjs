const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const C=require('../deck-core');
// Minimal DOM host for controller/event tests; does not claim browser layout or accessibility verification.
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.dataset={};this.listeners={};this.className='';this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.checked=false;this.open=false;
 this.classList={contains:c=>this.className.split(/\s+/).includes(c),add:(...cs)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...cs])].join(' ')},remove:(...cs)=>{this.className=this.className.split(/\s+/).filter(c=>!cs.includes(c)).join(' ')},toggle:(c,force)=>{const on=force===undefined?!this.classList.contains(c):force;on?this.classList.add(c):this.classList.remove(c);return on;}};}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 dispatch(type,extra={}){const e={type,target:this,preventDefault(){},stopPropagation(){},...extra};for(const fn of this.listeners[type]||[])fn(e);}
 click(){if(!this.disabled)this.dispatch('click');}
 focus(){}setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
 getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 querySelectorAll(selector){const results=[];const matches=n=>selector==='button'?n.tagName==='BUTTON':selector[0]==='.'?n.classList.contains(selector.slice(1)):selector==='[data-card-key]'?n.dataset.cardKey!=null:selector==='[aria-pressed="true"]'?n.getAttribute('aria-pressed')==='true':false;
 const walk=n=>{for(const c of n.children){if(matches(c))results.push(c);walk(c);}};walk(this);return results;}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
 contains(n){return n===this||this.children.some(c=>c.contains(n));}
 showModal(){this.open=true;}close(){this.open=false;this.dispatch('close');}
}
function storage(){const data=new Map([['tcg_collection','{"preserve":4}'],['tcg_favorite','{"wanted":2}']]);return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),data};}
function setup(store=storage()){
 const nodes=new Map();const markup=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');for(const [,tag,id]of markup.matchAll(/<(\w+)[^>]*\bid="([^"]+)"/g))if(!nodes.has(id))nodes.set(id,new Element(tag));
 const doc=new Element();doc.body=new Element('body');doc.body.className='home-mode';doc.readyState='complete';doc.getElementById=id=>nodes.get(id);doc.createElement=tag=>new Element(tag);
 const navs=['home','search','deck','collection','favorite','market'].map(name=>{const b=new Element('button');b.className='header-nav-btn';b.dataset.tab=name;return b;});
 doc.querySelectorAll=selector=>selector==='[data-tab="deck"]'?navs.filter(b=>b.dataset.tab==='deck'):selector==='.header-nav-btn'?navs:[];
 doc.getElementById('deck-civ-match').value='or';doc.getElementById('deck-sort').value='cost-asc';
 const win=new Element();win.TCGDeckCore=C;let allow=true;win.confirm=()=>allow;
 const counters={collection:0,favorite:0,market:0};const sandbox={window:win,document:doc,localStorage:store,console,setTimeout:fn=>{fn();return 1;},clearTimeout(){},renderCollectionCards:()=>counters.collection++,renderFavoriteCards:()=>counters.favorite++,renderMarketRankings:()=>counters.market++};
 const context=vm.createContext(sandbox);vm.runInContext(require('./fixtures/search-baseline.json').helpers,context);
 const raw=[{id:1,name:'カードA(DM01 1/10)',cost:['2'],power:['1000'],civilizations:[['火']],text:['スピードアタッカー']},{id:2,name:'カードB(DM01 2/10)',cost:['0'],power:['500'],civilizations:[['水']],text:['ブロッカー']}];
 context.allCards=raw.map(c=>({...c,_faces:context.buildCardFaces(c),_civList:c.civilizations[0],_isMulti:false,_isMono:true}));
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');vm.runInContext(app.slice(app.indexOf('function matchesCardSearchFilters('),app.indexOf('function renderSearchResults(')),context);
 vm.runInContext(app.slice(app.indexOf('function switchView('),app.indexOf('// --- ここまで ---',app.indexOf('function switchView('))),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../deck.js'),'utf8'),context);
 const get=id=>nodes.get(id),nav=name=>{if(name==='deck')navs.find(b=>b.dataset.tab===name).click();else context.switchView(name);};
 return {get,nav,store,context,win,doc,counters,setConfirm:v=>allow=v};
}
function drag(ui, source, target) {
 const data=new Map();const transfer={setData:(k,v)=>data.set(k,v),getData:k=>data.get(k)||'',get types(){return [...data.keys()];}};
 source.dispatch('dragstart',{dataTransfer:transfer});
 target.dispatch('dragover',{dataTransfer:transfer});
 target.dispatch('drop',{dataTransfer:transfer});
 source.dispatch('dragend',{dataTransfer:transfer});
 return transfer;
}
test('new deck -> 4 actual copies -> quantity/cover -> save -> list -> reload -> delete',()=>{
 const ui=setup();ui.nav('deck');assert.equal(ui.doc.body.classList.contains('deck-mode'),true);ui.get('deck-create').click();
 assert.equal(ui.get('deck-header-save').hidden,false);const result=ui.get('deck-search-results').children[0];for(let i=0;i<4;i++)drag(ui,result.children[0],ui.get('deck-copies'));
 assert.equal(ui.get('deck-copies').children.length,4);assert.equal(ui.get('deck-count').textContent,'4/40枚');
 result.children[0].click();assert.equal(ui.get('deck-card-dialog').open,true);ui.get('deck-set-cover').click();
 ui.get('deck-quantity').value='41';ui.get('deck-quantity').dispatch('change');assert.equal(ui.get('deck-count').textContent,'41/40枚');assert.match(ui.get('deck-state').textContent,/超過/);
 ui.get('deck-dialog-close').click();ui.get('deck-name').value='保存テスト';ui.get('deck-name').dispatch('input');ui.get('deck-header-save').click();
 const [d]=C.read(ui.store);assert.equal(d.name,'保存テスト');assert.equal(d.cards.length,41);assert.equal(d.coverCardKey,'id:2');
 ui.get('deck-back').click();assert.equal(ui.get('deck-list-grid').children.length,1);
 const reloaded=setup(ui.store);reloaded.nav('deck');reloaded.get('deck-list-grid').children[0].children[0].click();assert.equal(reloaded.get('deck-copies').children.length,41);
 reloaded.get('deck-back').click();reloaded.setConfirm(false);reloaded.get('deck-list-grid').children[0].children[1].click();assert.equal(C.read(ui.store).length,1);
 reloaded.setConfirm(true);reloaded.get('deck-list-grid').children[0].children[1].click();assert.equal(C.read(ui.store).length,0);
 assert.equal(ui.store.getItem('tcg_collection'),'{"preserve":4}');assert.equal(ui.store.getItem('tcg_favorite'),'{"wanted":2}');
});
test('dirty navigation can be cancelled; leaving cleans header state and preserves legacy navigation',()=>{
 const ui=setup();ui.nav('deck');ui.get('deck-create').click();ui.setConfirm(false);ui.nav('collection');assert.equal(ui.doc.body.classList.contains('deck-mode'),true);assert.equal(ui.counters.collection,0);
 ui.setConfirm(true);ui.nav('collection');assert.equal(ui.doc.body.classList.contains('deck-mode'),false);assert.equal(ui.doc.body.classList.contains('deck-editing'),false);assert.equal(ui.get('deck-header-save').hidden,true);assert.equal(ui.counters.collection,1);
 ui.nav('favorite');ui.nav('market');ui.nav('search');assert.equal(ui.counters.favorite,1);assert.equal(ui.counters.market,1);assert.equal(ui.doc.body.classList.contains('search-mode'),true);
});
test('storage error does not lose in-memory edits or overwrite the saved deck',()=>{
 const ui=setup();ui.nav('deck');ui.get('deck-create').click();ui.get('deck-header-save').click();const previous=ui.store.getItem(C.STORAGE_KEY);
 drag(ui,ui.get('deck-search-results').children[0].children[0],ui.get('deck-copies'));ui.store.setItem=()=>{throw Error('QuotaExceededError')};ui.get('deck-header-save').click();
 assert.equal(ui.store.getItem(C.STORAGE_KEY),previous);assert.equal(ui.get('deck-count').textContent,'1/40枚');assert.match(ui.get('deck-feedback').textContent,/保存できません/);assert.match(ui.get('deck-save-state').textContent,/未保存/);
});
test('same deck edited by another tab is not silently overwritten',()=>{
 const ui=setup();ui.nav('deck');ui.get('deck-create').click();ui.get('deck-header-save').click();const decks=C.read(ui.store);decks[0].name='別タブの変更';C.write(ui.store,decks);
 ui.get('deck-name').value='このタブの変更';ui.get('deck-name').dispatch('input');ui.get('deck-header-save').click();assert.equal(C.read(ui.store)[0].name,'別タブの変更');assert.match(ui.get('deck-feedback').textContent,/別のタブ/);
});
test('deck civilization filters stay in deck view and restrict search independently',()=>{
 const ui=setup();ui.nav('deck');ui.get('deck-create').click();const civ=ui.get('deck-civ-filters').children.find(n=>n.dataset.civ==='火');civ.click();
 assert.equal(ui.get('deck-search-results').children.length,1);assert.equal(ui.get('deck-search-results').children[0].dataset.cardKey,'id:1');assert.equal(ui.doc.body.classList.contains('deck-mode'),true);
 ui.get('deck-query').value='存在しないカード';ui.get('deck-query').dispatch('input');assert.equal(ui.get('deck-search-count').textContent,'0件');
});

test('empty or fractional quantity input does not silently remove adopted cards',()=>{
 const ui=setup();ui.nav('deck');ui.get('deck-create').click();const result=ui.get('deck-search-results').children[0];drag(ui,result.children[0],ui.get('deck-copies'));result.children[0].click();
 for(const value of ['', '1.5']){ui.get('deck-quantity').value=value;ui.get('deck-quantity').dispatch('change');assert.equal(ui.get('deck-count').textContent,'1/40枚');assert.match(ui.get('deck-feedback').textContent,/整数/);}
});

test('click opens details without adding; right-to-left drag adds one and reverse removes the grabbed copy only',()=>{
 const ui=setup();ui.nav('deck');ui.get('deck-create').click();const search=ui.get('deck-search-results').children[0].children[0];
 search.click();assert.equal(ui.get('deck-count').textContent,'0/40枚');assert.equal(ui.get('deck-card-dialog').open,true);ui.get('deck-dialog-close').click();
 for(let i=0;i<4;i++)drag(ui,search,ui.get('deck-copies'));
 const copies=ui.get('deck-copies').children, removedId=copies[1].dataset.copyId;
 const retainedIds=[copies[0],copies[2],copies[3]].map(c=>c.dataset.copyId);
 drag(ui,copies[1].children[0],ui.get('deck-catalog'));
 assert.equal(ui.get('deck-count').textContent,'3/40枚');assert.equal(ui.get('deck-copies').children.some(c=>c.dataset.copyId===removedId),false);
 assert.deepEqual(ui.get('deck-copies').children.map(c=>c.dataset.copyId),retainedIds);
 ui.get('deck-header-save').click();assert.equal(C.read(ui.store)[0].cards.length,3);
 assert.equal(ui.store.getItem('tcg_collection'),'{"preserve":4}');assert.equal(ui.store.getItem('tcg_favorite'),'{"wanted":2}');
});
test('dropping a deck copy within the deck, a catalog card on the catalog, or cancelling a drag makes no change',()=>{
 const ui=setup();ui.nav('deck');ui.get('deck-create').click();const search=ui.get('deck-search-results').children[0].children[0];
 drag(ui,search,ui.get('deck-catalog'));assert.equal(ui.get('deck-count').textContent,'0/40枚');
 drag(ui,search,ui.get('deck-copies'));const source=ui.get('deck-copies').children[0].children[0];
 drag(ui,source,ui.get('deck-copies'));assert.equal(ui.get('deck-count').textContent,'1/40枚');
 const data=new Map(),transfer={setData:(k,v)=>data.set(k,v),getData:k=>data.get(k)||''};
 source.dispatch('dragstart',{dataTransfer:transfer});source.dispatch('dragend',{dataTransfer:transfer});assert.equal(ui.get('deck-count').textContent,'1/40枚');
});
test('a stale or malformed drag payload does not remove or add cards',()=>{
 const ui=setup();ui.nav('deck');ui.get('deck-create').click();
 for(const value of ['{bad',JSON.stringify({kind:'catalog',key:'id:1',deckId:'another-deck'})]){
  const e={dataTransfer:{getData:()=>value}};ui.get('deck-copies').dispatch('drop',e);ui.get('deck-catalog').dispatch('drop',e);
 }
 assert.equal(ui.get('deck-count').textContent,'0/40枚');
});
