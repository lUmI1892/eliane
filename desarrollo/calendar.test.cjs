const { chromium } = require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root=__dirname, out=path.join(root,'verification');
fs.mkdirSync(out,{recursive:true});
async function main(){
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(pathToFileURL(path.join(root,'inventario-elianne.verificado.html')).href);
    await page.waitForFunction(()=>window.Elianne?.isReady());
    await page.evaluate(()=>{
      localStorage.clear();
      localStorage.setItem('elianneInventory.v1',JSON.stringify([{id:'p1',name:'Copas',qty:1000,unit:'unidades',code:'CR-01',photo:''}]));
      const event=(id,client,eventDate,status,date=eventDate,returnDate=eventDate)=>({id,client,eventDate,date,returnDate,status,hallIds:[id==='ongoing'?'hall-2':id==='done'?'hall-3':'hall-1'],type:'Boda',responsible:'Lorena',place:'Salon principal',items:[{productId:'p1',qty:10,returned:0,damaged:0,missing:0}]});
      localStorage.setItem('elianneSalonEvents.v1',JSON.stringify([
        event('quote','Cumpleaños Sofia','2026-10-20','cotizacion'),
        event('booked','Boda Camila y Diego','2026-10-22','reservado','2026-10-21','2026-10-23'),
        event('quote2','Evento por confirmar','2026-10-22','cotizacion'),
        event('ongoing','Graduacion San Jose','2026-10-24','en-evento','2026-10-23','2026-10-25'),
        event('done','Aniversario terminado','2026-10-26','cerrado','2026-10-26','2026-10-27'),
        event('cancel','Reserva cancelada','2026-10-28','cancelado')
      ]));
    });
    await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(window.ElianneStorage.name);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}));
    await page.reload();await page.locator('#calendarMonth').fill('2026-10');
    assert.equal(await page.locator('#salon-calendar').isVisible(),true);assert.equal(await page.locator('#salon-inventory').isVisible(),false);
    assert.ok((await page.locator('#salon-calendar').boundingBox()).y<260);
    assert.equal(await page.locator('[data-calendar-date="2026-10-22"]').getAttribute('class').then(x=>x.includes('has-booking')),true);
    await page.locator('[data-calendar-date="2026-10-22"] .day-number').click();
    assert.ok((await page.locator('#calendarDayEvents').innerText()).includes('Boda Camila y Diego'));
    assert.equal(await page.locator('#calendarDayEvents .salon-card').count(),2);
    assert.equal(await page.locator('[data-calendar-date="2026-10-23"] .calendar-event').count(),0,'Return/logistics dates must not occupy the event calendar');
    assert.equal(await page.locator('[data-calendar-date="2026-10-28"] .calendar-event').count(),0,'Cancelled events must not occupy the calendar');
    await page.locator('#calendarFilter').selectOption('occupied');assert.equal(await page.locator('#calendarDayEvents .salon-card').count(),1);
    await page.locator('#calendarFilter').selectOption('cotizacion');assert.ok((await page.locator('#calendarDayEvents').innerText()).includes('Evento por confirmar'));
    await page.locator('#calendarFilter').selectOption('');
    await page.locator('#calendarDayEvents [data-action="view"][data-event="booked"]').click();
    assert.equal(await page.locator('#salon-event-detail').isVisible(),true);assert.equal(await page.locator('#detailTitle').innerText(),'Boda Camila y Diego');
    await page.locator('[data-tab="calendar"]').click();await page.locator('#calendarDayEvents [data-action="edit"][data-event="booked"]').click();
    assert.equal(await page.locator('#salonEventDate').inputValue(),'2026-10-22');assert.equal(await page.locator('#salonDate').inputValue(),'2026-10-21');
    await page.locator('#salonClearEvent').click();await page.locator('[data-tab="calendar"]').click();
    await page.locator('[data-calendar-date="2026-10-27"] .day-number').click();await page.locator('#calendarNewDay').click();
    assert.equal(await page.locator('#salonEventDate').inputValue(),'2026-10-27');assert.equal(await page.locator('#salonEnd').inputValue(),'2026-10-27');
    await page.locator('#salonClient').fill('Boda nueva');await page.locator('#salonResp').fill('Lorena');await page.locator('#salonStatus').selectOption('reservado');
    await page.locator('input[name="eventHall"][value="hall-1"]').check();
    await page.locator('#salonEventForm button[type="submit"]').click();
    await page.waitForFunction(()=>!window.Elianne.saving());
    await page.locator('[data-tab="calendar"]').click();assert.ok((await page.locator('#calendarDayEvents').innerText()).includes('Boda nueva'));
    assert.equal(await page.locator('[data-calendar-date="2026-10-27"]').getAttribute('class').then(x=>x.includes('has-booking')),true);
    const snapshot=await page.evaluate(()=>window.Elianne.backup());
    await page.reload();await page.locator('#calendarMonth').fill('2026-10');await page.locator('[data-calendar-date="2026-10-27"] .day-number').click();
    assert.ok((await page.locator('#calendarDayEvents').innerText()).includes('Boda nueva'));
    assert.equal(await page.evaluate(()=>window.Elianne.get().events.length),snapshot.events.length);
    await page.locator('[data-tab="reports"]').click();
    const pending=page.waitForEvent('download');await page.locator('[data-report="csv"]').click();const csv=await pending;
    await csv.saveAs(path.join(out,'agenda-events.csv'));assert.ok(fs.readFileSync(path.join(out,'agenda-events.csv'),'utf8').includes('Boda nueva'));
    await page.locator('[data-tab="calendar"]').click();
    console.log('PASS: agenda first, migrated events, true event date, status filters, cancelled exclusion, event navigation, creation and persistence');
    await page.locator('#calendarMonth').fill('2028-02');assert.equal(await page.locator('[data-calendar-date="2028-02-29"]').count(),1);
    await page.locator('#calendarMonth').fill('2027-02');assert.equal(await page.locator('[data-calendar-date="2027-02-29"]').count(),0);
    await page.locator('#calendarMonth').fill('2030-12');await page.locator('#calendarNext').click();assert.equal(await page.locator('#calendarMonth').inputValue(),'2031-01');
    await page.locator('#calendarPrev').click();assert.equal(await page.locator('#calendarMonth').inputValue(),'2030-12');
    await page.locator('[data-calendar-date="2030-12-31"]').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#calendarMonth').inputValue(),'2031-01');assert.equal(await page.locator('[data-calendar-date="2031-01-01"]').getAttribute('aria-pressed'),'true');
    await page.locator('#calendarToday').click();assert.equal(await page.locator('#calendarMonth').inputValue(),await page.evaluate(()=>window.Elianne.today().slice(0,7)));
    console.log('PASS: leap year, month/year transitions, keyboard navigation and Today');
    await page.locator('#calendarMonth').fill('2026-10');await page.locator('[data-calendar-date="2026-10-22"] .day-number').click();
    await page.screenshot({path:path.join(out,'agenda-desktop.png'),fullPage:true});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});await page.locator('#calendarMonth').fill('2026-09');await page.locator('#calendarNext').click();await page.locator('[data-calendar-date="2026-10-22"] .day-number').click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
      const rects=await page.locator('#calendarDays .calendar-day').evaluateAll(days=>days.map(d=>d.getBoundingClientRect().toJSON()));
      assert.ok(rects.every(r=>r.width>30&&r.width<60));
      await page.screenshot({path:path.join(out,`agenda-mobile-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile calendar, no horizontal page overflow or runtime errors');
    await context.close();
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
