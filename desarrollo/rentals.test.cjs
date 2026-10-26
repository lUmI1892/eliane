const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/core.js','utf8');
function setup(initial={}){
 const entries=new Map(Object.entries(initial)),callbacks={};let quota=false;
 const localStorage={getItem:k=>entries.get(k)??null,setItem:(k,v)=>{if(quota)throw new Error('quota');entries.set(k,v);}};
 const window={addEventListener:(k,fn)=>(callbacks[k]||=[]).push(fn),dispatchEvent:e=>(callbacks[e.type]||[]).forEach(fn=>fn())};
 vm.runInNewContext(code,{window,localStorage,Date,Math,JSON,Number,Set,Map,Event:class{constructor(type){this.type=type;}},setTimeout:()=>0,clearTimeout(){},document:{}});
 return {api:window.Elianne,quota:value=>quota=value,reload:()=>setup(Object.fromEntries(entries))};
}
function fixture(stock=70){const ctx=setup();ctx.api.upsertProduct({id:'p1',name:'Centros de mesa',qty:stock,code:'001',unit:'unidades',category:'Decoracion',photo:''});return ctx;}
function event(api,overrides={}){const date=api.today();return {id:'e1',client:'Boda Maria',responsible:'Lorena',date,returnDate:date,eventDate:date,venueEndDate:date,hallIds:['hall-1'],status:'reservado',items:[{productId:'p1',qty:100,external:{qty:30,supplier:'',cost:null,status:'pendiente',deliveryDate:date,returnDate:date}}],...overrides};}
const record=api=>api.get().events.find(e=>e.id==='e1');
function receive(api){api.saveRental('e1','p1',{supplier:'Alquileres Rosa',cost:150},'Ana','confirmado');api.saveRental('e1','p1',{},'Ana','recibido');}

test('old records migrate without inventing rentals; schema protects external data from old writers',()=>{
 const {api}=fixture(100);api.saveEvent({...event(api),items:[{productId:'p1',qty:100}]});
 assert.equal(record(api).items[0].external,null);assert.equal(api.ownQty(record(api).items[0]),100);
 const old=api.backup();old.schemaVersion=3;assert.equal(api.prepareRestore(old).schemaVersion,4);
});
test('pending rental covers explicit shortage and never increases owned inventory',()=>{
 const {api}=fixture();api.saveEvent(event(api));assert.equal(api.available('p1'),0);assert.equal(api.reserved('p1'),70);assert.equal(api.get().items[0].qty,70);
 assert.equal(record(api).items[0].external.status,'pendiente');assert.throws(()=>api.transition('e1','en-evento'),/Falta recibir/);
 api.saveEvent(event(api,{id:'e2',hallIds:['hall-2'],items:[{productId:'p1',qty:40,external:{...record(api).items[0].external,qty:40}}]}));assert.equal(api.reserved('p1'),70);
});
test('shortages are still rejected unless explicitly assigned externally',()=>{
 const {api}=fixture();assert.throws(()=>api.saveEvent({...event(api),items:[{productId:'p1',qty:100}]}),/disponibles/);assert.equal(api.get().events.length,0);
});
test('supplier confirmation and actual receipt are required before dispatch',()=>{
 const {api}=fixture();api.saveEvent(event(api));assert.throws(()=>api.saveRental('e1','p1',{},'Ana','confirmado'),/proveedor/);
 assert.throws(()=>api.saveRental('e1','p1',{},'Ana','recibido'),/no esta permitido/);
 api.saveRental('e1','p1',{supplier:'Rosa',cost:0},'Ana','confirmado');assert.throws(()=>api.transition('e1','en-evento'),/Falta recibir/);
 api.saveRental('e1','p1',{},'Ana','recibido');assert.ok(record(api).items[0].external.receivedAt);api.transition('e1','en-evento');assert.equal(api.get().items[0].qty,70);
});
test('external losses and supplier returns never reduce own stock; closure waits for provider return',()=>{
 const {api}=fixture();api.saveEvent(event(api));receive(api);api.transition('e1','en-evento');
 assert.throws(()=>api.saveReturn('e1',[{productId:'p1',returned:100,damaged:0}],true),/unidades propias/);
 assert.throws(()=>api.saveRental('e1','p1',{returned:30,damaged:0},'Ana','devuelto'),/primero/);
 api.saveReturn('e1',[{productId:'p1',returned:65,damaged:3}],true);assert.equal(api.get().items[0].qty,65);
 assert.throws(()=>api.transition('e1','cerrado'),/alquileres pendientes/);
 api.saveRental('e1','p1',{returned:25,damaged:3},'Ana','devuelto');assert.equal(record(api).items[0].external.missing,2);assert.equal(api.get().items[0].qty,65);
 api.transition('e1','cerrado');assert.equal(record(api).status,'cerrado');assert.throws(()=>api.saveRental('e1','p1',{},'Ana','devuelto'),/finalizado/);
});
test('canceling a rental requires enough own stock or reassignment, never silent overselling',()=>{
 const {api}=fixture();api.saveEvent(event(api));const before=JSON.stringify(api.get());assert.throws(()=>api.saveRental('e1','p1',{},'Ana','cancelado'),/disponibles/);assert.equal(JSON.stringify(api.get()),before);
 api.adjust('p1','compra',30,'Material comprado','Ana');api.saveRental('e1','p1',{},'Ana','cancelado');assert.equal(api.reserved('p1'),100);assert.equal(api.ownQty(record(api).items[0]),100);
});
test('cancelled events retain supplier obligations; received rentals can still be returned',()=>{
 const {api}=fixture();api.saveEvent(event(api));receive(api);api.transition('e1','cancelado');assert.equal(record(api).items[0].external.status,'recibido');
 api.saveRental('e1','p1',{returned:28,damaged:1},'Ana','devuelto');assert.equal(api.get().items[0].qty,70);assert.equal(record(api).items[0].external.missing,1);
});
test('failed writes leave receipts and history untouched; retry adds just one receipt',()=>{
 const ctx=fixture(),{api}=ctx;api.saveEvent(event(api));api.saveRental('e1','p1',{supplier:'Rosa'},'Ana','confirmado');const before=JSON.stringify(api.get());ctx.quota(true);
 assert.throws(()=>api.saveRental('e1','p1',{},'Ana','recibido'),/No se pudo guardar/);assert.equal(JSON.stringify(api.get()),before);ctx.quota(false);api.saveRental('e1','p1',{},'Ana','recibido');
 assert.equal(api.eventHistory('e1').filter(m=>m.type==='alquiler-recibido').length,1);assert.equal(ctx.reload().api.get().events[0].items[0].external.status,'recibido');
});
test('full backups preserve rental costs, supplier, dates, states and audit records',()=>{
 const {api}=fixture();api.saveEvent(event(api));receive(api);const backup=JSON.parse(JSON.stringify(api.backup())),fresh=setup();fresh.api.restore(fresh.api.prepareRestore(backup));
 assert.deepEqual(JSON.parse(JSON.stringify(record(fresh.api).items)),JSON.parse(JSON.stringify(record(api).items)));assert.equal(fresh.api.eventHistory('e1').length,api.eventHistory('e1').length);
});
test('event editor cannot forge receipts or replace already received rentals',()=>{
 const {api}=fixture();api.saveEvent(event(api));const e=record(api);e.items[0].external.status='recibido';e.items[0].external.supplier='Fake';e.items[0].external.receivedAt=Date.now();assert.throws(()=>api.saveEvent(e),/recepcion/);
 receive(api);const received=record(api);received.items[0].external.qty=20;assert.throws(()=>api.saveEvent(received),/conserva su registro/);
 const unchanged=record(api);unchanged.notes='Cambio permitido';api.saveEvent(unchanged);assert.equal(record(api).items[0].external.status,'recibido');
});
test('invalid rental quantities, money, dates and return counts are atomic',()=>{
 const {api}=fixture();
 for(const patch of [{qty:101},{qty:0},{qty:1.5},{cost:-1},{deliveryDate:'invalid'},{deliveryDate:'2090-01-01',returnDate:'2090-01-02'}]){const e=event(api);Object.assign(e.items[0].external,patch);assert.throws(()=>api.saveEvent(e));assert.equal(api.get().events.length,0);}
 api.saveEvent(event(api));receive(api);api.transition('e1','cancelado');const before=JSON.stringify(api.get());assert.throws(()=>api.saveRental('e1','p1',{returned:29,damaged:5},'Ana','devuelto'),/supera/);assert.equal(JSON.stringify(api.get()),before);
});
test('unknown and zero rental costs differ, and rental changes belong to event history',()=>{
 const {api}=fixture();api.saveEvent(event(api));assert.equal(record(api).items[0].external.cost,null);api.saveRental('e1','p1',{cost:0,notes:'Prestamo sin costo'},'Ana');assert.equal(record(api).items[0].external.cost,0);
 assert.ok(api.eventHistory('e1').some(m=>m.type==='alquiler-editado'&&m.responsible==='Ana'&&m.detail.includes('Prestamo sin costo')));
});
test('entirely external material can cover zero owned stock without acquiring stock or charging outside losses',()=>{
 const {api}=fixture(0),e=event(api);e.items[0].external.qty=100;api.saveExtra('p1',{status:'mantenimiento',minQty:0,cost:10});api.saveEvent(e);receive(api);api.transition('e1','en-evento');
 api.saveReturn('e1',[{productId:'p1',returned:0,damaged:0}],true);api.saveRental('e1','p1',{returned:90,damaged:5},'Ana','devuelto');api.transition('e1','cerrado');assert.equal(api.get().items[0].qty,0);assert.equal(api.available('p1'),0);
 assert.equal(api.get().movements.filter(m=>m.delta<0).length,0);
});
test('provider return failures preserve confirmed counts, stock and audit until retry',()=>{
 const ctx=fixture(),{api}=ctx;api.saveEvent(event(api));receive(api);api.transition('e1','en-evento');api.saveReturn('e1',[{productId:'p1',returned:70,damaged:0}],true);const before=JSON.stringify(api.get());ctx.quota(true);
 assert.throws(()=>api.saveRental('e1','p1',{returned:29,damaged:1},'Ana','devuelto'),/No se pudo guardar/);assert.equal(JSON.stringify(api.get()),before);ctx.quota(false);api.saveRental('e1','p1',{returned:29,damaged:1},'Ana','devuelto');assert.equal(api.get().items[0].qty,70);
});
