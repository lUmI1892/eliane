let detailEventId=null,detailReturnTab='calendar',detailEditing=false;
let detailEditBaseline='',detailHistoryBaseline='',detailOriginScroll=0;
let detailFormHome,detailHistoryHomes=[];
const detailHistoryNodes=()=>[$('historyForm'),document.querySelector('.history-toolbar'),$('historyTimeline')];
const formFingerprint=form=>JSON.stringify([...form.querySelectorAll('input,select,textarea')].map(el=>[el.id,el.name,el.type==='checkbox'||el.type==='radio'?el.checked:el.value]));
const detailHistoryDirty=()=>detailEventId&&formFingerprint($('historyForm'))!==detailHistoryBaseline;
const detailEditorDirty=()=>detailEditing&&JSON.stringify([formFingerprint($('salonEventForm')),draft])!==detailEditBaseline;
function loadDetailHistory(e){
  historyEventId=e.id;$('historyGuests').value=e.guestCount??'';$('historyGuests').disabled=['cerrado','cancelado'].includes(e.status);
  $('historyBy').value='';$('historyNote').value='';$('historyMessage').textContent='';
  detailHistoryBaseline=formFingerprint($('historyForm'));renderHistory();
}
function detailHistorySaved(){if(detailEventId)detailHistoryBaseline=formFingerprint($('historyForm'));}
function openEventDetail(id,origin='calendar',day){
  if(api.saving())return false;
  const e=api.get().events.find(e=>e.id===id);if(!e)return false;
  if(detailEventId&&!leaveEventDetail())return false;
  detailEventId=id;detailReturnTab=origin;detailOriginScroll=window.scrollY;
  if(day)selectedDay=day;
  detailHistoryNodes().forEach(node=>$('detailHistorySlot').append(node));loadDetailHistory(e);
  renderReturns();renderEventDetail();showTab('event-detail');
  window.scrollTo({top:0});$('detailTitle').focus();return true;
}
function startDetailEdit(){
  const e=api.get().events.find(e=>e.id===detailEventId);if(!e||!['cotizacion','reservado'].includes(e.status)||api.saving())return;
  if(detailHistoryDirty()&&!confirm('Hay invitados o notas sin guardar. Descartar esos cambios para editar el evento?'))return;
  if((editing||draft.length||$('salonClient').value)&&!confirm('Hay otro formulario de evento abierto. Reemplazarlo por este evento?'))return;
  loadDetailHistory(e);detailEditing=true;$('detailEditorHost').append($('salonEventForm'));
  editEvent(e.id,true);$('salonClearEvent').textContent='Cancelar edicion';
  detailEditBaseline=JSON.stringify([formFingerprint($('salonEventForm')),draft]);
  renderEventDetail();$('detailEditorHost').scrollIntoView({block:'start'});$('salonClient').focus();
}
function finishDetailEdit(){
  detailEditing=false;detailFormHome.after($('salonEventForm'));$('salonClearEvent').textContent='Limpiar';
  const e=api.get().events.find(e=>e.id===detailEventId);if(e)loadDetailHistory(e);
  renderEventDetail();$('detailTitle').focus();
}
function cancelDetailEdit(force=false){
  if(api.saving())return false;
  if(!force&&detailEditorDirty()&&!confirm('Descartar los cambios sin guardar del evento?'))return false;
  resetEvent();finishDetailEdit();return true;
}
function leaveEventDetail(force=false){
  if(!detailEventId)return true;
  if(api.saving())return false;
  if(detailEditing&&!cancelDetailEdit(force))return false;
  if(!force&&detailHistoryDirty()&&!confirm('Hay invitados o notas sin guardar. Descartar esos cambios y salir?'))return false;
  const scroll=detailOriginScroll;
  detailHistoryHomes.forEach(({node,home})=>home.after(node));
  detailEventId=null;historyEventId=null;detailHistoryBaseline='';
  ['detailReturnSlot','detailStateActions','detailRentals','detailDocuments','detailMaterials','detailData','detailPending'].forEach(id=>$(id).replaceChildren());
  renderReturns();renderCalendar();
  window.scrollTo({top:scroll});return true;
}
function eventDetailPending(e){
  const lines=[];
  if(!e.hallIds.length&&e.status!=='cancelado')lines.push('Salon sin asignar.');
  if(api.occupiesHall(e)&&api.hallConflicts(e).length)lines.push('Hay un cruce de horario en los salones de este evento.');
  if(e.guestCount==null)lines.push('Cantidad de invitados sin definir.');
  if(e.date.slice(0,4)<'2000')lines.push('Revisar fecha de salida: '+reportDate(e.date)+'.');
  if(['reservado','cotizacion'].includes(e.status))e.items.forEach(i=>{
    const need=api.ownQty(i)-api.available(i.productId,e.date,e.returnDate,e.id);
    if(need>0)lines.push(`${product(i.productId)?.name||'Producto'}: faltan ${need} unidades propias.`);
  });
  e.items.filter(i=>i.external).forEach(i=>{
    const r=i.external,name=product(i.productId)?.name||'Producto';
    if(r.status==='pendiente')lines.push(`${name}: contratar ${r.qty} unidades externas${e.status==='cancelado'?' o cancelar el acuerdo pendiente':''}.`);
    if(r.status==='confirmado')lines.push(`${name}: recibir ${r.qty} unidades de ${r.supplier}${e.status==='cancelado'?' o coordinar su cancelacion':''}.`);
    if(r.status==='recibido')lines.push(`${name}: devolver ${r.qty} unidades a ${r.supplier} el ${reportDate(r.returnDate)}${r.returnDate<today()?' (vencido)':''}.`);
  });
  if(e.status==='en-evento')lines.push(e.returnDate<today()?'Devolucion del evento vencida; el material propio sigue reservado.':'Confirmar regreso del material propio del evento.');
  if(returns.has(e.id))lines.push('Hay un conteo de devolucion sin guardar.');
  if(e.items.some(i=>i.returned+i.damaged>api.ownQty(i)))lines.push('El conteo guardado supera el material propio asignado.');
  return lines;
}
function detailRentalsHtml(e){
  const list=e.items.filter(i=>i.external);if(!list.length)return '<p class="salon-muted">Sin alquileres externos.</p>';
  return `<div class="table-wrap"><table class="salon-table"><thead><tr><th>Producto / proveedor</th><th>Cantidad</th><th>Estado</th><th>Costo total</th><th>Entrega / devolucion</th></tr></thead><tbody>${list.map(i=>{const r=i.external;return `<tr><td>${esc(product(i.productId)?.name||'Producto')}<br>${esc(r.supplier||'Proveedor por definir')}</td><td>${r.qty}</td><td>${rentalLabels[r.status]}${r.status==='devuelto'?`<br>Bueno ${r.returned} · Dañado ${r.damaged} · Falta ${r.missing}`:''}</td><td>${r.cost==null?'Sin definir':'Bs '+money(r.cost)}</td><td>${reportDate(r.deliveryDate)}<br>${reportDate(r.returnDate)}</td></tr>`;}).join('')}</tbody></table></div><div class="actions">${button('Gestionar alquileres','rentals',e.id)}</div>`;
}
function renderEventDetail(){
  if(!detailEventId)return;
  const e=api.get().events.find(e=>e.id===detailEventId);if(!e){leaveEventDetail(true);showTab(detailReturnTab);return;}
  $('detailTitle').textContent=e.client;
  $('detailMetrics').innerHTML=`<div><span>Fecha del evento</span><strong>${reportDate(e.eventDate)}</strong></div><div><span>Salon</span><strong>${hallDots(e)} ${esc(hallNames(e))}</strong></div><div><span>Invitados</span><strong>${guestsLabel(e)}</strong></div><div><span>Estado</span><strong>${statuses[e.status]}</strong></div>`;
  $('detailEdit').hidden=!['cotizacion','reservado'].includes(e.status)||detailEditing;
  $('detailEditorHost').hidden=!detailEditing;$('detailReadOnly').hidden=detailEditing;
  $('detailData').innerHTML=`<dl class="detail-data">${[['Tipo',e.type],['Responsable',e.responsible||'Sin registrar'],['Lugar',e.place||'Sin registrar'],['Ocupacion',e.venueMode==='hours'?`${reportDate(e.eventDate)} ${e.startTime} a ${reportDate(e.venueEndDate)} ${e.endTime}`:`${reportDate(e.eventDate)} al ${reportDate(e.venueEndDate)} - dia completo`],['Montaje / limpieza',`${e.setupMinutes} min / ${e.cleanupMinutes} min`],['Salida prevista',reportDate(e.date)],['Salida registrada',e.departureDate?reportDate(e.departureDate):'Sin registrar'],['Devolucion prevista',reportDate(e.returnDate)]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${e.notes?`<p class="detail-notes">${esc(e.notes)}</p>`:''}`;
  $('detailStateActions').innerHTML=(e.status==='cotizacion'?button('Confirmar reserva','reserve',e.id,'primary'):'')+(['cotizacion','reservado'].includes(e.status)?button('Cancelar evento','cancel',e.id,'danger'):'')+(e.status!=='cancelado'?button('Editar salones / horario','assign',e.id):'');
  const pending=eventDetailPending(e);$('detailPending').innerHTML=pending.length?`<ul>${pending.map(line=>`<li>${esc(line)}</li>`).join('')}</ul>`:'<p class="salon-muted">Sin pendientes registrados.</p>';
  $('detailMaterials').innerHTML=e.items.length?`<div class="table-wrap"><table class="salon-table"><thead><tr><th>Producto / codigo</th><th>Solicitado</th><th>Propios</th><th>Externos</th></tr></thead><tbody>${e.items.map(i=>`<tr><td>${esc(product(i.productId)?.name||'Producto')}<br><span class="salon-muted">${esc(product(i.productId)?.code||'Sin codigo')}</span></td><td>${i.qty}</td><td>${api.ownQty(i)}</td><td>${i.qty-api.ownQty(i)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="salon-muted">Sin materiales asignados.</p>';
  $('detailRentals').innerHTML=detailRentalsHtml(e);
  $('detailDocuments').innerHTML=button('PDF entrega','pdf',e.id)+button('PDF devolucion','return-pdf',e.id)+'<button type="button" class="btn small" id="detailHistoryExport">Historial CSV</button>';
  const card=document.querySelector(`#salonReturnList [data-return-card="${e.id}"]`),slot=$('detailReturnSlot');
  if(card){slot.replaceChildren(card);}
  else if(!['reservado','en-evento','devuelto'].includes(e.status)||!slot.querySelector(`[data-return-card="${e.id}"]`))slot.innerHTML=readTable(e);
  if(!detailHistoryDirty())loadDetailHistory(e);else renderHistory();
}
function initEventDetail(){
  const module=document.querySelector('.salon-module');
  module.insertAdjacentHTML('beforeend',`<div id="salon-event-detail" class="salon-view"><div class="detail-top"><button class="btn" type="button" id="detailBack">Volver</button><button class="btn primary" type="button" id="detailEdit">Editar evento</button></div><header class="detail-heading"><h2 id="detailTitle" tabindex="-1"></h2><div id="detailMetrics" class="detail-metrics"></div></header><div id="detailEditorHost" hidden></div><div id="detailReadOnly"><div class="detail-overview-grid"><section class="detail-section"><h3>Datos del evento</h3><div id="detailData"></div><div id="detailStateActions" class="actions"></div></section><section class="detail-section detail-pending"><h3>Pendientes</h3><div id="detailPending"></div><h3>Documentos</h3><div id="detailDocuments" class="actions"></div></section></div><section class="detail-section"><h3>Materiales del evento</h3><div id="detailMaterials"></div></section><section class="detail-section"><h3>Alquiler externo</h3><div id="detailRentals"></div></section><section class="detail-section detail-return-host"><h3>Salida y devolucion de material propio</h3><div id="detailReturnSlot"></div></section><section id="detailHistorySection" class="detail-section"><h3>Invitados, notas e historial</h3><div id="detailHistorySlot"></div></section></div></div>`);
  detailFormHome=document.createComment('Event editor home');$('salonEventForm').before(detailFormHome);
  detailHistoryHomes=detailHistoryNodes().map(node=>{const home=document.createComment('Event history home');node.before(home);return {node,home};});
  $('detailBack').addEventListener('click',()=>showTab(detailReturnTab));
  $('detailEdit').addEventListener('click',startDetailEdit);
  module.addEventListener('click',event=>{if(event.target.closest('#detailHistoryExport'))exportHistory();});
  window.addEventListener('elianne:saving',()=>{
    if(api.saving()||!detailEventId)return;
    const e=api.get().events.find(e=>e.id===detailEventId);if(e)$('historyGuests').disabled=['cerrado','cancelado'].includes(e.status);
  });
  window.addEventListener('elianne:restored',()=>{leaveEventDetail(true);showTab('calendar');});
  window.addEventListener('beforeunload',event=>{if(detailEditorDirty()||detailHistoryDirty()){event.preventDefault();event.returnValue='';}});
}
