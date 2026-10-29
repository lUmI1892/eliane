const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/core.js','utf8');
function setup(initial={}){
 const storage=new Map(Object.entries(initial)),callbacks={};let quota=false;
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(quota)throw new Error('quota');storage.set(k,v);}};
 const window={addEventListener:(k,fn)=>(callbacks[k]||=[]).push(fn),dispatchEvent:e=>(callbacks[e.type]||[]).forEach(fn=>fn())};
 vm.runInNewContext(code,{window,localStorage,Date,Math,JSON,Number,Set,Map,Event:class{constructor(type){this.type=type;}},setTimeout:()=>0,clearTimeout(){},document:{}});
 return {api:window.Elianne,storage,quota:v=>quota=v,reload:()=>setup(Object.fromEntries(storage))};
}
const product=(id,category)=>({id,name:'Producto '+id,category,qty:10,photo:''});
test('v5 migration derives categories without changing legacy product labels, halls, finance or event records',()=>{
 const {api}=setup();api.upsertProduct(product('p1','Cristaleria'));api.upsertProduct(product('p2','Vajilla'));const day=api.today();
 api.saveEvent({id:'e1',client:'Boda',responsible:'Ana',date:day,returnDate:day,hallIds:['hall-1'],status:'reservado',items:[],basePrice:'1000'});
 api.addFinanceRecord('cash',{id:'c1',eventId:'e1',amount:'100',kind:'cobro',date:day,method:'QR',note:''},'Ana');
 const old=api.backup();old.schemaVersion=5;delete old.categories;old.items.push({...old.items.find(p=>p.id==='p2'),id:'p3',category:'vajilla'});
 const migrated=setup({'elianneSalon.v3':JSON.stringify(old)}).api;
 assert.equal(migrated.get().schemaVersion,6);assert.deepEqual(Array.from(migrated.categories()),['Cristaleria','Vajilla']);assert.equal(migrated.get().items.find(p=>p.id==='p3').category,'vajilla');
 for(const key of ['items','events','halls','finance'])assert.equal(JSON.stringify(migrated.get()[key]),JSON.stringify(old[key]));
});
test('empty categories survive saves, reload, product deletion and complete backup restoration',()=>{
 const ctx=setup(),{api}=ctx;api.addCategory('  Centros   de mesa  ');assert.deepEqual(Array.from(api.categories()),['Centros de mesa']);assert.equal(api.get().items.length,0);
 api.upsertProduct(product('p1','centros DE mesa'));assert.equal(api.get().items[0].category,'Centros de mesa');api.deleteProduct('p1');assert.equal(api.categories().length,1);
 assert.equal(ctx.reload().api.categories()[0],'Centros de mesa');const backup=api.backup(),fresh=setup().api;fresh.restore(fresh.prepareRestore(backup));assert.equal(fresh.categories()[0],'Centros de mesa');
 const copy=api.categories();copy.push('No guardar');assert.equal(api.categories().includes('No guardar'),false);
});
test('duplicate case, whitespace and Unicode composition are rejected without state or journal changes',()=>{
 const {api}=setup();api.addCategory('Mantelería premium');const before=JSON.stringify(api.get());
 for(const name of ['MANTELERÍA PREMIUM','  Mantelería   premium  ','Manteleri\u0301a premium','','   ','x'.repeat(101),{},42])assert.throws(()=>api.addCategory(name));
 assert.equal(JSON.stringify(api.get()),before);assert.equal(api.get().movements.filter(m=>m.type==='categoria-creada').length,1);
});
test('free-typed product categories join the registry and inventory-only imports retain empty categories',()=>{
 const {api}=setup();api.addCategory('Categoria vacia');api.upsertProduct(product('p1','Cristaleria'));
 assert.deepEqual(Array.from(api.categories()),['Categoria vacia','Cristaleria']);api.restore(api.prepareRestore([product('p1','Vajilla')]));
 assert.deepEqual(Array.from(api.categories()),['Categoria vacia','Cristaleria','Vajilla']);
});
test('failed category writes roll back completely, retry adds once, stale writers cannot overwrite',()=>{
 const ctx=setup(),{api}=ctx,before=JSON.stringify(api.get());ctx.quota(true);assert.throws(()=>api.addCategory('Mobiliario'),/guardar/);assert.equal(JSON.stringify(api.get()),before);ctx.quota(false);api.addCategory('Mobiliario');
 const other=ctx.reload();api.addCategory('Iluminacion');other.storage.set('elianneSalon.v3',ctx.storage.get('elianneSalon.v3'));assert.throws(()=>other.api.addCategory('Sonido'),/otra pestaña/);
 assert.equal(api.categories().includes('Sonido'),false);assert.equal(api.get().movements.filter(m=>m.detail.includes('Mobiliario')).length,1);
});
test('current backups require categories and finance; malformed and future versions do not alter confirmed data',()=>{
 const {api}=setup();api.addCategory('Vajilla');const before=JSON.stringify(api.get());
 for(const modify of [d=>delete d.categories,d=>d.categories=null,d=>d.categories=[''],d=>d.categories=[{}],d=>delete d.finance,d=>d.schemaVersion=7]){const broken=api.backup();modify(broken);assert.throws(()=>api.prepareRestore(broken));assert.equal(JSON.stringify(api.get()),before);}
 const old=api.backup();old.schemaVersion=3;delete old.categories;delete old.finance;assert.equal(api.prepareRestore(old).schemaVersion,6);
});
