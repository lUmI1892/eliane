const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(__dirname + '/core.js', 'utf8');
const KEY = 'elianneSalon.v3';
function setup(initial = {}) {
  const storage = new Map(Object.entries(initial)), callbacks = {};
  let quota = false;
  const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => { if(quota)throw new Error('quota'); storage.set(k,v); } };
  const window = { addEventListener: (key,fn) => (callbacks[key] ||= []).push(fn), dispatchEvent: e => (callbacks[e.type] || []).forEach(fn=>fn()) };
  vm.runInNewContext(code, { window, localStorage, Date, Math, JSON, Number, Set, Map, Event: class { constructor(type){this.type=type;} }, setTimeout: () => 0, clearTimeout() {}, document: {} });
  return { api: window.Elianne, storage, quota: v => {quota=v;}, reload: () => setup(Object.fromEntries(storage)) };
}
const p = (id='p1',qty=100) => ({id,name:'Copas '+id,qty,code:id,unit:'unidades',category:'Cristaleria',photo:'',updatedAt:1});
const e = (id='e1',qty=80,start='2030-10-20',end=start,status='reservado') => ({id,client:'Evento '+id,date:start,returnDate:end,status,responsible:'Lorena',hallIds:['hall-1'],items:[{productId:'p1',qty,returned:0,damaged:0,missing:0}]});
const counts = (good,bad=0) => [{productId:'p1',returned:good,damaged:bad}];
function fixture(){const ctx=setup();ctx.api.upsertProduct(p());return ctx;}

test('migration preserves products, events, extras and legacy keys; full backup round trip',()=>{
  const old={'elianneInventory.v1':JSON.stringify([p()]),'elianneSalonEvents.v1':JSON.stringify([e()]),'elianneSalonExtras.v1':JSON.stringify({p1:{status:'disponible',minQty:5,cost:12.5}})};
  const ctx=setup(old),backup=ctx.api.backup();
  assert.equal(backup.items[0].qty,100); assert.equal(backup.events[0].client,'Evento e1'); assert.equal(backup.extras.p1.cost,12.5); assert.equal(backup.movements.length,1);
  ctx.api.restore(ctx.api.prepareRestore(JSON.parse(JSON.stringify(backup))));
  assert.equal(ctx.reload().api.get().events.length,1);
  Object.entries(old).forEach(([k,v])=>assert.equal(ctx.storage.get(k),v));
});
test('independent dates reuse stock and overlapping intervals use peak simultaneous demand',()=>{
  const {api}=fixture();api.saveEvent(e('a',70,'2030-10-20'));api.saveEvent(e('b',70,'2030-10-22'));
  assert.equal(api.available('p1','2030-10-20'),30);
  assert.equal(api.available('p1','2030-10-21'),100);
  assert.equal(api.available('p1','2030-10-20','2030-10-22'),30);
  api.saveEvent({...e('c',30,'2030-10-20','2030-10-22'),hallIds:['hall-2']});
  assert.equal(api.available('p1','2030-10-20','2030-10-22'),0);
  assert.throws(()=>api.saveEvent(e('d',1,'2030-10-22')),/disponibles/);
});
test('return day is included; quote does not reserve; reserve and edits validate stock',()=>{
  const {api}=fixture();api.saveEvent(e('a',100,'2030-10-20','2030-10-21'));
  api.saveEvent(e('q',1,'2030-10-21',undefined,'cotizacion'));
  assert.throws(()=>api.transition('q','reservado'),/disponibles/);
  assert.throws(()=>api.saveEvent(e('b',1,'2030-10-21')),/disponibles/);
  api.saveEvent(e('a',90,'2030-10-20','2030-10-21'));
  assert.equal(api.available('p1','2030-10-21'),10);
  api.transition('a','cancelado');assert.equal(api.available('p1','2030-10-21'),100);
});
test('blocked products cannot be booked and active reserved products cannot be blocked',()=>{
  const {api}=fixture();api.saveExtra('p1',{status:'limpieza',minQty:0,cost:1});
  assert.equal(api.available('p1','2030-10-20'),0);assert.throws(()=>api.saveEvent(e()),/disponibles/);
  api.saveExtra('p1',{status:'disponible',minQty:0,cost:1});api.saveEvent(e());
  assert.throws(()=>api.saveExtra('p1',{status:'baja',minQty:0,cost:1}),/reservas activas/);
});
test('return validation is atomic, partial counts keep reservation, finalization settles once',()=>{
  const ctx=fixture(),{api}=ctx;const date=api.today();api.saveEvent(e('a',100,date));api.transition('a','en-evento');
  const before=JSON.stringify(api.get());assert.throws(()=>api.saveReturn('a',counts(95,81),true),/no puede superar/);assert.equal(JSON.stringify(api.get()),before);
  api.saveReturn('a',counts(90,5),false);assert.equal(api.available('p1'),0);assert.equal(api.get().items[0].qty,100);
  api.saveReturn('a',counts(90,5),true);assert.equal(api.get().items[0].qty,90);assert.equal(api.available('p1'),90);
  const record=api.get().events[0];assert.equal(record.items[0].missing,5);assert.equal(record.status,'devuelto');
  assert.throws(()=>api.saveReturn('a',counts(90,5),true),/en curso/);api.transition('a','cerrado');assert.equal(api.get().items[0].qty,90);
  const ledger=api.get().movements.filter(m=>m.productId==='p1');assert.equal(ledger.reduce((s,m)=>s+m.delta,0),90);
  assert.equal(ctx.reload().api.get().items[0].qty,90);
});
test('legacy inconsistent counts survive migration, can be corrected, and cannot settle invalid',()=>{
  const ev=e('a',100,'2020-10-20',undefined,'en-evento');ev.items[0].returned=95;ev.items[0].damaged=81;
  const {api}=setup({'elianneInventory.v1':JSON.stringify([p()]),'elianneSalonEvents.v1':JSON.stringify([ev])});
  assert.equal(api.get().events[0].items[0].damaged,81);assert.throws(()=>api.saveReturn('a',counts(95,81),true));
  assert.equal(api.available('p1','2030-10-20'),0);api.saveReturn('a',counts(95,0),true);assert.equal(api.get().items[0].qty,95);
});
test('historical completed events are not charged retroactively',()=>{
  const ev=e('a',50,'2020-10-20',undefined,'cerrado');ev.items[0].missing=10;
  const {api}=setup({'elianneInventory.v1':JSON.stringify([p()]),'elianneSalonEvents.v1':JSON.stringify([ev])});
  assert.equal(api.get().items[0].qty,100);assert.ok(api.get().events[0].settledAt);assert.throws(()=>api.saveReturn('a',counts(40),true));
});
test('storage quota errors keep data and ledger unchanged; next save and reload succeed',()=>{
  const ctx=fixture(),before=JSON.stringify(ctx.api.get());ctx.quota(true);
  assert.throws(()=>ctx.api.adjust('p1','compra',5,'Compra','Lorena'),/No se pudo guardar/);
  assert.equal(JSON.stringify(ctx.api.get()),before);ctx.quota(false);ctx.api.adjust('p1','compra',5,'Compra','Lorena');assert.equal(ctx.reload().api.get().items[0].qty,105);
});
test('second tab cannot overwrite new data',()=>{
  const ctx=fixture();ctx.storage.set(KEY,JSON.stringify({...ctx.api.get(),revision:900}));
  assert.throws(()=>ctx.api.adjust('p1','compra',5,'Compra','Lorena'),/otra pestaña/);assert.equal(ctx.api.get().items[0].qty,100);
});
test('malformed storage is protected from overwrite',()=>{
  const ctx=setup({'elianneInventory.v1':'not json'});assert.ok(ctx.api.blocked());assert.throws(()=>ctx.api.upsertProduct(p()),/No se pudieron leer/);assert.equal(ctx.storage.get('elianneInventory.v1'),'not json');assert.equal(ctx.storage.has(KEY),false);
});
test('invalid restore leaves data intact, old inventory backup protects event references',()=>{
  const {api}=fixture();api.saveEvent(e());const before=JSON.stringify(api.get());
  for(const raw of [{},[],{...api.backup(),items:[p(),p()]},{...api.backup(),items:[{...p(),qty:'no'}]},{...api.backup(),items:[{...p(),photo:'https://x.test'}]}])assert.throws(()=>api.prepareRestore(raw));
  assert.equal(JSON.stringify(api.get()),before);
  const old=api.prepareRestore([p()]);assert.equal(old.events.length,1);api.restore(old);assert.equal(api.get().events.length,1);
});
test('quantity, dates, references, codes, status transitions and deletion are validated',()=>{
  const {api}=fixture();for(const qty of [-1,1.5,Infinity,'',NaN])assert.throws(()=>api.upsertProduct({...p('new'),qty}));
  assert.throws(()=>api.upsertProduct({...p('p2'),code:'P1'}),/codigo/);assert.throws(()=>api.upsertProduct(p('p1',2)),/Movimientos/);
  assert.throws(()=>api.saveEvent(e('a',1,'2030-02-30')));assert.throws(()=>api.saveEvent(e('a',1,'2030-10-22','2030-10-20')));
  assert.throws(()=>api.saveEvent({...e(),items:[{productId:'missing',qty:1}]}),/Producto no encontrado/);
  api.saveEvent(e());assert.throws(()=>api.deleteProduct('p1'),/eventos asociados/);assert.throws(()=>api.transition('e1','cerrado'),/no esta permitido/);
});
test('manual adjustments preserve booked capacity and include motive and responsible',()=>{
  const {api}=fixture();api.saveEvent(e());assert.throws(()=>api.adjust('p1','baja',30,'Rotas','Lorena'),/reserva activa/);
  assert.throws(()=>api.adjust('p1','compra',1,'','Lorena'));assert.throws(()=>api.adjust('p1','compra',1,'Compra',''));
  api.adjust('p1','compra',10,'Compra','Lorena');api.adjust('p1','baja',10,'Rotas','Lorena');assert.equal(api.get().items[0].qty,100);
  const record=api.get().movements[0];assert.equal(record.responsible,'Lorena');assert.equal(record.detail,'Rotas');assert.equal(record.delta,-10);
});
test('outbound events remain unavailable until confirmed; early departures block earlier days',()=>{
  const {api}=fixture(),date=api.today();api.saveEvent(e('a',100,'2030-10-20'));api.transition('a','en-evento');assert.equal(api.available('p1',date),0);
  assert.throws(()=>api.saveEvent(e('b',1,date)),/disponibles/);assert.throws(()=>api.saveEvent(e('a',100,'2030-10-20')),/Solo puedes editar/);
});
test('event date survives backup and restoration separately from material dates',()=>{
  const {api}=fixture();api.saveEvent({...e('a',10,'2030-10-20','2030-10-23'),eventDate:'2030-10-21'});
  assert.equal(api.get().events[0].eventDate,'2030-10-21');
  api.restore(api.prepareRestore(JSON.parse(JSON.stringify(api.backup()))));
  assert.equal(api.get().events[0].eventDate,'2030-10-21');
  assert.throws(()=>api.saveEvent({...e('b',10,'2030-10-20','2030-10-23'),eventDate:'2030-10-24'}),/entre la salida/);
});
test('the agenda can reserve an event before any inventory is assigned',()=>{
  const {api}=setup();api.saveEvent({...e('agenda-only'),items:[],eventDate:'2030-10-20'});
  assert.equal(api.get().events.length,1);assert.equal(api.get().events[0].items.length,0);assert.equal(api.get().items.length,0);
});
