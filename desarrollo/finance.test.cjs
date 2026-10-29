const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/core.js','utf8');
function setup(initial={}){
 const storage=new Map(Object.entries(initial)),callbacks={};let quota=false;
 const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(quota)throw new Error('quota');storage.set(k,v);}};
 const window={addEventListener:(k,fn)=>(callbacks[k]||=[]).push(fn),dispatchEvent:e=>(callbacks[e.type]||[]).forEach(fn=>fn())};
 vm.runInNewContext(code,{window,localStorage,Date,Math,JSON,Number,Set,Map,Event:class{constructor(type){this.type=type;}},setTimeout:()=>0,clearTimeout(){},document:{}});
 return {api:window.Elianne,storage,quota:v=>quota=v,reload:()=>setup(Object.fromEntries(storage))};
}
const event=(id='e1',extra={})=>({id,client:'Boda '+id,eventDate:'2030-10-31',date:'2030-10-31',returnDate:'2030-10-31',hallIds:['hall-1'],status:'reservado',responsible:'Lorena',items:[],...extra});
function fixture(){const ctx=setup();ctx.api.saveEvent(event());return ctx;}
test('new expense and optional full or partial payment commit once and remain linked',()=>{
 const {api}=fixture();let revision=api.get().revision;
 api.addExpenseWithPayment(expense('pending'),null,'Ana');assert.equal(api.get().revision,revision+1);assert.equal(api.financeEvent('e1').paid,0);
 const payment=(id,amount)=>({id,amount,date:api.today(),method:'QR'});
 revision=api.get().revision;api.addExpenseWithPayment(expense('full'),payment('pay-full','200'),'Ana');assert.equal(api.get().revision,revision+1);
 api.addExpenseWithPayment(expense('partial'),payment('pay-partial','60.25'),'Ana');const f=api.financeEvent('e1');assert.equal(f.cost,60000);assert.equal(f.paid,26025);assert.equal(f.expenses.find(x=>x.id==='partial').pending,13975);assert.equal(f.cash.find(x=>x.id==='pay-full').expenseId,'full');assert.equal(api.financeMonth(api.today().slice(0,7)).out,26025);
 const before=JSON.stringify(api.get());assert.throws(()=>api.addExpenseWithPayment(expense('full'),payment('pay-full','200'),'Ana'),/ya fue/);assert.equal(JSON.stringify(api.get()),before);
});
test('invalid initial supplier payments cannot leave an expense or cash record behind',()=>{
 const {api}=fixture(),before=JSON.stringify(api.get());
 for(const patch of [{amount:'0'},{amount:'-1'},{amount:'200.01'},{amount:'1.001'},{date:'2199-01-01'},{date:'2026-02-30'},{method:'Invalid'},{id:''}]){
  assert.throws(()=>api.addExpenseWithPayment(expense(),{id:'pay',amount:'50',date:api.today(),method:'Efectivo',...patch},'Ana'));assert.equal(JSON.stringify(api.get()),before);
 }
 assert.throws(()=>api.addExpenseWithPayment(expense('bad',{eventId:'missing'}),{id:'pay',amount:'50',date:api.today(),method:'QR'},'Ana'));assert.equal(JSON.stringify(api.get()),before);
});
test('expense and initial payment roll back on storage failure and retry only once',()=>{
 const ctx=fixture(),{api}=ctx,payment={id:'pay',amount:'30',date:api.today(),method:'Efectivo'},before=JSON.stringify(api.get());ctx.quota(true);assert.throws(()=>api.addExpenseWithPayment(expense(),payment,'Ana'),/guardar/);assert.equal(JSON.stringify(api.get()),before);ctx.quota(false);api.addExpenseWithPayment(expense(),payment,'Ana');const f=ctx.reload().api.financeEvent('e1');assert.equal(f.cost,20000);assert.equal(f.paid,3000);assert.equal(f.expenses.length,1);assert.equal(f.cash.length,1);
});
const cash=(id,amount,extra={})=>({id,eventId:'e1',amount,kind:'cobro',date:'2020-10-20',method:'Efectivo',note:'Anticipo',...extra});
const expense=(id='g1',extra={})=>({id,eventId:'e1',hallId:'',description:'Comida',category:'Comida',date:'2030-10-31',amount:'200',...extra});
test('v4 migration has undefined prices, no invented payments and protected current backups',()=>{
 const ctx=fixture(),old=ctx.api.backup();old.schemaVersion=4;delete old.finance;const {api}=setup({'elianneSalon.v3':JSON.stringify(old)});
 assert.equal(api.get().schemaVersion,6);assert.equal(api.financeEvent('e1').total,null);assert.equal(api.financeEvent('e1').received,0);assert.equal(api.financeEvent('e1').result,null);
 const broken=api.backup();delete broken.finance;assert.throws(()=>api.prepareRestore(broken),/financieros/);const future=api.backup();future.schemaVersion=7;assert.throws(()=>api.prepareRestore(future),/compatible/);
});
test('explicit zero price differs from undefined; decimals use exact cents and extras preserve totals',()=>{
 const {api}=fixture();api.setContract('e1','0','Ana');assert.equal(api.financeEvent('e1').total,0);
 api.setContract('e1','1000.10','Ana');api.addFinanceRecord('extra',{id:'x1',eventId:'e1',description:'50 invitados adicionales',amount:'100.20'},'Ana');
 assert.equal(api.financeEvent('e1').total,110030);api.setContract('e1','1100.10','Rosa');assert.equal(api.financeEvent('e1').extras,10020);
 api.voidFinance('extra','x1','Cliente retiro el extra','Rosa','e1');assert.equal(api.financeEvent('e1').total,110010);assert.equal(api.get().finance.contracts[0].extras.length,1);
});
test('invalid precision, NaN, negatives, missing authors and unknown events never mutate finances',()=>{
 const {api}=fixture(),before=JSON.stringify(api.get());
 for(const value of ['-1','NaN','1.001','1e3','1000000000001',''])assert.throws(()=>api.addFinanceRecord('cash',cash('c1',value),'Ana'));
 assert.throws(()=>api.setContract('e1','100',''));assert.throws(()=>api.setContract('missing','100','Ana'));assert.equal(JSON.stringify(api.get()),before);
});
test('cash, agreed revenue and event result are independent; overpayments become credit',()=>{
 const {api}=fixture();api.setContract('e1','1000','Ana');api.addFinanceRecord('expense',expense(),'Ana');api.addFinanceRecord('cash',cash('c1','700'),'Ana');
 let f=api.financeEvent('e1');assert.equal(f.result,80000);assert.equal(f.received,70000);assert.equal(f.pending,30000);assert.equal(f.paid,0);
 api.addFinanceRecord('cash',cash('c2','400'),'Ana');f=api.financeEvent('e1');assert.equal(f.credit,10000);assert.equal(f.pending,0);
 api.addFinanceRecord('cash',cash('r1','100',{kind:'reembolso-cliente',date:'2020-10-21'}),'Ana');assert.equal(api.financeEvent('e1').credit,0);
});
test('cash months use payment dates, event forecasts use event dates and general costs use expense dates',()=>{
 const {api}=fixture();api.setContract('e1','1000','Ana');api.addFinanceRecord('cash',cash('c1','700'),'Ana');
 api.addFinanceRecord('expense',expense('general',{eventId:'',description:'Electricidad',amount:'50'}),'Ana');
 api.addFinanceRecord('cash',cash('out','20',{eventId:'',expenseId:'general',kind:'pago-gasto',date:'2020-11-01'}),'Ana');
 assert.equal(api.financeMonth('2020-10').net,70000);assert.equal(api.financeMonth('2020-11').net,-2000);assert.equal(api.financeMonth('2030-10').net,0);assert.equal(api.financeMonth('2030-10').result,95000);
});
test('hall filters include full shared events once, separate assigned general costs and disclose shared ones',()=>{
 const {api}=fixture();api.saveEvent({...api.get().events[0],hallIds:['hall-1','hall-2']});api.setContract('e1','1000','Ana');api.addFinanceRecord('cash',cash('c1','700'),'Ana');
 api.addFinanceRecord('expense',expense('shared',{eventId:'',amount:'50'}),'Ana');api.addFinanceRecord('expense',expense('assigned',{eventId:'',hallId:'hall-1',amount:'100'}),'Ana');
 assert.equal(api.financeMonth('2020-10').income,70000);assert.equal(api.financeMonth('2020-10','hall-1').income,70000);assert.equal(api.financeMonth('2020-10','hall-2').income,70000);assert.equal(api.financeMonth('2020-10','hall-3').income,0);
 assert.equal(api.financeMonth('2030-10','hall-1').generalCost,10000);assert.equal(api.financeMonth('2030-10','hall-1').unassignedGeneral,5000);assert.equal(api.financeMonth('2030-10').generalCost,15000);
});
test('unknown prices and rental costs block complete forecasts, quotes/cancellations do not inflate forecasts',()=>{
 const {api}=fixture();assert.equal(api.financeMonth('2030-10').result,null);api.setContract('e1','1000','Ana');
 api.saveEvent(event('quote',{status:'cotizacion',hallIds:['hall-2']}));assert.equal(api.financeMonth('2030-10').incomplete,0);api.transition('e1','cancelado');assert.equal(api.financeMonth('2030-10').result,0);
 api.addFinanceRecord('cash',cash('c1','50'),'Ana');assert.equal(api.financeMonth('2020-10').income,5000);
});
test('supplier costs, partial payments, reimbursements and unpaid balance are not double counted',()=>{
 const {api}=fixture();api.setContract('e1','1000','Ana');api.addFinanceRecord('expense',expense(),'Ana');api.addFinanceRecord('cash',cash('p1','80',{kind:'pago-gasto',expenseId:'g1'}),'Ana');
 let f=api.financeEvent('e1');assert.equal(f.cost,20000);assert.equal(f.expenses[0].pending,12000);assert.equal(f.paid,8000);assert.equal(f.result,80000);
 api.addFinanceRecord('cash',cash('refund','20',{kind:'reembolso-proveedor',expenseId:'g1',date:'2020-10-21'}),'Ana');f=api.financeEvent('e1');assert.equal(f.cost,20000);assert.equal(f.paid,6000);assert.equal(f.expenses[0].pending,14000);
 assert.throws(()=>api.voidFinance('expense','g1','Correccion','Ana'),/pagos/);
});
test('editing expense cost preserves payment history, creates supplier credit and journals the amendment',()=>{
 const {api}=fixture();api.addFinanceRecord('expense',expense(),'Ana');api.addFinanceRecord('cash',cash('p1','80',{kind:'pago-gasto',expenseId:'g1'}),'Ana');
 const before=JSON.stringify(api.get().finance.cash);api.updateFinanceExpense('g1',{description:'Comida corregida',category:'Comida',date:'2030-10-31',amount:'50',hallId:''},'Rosa');
 assert.equal(JSON.stringify(api.get().finance.cash),before);const row=api.financeEvent('e1').expenses[0];assert.equal(row.paid,8000);assert.equal(row.credit,3000);assert.equal(row.pending,0);assert.ok(api.eventHistory('e1').some(m=>m.type==='finanzas-expense-edit'));
 const snapshot=JSON.stringify(api.get());assert.throws(()=>api.updateFinanceExpense('g1',{description:'',category:'Otros',date:'2030-10-31',amount:'1'},'Ana'));assert.equal(JSON.stringify(api.get()),snapshot);
});
test('rental totals come from existing suppliers, payments retain references and event edits cannot orphan them',()=>{
 const {api}=fixture();api.upsertProduct({id:'p1',name:'Copas',qty:100,code:'CR-1',category:'Cristaleria',photo:''});
 api.saveEvent(event('e1',{items:[{productId:'p1',qty:100,external:{qty:20,cost:150,supplier:'Proveedor A',deliveryDate:'2030-10-31',returnDate:'2030-10-31',status:'pendiente'}}]}));
 api.setContract('e1','1000','Ana');api.addFinanceRecord('cash',cash('rp','50',{kind:'pago-gasto',productId:'p1'}),'Ana');
 let f=api.financeEvent('e1');assert.equal(f.expenses.length,1);assert.equal(f.cost,15000);assert.equal(f.result,85000);assert.equal(f.expenses[0].pending,10000);
 assert.throws(()=>api.saveEvent(event()),/alquiler/);api.saveRental('e1','p1',{cost:200},'Ana');assert.equal(api.financeEvent('e1').cost,20000);
 const before=api.backup();api.saveEvent({...api.get().events[0],guestCount:350});assert.equal(JSON.stringify(api.get().finance),JSON.stringify(before.finance));
});
test('unknown rental cost keeps result undefined; cancelled rentals retain unrefunded actual cost only',()=>{
 const {api}=fixture();api.upsertProduct({id:'p1',name:'Copas',qty:100,photo:''});api.saveEvent(event('e1',{items:[{productId:'p1',qty:50,external:{qty:10,cost:null,supplier:'Rosa',deliveryDate:'2030-10-31',returnDate:'2030-10-31',status:'pendiente'}}]}));api.setContract('e1','500','Ana');
 assert.equal(api.financeEvent('e1').result,null);api.addFinanceRecord('cash',cash('p1','20',{kind:'pago-gasto',productId:'p1'}),'Ana');api.saveRental('e1','p1',{},'Ana','cancelado');assert.equal(api.financeEvent('e1').cost,2000);
 api.addFinanceRecord('cash',cash('r1','20',{kind:'reembolso-proveedor',productId:'p1',date:'2020-10-21'}),'Ana');assert.equal(api.financeEvent('e1').cost,0);
});
test('refunds cannot exceed or predate active payments; voiding receipts cannot strand a refund',()=>{
 const {api}=fixture();api.addFinanceRecord('cash',cash('c1','100'),'Ana');const before=JSON.stringify(api.get());
 assert.throws(()=>api.addFinanceRecord('cash',cash('r1','101',{kind:'reembolso-cliente'}),'Ana'),/supera/);assert.throws(()=>api.addFinanceRecord('cash',cash('r2','50',{kind:'reembolso-cliente',date:'2020-10-19'}),'Ana'),/anterior/);assert.equal(JSON.stringify(api.get()),before);
 api.addFinanceRecord('cash',cash('r3','20',{kind:'reembolso-cliente',date:'2020-10-21'}),'Ana');assert.throws(()=>api.voidFinance('cash','c1','Error','Ana'),/supera/);
 api.voidFinance('cash','r3','Error','Ana');api.voidFinance('cash','c1','Error','Ana');assert.equal(api.financeEvent('e1').received,0);assert.equal(api.financeEvent('e1').cash.length,2);
});
test('future payments, invalid references and duplicate identifiers are rejected atomically',()=>{
 const {api}=fixture();assert.throws(()=>api.addFinanceRecord('cash',cash('future','100',{date:'2199-01-01'}),'Ana'),/futura/);assert.throws(()=>api.addFinanceRecord('cash',cash('missing','10',{kind:'pago-gasto',expenseId:'missing'}),'Ana'),/gasto/);
 api.addFinanceRecord('cash',cash('c1','100'),'Ana');const before=JSON.stringify(api.get());assert.throws(()=>api.addFinanceRecord('cash',cash('c1','100'),'Ana'),/ya fue/);assert.equal(JSON.stringify(api.get()),before);
});
test('failed persistence and stale tabs keep journal unchanged; retry saves once and full backup survives reload',()=>{
 const ctx=fixture(),{api}=ctx;api.setContract('e1','1000','Ana');const before=JSON.stringify(api.get());ctx.quota(true);assert.throws(()=>api.addFinanceRecord('cash',cash('c1','300'),'Ana'),/guardar/);assert.equal(JSON.stringify(api.get()),before);ctx.quota(false);
 api.addFinanceRecord('cash',cash('c1','300'),'Ana');const reloaded=ctx.reload();assert.equal(reloaded.api.financeEvent('e1').received,30000);api.addFinanceRecord('extra',{id:'x1',eventId:'e1',description:'Extra',amount:'10'},'Ana');reloaded.storage.set('elianneSalon.v3',ctx.storage.get('elianneSalon.v3'));assert.throws(()=>reloaded.api.setContract('e1','900','Ana'),/otra pestaña/);
 const backup=api.backup(),fresh=setup().api;fresh.restore(fresh.prepareRestore(backup));assert.equal(JSON.stringify(fresh.get().finance),JSON.stringify(backup.finance));assert.ok(fresh.eventHistory('e1').some(m=>m.type==='finanzas-cash'));
});
test('malformed v5 money, duplicate entries and orphaned financial references reject restores',()=>{
 const {api}=fixture();api.addFinanceRecord('cash',cash('c1','100'),'Ana');const before=JSON.stringify(api.get());
 for(const modify of [d=>d.finance.cash.push(d.finance.cash[0]),d=>d.finance.cash[0].amount=0.5,d=>d.finance.cash[0].eventId='missing',d=>d.finance.cash[0].method='Invalid',d=>d.finance.cash[0].voidedAt=Date.now()]){const broken=api.backup();modify(broken);assert.throws(()=>api.prepareRestore(broken));assert.equal(JSON.stringify(api.get()),before);}
});
test('event creation saves its optional base price in the same revision, never inventing a payment',()=>{
 const {api}=setup(),revision=api.get().revision;api.saveEvent(event('priced',{basePrice:'2500.50'}));
 assert.equal(api.get().revision,revision+1);assert.equal(api.financeEvent('priced').contract.base,250050);assert.equal(api.financeEvent('priced').received,0);assert.equal(api.get().finance.cash.length,0);
 const journal=api.eventHistory('priced');assert.equal(journal.filter(m=>m.type==='finanzas-acuerdo').length,1);assert.equal(journal.find(m=>m.type==='finanzas-acuerdo').responsible,'Lorena');
});
test('event edits update price and event together while preserving extras and all cash entries',()=>{
 const {api}=fixture();api.setContract('e1','1000','Ana');api.addFinanceRecord('extra',{id:'x1',eventId:'e1',description:'Extra',amount:'100'},'Ana');api.addFinanceRecord('cash',cash('c1','300'),'Ana');
 const before=api.get(),revision=before.revision;api.saveEvent({...api.get().events[0],client:'Boda actualizada',basePrice:'2000',expectedBasePrice:100000,recordedBy:'Rosa'});
 const f=api.financeEvent('e1');assert.equal(f.total,210000);assert.equal(f.received,30000);assert.equal(JSON.stringify(f.contract.extras),JSON.stringify(before.finance.contracts[0].extras));assert.equal(JSON.stringify(api.get().finance.cash),JSON.stringify(before.finance.cash));assert.equal(api.get().revision,revision+1);
 assert.equal(api.eventHistory('e1').find(m=>m.type==='finanzas-acuerdo').responsible,'Rosa');
});
test('event and price roll back together after storage failure or invalid hall reservation',()=>{
 const ctx=fixture(),{api}=ctx;api.setContract('e1','1000','Ana');const before=JSON.stringify(api.get());ctx.quota(true);
 assert.throws(()=>api.saveEvent({...api.get().events[0],client:'No confirmado',basePrice:'2000'}),/guardar/);assert.equal(JSON.stringify(api.get()),before);ctx.quota(false);
 assert.throws(()=>api.saveEvent(event('conflict',{basePrice:'3000'})),/reservado/);assert.equal(JSON.stringify(api.get()),before);
});
test('omitted prices retain current finance, stale explicit edits fail without changing the event',()=>{
 const {api}=fixture();api.setContract('e1','1200','Ana');api.saveEvent({...api.get().events[0],notes:'Solo nota'});assert.equal(api.financeEvent('e1').contract.base,120000);
 const before=JSON.stringify(api.get());assert.throws(()=>api.saveEvent({...api.get().events[0],notes:'No guardar',basePrice:'1500',expectedBasePrice:100000}),/precio cambio/);assert.equal(JSON.stringify(api.get()),before);
 const count=api.eventHistory('e1').filter(m=>m.type==='finanzas-acuerdo').length;api.saveEvent({...api.get().events[0],basePrice:'1200.00',expectedBasePrice:100000});assert.equal(api.eventHistory('e1').filter(m=>m.type==='finanzas-acuerdo').length,count);
});
test('blank event prices stay undefined, explicit zero is known, invalid prices reject the entire new event',()=>{
 const {api}=setup();api.saveEvent(event('blank',{basePrice:'',status:'cotizacion'}));assert.equal(api.financeEvent('blank').total,null);
 api.saveEvent(event('zero',{basePrice:'0',status:'cotizacion'}));assert.equal(api.financeEvent('zero').total,0);
 for(const price of ['-1','1.001','1e4','NaN']){const before=JSON.stringify(api.get());assert.throws(()=>api.saveEvent(event('invalid',{basePrice:price,status:'cotizacion'})));assert.equal(JSON.stringify(api.get()),before);}
});
const eventPayment=(api,id='initial',amount='250')=>({id,amount,date:api.today(),method:'QR',note:'Anticipo recibido'});
test('event, price and initial receipt share one atomic revision and use the receipt date for cash',()=>{
 const {api}=setup(),revision=api.get().revision;api.saveEvent(event('deposit',{basePrice:'500',payment:eventPayment(api)}));
 const f=api.financeEvent('deposit');assert.equal(api.get().revision,revision+1);assert.equal(f.received,25000);assert.equal(f.pending,25000);assert.equal(f.cash.length,1);assert.equal(f.cash[0].by,'Lorena');assert.equal(f.cash[0].date,api.today());assert.equal(api.financeMonth(api.today().slice(0,7)).income,25000);
});
test('new event payments preserve extras/refunds and duplicate receipt identifiers cannot apply an edit twice',()=>{
 const {api}=fixture();api.setContract('e1','1000','Ana');api.addFinanceRecord('extra',{id:'x1',eventId:'e1',description:'Extra',amount:'100'},'Ana');api.addFinanceRecord('cash',cash('c1','300'),'Ana');api.addFinanceRecord('cash',cash('r1','50',{kind:'reembolso-cliente',date:'2020-10-21'}),'Ana');
 const payload={...api.get().events[0],payment:eventPayment(api,'new','200'),expectedBasePrice:100000,recordedBy:'Rosa'};api.saveEvent(payload);let f=api.financeEvent('e1');assert.equal(f.received,45000);assert.equal(f.pending,65000);assert.equal(f.contract.extras.length,1);
 const before=JSON.stringify(api.get());assert.throws(()=>api.saveEvent({...payload,client:'No duplicar'}),/ya fue/);assert.equal(JSON.stringify(api.get()),before);api.saveEvent({...api.get().events[0],notes:'Solo datos'});f=api.financeEvent('e1');assert.equal(f.cash.length,3);assert.equal(f.received,45000);
});
test('invalid deposits reject the whole new event and price, with no orphan cash',()=>{
 const {api}=setup();for(const patch of [{amount:'-1'},{amount:'1.001'},{date:'2199-01-01'},{date:'2026-02-30'},{method:'Invalid'},{id:''}]){
  const before=JSON.stringify(api.get());assert.throws(()=>api.saveEvent(event('bad',{basePrice:'500',payment:{...eventPayment(api),...patch}})));assert.equal(JSON.stringify(api.get()),before);
 }
});
test('failed event payment persistence retains all confirmed values and retry records the receipt exactly once',()=>{
 const ctx=fixture(),{api}=ctx;api.setContract('e1','1000','Ana');const before=JSON.stringify(api.get()),payload={...api.get().events[0],client:'Cambio con abono',basePrice:'1200',payment:eventPayment(api)};
 ctx.quota(true);assert.throws(()=>api.saveEvent(payload),/guardar/);assert.equal(JSON.stringify(api.get()),before);ctx.quota(false);api.saveEvent(payload);const f=ctx.reload().api.financeEvent('e1');assert.equal(f.total,120000);assert.equal(f.received,25000);assert.equal(f.cash.length,1);
});
test('zero deposits do not invent cash, unknown totals stay undefined and overpayments become customer credit',()=>{
 const {api}=setup();api.saveEvent(event('unknown',{payment:eventPayment(api)}));assert.equal(api.financeEvent('unknown').total,null);assert.equal(api.financeEvent('unknown').received,25000);assert.equal(api.financeEvent('unknown').pending,null);
 api.saveEvent(event('zero',{status:'cotizacion',basePrice:'500',payment:{amount:'0'}}));assert.equal(api.financeEvent('zero').cash.length,0);
 api.saveEvent(event('credit',{status:'cotizacion',basePrice:'100',payment:eventPayment(api,'overpaid','150')}));assert.equal(api.financeEvent('credit').pending,0);assert.equal(api.financeEvent('credit').credit,5000);
});
test('an event payment based on a stale price cannot partially modify the event or cash',()=>{
 const {api}=fixture();api.setContract('e1','1200','Ana');const before=JSON.stringify(api.get());assert.throws(()=>api.saveEvent({...api.get().events[0],client:'No guardar',expectedBasePrice:100000,payment:eventPayment(api)}),/precio cambio/);assert.equal(JSON.stringify(api.get()),before);
});
