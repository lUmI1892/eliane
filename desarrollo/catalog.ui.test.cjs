const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const out=path.join(__dirname,'verification','catalog');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  let acceptDialog=false;page.on('dialog',dialog=>acceptDialog?dialog.accept():dialog.dismiss());
  await page.goto(pathToFileURL(path.join(__dirname,'inventario-elianne.verificado.html')).href);await page.waitForFunction(()=>window.Elianne?.isReady());
  await page.locator('[data-tab="events"]').click();await page.locator('#salonCatalogOpen').click();assert.equal(await page.locator('#catalogDialog').isVisible(),false);assert.ok((await page.locator('#systemNotice').innerText()).includes('fechas'));
  await page.evaluate(async()=>{
   const api=window.Elianne,data=api.backup(),day=api.today(),canvas=document.createElement('canvas');canvas.width=240;canvas.height=180;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,240,180);ctx.fillStyle='#147d74';ctx.fillRect(75,35,90,85);ctx.fillStyle='#43586a';ctx.fillRect(115,120,10,28);ctx.fillRect(90,148,60,5);
   const photo=canvas.toDataURL('image/png');
   data.items=[
    {id:'glass',name:'Copa de vino clasica',code:'CR-001',category:'Cristaleria',qty:100,unit:'unidades',photo},
    {id:'plate',name:'Plato blanco',code:'VA-001',category:'Vajilla',qty:12,unit:'unidades',photo:''},
    {id:'zero',name:'Copa labrada',code:'CR-002',category:'Cristaleria',qty:0,unit:'unidades',photo},
    {id:'blocked',name:'Jarra <img src=x onerror=window.injected=true>',code:'CR-003',category:'Cristaleria',qty:70,unit:'unidades',photo},
    {id:'broken',name:'Centro de mesa con nombre muy largo para comprobar el ajuste',code:'DE-001',category:'Decoracion',qty:10,unit:'juegos',photo:'data:image/png;base64,YQ=='}
   ];data.extras={blocked:{status:'mantenimiento',minQty:0,cost:0}};
   data.events=[{id:'other',client:'Otra reserva',date:day,returnDate:day,eventDate:day,venueEndDate:day,hallIds:['hall-1'],status:'reservado',type:'Boda',responsible:'Lorena',items:[{productId:'glass',qty:20,returned:0,damaged:0,missing:0}]}];
   await api.restore(api.prepareRestore(data));
  });
  const today=await page.evaluate(()=>window.Elianne.today()),before=await page.evaluate(()=>JSON.stringify(window.Elianne.backup().events));
  await page.locator('[data-tab="events"]').click();
  await page.locator('#salonClient').fill('Boda Camila');await page.locator('#salonEventDate').fill(today);await page.locator('#salonResp').fill('Lorena');await page.locator('#salonStatus').selectOption('reservado');await page.locator('input[name="eventHall"][value="hall-2"]').check();
  const open=()=>page.locator('#salonCatalogOpen').click(),card=pid=>page.locator(`[data-catalog-product="${pid}"]`),cart=pid=>page.locator(`[data-cart-row="${pid}"]`);
  await open();assert.equal(await page.locator('#catalogDialog').isVisible(),true);assert.equal(await page.locator('[data-catalog-product]').count(),5);assert.ok((await page.locator('#catalogContext').innerText()).includes('Elianne 2'));
  assert.ok((await card('glass').innerText()).includes('Disponibles: 80'));assert.ok((await card('blocked').innerText()).includes('Mantenimiento'));assert.ok((await card('blocked').innerText()).includes('Disponibles: 0'));
  assert.equal(await card('glass').locator('img').evaluate(img=>img.complete&&img.naturalWidth>0),true);assert.equal(await card('plate').locator('.catalog-photo-empty').isVisible(),true);
  await page.waitForFunction(()=>document.querySelector('[data-catalog-product="broken"] img').hidden);assert.equal(await card('broken').locator('.catalog-photo-empty').isVisible(),true);assert.equal(await page.evaluate(()=>Boolean(window.injected)),false);
  await page.locator('#catalogCategory').selectOption('Cristaleria');assert.equal(await page.locator('[data-catalog-product]').count(),3);
  await page.locator('#catalogSearch').fill('cr-001');assert.equal(await page.locator('[data-catalog-product]').count(),1);
  await card('glass').locator('[data-catalog-step="1"]').click();assert.equal(await card('glass').locator('input').inputValue(),'2');await card('glass').locator('[data-catalog-step="-1"]').click();assert.equal(await card('glass').locator('input').inputValue(),'1');
  await card('glass').locator('input').fill('0');await card('glass').locator('[data-catalog-add]').click();assert.equal(await page.locator('[data-cart-row]').count(),0);
  await card('glass').locator('input').fill('1.5');await card('glass').locator('[data-catalog-add]').click();assert.equal(await page.locator('[data-cart-row]').count(),0);
  await card('glass').locator('input').fill('12');await card('glass').locator('input').press('Enter');assert.equal(await cart('glass').locator('input').inputValue(),'12');
  await card('glass').locator('input').fill('3');await card('glass').locator('[data-catalog-add]').click();assert.equal(await page.locator('[data-cart-row]').count(),1);assert.equal(await cart('glass').locator('input').inputValue(),'15');
  await cart('glass').locator('input').fill('');await cart('glass').locator('input').pressSequentially('125');assert.equal(await cart('glass').locator('input').inputValue(),'125');assert.equal(await cart('glass').locator('input').evaluate(el=>el===document.activeElement),true);assert.ok((await cart('glass').innerText()).includes('Faltan 45 propios'));
  await cart('glass').locator('input').fill('-1');assert.equal(await page.locator('#catalogConfirm').isDisabled(),true);await page.locator('#catalogCategory').selectOption('Vajilla');assert.equal(await cart('glass').locator('input').inputValue(),'-1');assert.equal(await page.locator('#catalogConfirm').isDisabled(),true);
  await cart('glass').locator('input').fill('125');await page.locator('#catalogSearch').fill('');await card('plate').locator('input').fill('2');await card('plate').locator('[data-catalog-add]').click();assert.ok((await page.locator('#catalogTotals').innerText()).includes('2 modelos'));
  await page.locator('#catalogSearch').fill('No existe');assert.equal(await page.locator('[data-catalog-product]').count(),0);assert.equal(await page.locator('[data-cart-row]').count(),2);
  await page.locator('#catalogClose').click();assert.equal(await page.locator('#catalogDialog').isVisible(),true);acceptDialog=true;await page.keyboard.press('Escape');assert.equal(await page.locator('#catalogDialog').isVisible(),false);assert.equal(await page.locator('[data-draft-row]').count(),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.Elianne.backup().events)),before);console.log('PASS: real embedded images, photo fallback, escaped names, categories/search, dated stock, duplicate merging, steppers, uninterrupted multi-digit entry, invalid-quantity persistence and cancel isolation');
  await open();await page.locator('#catalogCategory').selectOption('Cristaleria');await card('glass').locator('input').fill('125');await card('glass').locator('[data-catalog-add]').click();
  await page.locator('#catalogCategory').selectOption('Vajilla');await card('plate').locator('input').fill('2');await card('plate').locator('[data-catalog-add]').click();await page.locator('#catalogCategory').selectOption('');
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:1000});await page.locator('#catalogDialog').evaluate(el=>el.scrollTop=0);
   assert.equal(await page.locator('#catalogDialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.ok(await page.locator('.catalog-product').evaluateAll(nodes=>nodes.every(el=>el.scrollWidth<=el.clientWidth)));
   await page.screenshot({path:path.join(out,`catalog-${width}.png`)});
   if(width<=760){await page.locator('#catalogViewSelection').click();assert.equal(await page.locator('#catalogSelectionTitle').evaluate(el=>el===document.activeElement),true);assert.equal(await cart('glass').locator('input').isVisible(),true);}
  }
  await page.setViewportSize({width:1440,height:1000});await cart('glass').locator('[data-catalog-rent]').click();assert.equal(await page.locator('#catalogDialog').isVisible(),false);assert.equal(await page.locator('#rentQty0').inputValue(),'45');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.Elianne.backup().events)),before);
  await page.locator('#salonEventForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());
  const id=await page.evaluate(()=>window.Elianne.get().events.find(e=>e.client==='Boda Camila')?.id);assert.ok(id);assert.equal(await page.evaluate(id=>window.Elianne.get().events.find(e=>e.id===id).items[0].external.qty,id),45);assert.equal(await page.evaluate(()=>window.Elianne.get().items.find(p=>p.id==='glass').qty),100);
  await page.locator(`[data-event-entry="${id}"] [data-action="edit"]`).click();await open();assert.ok((await card('glass').innerText()).includes('Disponibles: 80'));assert.equal(await cart('glass').locator('input').inputValue(),'125');
  await cart('glass').locator('input').fill('44');assert.equal(await page.locator('#catalogConfirm').isDisabled(),true);await cart('glass').locator('input').fill('126');await page.locator('#catalogConfirm').click();assert.equal(await page.locator('#rentQty0').inputValue(),'45');
  await page.locator('#salonRecordedBy').fill('Ana');await page.locator('#salonEventForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());assert.ok((await page.locator('#systemNotice').innerText()).includes('disponibles'));assert.equal(await page.locator('[data-draft-row="0"] td:nth-child(2)').innerText(),'126');
  await page.locator('#salonClearEvent').click();
  console.log('PASS: confirm changes only form draft, shortage opens existing external-rental form, save preserves owned stock/rental metadata, edit excludes its own reservation, rental minimum and stock validation remain enforced');
  await page.locator('[data-tab="calendar"]').click();await page.locator(`[data-open-detail="${id}"]`).first().click();await page.locator('#detailEdit').click();await open();await cart('plate').locator('input').fill('3');await page.locator('#catalogConfirm').click();assert.equal(await page.locator('#detailEditorHost #salonEventForm').isVisible(),true);assert.ok((await page.locator('#salonDraft').innerText()).includes('Plato blanco'));
  await page.locator('#salonRecordedBy').fill('Ana');await page.evaluate(()=>{window.savedWrite=window.ElianneStorage.write;window.ElianneStorage.write=()=>Promise.reject(new Error('Simulated failure'));});await page.locator('#salonEventForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());
  assert.equal(await page.evaluate(id=>window.Elianne.get().events.find(e=>e.id===id).items.find(i=>i.productId==='plate').qty,id),2);await open();assert.equal(await cart('plate').locator('input').inputValue(),'3');await page.locator('#catalogClose').click();
  await page.evaluate(()=>window.ElianneStorage.write=window.savedWrite);await page.locator('#salonEventForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());assert.equal(await page.evaluate(id=>window.Elianne.get().events.find(e=>e.id===id).items.find(i=>i.productId==='plate').qty,id),3);
  await page.locator('#detailBack').click();await page.reload();await page.locator('[data-tab="events"]').click();await page.locator(`[data-event-entry="${id}"] [data-action="edit"]`).click();await open();assert.equal(await cart('plate').locator('input').inputValue(),'3');await page.locator('#catalogClose').click();await page.locator('#salonClearEvent').click();
  await page.evaluate(async id=>{const api=window.Elianne,data=api.backup(),r=data.events.find(e=>e.id===id).items[0].external;r.status='recibido';r.supplier='Proveedor A';r.receivedAt=Date.now();await api.restore(api.prepareRestore(data));},id);
  await page.locator('[data-tab="events"]').click();await page.locator(`[data-event-entry="${id}"] [data-action="edit"]`).click();await open();assert.equal(await cart('glass').locator('[data-catalog-remove]').isDisabled(),true);
  const rentalBefore=await page.evaluate(id=>JSON.stringify(window.Elianne.get().events.find(e=>e.id===id).items[0].external),id);
  await page.evaluate(async()=>window.Elianne.saveHalls(window.Elianne.get().halls));assert.equal(await cart('glass').locator('[data-catalog-remove]').isDisabled(),true);await page.locator('#catalogConfirm').click();await page.locator('#salonRecordedBy').fill('Ana');await page.locator('#salonEventForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());
  assert.equal(await page.evaluate(id=>JSON.stringify(window.Elianne.get().events.find(e=>e.id===id).items[0].external),id),rentalBefore);console.log('PASS: received-rental removal remains locked after asynchronous updates and supplier receipt metadata survives unchanged');
  await page.evaluate(async()=>{const api=window.Elianne,data=api.backup();data.items=[];data.events=[];data.extras={};await api.restore(api.prepareRestore(data));});await page.locator('[data-tab="events"]').click();await page.locator('#salonEventDate').fill(today);await open();assert.ok((await page.locator('#catalogProducts').innerText()).includes('No hay productos registrados'));await page.locator('#catalogConfirm').click();
  assert.deepEqual(errors,[]);await context.close();console.log('PASS: desktop/mobile nonoverflow, event-detail editor integration, failed persistence retains selection, retry/reload and empty inventory');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
