const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=__dirname,out=path.join(root,'verification','event-detail');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];let accept=true;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept():d.dismiss());
  await page.goto(pathToFileURL(path.join(root,'inventario-elianne.verificado.html')).href);await page.waitForFunction(()=>window.Elianne?.isReady());
  await page.evaluate(async()=>{
   const api=window.Elianne,date=api.today();await api.upsertProduct({id:'p1',name:'Copas de cristal',qty:500,code:'CR-01',unit:'unidades',category:'Cristaleria',photo:''});
   const base={date,returnDate:date,eventDate:date,venueEndDate:date,status:'reservado',responsible:'Lorena',guestCount:300,type:'Boda',notes:'La novia quiere vajilla blanca.'};
   await api.saveEvent({...base,id:'e1',client:'Boda Maria',hallIds:['hall-1'],items:[{productId:'p1',qty:100,external:{qty:20,status:'pendiente',supplier:'Rosa',cost:150,deliveryDate:date,returnDate:date}}]});
   await api.saveEvent({...base,id:'e2',client:'Otro evento',hallIds:['hall-2'],items:[{productId:'p1',qty:100}]});
  });
  const date=await page.evaluate(()=>window.Elianne.today()),settle=()=>page.waitForFunction(()=>!window.Elianne.saving());
  const eventValue=()=>page.evaluate(()=>window.Elianne.get().events.find(e=>e.id==='e1'));
  await page.locator('#calendarHall').selectOption('hall-1');await page.locator('#calendarFilter').selectOption('occupied');
  await page.locator(`[data-detail-day="${date}"] [data-open-detail="e1"]`).click();
  assert.equal(await page.locator('#salon-event-detail').isVisible(),true);assert.equal(await page.locator('#detailTitle').innerText(),'Boda Maria');assert.ok((await page.locator('#detailMaterials').innerText()).includes('100'));assert.ok((await page.locator('#detailRentals').innerText()).includes('Rosa'));assert.ok((await page.locator('#detailPending').innerText()).includes('contratar 20'));
  assert.equal(await page.locator('#detailHistorySlot #historyForm').count(),1);assert.equal(await page.locator('#salonEventForm').count(),1);
  await page.screenshot({path:path.join(out,'detail-desktop.png'),fullPage:true});
  await page.locator('#detailEdit').click();assert.equal(await page.locator('#detailEditorHost #salonEventForm').count(),1);assert.equal(await page.locator('#salonClient').inputValue(),'Boda Maria');
  await page.locator('#salonClient').fill('Boda Maria y Jose');await page.locator('#salonGuests').fill('350');await page.locator('#salonRecordedBy').fill('Ana');await page.locator('#salonNotes').fill('Vajilla blanca. <img src=x onerror="window.detailInjected=true">');
  accept=false;await page.locator('#detailBack').click();assert.equal(await page.locator('#detailEditorHost').isVisible(),true);assert.equal(await page.locator('#salonClient').inputValue(),'Boda Maria y Jose');accept=true;
  await page.locator('[name="eventHall"][value="hall-1"]').uncheck();await page.locator('[name="eventHall"][value="hall-2"]').check();await page.locator('#salonEventForm button[type="submit"]').click();assert.ok((await page.locator('#systemNotice').innerText()).includes('ya esta reservado'));assert.equal((await eventValue()).client,'Boda Maria');
  await page.locator('[name="eventHall"][value="hall-2"]').uncheck();await page.locator('[name="eventHall"][value="hall-1"]').check();
  await page.evaluate(()=>{window.__detailWrite=window.ElianneStorage.write;window.ElianneStorage.write=()=>Promise.reject(new Error('Simulated write failure'));});
  await page.locator('#salonEventForm button[type="submit"]').click();await settle();assert.equal(await page.locator('#salonClient').inputValue(),'Boda Maria y Jose');assert.equal((await eventValue()).client,'Boda Maria');
  await page.evaluate(()=>window.ElianneStorage.write=window.__detailWrite);await page.locator('#salonEventForm button[type="submit"]').click();await settle();
  assert.equal(await page.locator('#detailEditorHost').isVisible(),false);assert.equal(await page.locator('#detailTitle').innerText(),'Boda Maria y Jose');assert.equal(await page.locator('#historyGuests').inputValue(),'350');assert.equal(await page.locator('#salon-events #salonEventForm').count(),1);
  assert.equal(await page.locator('#detailData img').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.detailInjected)),false);
  console.log('PASS: direct calendar entry, single shared editor, failed writes/conflicts keep inputs, save stays in the event');

  await page.locator('#historyGuests').fill('400');await page.locator('#historyBy').fill('Ana');await page.locator('#historyNote').fill('La novia confirmo 50 personas mas.');await page.locator('#historyForm button[type="submit"]').click();await settle();assert.ok((await page.locator('#historyTimeline').innerText()).includes('Se agregaron 50 personas.'));assert.ok((await page.locator('#detailMetrics').innerText()).includes('400'));
  await page.locator('#historyNote').fill('Nota pendiente');accept=false;await page.locator('#detailBack').click();assert.equal(await page.locator('#historyNote').inputValue(),'Nota pendiente');accept=true;await page.locator('#detailBack').click();assert.equal(await page.locator('#salon-calendar').isVisible(),true);assert.equal(await page.locator('#calendarHall').inputValue(),'hall-1');assert.equal(await page.locator('#calendarFilter').inputValue(),'occupied');assert.equal(await page.locator('#calendarMonth').inputValue(),date.slice(0,7));
  await page.locator(`[data-calendar-date="${date}"] .day-number`).click();await page.locator('#calendarDayEvents [data-action="view"]').click();assert.equal(await page.locator('#historyNote').inputValue(),'');
  await page.locator('#detailBack').click();assert.equal(await page.locator('[data-return-card="e1"]').count(),1);
  await page.locator('[data-tab="events"]').click();await page.locator('#salonClient').fill('Otro formulario sin guardar');await page.locator('[data-tab="calendar"]').click();await page.locator('#calendarDayEvents [data-action="view"]').click();assert.equal(await page.locator('#salonClient').inputValue(),'Otro formulario sin guardar');
  accept=false;await page.locator('#detailEdit').click();assert.equal(await page.locator('#detailEditorHost').isVisible(),false);assert.equal(await page.locator('#salonClient').inputValue(),'Otro formulario sin guardar');accept=true;await page.locator('#detailEdit').click();await page.locator('#salonClearEvent').click();assert.equal(await page.locator('#detailEditorHost').isVisible(),false);
  await page.locator('#detailReturnSlot [data-action="out"]').click();assert.ok((await page.locator('#systemNotice').innerText()).includes('Falta recibir'));
  await page.locator('#detailRentals [data-action="rentals"]').click();await page.locator('#rentalBy').fill('Ana');await page.locator('#rentalConfirm').click();await settle();await page.locator('#rentalReceive').click();await settle();await page.locator('#rentalClose').click();assert.ok((await page.locator('#detailRentals').innerText()).includes('Recibido'));
  await page.locator('#detailReturnSlot [data-action="out"]').click();await settle();assert.equal(await page.locator('#detailEdit').isVisible(),false);
  await page.locator('#detailReturnSlot [data-return="returned"]').fill('');await page.locator('#detailReturnSlot [data-return="returned"]').pressSequentially('75');assert.equal(await page.locator('#detailReturnSlot [data-return="returned"]').evaluate(el=>el===document.activeElement),true);
  await page.locator('#detailReturnSlot [data-return="damaged"]').fill('3');await page.locator('#detailReturnSlot [data-action="count"]').click();await settle();assert.equal(await page.locator('#detailReturnSlot [data-return="returned"]').inputValue(),'75');
  await page.locator('#detailReturnSlot [data-action="return"]').click();await settle();assert.equal((await eventValue()).status,'devuelto');assert.equal(await page.evaluate(()=>window.Elianne.get().items[0].qty),495);
  await page.locator('#detailReturnSlot [data-action="close"]').click();assert.ok((await page.locator('#systemNotice').innerText()).includes('alquileres pendientes'));
  await page.locator('#detailRentals [data-action="rentals"]').click();await page.locator('#rentalBy').fill('Ana');await page.locator('#rentalGood').fill('18');await page.locator('#rentalDamaged').fill('1');await page.locator('#rentalComplete').click();await settle();await page.locator('#rentalClose').click();await page.locator('#detailReturnSlot [data-action="close"]').click();await settle();assert.equal((await eventValue()).status,'cerrado');assert.equal(await page.locator('#detailReturnSlot [data-action="close"]').count(),0);assert.equal(await page.locator('#historyGuests').isDisabled(),true);
  console.log('PASS: inline guests/history, draft navigation guards, supplier workflow and own-stock return without leaving detail');

  const download=page.waitForEvent('download');await page.locator('#detailDocuments [data-action="pdf"]').click();await (await download).saveAs(path.join(out,'delivery.pdf'));
  const history=page.waitForEvent('download');await page.locator('#detailHistoryExport').click();await (await history).saveAs(path.join(out,'history.csv'));assert.ok(fs.readFileSync(path.join(out,'history.csv'),'utf8').includes('Se agregaron 50'));
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`detail-mobile-${width}.png`),fullPage:true});await page.locator('#detailBack').click();await page.locator(`[data-calendar-date="${date}"] .day-number`).click();await page.locator('#calendarDayEvents [data-action="view"]').click();assert.equal(await page.locator('#detailTitle').innerText(),'Boda Maria y Jose');}
  const ids=await page.locator('[id]').evaluateAll(nodes=>nodes.map(el=>el.id));assert.equal(new Set(ids).size,ids.length);assert.equal(await page.locator('#detailHistorySlot #historyForm').count(),1);assert.equal(await page.evaluate(()=>window.Elianne.get().events.find(e=>e.id==='e2').client),'Otro evento');
  await page.locator('#detailBack').click();assert.equal(await page.locator('#eventHistoryDialog #historyForm').count(),1);await page.locator('#calendarDayEvents [data-action="history"]').click();assert.equal(await page.locator('#eventHistoryDialog').isVisible(),true);await page.locator('[data-close-dialog="eventHistoryDialog"]').click();
  await page.locator('#calendarDayEvents [data-action="view"]').click();
  const backup=page.waitForEvent('download');await page.locator('#backupBtn').click();await (await backup).saveAs(path.join(out,'backup.json'));
  const previousBackup=page.waitForEvent('download');await page.locator('#restoreInput').setInputFiles(path.join(out,'backup.json'));await previousBackup;await settle();assert.equal(await page.locator('#salon-calendar').isVisible(),true);assert.equal(await page.locator('#eventHistoryDialog #historyForm').count(),1);assert.equal(await page.locator('#salon-events #salonEventForm').count(),1);
  await page.reload();await page.waitForFunction(()=>window.Elianne?.isReady());assert.equal((await eventValue()).guestCount,400);assert.equal((await eventValue()).items[0].external.status,'devuelto');assert.deepEqual(errors,[]);
  console.log('PASS: downloads, final-state locks, mobile re-entry, unique controls, restored original forms, isolated events and reload');
  await context.close();
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
