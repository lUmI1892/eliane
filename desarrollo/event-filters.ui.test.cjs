const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const out=path.join(__dirname,'verification','event-filters');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.join(__dirname,'inventario-elianne.verificado.html')).href);await page.waitForFunction(()=>window.Elianne?.isReady());
  const currentMonth=await page.evaluate(()=>window.Elianne.today().slice(0,7));
  await page.evaluate(async()=>{
   const api=window.Elianne,data=api.backup();
   const event=(id,client,day,hallIds,status='reservado',extra={})=>({id,client,eventDate:day,venueEndDate:day,date:day,returnDate:day,hallIds,status,items:[],responsible:'Lorena',type:'Boda',...extra});
   data.events=[
    event('current','Evento de este mes',api.today(),['hall-3']),
    event('first','Boda Ana','2030-10-01',['hall-1']),
    event('last','Boda compartida','2030-10-31',['hall-1','hall-2']),
    event('quote','Boda Sofia','2030-10-15',['hall-2'],'cotizacion'),
    event('third','Graduacion Lucia','2030-10-20',['hall-3']),
    event('unknown','Evento anterior sin salon','2030-10-12',[]),
    event('previous','Mes anterior','2030-09-30',['hall-1']),
    event('next','Mes siguiente','2030-11-01',['hall-2']),
    event('material','Material de octubre, evento noviembre','2030-11-07',['hall-3'],'reservado',{date:'2030-10-31',returnDate:'2030-11-08'})
   ];await api.restore(api.prepareRestore(data));
  });
  const before=await page.evaluate(()=>JSON.stringify(window.Elianne.get().events));
  const ids=()=>page.locator('#salonEventList [data-event-entry]').evaluateAll(nodes=>nodes.map(el=>el.dataset.eventEntry));
  await page.locator('[data-tab="events"]').click();assert.equal(await page.locator('#salonEventMonth').inputValue(),currentMonth);assert.deepEqual(await ids(),['current']);
  await page.locator('#salonEventMonth').fill('2030-10');assert.deepEqual(await ids(),['first','unknown','quote','third','last']);assert.ok((await page.locator('#salonEventSelection').innerText()).startsWith('5 eventos'));
  await page.locator('#salonEventHall').selectOption('hall-1');assert.deepEqual(await ids(),['first','last']);
  await page.locator('#salonEventHall').selectOption('hall-2');assert.deepEqual(await ids(),['quote','last']);
  await page.locator('#salonEventFilter').selectOption('cotizacion');assert.deepEqual(await ids(),['quote']);
  await page.locator('#salonEventSearch').fill('  SOFIA  ');assert.deepEqual(await ids(),['quote']);
  await page.locator('#salonEventSearch').fill('Ana');assert.deepEqual(await ids(),[]);assert.ok((await page.locator('#salonEventSelection').innerText()).startsWith('0 eventos'));
  await page.locator('#salonEventSearch').fill('');await page.locator('#salonEventFilter').selectOption('');
  await page.locator('#salonEventHall').selectOption('unassigned');assert.deepEqual(await ids(),['unknown']);
  await page.locator('#salonEventHall').selectOption('hall-3');assert.deepEqual(await ids(),['third']);
  await page.locator('#salonEventMonth').fill('2030-11');assert.deepEqual(await ids(),['material']);
  await page.locator('#salonEventMonth').fill('2030-10');
  await page.evaluate(async()=>{const halls=window.Elianne.get().halls;halls[2].name='Elianne Jardin';await window.Elianne.saveHalls(halls);});
  assert.equal(await page.locator('#salonEventMonth').inputValue(),'2030-10');assert.equal(await page.locator('#salonEventHall').inputValue(),'hall-3');assert.deepEqual(await ids(),['third']);assert.ok((await page.locator('#salonEventSelection').innerText()).includes('Elianne Jardin'));
  assert.equal(await page.evaluate(()=>JSON.stringify(window.Elianne.get().events)),before);
  await page.locator('#salonEventMonth').fill('');await page.locator('#salonEventMonth').dispatchEvent('change');assert.equal(await page.locator('#salonEventMonth').inputValue(),currentMonth);assert.deepEqual(await ids(),['current']);
  console.log('PASS: current-month default, month boundaries, event date rather than material date, combined halls, unassigned, search/status intersection, empty state, room rename and no record mutations');
  await page.locator('#salonEventMonth').fill('2030-10');await page.locator('#salonEventHall').selectOption('');
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const bounds=await page.locator('.event-list-filters').evaluate(el=>{
    const r=el.getBoundingClientRect();return [...el.querySelectorAll('input,select,label')].map(node=>{const b=node.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1&&node.scrollWidth<=node.clientWidth+1;});
   });assert.ok(bounds.every(Boolean));
   await page.locator('#salon-events .salon-event-column').screenshot({path:path.join(out,`events-${width}.png`)});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-event-entry="first"] [data-action="edit"]').click();await page.locator('#salonGuests').fill('350');await page.locator('#salonRecordedBy').fill('Ana');await page.locator('#salonEventForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());
  assert.equal(await page.evaluate(()=>window.Elianne.get().events.find(e=>e.id==='first').guestCount),350);assert.equal(await page.locator('[data-event-entry="first"]').count(),1);
  await page.locator('[data-tab="calendar"]').click();await page.locator('#calendarMonth').fill('2030-12');await page.locator('[data-calendar-date="2030-12-08"]').click();await page.locator('#calendarNewDay').click();assert.equal(await page.locator('#salonEventMonth').inputValue(),'2030-12');
  await page.locator('#salonClient').fill('Nuevo evento diciembre');await page.locator('#salonResp').fill('Lorena');await page.locator('input[name="eventHall"][value="hall-1"]').check();await page.locator('#salonEventForm button[type="submit"]').click();await page.waitForFunction(()=>!window.Elianne.saving());
  assert.ok((await page.locator('#salonEventList').innerText()).includes('Nuevo evento diciembre'));assert.equal(await page.locator('#salonEventList [data-event-entry]').count(),1);
  assert.deepEqual(errors,[]);await context.close();console.log('PASS: desktop/mobile filter layout, existing-event edit and creating from calendar follow the event month');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
