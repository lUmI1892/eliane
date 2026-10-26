const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const root=__dirname,out=path.join(root,'verification');fs.mkdirSync(out,{recursive:true});
const url=pathToFileURL(path.join(root,'inventario-elianne.verificado.html')).href;
function seed({full=false,archiveFailure=false}){
  if(sessionStorage.getItem('storage-fixture'))return;
  sessionStorage.setItem('storage-fixture','1');localStorage.clear();
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(400,300);let random=7;
  for(let i=0;i<pixels.data.length;i+=4){random=(random*1664525+1013904223)>>>0;pixels.data[i]=random&255;pixels.data[i+1]=(random>>>8)&255;pixels.data[i+2]=(random>>>16)&255;pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);const photo=canvas.toDataURL('image/jpeg',.9);
  const items=[0,1].map(i=>({id:'p'+i,name:'Producto '+i,qty:100,photo,code:'P'+i,updatedAt:1}));
  const event={id:'event',client:'Reserva original',date:'2030-11-15',eventDate:'2030-11-15',returnDate:'2030-11-15',hallIds:['hall-2'],status:'reservado',responsible:'Lorena',items:[{productId:'p0',qty:5,returned:0,damaged:0,missing:0}]};
  const data={schemaVersion:3,revision:7,items,events:[event],extras:{p0:{status:'disponible',cost:12.5,minQty:3}},movements:[]};
  localStorage.setItem('elianneInventory.v1',JSON.stringify(items.slice(0,1)));
  localStorage.setItem('elianneSalonEvents.v1','[]');localStorage.setItem('elianneSalonExtras.v1','{}');
  const raw=JSON.stringify(data);localStorage.setItem('elianneSalon.v3',raw);
  window.__storageFixture={raw,photo};
  if(full){for(let i=0;i<150;i++){try{localStorage.setItem('unrelated-padding-'+i,'x'.repeat(65536));}catch{break;}}}
  if(archiveFailure){const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='legacy')throw new DOMException('Simulated migration failure','QuotaExceededError');return put.apply(this,args);};}
}
async function record(page,store='state',key='main'){
  return page.evaluate(({store,key})=>new Promise((resolve,reject)=>{const req=indexedDB.open('elianneSalonData',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction(store,'readonly'),get=tx.objectStore(store).get(key);let value;get.onsuccess=()=>value=get.result;tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=()=>{db.close();reject(tx.error);};};}),{store,key});
}
async function ready(page){await page.waitForFunction(()=>window.Elianne?.isReady());await page.locator('[data-tab="calendar"]').waitFor();}
async function main(){
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    // Reproduce the user's error with the actual previous program, in an isolated profile.
    const oldContext=await browser.newContext();await oldContext.addInitScript(seed,{full:true});const old=await oldContext.newPage();
    await old.goto(pathToFileURL(path.join(root,'storage-baseline.html')).href);
    const previous=await old.evaluate(()=>{try{window.Elianne.upsertProduct({id:'attempt',name:'Intento',qty:1,photo:window.Elianne.get().items[0].photo});return 'saved';}catch(e){return e.message;}});
    assert.ok(previous.includes('almacenamiento esta lleno o bloqueado'),'Unexpected baseline result: '+previous);await oldContext.close();
    console.log('PASS: original localStorage quota failure reproduced with previous installed version');

    const context=await browser.newContext({acceptDownloads:true});await context.addInitScript(seed,{full:true});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await ready(page);
    assert.equal(await page.evaluate(()=>window.Elianne.blocked()),'');
    assert.equal(await page.evaluate(()=>window.Elianne.get().items.length),2);
    assert.equal(await page.evaluate(()=>window.Elianne.get().events[0].client),'Reserva original');
    assert.equal(await page.evaluate(()=>window.Elianne.get().extras.p0.cost),12.5);
    assert.equal(await page.evaluate(()=>window.Elianne.get().items[0].photo===window.__storageFixture.photo),true);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('elianneSalon.v3')).backend),'indexeddb');
    assert.equal(await page.evaluate(()=>localStorage.getItem('elianneInventory.v1')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-padding-0').length),65536);
    const archive=await record(page,'legacy','elianneSalon.v3');assert.equal(archive.raw,await page.evaluate(()=>window.__storageFixture.raw));
    await page.evaluate(()=>window.Elianne.upsertProduct({id:'new',name:'Guardado con cuota llena',qty:3,photo:window.Elianne.get().items[0].photo}));
    assert.equal(await page.evaluate(()=>window.Elianne.get().items.length),3);
    await page.reload();await ready(page);assert.equal(await page.evaluate(()=>window.Elianne.get().items.length),3);
    console.log('PASS: full quota migration preserves latest records/photos/events/costs, archives originals, keeps unrelated keys and saves after reload');

    const bytes=await page.evaluate(async()=>{
      const d=window.Elianne.backup(),photo=d.items[0].photo,count=Math.ceil(6*1024*1024/photo.length);
      for(let i=0;i<count;i++)d.items.push({id:'bulk'+i,name:'Foto adicional '+i,qty:1,code:'BULK'+i,photo});
      await window.Elianne.restore(window.Elianne.prepareRestore(d));return JSON.stringify(window.Elianne.backup()).length;
    });
    assert.ok(bytes>6*1024*1024);
    await page.reload();await ready(page);
    assert.ok(await page.evaluate(()=>JSON.stringify(window.Elianne.backup()).length)>6*1024*1024);
    await page.locator('[data-tab="inventory"]').click();await page.waitForFunction(()=>document.querySelector('.thumb')?.naturalWidth===400);
    const download=page.waitForEvent('download');await page.locator('#backupBtn').click();const backup=await download;await backup.saveAs(path.join(out,'storage-large-backup.json'));
    const saved=JSON.parse(fs.readFileSync(path.join(out,'storage-large-backup.json'),'utf8'));assert.ok(saved.items.length>30);assert.equal(saved.events[0].hallIds[0],'hall-2');
    assert.deepEqual(errors,[]);await context.close();
    console.log('PASS: document larger than 6 MiB persists, photos decode after reload, full backup includes halls and original reservations');

    const small=await browser.newContext(),p=await small.newPage();await p.goto(url);await ready(p);await p.locator('[data-tab="inventory"]').click();
    await p.evaluate(()=>{window.__write=window.ElianneStorage.write;window.ElianneStorage.write=()=>Promise.reject(new DOMException('Simulated quota','QuotaExceededError'));});
    await p.locator('#nameInput').fill('Formulario conservado');await p.locator('#qtyInput').fill('3');await p.locator('#codeInput').fill('KEEP');
    const upload=await p.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;canvas.getContext('2d').fillRect(0,0,24,24);return canvas.toDataURL('image/png').split(',')[1];});
    await p.locator('#photoInput').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:Buffer.from(upload,'base64')});await p.waitForFunction(()=>document.querySelector('#photoPreview').getAttribute('src')?.startsWith('data:image/jpeg'));
    const pendingPhoto=await p.locator('#photoPreview').getAttribute('src');
    await p.locator('#productForm button[type="submit"]').click();await p.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await p.locator('#nameInput').inputValue(),'Formulario conservado');assert.equal(await p.evaluate(()=>window.Elianne.get().items.length),0);assert.ok((await p.locator('#systemNotice').innerText()).includes('No hay espacio suficiente'));
    assert.equal(await p.locator('#photoPreview').getAttribute('src'),pendingPhoto);
    assert.equal((await record(p)).data.items.length,0);
    await p.locator('#systemNotice [aria-label="Cerrar aviso"]').click();assert.equal(await p.locator('#systemNotice').isVisible(),false);
    await p.evaluate(()=>window.ElianneStorage.write=window.__write);await p.locator('#productForm button[type="submit"]').click();await p.waitForFunction(()=>!window.Elianne.saving());assert.equal(await p.evaluate(()=>window.Elianne.get().items.length),1);
    await p.evaluate(()=>{window.__put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='state')throw new DOMException('Simulated abort','AbortError');return window.__put.apply(this,args);};});
    await p.locator('#nameInput').fill('No debe persistir');await p.locator('#qtyInput').fill('1');await p.locator('#codeInput').fill('ABORT');
    await p.locator('#productForm button[type="submit"]').click();await p.waitForFunction(()=>!window.Elianne.saving());
    assert.equal(await p.locator('#nameInput').inputValue(),'No debe persistir');assert.equal((await record(p)).data.items.length,1);assert.equal(await p.evaluate(()=>window.Elianne.get().items.length),1);
    await p.reload();await ready(p);assert.equal(await p.evaluate(()=>window.Elianne.get().items.length),1);
    const second=await small.newPage();await second.goto(url);await ready(second);
    await p.evaluate(()=>window.Elianne.adjust(window.Elianne.get().items[0].id,'compra',1,'Compra','Lorena'));
    const conflict=await second.evaluate(async()=>{try{await window.Elianne.adjust(window.Elianne.get().items[0].id,'compra',1,'Compra','Lorena');return 'saved';}catch(e){return e.message;}});
    assert.ok(conflict.includes('otra pestaña'));assert.equal((await record(p)).data.items[0].qty,4);await small.close();
    console.log('PASS: quota and transaction abort retain form/model/persisted state; retry succeeds; second tab cannot overwrite newer data');

    const broken=await browser.newContext();await broken.addInitScript(seed,{archiveFailure:true});const b=await broken.newPage();await b.goto(url);await ready(b);
    assert.ok(await b.evaluate(()=>window.Elianne.blocked()));
    assert.equal(await b.evaluate(()=>localStorage.getItem('elianneSalon.v3')===window.__storageFixture.raw),true);
    assert.ok(await b.evaluate(()=>localStorage.getItem('elianneInventory.v1')));assert.equal(await record(b),undefined);
    await b.reload();await ready(b);assert.equal(await b.evaluate(()=>window.Elianne.blocked()),'');assert.equal(await b.evaluate(()=>window.Elianne.get().items.length),2);await broken.close();
    console.log('PASS: failed migration rolls back atomically, does not delete originals, and retries successfully on reload');
    const denied=await browser.newContext();await denied.addInitScript(seed,{});await denied.addInitScript(()=>{indexedDB.open=()=>{throw new DOMException('Policy denied','SecurityError');};});const blocked=await denied.newPage();await blocked.goto(url);await ready(blocked);
    assert.ok((await blocked.evaluate(()=>window.Elianne.blocked())).includes('No se pudo abrir'));
    assert.equal(await blocked.evaluate(()=>localStorage.getItem('elianneSalon.v3')===window.__storageFixture.raw),true);assert.equal(await blocked.evaluate(()=>window.Elianne.backup().items.length),2);await denied.close();
    console.log('PASS: browser policy denial preserves old records and still permits a recovery backup');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
