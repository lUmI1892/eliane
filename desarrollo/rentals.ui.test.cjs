const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=__dirname,out=path.join(root,'verification','rentals');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(pathToFileURL(path.join(root,'inventario-elianne.verificado.html')).href);await page.waitForFunction(()=>window.Elianne?.isReady());
  await page.evaluate(async()=>{await window.Elianne.upsertProduct({id:'p1',name:'Centro de mesa de tres piezas',qty:2,code:'001',category:'Decoracion',photo:'',unit:'juegos'});});
  const date=await page.evaluate(()=>window.Elianne.today()),settle=()=>page.waitForFunction(()=>!window.Elianne.saving());
  async function download(selector,name){const waiting=page.waitForEvent('download');await page.locator(selector).click();const file=await waiting;await file.saveAs(path.join(out,name));}
  await page.locator('[data-tab="events"]').click();await page.locator('#salonClient').fill('Boda Maria');await page.locator('#salonEventDate').fill(date);await page.locator('#salonDate').fill(date);await page.locator('#salonEnd').fill(date);
  await page.locator('input[name="eventHall"][value="hall-1"]').check();await page.locator('#salonResp').fill('Lorena');await page.locator('#salonStatus').selectOption('reservado');await page.locator('#salonGuests').fill('350');
  await page.locator('#salonQty').fill('5');await page.locator('#salonAddItem').click();assert.ok((await page.locator('#salonDraft').innerText()).includes('Faltan 3 propios'));
  await page.locator('[data-draft-rent="0"]').click();assert.equal(await page.locator('#rentQty0').inputValue(),'3');await page.locator('#rentSupplier0').fill('Alquileres Rosa');await page.locator('#rentCost0').fill('150');
  await page.screenshot({path:path.join(out,'rental-draft-desktop.png'),fullPage:true});
  await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('#salonRentalsDraft').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'rental-draft-mobile.png')});await page.setViewportSize({width:1440,height:1000});
  await page.locator('#salonEventForm button[type="submit"]').click();await settle();
  const id=await page.evaluate(()=>window.Elianne.get().events[0].id),card=`[data-event-entry="${id}"]`;
  assert.ok((await page.locator(card).innerText()).includes('Pendiente'));assert.equal(await page.evaluate(()=>window.Elianne.get().items[0].qty),2);assert.equal(await page.evaluate(()=>window.Elianne.available('p1')),0);
  await page.locator('[data-tab="alerts"]').click();assert.ok((await page.locator('#salonAlertList').innerText()).includes('falta contratar 3'));
  await page.locator('[data-tab="returns"]').click();await page.locator('[data-action="out"]').click();assert.ok((await page.locator('#systemNotice').innerText()).includes('Falta recibir'));
  await page.locator('#salonReturnList [data-action="rentals"]').click();await page.locator('#rentalBy').fill('Ana');await page.locator('#rentalConfirm').click();await settle();assert.equal(await page.locator('#rentalState').innerText(),'Confirmado');
  await page.evaluate(()=>{window.__rentalWrite=window.ElianneStorage.write;window.ElianneStorage.write=()=>Promise.reject(new Error('Simulated failure'));});
  await page.locator('#rentalNotes').fill('Material revisado con proveedor');await page.locator('#rentalReceive').click();await settle();assert.ok((await page.locator('#rentalMessage').innerText()).includes('No se pudo confirmar'));assert.equal(await page.locator('#rentalNotes').inputValue(),'Material revisado con proveedor');assert.equal(await page.evaluate(()=>window.Elianne.get().events[0].items[0].external.status),'confirmado');
  await page.evaluate(()=>window.ElianneStorage.write=window.__rentalWrite);await page.locator('#rentalReceive').click();await settle();assert.equal(await page.locator('#rentalState').innerText(),'Recibido');
  await page.screenshot({path:path.join(out,'rental-desktop.png')});
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('#rentalDialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.screenshot({path:path.join(out,`rental-mobile-${width}.png`)});}
  await page.locator('#rentalClose').click();await page.setViewportSize({width:1440,height:1000});await page.locator('[data-action="out"]').click();await settle();
  assert.equal(await page.locator('[data-return="returned"]').getAttribute('max'),'2');await page.locator('[data-return="returned"]').fill('1');await page.locator('[data-return="damaged"]').fill('1');await page.locator('[data-action="return"]').click();await settle();
  assert.equal(await page.evaluate(()=>window.Elianne.get().items[0].qty),1);await page.locator('[data-action="close"]').click();assert.ok((await page.locator('#systemNotice').innerText()).includes('alquileres pendientes'));
  await page.locator('#salonReturnList [data-action="rentals"]').click();await page.locator('#rentalBy').fill('Ana');await page.locator('#rentalGood').fill('1');await page.locator('#rentalDamaged').fill('1');await page.locator('#rentalComplete').click();await settle();assert.equal(await page.locator('#rentalState').innerText(),'Devuelto al proveedor');assert.ok((await page.locator('#rentalFinalCounts').innerText()).includes('faltante 1'));assert.equal(await page.evaluate(()=>window.Elianne.get().items[0].qty),1);
  await page.locator('#rentalClose').click();await download('[data-action="return-pdf"]','return.pdf');await page.locator('[data-action="close"]').click();await settle();
  await page.locator('[data-tab="events"]').click();await download(`${card} [data-action="pdf"]`,'delivery.pdf');
  await page.locator(`${card} [data-action="history"]`).click();assert.ok((await page.locator('#historyTimeline').innerText()).includes('faltante 1'));await page.locator('[data-close-dialog="eventHistoryDialog"]').click();
  await page.locator('[data-tab="reports"]').click();await download('[data-report="rentals-csv"]','rentals.csv');await download('[data-report="csv"]','events.csv');await download('[data-report="events"]','events.pdf');
  const csv=fs.readFileSync(path.join(out,'rentals.csv'),'utf8');assert.ok(csv.includes('Alquileres Rosa'));assert.ok(csv.includes('Devuelto al proveedor'));assert.ok(csv.includes('150'));
  await download('#backupBtn','backup.json');const backup=JSON.parse(fs.readFileSync(path.join(out,'backup.json'),'utf8'));assert.equal(backup.events[0].items[0].external.missing,1);
  const prior=page.waitForEvent('download');await page.locator('#restoreInput').setInputFiles(path.join(out,'backup.json'));await prior;await settle();await page.reload();await page.waitForFunction(()=>window.Elianne?.isReady());assert.equal(await page.evaluate(()=>window.Elianne.get().events[0].items[0].external.status),'devuelto');assert.equal(await page.evaluate(()=>window.Elianne.get().items[0].qty),1);
  assert.deepEqual(errors,[]);console.log('PASS: shortage allocation, pending/confirmed receipt gating, failed save retains fields, own-only losses, supplier return and event closure');
  console.log('PASS: rental alerts, history, PDF/CSV separation, complete backup/restore/reload and mobile dialogs');
  await context.close();
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
