const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=__dirname,out=path.join(root,'verification','reports');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'inventario-elianne.verificado.html')).href);await page.waitForFunction(()=>window.Elianne?.isReady());
  await page.evaluate(async()=>{
   const api=window.Elianne,data=api.backup();
   data.items=[{id:'p1',name:'Jarra bonita de cristal',code:'0002',qty:1000,unit:'unidades',category:'Cristaleria',photo:'',location:'Estante A'},{id:'p2',name:'Centro de mesa de tres piezas',code:'001',qty:50,unit:'juegos',category:'Decoracion',photo:'',location:'Estante B'}];
   data.extras={p1:{status:'disponible',minQty:10,cost:15},p2:{status:'disponible',minQty:2,cost:50}};
   const base={venueMode:'day',setupMinutes:0,cleanupMinutes:0,type:'Boda',responsible:'Lorena',place:'Salon principal',status:'reservado',notes:'Confirmar decoracion con la novia. Llevar vajilla blanca.',updatedAt:1};
   data.events=[
    {...base,id:'e1',client:'PERICO DE LOS PALOTES',eventDate:'2030-10-30',venueEndDate:'2030-10-30',date:'0001-01-30',returnDate:'2030-10-30',hallIds:['hall-3'],guestCount:300,items:[{productId:'p1',qty:12,returned:0,damaged:0,missing:0}]},
    {...base,id:'e2',client:'Boda Maria',eventDate:'2030-10-14',venueEndDate:'2030-10-14',date:'2030-10-14',returnDate:'2030-10-15',hallIds:[],guestCount:null,items:[{productId:'p1',qty:100,returned:95,damaged:9,missing:5},{productId:'p2',qty:3,returned:3,damaged:0,missing:0}]},
    {...base,id:'e3',client:'Boda Camila',eventDate:'2030-10-14',venueEndDate:'2030-10-14',date:'2030-10-14',returnDate:'2030-10-15',departureDate:'2030-10-14',hallIds:['hall-1'],guestCount:350,status:'devuelto',settledAt:Date.now(),items:[{productId:'p1',qty:450,returned:440,damaged:5,missing:5}]},
    {...base,id:'e4',client:'Evento sin materiales',eventDate:'2030-11-01',venueEndDate:'2030-11-01',date:'2030-11-01',returnDate:'2030-11-01',hallIds:['hall-2'],guestCount:0,status:'cotizacion',items:[]}
   ];
   await api.restore(api.prepareRestore(data));
  });
  const before=await page.evaluate(()=>JSON.stringify(window.Elianne.backup().events));
  async function download(selector,name){const waiting=page.waitForEvent('download');await page.locator(selector).click();const file=await waiting;await file.saveAs(path.join(out,name));assert.ok(fs.readFileSync(path.join(out,name)).length>100);}
  await page.locator('[data-tab="reports"]').click();
  await download('[data-report="events"]','events.pdf');await download('[data-report="inventory"]','inventory.pdf');
  await page.locator('#reportFrom').fill('2030-10-01');await page.locator('#reportFrom').dispatchEvent('change');await page.locator('#reportTo').fill('2030-10-31');await page.locator('#reportTo').dispatchEvent('change');
  await page.locator('#reportHall').selectOption('hall-3');await page.locator('#reportStatus').selectOption('reservado');
  assert.equal(await page.locator('#reportSelection').innerText(),'1 evento seleccionado');
  await page.locator('#reportDetails').uncheck();await download('[data-report="events"]','filtered.pdf');await download('[data-report="csv"]','filtered.csv');
  const csv=fs.readFileSync(path.join(out,'filtered.csv'),'utf8');assert.ok(csv.includes('PERICO'));assert.equal(csv.includes('Boda Maria'),false);assert.ok(csv.includes('Faltante confirmado'));assert.ok(csv.includes('Sin confirmar'));
  await page.locator('#reportFrom').fill('2031-01-01');await page.locator('#reportFrom').dispatchEvent('change');assert.equal(await page.locator('[data-report="events"]').isDisabled(),true);assert.ok((await page.locator('#reportSelection').innerText()).includes('Revisa el periodo'));
  await page.locator('#reportFrom').fill('');await page.locator('#reportFrom').dispatchEvent('change');await page.locator('#reportHall').selectOption('unassigned');assert.equal(await page.locator('#reportSelection').innerText(),'1 evento seleccionado');
  await page.screenshot({path:path.join(out,'reports-desktop.png')});
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`reports-mobile-${width}.png`)});}
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-tab="events"]').click();await download('[data-event-entry="e1"] [data-action="pdf"]','delivery.pdf');
  await page.locator('[data-tab="returns"]').click();await download('[data-return-card="e2"] [data-action="return-pdf"]','return-pending.pdf');await download('[data-return-card="e3"] [data-action="return-pdf"]','return-confirmed.pdf');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.Elianne.backup().events)),before);
  console.log('PASS: report filters, date validation, CSV selection, distinct delivery/return downloads, no data mutation and mobile layout');
  await page.evaluate(async()=>{
   const api=window.Elianne,data=api.backup();data.events=[];data.items=[];data.extras={};
   for(let i=0;i<60;i++)data.items.push({id:'long'+i,name:`Producto ${i}: `+'cristaleriaYDecoracion'.repeat(i===59?450:10),code:'LONG-'+i,qty:20,unit:'unidades',category:'Otros',photo:'',location:'Deposito'});
   data.events=[{id:'stress',client:'Evento extenso con materiales y observaciones',eventDate:'2031-12-31',venueEndDate:'2032-01-01',venueMode:'hours',startTime:'20:00',endTime:'03:00',date:'2031-12-30',returnDate:'2032-01-02',setupMinutes:120,cleanupMinutes:90,hallIds:['hall-1','hall-2'],guestCount:100000000,status:'reservado',type:'Graduacion',responsible:'Coordinacion de eventos',notes:'Inicio de observaciones.\n'+'Nota completa sin recortar. '.repeat(180)+'\nFIN DE OBSERVACIONES',items:data.items.map(p=>({productId:p.id,qty:12,returned:0,damaged:0,missing:0}))}];
   await api.restore(api.prepareRestore(data));
  });
  await page.locator('[data-tab="events"]').click();await download('[data-event-entry="stress"] [data-action="pdf"]','stress.pdf');
  await page.locator('[data-tab="reports"]').click();await page.locator('#reportHall').selectOption('');await page.locator('#reportStatus').selectOption('');await page.locator('#reportTo').fill('2020-01-01');await page.locator('#reportTo').dispatchEvent('change');await download('[data-report="events"]','empty.pdf');
  assert.deepEqual(errors,[]);console.log('PASS: empty reports and multipage long names/notes export without runtime errors');
  await context.close();
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
