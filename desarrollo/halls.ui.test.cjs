const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=__dirname,out=path.join(root,'verification');fs.mkdirSync(out,{recursive:true});
async function main(){
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(pathToFileURL(path.join(root,'inventario-elianne.verificado.html')).href);
    await page.waitForFunction(()=>window.Elianne?.isReady());
    await page.evaluate(()=>{
      localStorage.clear();localStorage.setItem('elianneSalonEvents.v1',JSON.stringify([{id:'legacy',client:'Boda anterior',eventDate:'2030-11-15',date:'2030-11-15',returnDate:'2030-11-15',status:'reservado',responsible:'Lorena',items:[]}]));
    });
    await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(window.ElianneStorage.name);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}));
    await page.reload();await page.locator('#calendarMonth').fill('2030-11');await page.locator('[data-calendar-date="2030-11-15"] .day-number').click();
    assert.ok((await page.locator('#calendarPending').innerText()).includes('sin salon asignado'));
    assert.equal(await page.locator('#calendarHallStatus .invalid').count(),4);
    await page.locator('#calendarDayEvents [data-action="assign"]').click();
    assert.equal(await page.locator('#assignDialog').isVisible(),true);assert.equal(await page.locator('#assignHours').isVisible(),false);
    await page.locator('input[name="assignHall"][value="hall-1"]').check();await page.locator('#assignForm button[type="submit"]').click();
    await page.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await page.locator('#assignDialog').isVisible(),false);assert.equal(await page.locator('#calendarPending').isVisible(),false);
    assert.equal(await page.evaluate(()=>window.Elianne.get().events[0].hallIds[0]),'hall-1');
    console.log('PASS: legacy reservation stays unassigned until explicitly assigned through the dialog');

    async function create(name,date,halls,clock){
      await page.locator('[data-tab="calendar"]').click();await page.locator('#calendarHall').selectOption('');
      await page.locator(`[data-calendar-date="${date}"] .day-number`).click();await page.locator('#calendarNewDay').click();
      await page.locator('#salonClient').fill(name);await page.locator('#salonResp').fill('Lorena');await page.locator('#salonStatus').selectOption('reservado');
      for(const hall of halls)await page.locator(`input[name="eventHall"][value="${hall}"]`).check();
      if(clock){
        await page.locator('input[name="eventMode"][value="hours"]').check();assert.equal(await page.locator('#eventHours').isVisible(),true);
        await page.locator('#eventStartTime').fill(clock.start);await page.locator('#eventEndTime').fill(clock.end);await page.locator('#eventCleanup').fill(String(clock.cleanup||0));
      }
      await page.locator('#salonEventForm button[type="submit"]').click();
      await page.waitForFunction(()=>!window.Elianne.saving());
    }
    await page.locator('#calendarHall').selectOption('hall-2');await page.locator('#calendarNewDay').click();
    assert.equal(await page.locator('input[name="eventHall"][value="hall-2"]').isChecked(),true);
    await page.locator('#salonClient').fill('Cumpleaños Elianne 2');await page.locator('#salonResp').fill('Lorena');await page.locator('#salonStatus').selectOption('reservado');await page.locator('#salonEventForm button[type="submit"]').click();
    await page.waitForFunction(()=>!window.Elianne.saving());
    await create('Otra reserva','2030-11-15',['hall-2']);
    assert.ok((await page.locator('#systemNotice').innerText()).includes('Elianne 2 ya esta reservado'));
    assert.equal(await page.evaluate(()=>window.Elianne.get().events.length),2);
    await page.locator('input[name="eventHall"][value="hall-2"]').uncheck();await page.locator('input[name="eventHall"][value="hall-3"]').check();
    await page.locator('#salonEventForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());assert.equal(await page.evaluate(()=>window.Elianne.get().events.length),3);
    await page.locator('[data-tab="calendar"]').click();await page.locator('#calendarHall').selectOption('hall-3');
    assert.equal(await page.locator('#calendarDayEvents .salon-card').count(),1);assert.ok((await page.locator('#calendarDayEvents').innerText()).includes('Otra reserva'));
    await create('Evento dos salones','2030-11-16',['hall-1','hall-3']);
    assert.equal(await page.evaluate(()=>window.Elianne.get().events.find(e=>e.client==='Evento dos salones').hallIds.length),2);
    await create('Evento mañana','2030-11-18',['hall-1'],{start:'10:00',end:'12:00',cleanup:60});
    await create('Horario en cruce','2030-11-18',['hall-1'],{start:'12:30',end:'14:00'});
    assert.ok((await page.locator('#systemNotice').innerText()).includes('montaje y limpieza'));
    assert.equal(await page.locator('#salonClient').inputValue(),'Horario en cruce');
    await page.locator('#eventStartTime').fill('13:00');await page.locator('#salonEventForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await page.evaluate(()=>window.Elianne.get().events.length),6);
    console.log('PASS: three independent halls, automatic hall selection, conflict errors retain form, combined halls and timed cleanup');

    await page.locator('[data-tab="calendar"]').click();await page.locator('#hallConfigOpen').click();
    assert.equal(await page.locator('#name-hall-1').inputValue(),'Elianne 1');
    await page.locator('#name-hall-1').fill('Elianne 2');await page.locator('#hallConfigForm button[type="submit"]').click();
    assert.ok((await page.locator('#hallConfigError').innerText()).includes('repetirse'));assert.equal(await page.locator('#hallConfigDialog').isVisible(),true);
    await page.locator('#name-hall-1').fill('Elianne Principal');await page.locator('#hallConfigForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await page.locator('#hallConfigDialog').isVisible(),false);assert.ok((await page.locator('#calendarHallLegend').innerText()).includes('Elianne Principal'));
    const backup=page.waitForEvent('download');await page.locator('#backupBtn').click();const file=await backup;await file.saveAs(path.join(out,'halls-backup.json'));
    const saved=JSON.parse(fs.readFileSync(path.join(out,'halls-backup.json'),'utf8'));assert.equal(saved.halls[0].name,'Elianne Principal');assert.ok(saved.events.some(e=>e.hallIds.length===2));
    await page.reload();await page.locator('#calendarMonth').fill('2030-11');await page.locator('[data-calendar-date="2030-11-15"] .day-number').click();
    assert.ok((await page.locator('#calendarDayEvents').innerText()).includes('Elianne Principal'));
    assert.equal(await page.locator('#calendarHallStatus .hall-busy').count(),3);
    await page.screenshot({path:path.join(out,'halls-desktop.png'),fullPage:true});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(out,`halls-mobile-${width}.png`),fullPage:true});
      await page.locator('#calendarDayEvents [data-action="assign"]').first().click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const box=await page.locator('#assignDialog').boundingBox();assert.ok(box.width<=width);
      await page.locator('[data-close-dialog="assignDialog"]').click();
    }
    assert.deepEqual(errors,[]);console.log('PASS: editable names, backup and reload preserve hall assignments, desktop/mobile and dialogs have no overflow or runtime errors');
    await context.close();
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
