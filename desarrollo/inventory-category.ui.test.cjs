const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const out=path.join(__dirname,'verification','inventory-category');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(pathToFileURL(path.join(__dirname,'inventario-elianne.verificado.html')).href);await page.waitForFunction(()=>window.Elianne?.isReady());
  await page.evaluate(async()=>{const api=window.Elianne,data=api.backup();data.items=[{id:'p1',name:'Plato blanco',qty:10,category:'platos',photo:''},{id:'p2',name:'Plato antiguo',qty:10,category:'PLATOS',photo:''},{id:'p3',name:'Jarra de cristal',qty:10,category:'jarras',photo:''}];await api.restore(api.prepareRestore(data));});
  await page.locator('[data-tab="inventory"]').click();const select=page.locator('#categoryInput'),options=()=>select.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
  assert.equal(await select.evaluate(el=>el.tagName),'SELECT');assert.equal(await select.getAttribute('list'),null);const before=await options();assert.ok(before.includes('platos')&&before.includes('jarras')&&before.includes('Vajilla'));
  await select.selectOption('platos');assert.deepEqual(await options(),before);await select.selectOption('jarras');assert.deepEqual(await options(),before);await select.selectOption('platos');
  await page.locator('#nameInput').fill('Plato nuevo');await page.locator('#qtyInput').fill('5');await page.locator('#productForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());assert.equal(await select.inputValue(),'');assert.deepEqual(await options(),before);await select.selectOption('platos');await select.selectOption('jarras');
  await page.locator('#inventoryCategoryAdd').click();assert.equal(await page.locator('#newCategoryName').inputValue(),'');await page.locator('#newCategoryName').fill('Cubiertos premium');await page.locator('#newCategoryForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());assert.equal(await select.inputValue(),'Cubiertos premium');assert.ok((await options()).includes('platos'));assert.ok((await options()).includes('jarras'));
  await page.locator('[data-edit="p2"]').click();assert.equal(await select.inputValue(),'platos');await select.selectOption('jarras');await page.locator('#productForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());assert.equal(await page.evaluate(()=>window.Elianne.get().items.find(p=>p.id==='p2').category),'jarras');
  await page.locator('[data-edit="p2"]').click();assert.equal(await select.inputValue(),'jarras');await page.locator('#nameInput').fill('Nombre todavia sin guardar');await page.evaluate(async()=>window.Elianne.addCategory('Centros nuevos'));assert.equal(await select.inputValue(),'jarras');assert.equal(await page.locator('#nameInput').inputValue(),'Nombre todavia sin guardar');assert.ok((await options()).includes('Centros nuevos'));
  for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('.category-entry').screenshot({path:path.join(out,`selector-${width}.png`)});}
  await page.reload();await page.locator('[data-tab="inventory"]').click();await select.selectOption('platos');assert.ok((await options()).includes('jarras')&&(await options()).includes('Cubiertos premium'));await select.selectOption('jarras');assert.ok((await options()).includes('platos'));
  assert.deepEqual(errors,[]);await context.close();console.log('PASS: platos never filters out other inventory choices, create/save/reselect, new categories, legacy case labels, edit preservation, registry refresh, desktop/mobile and reload');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
