const rentalLabels={pendiente:'Pendiente',confirmado:'Confirmado',recibido:'Recibido',devuelto:'Devuelto al proveedor',cancelado:'Cancelado'};
let rentalEventId=null,rentalSelectedPid=null,rentalDirty=false;
const hasRental=e=>e.items.some(i=>i.external);
function rentalSummary(e){
  const items=e.items.filter(i=>i.external);if(!items.length)return '';
  const open=items.filter(i=>!['devuelto','cancelado'].includes(i.external.status));
  return `<p class="rental-status-line"><strong>Alquiler externo:</strong> ${open.length?open.map(i=>`${esc(product(i.productId)?.name||'Producto')}: ${i.external.qty} - ${rentalLabels[i.external.status]}`).join('; '):'finalizado'}</p>`;
}
function rentalAlertBlocks(data){
  const rows=data.events.flatMap(e=>e.items.filter(i=>i.external).map(i=>({e,i,r:i.external})));
  return [
    ['Alquileres por contratar',rows.filter(({e,r})=>!['cerrado','cancelado'].includes(e.status)&&r.status==='pendiente').map(({e,i,r})=>`${e.eventDate}: ${e.client} - falta contratar ${r.qty} de ${product(i.productId)?.name||'Producto'}.`)],
    ['Alquileres por recibir',rows.filter(({e,r})=>!['cerrado','cancelado'].includes(e.status)&&r.status==='confirmado').map(({e,i,r})=>`${e.client}: recibir ${r.qty} de ${product(i.productId)?.name||'Producto'} de ${r.supplier}, entrega ${r.deliveryDate}.`)],
    ['Alquileres por devolver',rows.filter(({r})=>r.status==='recibido').map(({e,r,i})=>`${e.client}: devolver ${r.qty} de ${product(i.productId)?.name||'Producto'} a ${r.supplier}, previsto ${r.returnDate}${r.returnDate<today()?' - VENCIDO':''}.`)],
    ['Alquileres de eventos cancelados',rows.filter(({e,r})=>e.status==='cancelado'&&['pendiente','confirmado'].includes(r.status)).map(({e,r})=>`${e.client}: coordinar y registrar la cancelacion del alquiler con ${r.supplier||'proveedor por definir'}.`)]
  ];
}
function updateDraftCoverage(){
  const [a,b]=period();
  draft.forEach((i,n)=>{
    const row=document.querySelector(`[data-draft-row="${n}"]`);if(!row)return;
    const need=Math.max(0,api.ownQty(i)-api.available(i.productId,a,b,editing)),r=i.external;
    row.querySelector('[data-draft-own]').textContent=api.ownQty(i);
    const label=row.querySelector('[data-draft-coverage]');
    label.textContent=need?`Faltan ${need} propios: cubrir con alquiler externo.`:r&&r.status!=='cancelado'?`${r.qty} de alquiler - ${rentalLabels[r.status]}`:'Cubierto con material propio';
    label.classList.toggle('invalid',need>0);
  });
}
function renderRentalDraft(){
  const section=$('salonRentalsDraft'),rows=draft.map((item,index)=>({item,index})).filter(({item})=>item.external);
  section.hidden=!rows.length;
  section.innerHTML=rows.length?`<h3>Alquiler externo</h3>${rows.map(({item:i,index:n})=>{
    const r=i.external,locked=['recibido','devuelto','cancelado'].includes(r.status),disabled=locked?'disabled':'';
    return `<fieldset class="rental-fields"><legend>${esc(product(i.productId)?.name||'Producto')}</legend><div class="row"><div class="field"><label for="rentQty${n}">Cantidad externa</label><input id="rentQty${n}" data-rental-draft="qty" data-index="${n}" type="number" min="1" max="${i.qty}" step="1" value="${r.qty}" required ${disabled}></div><div class="field"><label for="rentSupplier${n}">Proveedor</label><input id="rentSupplier${n}" data-rental-draft="supplier" data-index="${n}" value="${esc(r.supplier)}" maxlength="200" ${disabled}></div></div><div class="row"><div class="field"><label for="rentCost${n}">Costo total (Bs)</label><input id="rentCost${n}" data-rental-draft="cost" data-index="${n}" type="number" min="0" max="1000000000000" step="0.01" value="${r.cost??''}" placeholder="Sin definir" ${disabled}></div><div class="field"><label for="rentStatus${n}">Estado</label><select id="rentStatus${n}" data-rental-draft="status" data-index="${n}" ${disabled}>${(locked?[r.status]:['pendiente','confirmado']).map(key=>`<option value="${key}" ${key===r.status?'selected':''}>${rentalLabels[key]}</option>`).join('')}</select></div></div><div class="row"><div class="field"><label for="rentDelivery${n}">Entrega del proveedor</label><input id="rentDelivery${n}" data-rental-draft="deliveryDate" data-index="${n}" type="date" value="${r.deliveryDate}" required ${disabled}></div><div class="field"><label for="rentReturn${n}">Devolucion al proveedor</label><input id="rentReturn${n}" data-rental-draft="returnDate" data-index="${n}" type="date" value="${r.returnDate}" required ${disabled}></div></div><div class="field"><label for="rentNotes${n}">Observaciones del alquiler</label><textarea id="rentNotes${n}" data-rental-draft="notes" data-index="${n}" maxlength="10000" ${disabled}>${esc(r.notes)}</textarea></div>${!locked?`<button type="button" class="btn small danger" data-rental-remove="${n}">Usar solo material propio</button>`:''}</fieldset>`;
  }).join('')}`:'';
}
function rentalControls(){
  const e=api.get().events.find(e=>e.id===rentalEventId),i=e?.items.find(i=>i.productId===$('rentalProduct').value),r=i?.external;if(!r)return;
  rentalSelectedPid=i.productId;
  $('rentalHeading').textContent=e.client;$('rentalState').textContent=rentalLabels[r.status];$('rentalQuantity').textContent=r.qty;
  [['rentalSupplier',r.supplier],['rentalCost',r.cost??''],['rentalDelivery',r.deliveryDate],['rentalReturn',r.returnDate],['rentalNotes',r.notes],['rentalGood',r.status==='devuelto'?r.returned:r.qty],['rentalDamaged',r.damaged]].forEach(([id,value])=>$(id).value=value);
  const final=['cancelado','devuelto'].includes(r.status);
  ['rentalSupplier','rentalCost','rentalDelivery','rentalReturn','rentalNotes'].forEach(id=>$(id).disabled=final);
  $('rentalSave').disabled=final;
  $('rentalConfirm').hidden=r.status!=='pendiente'||['devuelto','cerrado','cancelado'].includes(e.status);
  $('rentalReceive').hidden=r.status!=='confirmado'||['devuelto','cerrado','cancelado'].includes(e.status);
  $('rentalCancel').hidden=!['pendiente','confirmado'].includes(r.status)||e.status==='en-evento';
  const canReturn=r.status==='recibido'&&['devuelto','cerrado','cancelado'].includes(e.status);
  $('rentalReturnFields').hidden=!canReturn;$('rentalComplete').hidden=!canReturn;
  $('rentalFinalCounts').textContent=r.status==='devuelto'?`Al proveedor: bueno ${r.returned}, dañado ${r.damaged}, faltante ${r.missing}.`:'';
  rentalDirty=false;
}
function openRental(id){
  const e=api.get().events.find(e=>e.id===id);if(!e)return;
  rentalEventId=id;$('rentalProduct').innerHTML=e.items.filter(i=>i.external).map(i=>`<option value="${esc(i.productId)}">${esc(product(i.productId)?.name||'Producto')}</option>`).join('');
  $('rentalBy').value='';$('rentalMessage').textContent='';rentalControls();$('rentalDialog').showModal();
}
function initRentals(){
  Object.assign(types,{'alquiler-editado':'Alquiler externo modificado',...Object.fromEntries(Object.entries(rentalLabels).map(([key,label])=>['alquiler-'+key,'Alquiler externo: '+label]))});
  document.querySelector('.salon-module').insertAdjacentHTML('beforeend',`<dialog id="rentalDialog" class="salon-dialog rental-dialog" aria-labelledby="rentalTitle"><div class="history-heading"><div><h2 id="rentalTitle">Alquiler externo</h2><p id="rentalHeading"></p></div><button type="button" class="btn small" id="rentalClose">Cerrar</button></div><form id="rentalForm" class="form"><div class="field"><label for="rentalProduct">Producto alquilado</label><select id="rentalProduct"></select></div><p><strong id="rentalQuantity"></strong> unidades externas · <strong id="rentalState"></strong></p><div class="row"><div class="field"><label for="rentalSupplier">Proveedor</label><input id="rentalSupplier" maxlength="200"></div><div class="field"><label for="rentalCost">Costo total (Bs)</label><input id="rentalCost" type="number" min="0" max="1000000000000" step="0.01" placeholder="Sin definir"></div></div><div class="row"><div class="field"><label for="rentalDelivery">Entrega del proveedor</label><input id="rentalDelivery" type="date" required></div><div class="field"><label for="rentalReturn">Devolucion al proveedor</label><input id="rentalReturn" type="date" required></div></div><div class="field"><label for="rentalNotes">Observaciones</label><textarea id="rentalNotes" maxlength="10000"></textarea></div><div id="rentalReturnFields" hidden><h3>Devolucion al proveedor</h3><div class="row"><div class="field"><label for="rentalGood">Devuelto bueno</label><input id="rentalGood" type="number" min="0" step="1"></div><div class="field"><label for="rentalDamaged">Dañado</label><input id="rentalDamaged" type="number" min="0" step="1"></div></div></div><p id="rentalFinalCounts"></p><div class="field"><label for="rentalBy">Registrado por</label><input id="rentalBy" maxlength="120" required></div><p id="rentalMessage" role="status"></p><div class="actions"><button type="submit" class="btn" id="rentalSave">Guardar datos</button><button type="submit" class="btn primary" id="rentalConfirm" data-rental-next="confirmado">Confirmar alquiler</button><button type="submit" class="btn primary" id="rentalReceive" data-rental-next="recibido">Marcar recibido</button><button type="submit" class="btn primary" id="rentalComplete" data-rental-next="devuelto">Devolver al proveedor</button><button type="submit" class="btn danger" id="rentalCancel" data-rental-next="cancelado">Cancelar alquiler</button></div></form></dialog>`);
  document.querySelector('.salon-module').addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.draftRent!==undefined){
      const i=draft[Number(button.dataset.draftRent)],[a,b]=period();
      if(!i.external||i.external.status==='cancelado')i.external={qty:Math.max(1,i.qty-api.available(i.productId,a,b,editing)),supplier:'',cost:null,deliveryDate:a,returnDate:b,status:'pendiente',notes:'',returned:0,damaged:0,missing:0,receivedAt:null,returnedAt:null};
      renderDraft();$('salonRentalsDraft').scrollIntoView({block:'nearest'});
    }
    if(button.dataset.rentalRemove!==undefined){draft[Number(button.dataset.rentalRemove)].external=null;renderDraft();}
    if(button.dataset.action==='rentals')openRental(button.dataset.event);
    if(button.id==='rentalClose'&&!api.saving()&&(!rentalDirty||confirm('Hay datos del alquiler sin guardar. Cerrar?'))){rentalDirty=false;$('rentalDialog').close();}
  });
  document.querySelector('.salon-module').addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.rentalDraft){const i=draft[Number(input.dataset.index)];i.external[input.dataset.rentalDraft]=['qty','cost'].includes(input.dataset.rentalDraft)?(input.value===''?null:Number(input.value)):input.value;updateDraftCoverage();}
    if(input.closest('#rentalForm')&&input.id!=='rentalProduct')rentalDirty=true;
  });
  $('rentalProduct').addEventListener('change',()=>{if(!rentalDirty||confirm('Descartar los datos sin guardar y cambiar de producto?'))rentalControls();else $('rentalProduct').value=rentalSelectedPid;});
  $('rentalDialog').addEventListener('cancel',event=>{if(api.saving()||(rentalDirty&&!confirm('Hay datos del alquiler sin guardar. Cerrar?')))event.preventDefault();else rentalDirty=false;});
  $('rentalForm').addEventListener('submit',async event=>{
    event.preventDefault();const next=event.submitter?.dataset.rentalNext;
    if(next==='recibido'&&!confirm('Confirmar que recibiste toda la cantidad alquilada?'))return;
    if(next==='cancelado'&&!confirm('Registrar cancelacion del alquiler? Esto no cancela automaticamente el acuerdo con el proveedor.'))return;
    if(next==='devuelto'&&!confirm('Confirmar devolucion al proveedor? Los daños y faltantes externos NO descontaran inventario propio.'))return;
    try{
      await api.saveRental(rentalEventId,$('rentalProduct').value,{supplier:$('rentalSupplier').value,cost:$('rentalCost').value,deliveryDate:$('rentalDelivery').value,returnDate:$('rentalReturn').value,notes:$('rentalNotes').value,returned:$('rentalGood').value,damaged:$('rentalDamaged').value},$('rentalBy').value,next);
      rentalControls();$('rentalMessage').textContent='Alquiler guardado correctamente.';$('rentalMessage').className='history-success';
    }catch(error){$('rentalMessage').textContent=error.message;$('rentalMessage').className='invalid';}
  });
  window.addEventListener('elianne:restored',()=>{rentalDirty=false;rentalEventId=null;if($('rentalDialog').open)$('rentalDialog').close();});
  window.addEventListener('beforeunload',event=>{if(rentalDirty){event.preventDefault();event.returnValue='';}});
}
function renderRentalReportButton(){
  if(!$('salonReportList')||$('rentalCsv'))return;
  const button=document.createElement('button');button.type='button';button.id='rentalCsv';button.className='btn';button.dataset.report='rentals-csv';button.textContent='Exportar alquileres CSV';
  $('salonReportList').querySelector('[data-report="csv"]')?.insertAdjacentElement('afterend',button);
}
