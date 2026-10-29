const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=__dirname,out=path.join(root,'verification');fs.mkdirSync(out,{recursive:true});
const settle=page=>page.waitForFunction(()=>!window.Elianne.saving());
async function main(){
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(pathToFileURL(path.join(root,'inventario-elianne.verificado.html')).href);await page.waitForFunction(()=>window.Elianne?.isReady());
    await page.locator('#calendarMonth').fill('2030-10');await page.locator('#calendarHall').selectOption('hall-1');await page.locator('[data-calendar-date="2030-10-31"]').click();await page.locator('#calendarNewDay').click();
    await page.locator('#salonClient').fill('Boda Maria');await page.locator('#salonGuests').fill('300');await page.locator('#salonResp').fill('Lorena');await page.locator('#salonStatus').selectOption('reservado');await page.locator('#salonEventForm button[type="submit"]').click();await settle(page);
    const eventId=await page.evaluate(()=>window.Elianne.get().events[0].id);
    await page.locator('[data-tab="calendar"]').click();assert.ok((await page.locator('#calendarDayEvents').innerText()).includes('Invitados: 300'));
    await page.locator('#calendarDayEvents [data-action="history"]').click();
    assert.ok((await page.locator('#historySummary').innerText()).includes('Invitados: 300'));assert.ok((await page.locator('#historyTimeline').innerText()).includes('Invitados: 300'));
    await page.locator('#historyGuests').fill('350');await page.locator('#historyBy').fill('Ana');await page.locator('#historyNote').fill('La novia confirmo 50 personas mas.');await page.locator('#historyForm button[type="submit"]').click();await settle(page);
    assert.equal(await page.locator('#eventHistoryDialog').isVisible(),true);assert.ok((await page.locator('#historyTimeline').innerText()).includes('Invitados: de 300 a 350. Se agregaron 50 personas.'));assert.ok((await page.locator('#historyTimeline').innerText()).includes('Responsable registrado: Ana'));assert.equal(await page.locator('#historyGuests').inputValue(),'350');
    await page.screenshot({path:path.join(out,'event-history-desktop.png')});
    const entryCount=await page.locator('#historyTimeline .history-entry').count();
    await page.locator('#historyForm button[type="submit"]').click();assert.ok((await page.locator('#historyMessage').innerText()).includes('No hay cambios'));assert.equal(await page.locator('#historyTimeline .history-entry').count(),entryCount);
    await page.locator('#historyNote').fill('Confirmado por WhatsApp.');await page.locator('#historyForm button[type="submit"]').click();await settle(page);
    assert.equal(await page.locator('#historyTimeline .history-entry').count(),entryCount+1);assert.equal(await page.evaluate(id=>window.Elianne.eventHistory(id).filter(m=>m.type==='evento-invitados').length,eventId),1);
    await page.locator('#historyGuests').fill('325');await page.locator('#historyBy').fill('Rosa');await page.locator('#historyForm button[type="submit"]').click();await settle(page);
    assert.ok((await page.locator('#historyTimeline').innerText()).includes('Se redujeron 25 personas.'));assert.ok((await page.locator('#historyTimeline').innerText()).includes('Se agregaron 50 personas.'));
    console.log('PASS: 300 to 350 message, author, client note, unchanged-save protection and decreases keep prior history');

    await page.evaluate(()=>{window.__historyWrite=window.ElianneStorage.write;window.ElianneStorage.write=()=>Promise.reject(new Error('Simulated write failure'));});
    await page.locator('#historyGuests').fill('375');await page.locator('#historyBy').fill('Ana');await page.locator('#historyNote').fill('Solicitud pendiente');await page.locator('#historyForm button[type="submit"]').click();await settle(page);
    assert.equal(await page.locator('#historyGuests').inputValue(),'375');assert.equal(await page.locator('#historyNote').inputValue(),'Solicitud pendiente');assert.ok((await page.locator('#historyMessage').innerText()).includes('No se pudo confirmar'));assert.equal(await page.evaluate(()=>window.Elianne.get().events[0].guestCount),325);
    assert.equal(await page.evaluate(id=>window.Elianne.eventHistory(id).some(m=>m.detail.includes('de 325 a 375')),eventId),false);
    await page.evaluate(()=>window.ElianneStorage.write=window.__historyWrite);await page.locator('#historyForm button[type="submit"]').click();await settle(page);assert.equal(await page.evaluate(()=>window.Elianne.get().events[0].guestCount),375);
    const download=page.waitForEvent('download');await page.locator('#historyExport').click();const file=await download;await file.saveAs(path.join(out,'event-history.csv'));const csv=fs.readFileSync(path.join(out,'event-history.csv'),'utf8');assert.ok(csv.includes('Se agregaron 50 personas.'));assert.ok(csv.includes('Ana'));assert.ok(csv.includes('Rosa'));
    assert.ok(await page.locator('#historyTimeline time').evaluateAll(times=>times.every(t=>Number.isFinite(Date.parse(t.dateTime)))));
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});const box=await page.locator('#eventHistoryDialog').boundingBox();assert.ok(box.width<=width);assert.equal(await page.locator('#eventHistoryDialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.screenshot({path:path.join(out,`event-history-mobile-${width}.png`)});
    }
    await page.locator('[data-close-dialog="eventHistoryDialog"]').click();await page.setViewportSize({width:1440,height:1000});
    await page.locator('[data-tab="events"]').click();await page.locator(`[data-event-entry="${eventId}"] [data-action="edit"]`).click();
    assert.equal(await page.locator('#salonGuests').inputValue(),'375');assert.equal(await page.locator('#salonRecordedBy').getAttribute('required'),'');
    await page.locator('#salonGuests').fill('400');await page.locator('#salonRecordedBy').fill('Claudia');await page.locator('#salonChangeNote').fill('Cliente confirma 400 invitados.');await page.locator('#salonEventForm button[type="submit"]').click();await settle(page);
    assert.equal(await page.evaluate(()=>window.Elianne.get().events[0].guestCount),400);
    await page.locator(`[data-event-entry="${eventId}"] [data-action="history"]`).click();assert.ok((await page.locator('#historyTimeline').innerText()).includes('de 375 a 400'));assert.ok((await page.locator('#historyTimeline').innerText()).includes('Claudia'));await page.locator('[data-close-dialog="eventHistoryDialog"]').click();
    console.log('PASS: failed persistence retains inputs without ghost entries; retry, CSV, mobile layout and ordinary edit all preserve the journal');

    await page.evaluate(async()=>{const e=window.Elianne.get().events[0];await window.Elianne.saveEvent({...e,id:'other-event',client:'Otra boda',hallIds:['hall-2'],guestCount:100});});
    await page.locator('[data-event-entry="other-event"] [data-action="history"]').click();assert.equal(await page.locator('#historyTimeline .history-entry').count(),1);assert.equal((await page.locator('#historyTimeline').innerText()).includes('50 personas'),false);await page.locator('[data-close-dialog="eventHistoryDialog"]').click();
    const backupDownload=page.waitForEvent('download');await page.locator('#backupBtn').click();const backup=await backupDownload;await backup.saveAs(path.join(out,'event-history-backup.json'));const saved=JSON.parse(fs.readFileSync(path.join(out,'event-history-backup.json'),'utf8'));assert.equal(saved.events.find(e=>e.id===eventId).guestCount,400);
    const before=await page.evaluate(id=>window.Elianne.eventHistory(id).length,eventId),preRestoreBackup=page.waitForEvent('download');await page.locator('#restoreInput').setInputFiles(path.join(out,'event-history-backup.json'));await preRestoreBackup;await page.waitForFunction(()=>!window.Elianne.saving()&&window.Elianne.get().movements[0].type==='restauracion');
    await page.reload();await page.locator('[data-tab="events"]').click();await page.locator('#salonEventMonth').fill('2030-10');await page.locator(`[data-event-entry="${eventId}"] [data-action="history"]`).click();assert.equal(await page.locator('#historyTimeline .history-entry').count(),before);assert.ok((await page.locator('#historyTimeline').innerText()).includes('de 300 a 350'));
    await page.locator('#historyBy').fill('Ana');await page.locator('#historyNote').fill('<img src=x onerror="window.historyInjected=true">');await page.locator('#historyForm button[type="submit"]').click();await settle(page);assert.equal(await page.locator('#historyTimeline img').count(),0);assert.equal(await page.evaluate(()=>Boolean(window.historyInjected)),false);
    assert.deepEqual(errors,[]);console.log('PASS: history is event-specific, survives full file restore and reload, and escapes client note HTML');
    await context.close();
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
