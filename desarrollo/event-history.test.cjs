const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/core.js','utf8');
function setup(initial={}){
  const storage=new Map(Object.entries(initial)),listeners={};let quota=false;
  const window={addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn),dispatchEvent:event=>(listeners[event.type]||[]).forEach(fn=>fn())};
  vm.runInNewContext(code,{window,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{if(quota)throw Error('Quota');storage.set(key,value);}},document:{},Event:class{constructor(type){this.type=type;}},setTimeout:()=>0,clearTimeout(){}});
  return {api:window.Elianne,quota:value=>quota=value};
}
const event=(id='e1',guestCount=300)=>({id,client:'Boda Maria',guestCount,eventDate:'2030-10-31',date:'2030-10-31',returnDate:'2030-10-31',status:'reservado',responsible:'Lorena',hallIds:['hall-1'],items:[]});
test('legacy guest counts remain unknown and no earlier history is invented',()=>{
  const old=event();delete old.guestCount;const {api}=setup({'elianneSalonEvents.v1':JSON.stringify([old])});
  assert.equal(api.get().events[0].guestCount,null);assert.equal(api.eventHistory('e1').length,0);
  api.updateGuests('e1',300,'Ana');assert.ok(api.eventHistory('e1')[0].detail.includes('Se definieron 300'));assert.equal(api.eventHistory('e1')[0].detail.includes('agregaron'),false);
});
test('300 to 350 produces an explicit fifty-person message with date, author and client note',()=>{
  const {api}=setup();api.saveEvent(event());const created=JSON.stringify(api.eventHistory('e1')[0]);
  api.updateGuests('e1',350,'Ana','La novia confirmo 50 personas mas.');
  const entry=api.eventHistory('e1')[0];assert.equal(api.get().events[0].guestCount,350);assert.ok(entry.detail.includes('Invitados: de 300 a 350. Se agregaron 50 personas.'));assert.ok(entry.detail.includes('La novia confirmo'));assert.equal(entry.responsible,'Ana');assert.ok(Number.isFinite(entry.at));assert.equal(JSON.stringify(api.eventHistory('e1')[1]),created);
});
test('decreases, zero, singular and cleared counts have accurate deltas',()=>{
  const {api}=setup();api.saveEvent(event());api.updateGuests('e1',275,'Ana');assert.ok(api.eventHistory('e1')[0].detail.includes('redujeron 25 personas'));
  api.updateGuests('e1',0,'Ana');assert.equal(api.get().events[0].guestCount,0);api.updateGuests('e1',1,'Ana');assert.ok(api.eventHistory('e1')[0].detail.includes('1 persona.'));
  api.updateGuests('e1',null,'Ana');assert.equal(api.get().events[0].guestCount,null);assert.ok(api.eventHistory('e1')[0].detail.includes('de 1 a sin definir'));
});
test('notes do not duplicate guest changes and unchanged saves do not fabricate entries',()=>{
  const {api}=setup();api.saveEvent(event());const count=api.eventHistory('e1').length;
  assert.throws(()=>api.updateGuests('e1',300,'Ana'),/No hay cambios/);assert.equal(api.eventHistory('e1').length,count);
  api.saveEvent(api.get().events[0]);assert.equal(api.eventHistory('e1').length,count);
  api.updateGuests('e1',300,'Ana','Confirmado por telefono.');assert.equal(api.eventHistory('e1')[0].type,'evento-nota');assert.equal(api.get().events[0].guestCount,300);
});
test('invalid counts or missing authors never change the count or history',()=>{
  const {api}=setup();api.saveEvent(event());const before=JSON.stringify(api.get());
  for(const value of [-1,1.5,Infinity,NaN,'abc',' ',100000001])assert.throws(()=>api.updateGuests('e1',value,'Ana'));
  assert.throws(()=>api.updateGuests('e1',350,''),/quien registra/);assert.throws(()=>api.updateGuests('missing',350,'Ana'),/no encontrado/);assert.equal(JSON.stringify(api.get()),before);
});
test('ordinary event edits log guests, dates, materials, location and name changes',()=>{
  const {api}=setup();api.upsertProduct({id:'p1',name:'Copas',qty:100,photo:''});api.saveEvent({...event(),items:[{productId:'p1',qty:20}]});
  const old=api.get().events[0];api.saveEvent({...old,client:'Boda Maria y Juan',guestCount:350,eventDate:'2030-11-01',venueEndDate:'2030-11-01',date:'2030-11-01',returnDate:'2030-11-01',place:'Salon principal',items:[{productId:'p1',qty:30}],recordedBy:'Rosa',changeNote:'La novia cambio la fecha.'});
  const entries=api.eventHistory('e1'),joined=entries.map(m=>m.detail).join('\n');assert.ok(joined.includes('agregaron 50 personas'));assert.ok(joined.includes('Fecha del evento: de "2030-10-31" a "2030-11-01"'));assert.ok(joined.includes('Copas: de 20 a 30'));assert.ok(joined.includes('Boda Maria y Juan'));assert.ok(joined.includes('La novia cambio la fecha.'));assert.ok(entries.filter(m=>m.type!=='evento-creado').every(m=>m.responsible==='Rosa'));assert.equal(api.get().items[0].qty,100);
});
test('edits from older callers retain an existing count when the field is omitted',()=>{
  const {api}=setup();api.saveEvent(event());const payload=api.get().events[0];delete payload.guestCount;payload.place='Jardin';api.saveEvent(payload);assert.equal(api.get().events[0].guestCount,300);
});
test('a failed write does not create a ghost increase or journal entry',()=>{
  const ctx=setup();ctx.api.saveEvent(event());const before=JSON.stringify(ctx.api.get());ctx.quota(true);
  assert.throws(()=>ctx.api.updateGuests('e1',350,'Ana'),/No se pudo guardar/);assert.equal(JSON.stringify(ctx.api.get()),before);ctx.quota(false);ctx.api.updateGuests('e1',350,'Ana');assert.equal(ctx.api.eventHistory('e1').filter(m=>m.type==='evento-invitados').length,1);
});
test('backup restoration keeps counts, authors and earlier messages without duplicating entries',()=>{
  const {api}=setup();api.saveEvent(event());api.updateGuests('e1',350,'Ana','Cambio solicitado');const backup=JSON.parse(JSON.stringify(api.backup())),fresh=setup();fresh.api.restore(fresh.api.prepareRestore(backup));
  assert.equal(fresh.api.get().events[0].guestCount,350);assert.equal(JSON.stringify(fresh.api.eventHistory('e1')),JSON.stringify(api.eventHistory('e1')));
  const invalid=JSON.parse(JSON.stringify(backup));invalid.movements[0].at=1e30;assert.throws(()=>fresh.api.prepareRestore(invalid),/Movimiento invalido/);
});
test('closed events preserve counts but allow explanatory notes',()=>{
  const {api}=setup();api.saveEvent(event());api.transition('e1','en-evento');api.saveReturn('e1',[],true);api.transition('e1','cerrado');
  assert.throws(()=>api.updateGuests('e1',350,'Ana'),/cerrado o cancelado/);api.updateGuests('e1',300,'Ana','Observacion posterior al cierre.');assert.equal(api.get().events[0].guestCount,300);assert.ok(api.eventHistory('e1')[0].detail.includes('Observacion posterior'));
  assert.ok(api.eventHistory('e1').some(m=>m.detail.includes('Estado: de Devuelto a Cerrado')));
});
test('history is isolated by event ID even when clients share names or an event is renamed',()=>{
  const {api}=setup();api.saveEvent(event());api.saveEvent({...event('e2',100),hallIds:['hall-2']});api.updateGuests('e1',350,'Ana');api.updateGuests('e2',120,'Rosa');
  assert.equal(api.eventHistory('e1').filter(m=>m.detail.includes('20 personas')).length,0);assert.ok(api.eventHistory('e2')[0].detail.includes('20 personas'));
  api.saveEvent({...api.get().events.find(e=>e.id==='e1'),client:'Nombre corregido'});assert.ok(api.eventHistory('e1').some(m=>m.detail.includes('50 personas')));assert.equal(api.eventHistory('missing').length,0);
});
test('long note changes are preserved without truncating the earlier note',()=>{
  const {api}=setup();api.saveEvent({...event(),notes:'A'.repeat(10000)});api.saveEvent({...api.get().events[0],notes:'B'.repeat(10000)});
  assert.ok(api.eventHistory('e1')[0].detail.includes('A'.repeat(10000)));assert.ok(api.eventHistory('e1')[0].detail.includes('B'.repeat(10000)));
});
