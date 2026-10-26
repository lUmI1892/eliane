const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(__dirname+'/core.js','utf8');
function setup(initial={}){
  const storage=new Map(Object.entries(initial)),listeners={};let fail=false;
  const window={addEventListener:(key,fn)=>(listeners[key]??=[]).push(fn),dispatchEvent:e=>(listeners[e.type]||[]).forEach(fn=>fn())};
  vm.runInNewContext(code,{window,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');storage.set(k,v);}},document:{},Event:class{constructor(type){this.type=type;}},setTimeout:()=>0,clearTimeout(){}});
  return {api:window.Elianne,storage,quota:v=>fail=v};
}
const booking=(id,hallIds=['hall-1'],extra={})=>({id,client:'Evento '+id,eventDate:'2030-11-15',date:'2030-11-15',returnDate:'2030-11-15',status:'reservado',responsible:'Lorena',items:[],hallIds,...extra});
const hours=(id,startTime,endTime,hallIds=['hall-1'],extra={})=>booking(id,hallIds,{venueMode:'hours',startTime,endTime,...extra});
test('three halls default to supplied names and migration leaves previous events unassigned',()=>{
  const legacy=booking('old');delete legacy.hallIds;
  const {api}=setup({'elianneSalonEvents.v1':JSON.stringify([legacy])});
  assert.deepEqual(JSON.parse(JSON.stringify(api.get().halls.map(h=>h.name))),['Elianne 1','Elianne 2','Elianne 3']);
  assert.equal(api.get().events[0].hallIds.length,0);assert.equal(api.blocked(),'');
});
test('different halls can host simultaneous events; same hall rejects double booking atomically',()=>{
  const {api}=setup();api.saveEvent(booking('a'));api.saveEvent(booking('b',['hall-2']));api.saveEvent(booking('c',['hall-3']));
  const before=JSON.stringify(api.get());assert.throws(()=>api.saveEvent(booking('d')),/Elianne 1 ya esta reservado/);assert.equal(JSON.stringify(api.get()),before);
});
test('one event can book several halls, and failure on one hall never reserves another',()=>{
  const {api}=setup();api.saveEvent(booking('a',['hall-1','hall-2']));
  assert.throws(()=>api.saveEvent(booking('b',['hall-2','hall-3'])),/reservado/);api.saveEvent(booking('c',['hall-3']));assert.equal(api.get().events.length,2);
});
test('quotes do not occupy halls; confirmation validates and cancellation releases them',()=>{
  const {api}=setup();api.saveEvent(booking('a'));api.saveEvent(booking('q',['hall-1'],{status:'cotizacion'}));
  assert.throws(()=>api.transition('q','reservado'),/reservado/);api.transition('a','cancelado');api.transition('q','reservado');assert.equal(api.get().events[0].status,'reservado');
});
test('hourly bookings use half-open intervals; adjacent hours fit, overlaps do not',()=>{
  const {api}=setup();api.saveEvent(hours('a','10:00','12:00'));api.saveEvent(hours('b','12:00','14:00'));
  assert.throws(()=>api.saveEvent(hours('c','11:59','12:30')),/reservado/);
});
test('setup and cleanup are included in conflicts on both sides',()=>{
  const {api}=setup();api.saveEvent(hours('a','10:00','12:00',['hall-1'],{setupMinutes:60,cleanupMinutes:60}));
  assert.throws(()=>api.saveEvent(hours('b','08:00','09:30')),/montaje y limpieza/);
  assert.throws(()=>api.saveEvent(hours('c','12:30','14:00')),/montaje y limpieza/);
  api.saveEvent(hours('d','13:00','14:00'));
});
test('overnight bookings, exact midnight and setup days appear on correct calendar dates',()=>{
  const {api}=setup();api.saveEvent(hours('a','22:00','02:00',['hall-1'],{eventDate:'2030-12-31',date:'2030-12-31',returnDate:'2031-01-01',venueEndDate:'2031-01-01'}));
  const event=api.get().events[0];assert.ok(api.onVenueDay(event,'2030-12-31'));assert.ok(api.onVenueDay(event,'2031-01-01'));assert.equal(api.onVenueDay(event,'2031-01-02'),false);
  assert.throws(()=>api.saveEvent(hours('b','01:00','03:00',['hall-1'],{eventDate:'2031-01-01',date:'2031-01-01',returnDate:'2031-01-01'})),/reservado/);
  api.saveEvent(hours('c','23:00','00:00',['hall-2'],{venueEndDate:'2030-11-16'}));
  const midnight=api.get().events.find(e=>e.id==='c');assert.equal(api.onVenueDay(midnight,'2030-11-16'),false);
  api.saveEvent(hours('d','00:30','01:30',['hall-3'],{setupMinutes:60}));const setupDay=api.get().events.find(e=>e.id==='d');assert.ok(api.onVenueDay(setupDay,'2030-11-14'));
});
test('full days and multi-day bookings block all hours in their inclusive dates',()=>{
  const {api}=setup();api.saveEvent(booking('a',['hall-1'],{venueEndDate:'2030-11-17'}));
  assert.throws(()=>api.saveEvent(hours('b','22:00','23:00',['hall-1'],{eventDate:'2030-11-17',date:'2030-11-17',returnDate:'2030-11-17'})),/reservado/);
  api.saveEvent(booking('c',['hall-1'],{eventDate:'2030-11-18',date:'2030-11-18',returnDate:'2030-11-18'}));
});
test('material return or closure does not release the hall reservation early',()=>{
  const {api}=setup();api.saveEvent(booking('a'));api.transition('a','en-evento');api.saveReturn('a',[],true);api.transition('a','cerrado');
  assert.throws(()=>api.saveEvent(booking('b')),/reservado/);
});
test('unassigned legacy bookings block new confirmations until assigned, without assignment deadlocks',()=>{
  const a=booking('old-a'),b=booking('old-b');delete a.hallIds;delete b.hallIds;
  const {api}=setup({'elianneSalonEvents.v1':JSON.stringify([a,b])});assert.throws(()=>api.saveEvent(booking('new')),/aun no tiene salon/);
  api.assignVenue('old-a',{hallIds:['hall-1']});api.assignVenue('old-b',{hallIds:['hall-2']});api.saveEvent(booking('new',['hall-3']));
  assert.equal(api.get().events.length,3);
});
test('hall names, assignments and timing survive full backup and restore',()=>{
  const {api}=setup();api.saveEvent(hours('a','18:00','23:00',['hall-1','hall-3'],{setupMinutes:60,cleanupMinutes:30}));
  api.saveHalls([{id:'hall-1',name:'Elianne Principal'},{id:'hall-2',name:'Elianne Jardin'},{id:'hall-3',name:'Elianne Terraza'}]);
  const saved=api.backup(),fresh=setup();fresh.api.restore(fresh.api.prepareRestore(JSON.parse(JSON.stringify(saved))));
  assert.equal(fresh.api.get().halls[0].name,'Elianne Principal');assert.equal(fresh.api.get().events[0].cleanupMinutes,30);assert.equal(fresh.api.get().events[0].hallIds.length,2);
  assert.throws(()=>fresh.api.saveEvent(hours('b','18:00','19:00',['hall-3'])),/reservado/);
});
test('invalid names, halls and times reject without changing confirmed state',()=>{
  const {api}=setup();const before=JSON.stringify(api.get());
  for(const schedule of [booking('a',[]),booking('a',['missing']),booking('a',['hall-1','hall-1']),hours('a','25:00','26:00'),hours('a','20:00','19:00'),hours('a','20:00','21:00',['hall-1'],{setupMinutes:-1})])assert.throws(()=>api.saveEvent(schedule));
  assert.throws(()=>api.saveHalls([{id:'hall-1',name:'A'},{id:'hall-2',name:'A'},{id:'hall-3',name:'B'}]));assert.equal(JSON.stringify(api.get()),before);
});
test('inventory stays shared across halls and failed hall updates retain records and counts',()=>{
  const {api}=setup();api.upsertProduct({id:'p',name:'Copas',qty:100,photo:''});
  const items=[{productId:'p',qty:70}];api.saveEvent({...booking('a'),items});
  assert.throws(()=>api.saveEvent({...booking('b',['hall-2']),items:[{productId:'p',qty:40}]}),/disponibles/);
  api.saveEvent({...booking('c',['hall-2']),items:[{productId:'p',qty:30}]});const before=JSON.stringify(api.get());
  assert.throws(()=>api.assignVenue('c',{hallIds:['hall-1']}),/reservado/);assert.equal(JSON.stringify(api.get()),before);
});
test('storage failure leaves hall configuration unchanged',()=>{
  const ctx=setup(),before=JSON.stringify(ctx.api.get());ctx.quota(true);
  assert.throws(()=>ctx.api.saveHalls([{id:'hall-1',name:'A'},{id:'hall-2',name:'B'},{id:'hall-3',name:'C'}]),/No se pudo guardar/);assert.equal(JSON.stringify(ctx.api.get()),before);
});
