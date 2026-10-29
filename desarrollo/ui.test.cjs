const { chromium } = require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = __dirname;
const out = path.join(root, 'verification');
fs.mkdirSync(out, { recursive: true });
const url = pathToFileURL(path.join(root, 'inventario-elianne.verificado.html')).href;
async function main() {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(url);
    await page.waitForFunction(()=>window.Elianne?.isReady());
    const photo = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#b51735'; ctx.fillRect(0,0,80,60); ctx.fillStyle = '#fff'; ctx.fillRect(12,12,56,36);
      return canvas.toDataURL('image/jpeg');
    });
    const today = await page.evaluate(() => window.Elianne.today());
    await page.evaluate(({photo,today}) => {
      localStorage.clear();
      localStorage.setItem('elianneInventory.v1', JSON.stringify([{id:'p1',name:'Jarra bonita',qty:100,unit:'unidades',code:'0002',category:'Cristaleria',photo,updatedAt:1},{id:'p2',name:'Centro de mesa',qty:3,unit:'unidades',code:'001',category:'Decoracion',photo:'',updatedAt:1}]));
      localStorage.setItem('elianneSalonEvents.v1', JSON.stringify([{id:'e1',client:'Boda Maria',date:today,status:'en-evento',responsible:'Lorena',type:'Boda',items:[{productId:'p1',qty:100,returned:0,damaged:0,missing:0}]}]));
      localStorage.setItem('elianneSalonExtras.v1', JSON.stringify({p1:{status:'disponible',minQty:10,cost:15}}));
    }, {photo,today});
    await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(window.ElianneStorage.name);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);}));
    await page.reload();await page.waitForFunction(()=>window.Elianne?.isReady());
    assert.equal(await page.locator('#statProducts').innerText(), '2');
    await page.locator('[data-tab="returns"]').click();
    const good = page.locator('[data-return="returned"]'), damaged = page.locator('[data-return="damaged"]');
    await good.fill(''); await good.pressSequentially('95');
    assert.equal(await good.inputValue(),'95'); assert.equal(await good.evaluate(el=>el===document.activeElement),true);
    await damaged.fill('81');
    assert.equal(await page.locator('[data-action="return"]').isDisabled(), true);
    assert.equal(await page.locator('[data-missing]').innerText(), 'Revisar');
    await damaged.fill('3');
    assert.equal(await page.locator('[data-missing]').innerText(),'2');
    await page.locator('[data-action="count"]').click();
    await page.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await page.evaluate(()=>window.Elianne.get().items[0].qty),100);
    await page.reload(); await page.locator('[data-tab="returns"]').click();
    assert.equal(await good.inputValue(),'95'); assert.equal(await damaged.inputValue(),'3');
    await page.locator('[data-action="return"]').click();
    await page.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await page.evaluate(()=>window.Elianne.get().items[0].qty),95);
    assert.equal(await page.locator('[data-action="return"]').count(),0);
    await page.locator('[data-action="close"]').click();
    await page.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await page.evaluate(()=>window.Elianne.get().events[0].status),'cerrado');
    await page.reload(); assert.equal(await page.locator('#statUnits').innerText(),'98');
    console.log('PASS: migration, multi-digit focus, invalid count, partial persistence, final return and close');

    // Exercise real forms and their synchronization with the legacy inventory UI.
    await page.locator('[data-tab="inventory"]').click();
    await page.locator('#nameInput').fill('Plato de prueba'); await page.locator('#qtyInput').fill('10'); await page.locator('#codeInput').fill('VAJ-01');
    await page.locator('#productForm button[type="submit"]').click();
    await page.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await page.locator('#statProducts').innerText(),'3');
    await page.locator('[data-tab="movements"]').click();
    const plateId = await page.evaluate(()=>window.Elianne.get().items.find(p=>p.name==='Plato de prueba').id);
    await page.locator('#moveProduct').selectOption(plateId); await page.locator('#moveQty').fill('5'); await page.locator('#moveResp').fill('Lorena'); await page.locator('#moveReason').fill('Compra de prueba');
    await page.locator('#movementForm button[type="submit"]').click();
    await page.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await page.locator('#statUnits').innerText(),'113');
    assert.ok((await page.locator('#movementList').innerText()).includes('Compra de prueba'));

    await page.locator('[data-tab="events"]').click();
    async function createEvent(name, date, qty) {
      await page.locator('#salonClient').fill(name); await page.locator('#salonDate').fill(date); await page.locator('#salonEnd').fill(date);
      await page.locator('#salonResp').fill('Lorena'); await page.locator('#salonStatus').selectOption('reservado');
      await page.locator('input[name="eventHall"][value="hall-1"]').check();
      await page.locator('#salonProduct').selectOption('p1'); await page.locator('#salonQty').fill(qty); await page.locator('#salonAddItem').click();
      await page.locator('#salonEventForm button[type="submit"]').click();
      await page.waitForFunction(()=>!window.Elianne.saving());
    }
    await createEvent('Reserva A','2030-10-22','80');
    assert.ok((await page.locator('#salonEventList').innerText()).includes('Reserva A'));
    await createEvent('Reserva B','2030-10-23','80');
    assert.ok((await page.locator('#salonEventList').innerText()).includes('Reserva B'));
    await createEvent('Exceso','2030-10-22','20');
    assert.equal(await page.evaluate(()=>window.Elianne.get().events.some(e=>e.client==='Exceso')),false);
    assert.ok((await page.locator('#systemNotice').innerText()).includes('15 disponibles'));
    await page.locator('#salonClearEvent').click();
    console.log('PASS: product form, stock movements, dated bookings, overbooking prevention');

    async function download(selector,name) {
      const pending=page.waitForEvent('download');await page.locator(selector).click();const file=await pending;await file.saveAs(path.join(out,name));return fs.readFileSync(path.join(out,name));
    }
    const backupBytes=await download('#backupBtn','backup.json'), backup=JSON.parse(backupBytes);
    assert.equal(backup.schemaVersion,6); assert.equal(backup.items.length,3); assert.equal(backup.events.length,3);assert.equal(backup.extras.p1.cost,15);assert.ok(backup.movements.length>8);assert.equal(backup.items.find(p=>p.id==='p1').photo,photo);
    await page.locator('[data-tab="inventory"]').click();
    const xlsx=await download('#excelBtn','inventory.xlsx');assert.equal(xlsx.subarray(0,2).toString(),'PK');
    const pdf=await download('#pdfBtn','inventory.pdf');assert.equal(pdf.subarray(0,8).toString(),'%PDF-1.4');
    await page.locator('[data-tab="reports"]').click();
    const eventsPdf=await download('[data-report="events"]','events.pdf');assert.equal(eventsPdf.subarray(0,8).toString(),'%PDF-1.4');
    await download('[data-report="movements"]','movements.csv');
    const restoreDownload=page.waitForEvent('download');
    await page.locator('#restoreInput').setInputFiles(path.join(out,'backup.json'));await restoreDownload;
    await page.waitForFunction(()=>window.Elianne.get().movements[0].type==='restauracion');
    assert.equal(await page.evaluate(()=>window.Elianne.get().items.find(p=>p.id==='p1').qty),95);
    console.log('PASS: full backup and file restore, XLSX/PDF/CSV downloads');
    await page.locator('[data-tab="returns"]').click();
    await page.locator('.salon-module').screenshot({path:path.join(out,'desktop.png')});
    await page.setViewportSize({width:390,height:844});
    for(const tab of ['calendar','events','inventory','returns','settings','movements','alerts','reports']) {
      await page.locator(`[data-tab="${tab}"]`).click();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
      assert.equal(overflow,false,'Unexpected page overflow at mobile tab '+tab);
      await page.locator('.salon-module').screenshot({path:path.join(out,'mobile-'+tab+'.png')});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile all views, no page overflow, no runtime errors');
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
