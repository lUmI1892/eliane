const {chromium}=require('C:/Users/Marketing/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=__dirname,out=path.join(root,'verification','calendar-colors');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'inventario-elianne.verificado.html')).href);await page.waitForFunction(()=>window.Elianne?.isReady());
  await page.evaluate(async()=>{
   const api=window.Elianne;
   const event=(id,client,day,hallIds,extra={})=>({id,client,date:day,returnDate:day,eventDate:day,venueEndDate:day,hallIds,status:'reservado',responsible:'Lorena',type:'Boda',items:[],...extra});
   for(let n=1;n<=3;n++)await api.saveEvent(event('same-'+n,['','Boda Maria','Graduacion Sofia','Evento corporativo'][n],'2030-11-13',['hall-'+n]));
   await api.saveEvent(event('combined','Boda de dos salones','2030-11-14',['hall-1','hall-3']));
   await api.saveEvent(event('quote','Cotizacion pendiente','2030-11-15',['hall-2'],{status:'cotizacion'}));
   await api.saveEvent(event('cancel','Evento cancelado','2030-11-16',['hall-3']));await api.transition('cancel','cancelado');
   await api.saveEvent(event('mixed-quote','Consulta por confirmar','2030-11-18',['hall-2'],{status:'cotizacion'}));
   await api.saveEvent(event('mixed-booked','Reserva confirmada','2030-11-18',['hall-2']));
   await api.saveEvent(event('overnight','Evento con montaje previo','2030-11-20',['hall-3'],{venueMode:'hours',startTime:'00:30',endTime:'02:00',venueEndDate:'2030-11-21',setupMinutes:60}));
   const backup=api.backup();backup.events.push(event('unknown','Evento anterior sin salon','2030-11-17',[]));await api.restore(api.prepareRestore(backup));
  });
  const eventsBefore=await page.evaluate(()=>JSON.stringify(window.Elianne.get().events));
  await page.locator('#calendarMonth').fill('2030-11');
  const day=value=>page.locator(`[data-calendar-date="2030-11-${value}"]`);
  const colors={'hall-1':'rgb(211, 47, 47)','hall-2':'rgb(22, 128, 60)','hall-3':'rgb(37, 99, 235)'};
  async function checkColors(){
   for(const [id,color] of Object.entries(colors)){
    const marker=day('13').locator(`[data-hall-marker="${id}"]`);assert.equal(await marker.isVisible(),true);assert.equal(await marker.evaluate(el=>getComputedStyle(el).backgroundColor),color);assert.equal(await marker.getAttribute('data-marker-state'),'booked');assert.equal(await marker.innerText(),id.slice(-1));
    assert.equal(await page.locator(`[data-hall-legend="${id}"]`).evaluate(el=>getComputedStyle(el).backgroundColor),color);
   }
  }
  await checkColors();assert.equal(await page.locator('[data-detail-day="2030-11-13"] .calendar-event').count(),2);assert.equal(await day('13').locator('[data-hall-marker]').count(),3);
  assert.equal(await day('14').locator('[data-hall-marker]').count(),2);assert.equal(await page.locator('[data-open-detail="combined"] [data-chip-hall]').count(),2);assert.equal(await page.locator('[data-open-detail="combined"] [data-chip-hall="hall-3"]').evaluate(el=>getComputedStyle(el).backgroundColor),colors['hall-3']);
  assert.equal(await day('15').locator('[data-hall-marker="hall-2"]').getAttribute('data-marker-state'),'quote');assert.equal(await day('15').locator('[data-hall-marker="hall-2"]').evaluate(el=>getComputedStyle(el).borderTopStyle),'dashed');assert.equal(await day('15').locator('[data-hall-marker="hall-2"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  assert.equal(await day('18').locator('[data-hall-marker="hall-2"]').getAttribute('data-marker-state'),'booked');assert.equal(await day('16').locator('[data-hall-marker]').count(),0);assert.equal(await day('22').locator('.calendar-hall-marks').count(),0);
  assert.equal(await day('17').locator('[data-hall-marker]').count(),0);assert.equal(await day('17').locator('.is-unassigned').innerText(),'?');
  for(const value of ['19','20','21'])assert.equal(await day(value).locator('[data-hall-marker="hall-3"]').getAttribute('data-marker-state'),'booked');
  assert.ok((await day('13').getAttribute('aria-label')).includes('Elianne 3'));
  await page.locator('#calendarHall').selectOption('hall-3');assert.equal(await day('13').locator('[data-hall-marker]').count(),1);assert.equal(await day('13').locator('[data-hall-marker="hall-3"]').isVisible(),true);await page.locator('#calendarHall').selectOption('');
  await page.locator('#calendarFilter').selectOption('cotizacion');assert.equal(await day('18').locator('[data-hall-marker="hall-2"]').getAttribute('data-marker-state'),'quote');await page.locator('#calendarFilter').selectOption('');
  await page.locator('[data-detail-day="2030-11-13"] [data-open-detail="same-1"]').click();assert.equal(await page.locator('#detailTitle').innerText(),'Boda Maria');await page.locator('#detailBack').click();assert.equal(await page.locator('#calendarMonth').inputValue(),'2030-11');
  console.log('PASS: red/green/blue rooms, all three visible even with two preview slots, combined halls, quotes, unknown rooms, cancellation, buffers and filters');
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1000});await checkColors();await day('13').locator('.day-number').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   const bounds=await day('13').evaluate(el=>{const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};return {day:rect(el),number:rect(el.querySelector('.day-number')),marks:rect(el.querySelector('.calendar-hall-marks')),count:rect(el.querySelector('.day-mobile-status')),markers:[...el.querySelectorAll('[data-hall-marker]')].map(rect)};});
   assert.ok(bounds.marks.top>=bounds.number.bottom);assert.ok(bounds.marks.bottom<=bounds.day.bottom);assert.ok(bounds.markers.every(r=>r.width>=7&&r.height>=12&&r.left>=bounds.day.left&&r.right<=bounds.day.right));
   if(width<=600)assert.ok(bounds.count.bottom<=bounds.marks.top);
   else {const previews=await page.locator('[data-detail-day="2030-11-13"] .calendar-event').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().bottom));assert.ok(previews.every(bottom=>bottom<bounds.marks.top));}
   await page.locator('#calendarDays').screenshot({path:path.join(out,`calendar-${width}.png`)});await page.screenshot({path:path.join(out,`page-${width}.png`),fullPage:true});
  }
  await page.evaluate(async()=>{const halls=window.Elianne.get().halls;halls[0].name='Elianne Principal';await window.Elianne.saveHalls(halls);});await checkColors();assert.ok((await page.locator('#calendarHallLegend').innerText()).includes('Elianne Principal'));
  assert.equal(await page.evaluate(()=>JSON.stringify(window.Elianne.get().events)),eventsBefore);assert.deepEqual(errors,[]);console.log('PASS: desktop/tablet/mobile visible colors, bounded cells, no overlapping labels, editable room names retain their color and event data stays unchanged');
  await context.close();
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
