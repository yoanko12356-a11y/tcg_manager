const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
// Compare the exact pre-implementation predicate against the shared predicate on the full real catalog.
const baseline = require('./fixtures/search-baseline.json');
const current=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const shared=current.slice(current.indexOf('function matchesCardSearchFilters('),current.indexOf('function renderSearchResults('));
const funcs=baseline.helpers+'\n'+shared;
const context=vm.createContext({});vm.runInContext(funcs,context);
const raw=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../all_cards.json'),'utf8'));
const cards=raw.map(card=>{const faces=context.buildCardFaces(card);const civs=[...new Set(faces.flatMap(f=>f.civilizations.flatMap(c=>String(c).split('/'))))];return {...card,_faces:faces,_civList:civs,_isMulti:civs.length>1,_isMono:civs.length===1,_nameNorm:context.normalizeQuery(card.name),_codeNorm:context.normalizeQuery(card.product_code||''),_rubyNorm:context.normalizeQuery(card.ruby||'')};});
const predicate=baseline.predicate;
function legacy(filters){const sandbox=vm.createContext({...context,...filters,document:{getElementById:()=>({value:filters.matchMode})}});return vm.runInContext(predicate,sandbox);}
const scenarios=[{}, {normalizedKeywords:['どらごん']},{normalizedKeywords:['水神','みづはのめのかみ'].map(context.normalizeQuery)},{subQueryKeywords:['ぶろっかー'].map(context.normalizeQuery)}, {slideConditions:[{keywords:['進化'].map(context.normalizeQuery)}]}];
for(const civs of [[],['光'],['水','火'],['光','水','闇'],['多色'],['単色'],['多色','単色'],['水','多色'],['ゼロ']])for(const matchMode of ['or','and'])for(const range of [{},{costMin:0,costMax:3},{powerMin:5000,costMax:5}])scenarios.push({selectedCivs:civs,matchMode,...range});
test('shared deck/main search preserves all existing filters on 23,478 real records',()=>{
 for(const options of scenarios){const f={normalizedKeywords:[],subQueryKeywords:[],slideConditions:[],selectedCivs:[],matchMode:'or',powerMin:NaN,powerMax:NaN,costMin:NaN,costMax:NaN,...options};const old=legacy(f);
  assert.deepEqual(cards.filter(c=>context.matchesCardSearchFilters(c,f)).map(c=>c.id),cards.filter(old).map(c=>c.id),JSON.stringify(options));
 }
});
test('numeric range must match a single face, including zero cost',()=>{
 const card={name:'test',cost:['2','8'],power:['1000','12000'],civilizations:[['火'],['水']]};
 assert.equal(context.matchesCardSearchFilters(card,{costMax:3,powerMin:10000}),false);
 assert.equal(context.matchesCardSearchFilters({...card,cost:['0']},{costMin:0,costMax:0}),true);
});
