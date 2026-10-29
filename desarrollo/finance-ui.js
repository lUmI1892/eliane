let finContext=null,finBaseline='';
const finLabels={cobro:'Cobro','reembolso-cliente':'Reembolso al cliente','pago-gasto':'Pago a proveedor','reembolso-proveedor':'Reembolso del proveedor'};
const finMoney=value=>value===null?'Sin definir':'Bs '+money(value/100);
const finButton=(label,mode,eid='',extra='')=>`<button type="button" class="btn small" data-fin-mode="${mode}" data-fin-event="${esc(eid)}" ${extra}>${label}</button>`;
const finMetric=(label,value,cls='')=>`<div class="finance-metric ${cls}"><span>${label}</span><strong>${value}</strong></div>`;
const finDialogDirty=()=>finContext&&formFingerprint($('financeForm'))!==finBaseline;
function finCashReference(c,state){
  const event=state.events.find(e=>e.id===c.eventId),expense=state.finance.expenses.find(x=>x.id===c.expenseId);
  const concept=expense?.description||(c.productId?'Alquiler: '+(state.items.find(p=>p.id===c.productId)?.name||c.productId):'');
  return [event?.client,concept].filter(Boolean).join(' / ')||'Gasto general';
}
function labelFinanceTables(root){
  root.querySelectorAll('.finance-table').forEach(table=>{const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent);table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,n)=>cell.dataset.label=labels[n]||''));});
}
function finCashTable(rows){
  if(!rows.length)return '<p class="salon-muted">Sin cobros ni pagos registrados.</p>';
  const state=api.get();
  return `<div class="table-wrap"><table class="salon-table finance-table"><thead><tr><th>Fecha / referencia</th><th>Movimiento</th><th>Importe</th><th>Medio / responsable</th><th>Estado</th></tr></thead><tbody>${[...rows].sort((a,b)=>b.date.localeCompare(a.date)||b.at-a.at).map(c=>{
    const reference=finCashReference(c,state);
    return `<tr class="${c.voidedAt?'finance-void':''}"><td>${reportDate(c.date)}<br><span class="salon-muted">${esc(reference||'Gasto general')}</span>${c.note?`<p>${esc(c.note)}</p>`:''}</td><td>${finLabels[c.kind]}</td><td class="finance-number">${finMoney(c.amount)}</td><td>${esc(c.method)}<br>${esc(c.by)}</td><td>${c.voidedAt?`Anulado<br>${esc(c.voidReason)}<br>${esc(c.voidBy)}`:finButton('Anular','void',c.eventId,`data-fin-kind="cash" data-fin-record="${c.id}"`)}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function finExpensesTable(rows){
  if(!rows.length)return '<p class="salon-muted">Sin gastos registrados.</p>';
  return `<div class="table-wrap"><table class="salon-table finance-table"><thead><tr><th>Concepto</th><th>Costo</th><th>Pagado neto</th><th>Por pagar</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.description)}<br><span class="salon-muted">${esc(x.category)} · ${reportDate(x.date)}${x.rentalStatus?' · '+rentalLabels[x.rentalStatus]:''}</span></td><td class="finance-number">${finMoney(x.amount)}</td><td class="finance-number">${finMoney(x.paid)}${x.credit?`<p class="finance-credit">Anticipo excedente: ${finMoney(x.credit)}</p>`:''}</td><td class="finance-number">${finMoney(x.pending)}</td><td><div class="finance-row-actions">${finButton('Registrar pago','cash',x.eventId,`data-fin-expense="${esc(x.id)}" data-fin-product="${esc(x.productId)}"`)}${x.source==='manual'?finButton('Editar gasto','expense-edit',x.eventId,`data-fin-record="${x.id}"`)+finButton('Anular gasto','void',x.eventId,`data-fin-kind="expense" data-fin-record="${x.id}"`):button('Gestionar alquiler','rentals',x.eventId)}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function renderEventFinance(e){
  if(!$('detailFinance'))return;
  const f=api.financeEvent(e.id);
  $('detailFinance').innerHTML=`<div class="finance-section-heading"><h3>Finanzas del evento</h3><div class="actions">${finButton('Precio acordado','contract',e.id)}${finButton('Agregar extra','extra',e.id)}${finButton('Registrar cobro','cash',e.id)}${finButton('Nuevo gasto','expense',e.id)}<button type="button" class="btn small" data-fin-pdf-event="${e.id}">PDF finanzas</button></div></div><div class="finance-metrics">${finMetric('Total acordado',finMoney(f.total))}${finMetric('Cobrado neto',finMoney(f.received))}${finMetric('Pendiente del cliente',finMoney(f.pending))}${finMetric('Resultado previsto',f.result===null?'Por completar':finMoney(f.result),f.result<0?'finance-negative':'')}</div><dl class="finance-breakdown"><div><dt>Precio base</dt><dd>${finMoney(f.contract.base)}</dd></div><div><dt>Extras vigentes</dt><dd>${finMoney(f.extras)}</dd></div><div><dt>Gastos registrados</dt><dd>${finMoney(f.cost)}${f.unknown?` + ${f.unknown} sin costo definido`:''}</dd></div><div><dt>Pagado a proveedores</dt><dd>${finMoney(f.paid)}</dd></div>${f.credit?`<div><dt>Saldo a favor del cliente</dt><dd>${finMoney(f.credit)}</dd></div>`:''}</dl><h4>Extras del acuerdo</h4>${f.contract.extras.length?`<ul class="finance-extras">${f.contract.extras.map(x=>`<li class="${x.voidedAt?'finance-void':''}"><span>${esc(x.description)} · ${finMoney(x.amount)}${x.voidedAt?` · Anulado: ${esc(x.voidReason)}`:''}</span>${x.voidedAt?'':finButton('Anular','void',e.id,`data-fin-kind="extra" data-fin-record="${x.id}"`)}</li>`).join('')}</ul>`:'<p class="salon-muted">Sin extras registrados.</p>'}<h4>Gastos y alquileres externos</h4>${finExpensesTable(f.expenses)}<h4>Cobros, pagos y reembolsos</h4>${finCashTable(f.cash)}`;
  const expenseHeading=[...$('detailFinance').querySelectorAll('h4')].find(h=>h.textContent==='Gastos y alquileres externos');
  const expenseTable=expenseHeading.nextElementSibling,expenseButton=$('detailFinance').querySelector('[data-fin-mode="expense"]');
  const expensePanel=document.createElement('section');expensePanel.id='detailExpenses';expensePanel.className='event-expense-panel';expensePanel.setAttribute('aria-labelledby','detailExpensesTitle');
  expensePanel.innerHTML=`<div class="finance-section-heading"><h4 id="detailExpensesTitle" tabindex="-1">Gastos del evento</h4><div class="actions"></div></div><p class="salon-muted">Registra comida, personal, decoración, transporte y otros costos de este evento. Los alquileres externos se incluyen automáticamente.</p><div class="finance-metrics">${finMetric('Costo registrado',finMoney(f.cost)+(f.unknown?' + por definir':''))}${finMetric('Pagado a proveedores',finMoney(f.paid))}${finMetric('Por pagar',finMoney(f.unknown?null:f.expenses.reduce((sum,x)=>sum+x.pending,0)))}</div><p class="event-expense-help">Al agregar un gasto puedes indicar si está pendiente, pagado completo o con abono. Para pagos posteriores, usa Registrar pago en su fila.</p>`;
  expenseButton.textContent='Registrar gasto';expenseButton.classList.add('primary');expensePanel.querySelector('.actions').append(expenseButton);
  expenseHeading.replaceWith(expensePanel);expensePanel.append(expenseTable);
  labelFinanceTables($('detailFinance'));
}
function refreshFinanceHalls(){
  const select=$('financeHall'),value=select.value;
  select.innerHTML='<option value="">Todos los salones</option>'+api.get().halls.map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join('');select.value=value;
}
function renderFinanceMonth(){
  if(!$('financeMonth'))return;
  refreshFinanceHalls();
  const month=$('financeMonth').value||today().slice(0,7),f=api.financeMonth(month,$('financeHall').value);
  $('financeCashMetrics').innerHTML=finMetric('Cobros netos del mes',finMoney(f.income-f.refunds))+finMetric('Pagos netos del mes',finMoney(f.out-f.supplierRefunds))+finMetric('Flujo neto del mes',finMoney(f.net),f.net<0?'finance-negative':'')+finMetric('Devoluciones a clientes',finMoney(f.refunds));
  $('financeForecastMetrics').innerHTML=finMetric('Resultado previsto menos gastos generales',f.result===null?'Por completar':finMoney(f.result),f.result<0?'finance-negative':'')+finMetric('Saldo de reservas del mes',finMoney(f.pending))+finMetric('Gastos generales del mes',finMoney(f.generalCost))+finMetric('Reservas con datos incompletos',String(f.incomplete));
  $('financeShared').textContent=$('financeHall').value?`Importes de eventos compartidos sin prorratear. Gastos generales compartidos no incluidos: ${finMoney(f.unassignedGeneral)}.`:'';
  $('financeEvents').innerHTML=f.rows.length?`<div class="table-wrap"><table class="salon-table finance-table"><thead><tr><th>Evento / salon</th><th>Total acordado</th><th>Cobrado neto</th><th>Pendiente</th><th>Resultado previsto</th></tr></thead><tbody>${f.rows.sort((a,b)=>a.event.eventDate.localeCompare(b.event.eventDate)).map(r=>`<tr><td><button type="button" class="finance-event-link" data-fin-open="${r.eventId}">${esc(r.event.client)}</button><br><span class="salon-muted">${reportDate(r.event.eventDate)} · ${esc(hallNames(r.event))}<br>${statuses[r.event.status]}</span></td><td class="finance-number">${finMoney(r.total)}</td><td class="finance-number">${finMoney(r.received)}</td><td class="finance-number">${finMoney(r.pending)}</td><td class="finance-number">${r.result===null?'Por completar':finMoney(r.result)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No hay eventos para este mes y salon.</p>';
  $('financeGeneral').innerHTML=finExpensesTable(f.general);
  $('financeCashList').innerHTML=finCashTable(f.cash);
  labelFinanceTables($('salon-finance'));
}
const finAmountField=(value='',required=true,label='Importe (Bs)')=>`<div class="field"><label for="finAmount">${label}</label><input id="finAmount" type="number" min="${required?'0.01':'0'}" max="1000000000000" step="0.01" ${required?'required':''} value="${value}" placeholder="${required?'':'Sin definir'}"></div>`;
function openFinanceDialog(context){
  if(api.saving())return;
  finContext={...context,id:api.uid(),paymentId:api.uid()};const mode=context.mode,eid=context.eventId||'',state=api.get(),e=state.events.find(e=>e.id===eid);
  let fields='',title='';
  if(mode==='contract'){title='Precio acordado';const base=api.financeEvent(eid).contract.base;fields=finAmountField(base===null?'':base/100,false,'Precio base (Bs)');}
  if(mode==='extra'){title='Agregar extra';fields='<div class="field"><label for="finDescription">Concepto</label><input id="finDescription" maxlength="300" required></div>'+finAmountField();}
  if(['expense','expense-edit'].includes(mode)){
    title=eid?'Nuevo gasto del evento':'Nuevo gasto general';
    const month=$('financeMonth').value||today().slice(0,7),expenseDate=eid?today():(month===today().slice(0,7)?today():month+'-01');
    fields='<div class="field"><label for="finDescription">Concepto / proveedor</label><input id="finDescription" maxlength="300" required></div><div class="field"><label for="finCategory">Categoria</label><select id="finCategory">'+(eid?['Comida','Personal','Decoracion','Transporte','Servicios','Otros']:['Luz','Agua','Sueldos','Mantenimiento','Alquiler del local','Otros']).map(x=>`<option>${x}</option>`).join('')+'</select></div>'+finAmountField()+'<div class="field"><label for="finDate">Fecha del gasto previsto</label><input id="finDate" type="date" required value="'+expenseDate+'"></div>';
    if(!eid)fields+='<div class="field"><label for="finHall">Salon del gasto</label><select id="finHall"><option value="">Compartido / general</option>'+state.halls.map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join('')+'</select></div>';
    if(mode==='expense')fields+=`<section class="expense-payment-choice" aria-label="Pago de este gasto"><div class="field"><label for="finExpensePayment">¿Ya pagaste este gasto?</label><select id="finExpensePayment"><option value="pending">Pendiente: todavía no pagué</option><option value="full">Pagado completo</option><option value="partial">Abono: pagué una parte</option></select></div><div class="field" id="finExpensePartial" hidden><label for="finExpensePaid">Cuánto pagaste (Bs)</label><input id="finExpensePaid" type="number" min="0.01" max="1000000000000" step="0.01" placeholder="0.00"></div><div id="finExpensePaymentFields" hidden><div class="row"><div class="field"><label for="finExpensePaidDate">Fecha del pago</label><input id="finExpensePaidDate" type="date" value="${today()}" max="${today()}"></div><div class="field"><label for="finExpenseMethod">Cómo pagaste</label><select id="finExpenseMethod">${['Efectivo','Transferencia','QR','Tarjeta','Otro'].map(x=>`<option>${x}</option>`).join('')}</select></div></div></div><p class="expense-payment-balance">Queda por pagar: <strong><output id="finExpensePending">Sin definir</output></strong></p></section>`;
  }
  if(mode==='cash'){
    const supplier=Boolean(context.expenseId||context.productId);title=supplier?'Pago / reembolso de proveedor':'Cobro / reembolso del cliente';
    fields='<div class="field"><label for="finCashKind">Movimiento</label><select id="finCashKind">'+(supplier?['pago-gasto','reembolso-proveedor']:['cobro','reembolso-cliente']).map(k=>`<option value="${k}">${finLabels[k]}</option>`).join('')+'</select></div>'+finAmountField()+'<div class="row"><div class="field"><label for="finDate">Fecha del pago</label><input id="finDate" type="date" max="'+today()+'" required value="'+today()+'"></div><div class="field"><label for="finMethod">Medio de pago</label><select id="finMethod">'+['Efectivo','Transferencia','QR','Tarjeta','Otro'].map(x=>`<option>${x}</option>`).join('')+'</select></div></div><div class="field"><label for="finNote">Referencia / observaciones</label><input id="finNote" maxlength="300"></div>';
  }
  if(mode==='void'){title='Anular registro financiero';fields='<div class="field"><label for="finReason">Motivo de anulacion</label><textarea id="finReason" maxlength="1000" required></textarea></div>';}
  $('financeDialogTitle').textContent=title;$('financeDialogContext').textContent=e?.client||'Gastos generales';
  $('financeFields').innerHTML=fields;if($('finHall'))$('finHall').value=$('financeHall').value;
  if(mode==='expense-edit'){
    const r=state.finance.expenses.find(x=>x.id===context.record);if(!r){finContext=null;return;}
    $('financeDialogTitle').textContent='Editar gasto';$('finAmount').value=r.amount/100;$('finDescription').value=r.description;$('finDate').value=r.date;
    if(![...$('finCategory').options].some(o=>o.value===r.category))$('finCategory').add(new Option(r.category,r.category));$('finCategory').value=r.category;if($('finHall'))$('finHall').value=r.hallId;
  }
  if(mode==='expense'){
    $('financeFields').querySelector('label[for="finDate"]').textContent='Fecha del gasto';
    $('financeFields').querySelector('label[for="finAmount"]').textContent='Costo total del gasto (Bs)';
  }
  $('financeForm').querySelector('button[type="submit"]').textContent=mode==='expense'?'Guardar gasto':'Guardar registro';
  $('finBy').value='';$('financeMessage').textContent='';syncExpensePayment();finBaseline=formFingerprint($('financeForm'));$('financeDialog').showModal();$('financeFields').querySelector('input,select,textarea')?.focus();
}
function syncExpensePayment(){
  if(!$('finExpensePayment'))return;
  const mode=$('finExpensePayment').value,partial=mode==='partial',paid=mode==='full'||partial;
  $('finExpensePartial').hidden=!partial;$('finExpensePaymentFields').hidden=!paid;
  $('finExpensePaid').setCustomValidity('');
  if(!api.saving()){
    $('finExpensePaid').disabled=!partial;$('finExpensePaid').required=partial;
    $('finExpensePaidDate').disabled=!paid;$('finExpensePaidDate').required=paid;$('finExpenseMethod').disabled=!paid;
  }
  try{
    const total=api.moneyCents($('finAmount').value,true),part=partial?api.moneyCents($('finExpensePaid').value,true):0;
    if(partial&&total!==null&&part>total){$('finExpensePaid').setCustomValidity('El abono no puede superar el costo del gasto.');throw new Error();}
    $('finExpensePending').textContent=total===null?'Sin definir':finMoney(mode==='full'?0:total-(part||0));
  }catch{$('finExpensePending').textContent='Revisa los importes';}
}
function closeFinanceDialog(){if(api.saving()||(finDialogDirty()&&!confirm('Hay datos financieros sin guardar. Descartar estos cambios?')))return;finContext=null;$('financeDialog').close();}
async function saveFinanceDialog(event){
  event.preventDefault();if(!finContext||api.saving())return;
  const c=finContext,by=$('finBy').value,amount=$('finAmount')?.value,eventId=c.eventId||'';
  try{
    if(c.mode==='contract')await api.setContract(eventId,amount,by);
    else if(c.mode==='void')await api.voidFinance(c.kind,c.record,$('finReason').value,by,eventId);
    else if(c.mode==='extra')await api.addFinanceRecord('extra',{id:c.id,eventId,amount,description:$('finDescription').value},by);
    else if(c.mode==='expense'){
      const paymentMode=$('finExpensePayment').value,payment=paymentMode==='pending'?null:{id:c.paymentId,amount:paymentMode==='full'?amount:$('finExpensePaid').value,date:$('finExpensePaidDate').value,method:$('finExpenseMethod').value};
      await api.addExpenseWithPayment({id:c.id,eventId,hallId:$('finHall')?.value||'',amount,description:$('finDescription').value,category:$('finCategory').value,date:$('finDate').value},payment,by);
    }
    else if(c.mode==='expense-edit')await api.updateFinanceExpense(c.record,{hallId:$('finHall')?.value||'',amount,description:$('finDescription').value,category:$('finCategory').value,date:$('finDate').value},by);
    else if(c.mode==='cash')await api.addFinanceRecord('cash',{id:c.id,eventId,expenseId:c.expenseId||'',productId:c.productId||'',amount,kind:$('finCashKind').value,method:$('finMethod').value,date:$('finDate').value,note:$('finNote').value},by);
    finContext=null;$('financeDialog').close();api.notify('Registro financiero guardado.');
  }catch(error){$('financeMessage').textContent=error.message;}
}
function financePdf(eid){
  if(eid){
    const f=api.financeEvent(eid),e=api.get().events.find(e=>e.id===eid);
    const blocks=[{type:'heading',text:e.client+' / '+reportDate(e.eventDate)},{type:'text',text:hallNames(e)+' / '+statuses[e.status]},{type:'table',columns:['Concepto','Importe'],widths:[330,193],rows:[['Precio base',finMoney(f.contract.base)],['Extras vigentes',finMoney(f.extras)],['Total acordado',finMoney(f.total)],['Cobrado neto',finMoney(f.received)],['Saldo pendiente',finMoney(f.pending)],['Saldo a favor del cliente',finMoney(f.credit)],['Gastos conocidos',finMoney(f.cost)+(f.unknown?' + costos sin definir':'')],['Resultado previsto',f.result===null?'Por completar':finMoney(f.result)]]}];
    if(f.contract.extras.length)blocks.push({type:'heading',text:'Extras del acuerdo'},{type:'table',columns:['Concepto','Importe','Estado'],widths:[303,110,110],rows:f.contract.extras.map(x=>[x.description,finMoney(x.amount),x.voidedAt?'Anulado: '+x.voidReason:'Vigente'])});
    blocks.push({type:'heading',text:'Gastos y alquileres externos'},financeExpensesBlock(f.expenses),{type:'heading',text:'Cobros y pagos (incluye anulaciones)'},financeCashBlock(f.cash));
    reportPdf('Finanzas del evento',blocks,'finanzas-evento');
  }else{
    const f=api.financeMonth($('financeMonth').value||today().slice(0,7),$('financeHall').value);
    const blocks=[{type:'heading',text:f.month+' / '+$('financeHall').selectedOptions[0].textContent},{type:'text',text:'Caja por fecha de cobro/pago. Importes completos de eventos compartidos, sin prorrateo.'},{type:'table',columns:['Caja del mes','Importe'],widths:[330,193],rows:[['Cobros netos',finMoney(f.income-f.refunds)],['Pagos netos',finMoney(f.out-f.supplierRefunds)],['Flujo neto (no es ganancia)',finMoney(f.net)]]},{type:'text',text:'Prevision por fecha de evento: reservas confirmadas, sin cotizaciones ni cancelados. No es utilidad contable definitiva.'},{type:'table',columns:['Prevision','Importe'],widths:[330,193],rows:[['Resultado menos gastos generales',f.result===null?'Por completar':finMoney(f.result)],['Gastos generales',finMoney(f.generalCost)],['Reservas incompletas',f.incomplete],['Gastos compartidos fuera del filtro',finMoney(f.unassignedGeneral)]]},{type:'heading',text:'Eventos del mes'},{type:'table',columns:['Evento / fecha / salon','Acordado','Gastos','Resultado','Estado'],widths:[203,80,80,80,80],rows:f.rows.map(r=>[r.event.client+'\n'+reportDate(r.event.eventDate)+' / '+hallNames(r.event),finMoney(r.total),finMoney(r.cost)+(r.unknown?' + por definir':''),r.result===null?'Por completar':finMoney(r.result),statuses[r.event.status]])},{type:'heading',text:'Gastos generales'},financeExpensesBlock(f.general),{type:'heading',text:'Movimientos de caja vigentes'},financeCashBlock(f.cash)];
    reportPdf('Finanzas mensuales',blocks,'finanzas-mes');
  }
}
function financeExpensesBlock(rows){return {type:'table',columns:['Concepto','Costo','Pagado neto','Por pagar'],widths:[253,90,90,90],rows:rows.map(x=>[x.description,finMoney(x.amount),finMoney(x.paid),finMoney(x.pending)])};}
function financeCashBlock(rows){const state=api.get();return {type:'table',columns:['Fecha','Referencia / responsable','Importe','Movimiento / estado'],widths:[70,180,100,173],rows:rows.map(c=>[reportDate(c.date),finCashReference(c,state)+'\n'+c.by,finMoney(c.amount),finLabels[c.kind]+' / '+c.method+'\n'+(c.voidedAt?'ANULADO: '+c.voidReason:'Vigente')+(c.note?' / '+c.note:'')])};}
function financeCsv(){
  const f=api.financeMonth($('financeMonth').value||today().slice(0,7),$('financeHall').value),data=api.get();
  const safe=value=>typeof value==='string'&&/^[\s]*[=+\-@]/.test(value)?"'"+value:value;
  csv('finanzas-'+f.month,[['Fecha','Evento / gasto','Movimiento','Importe Bs','Medio','Responsable','Referencia','Registro'],...f.cash.map(c=>[c.date,finCashReference(c,data),finLabels[c.kind],c.amount/100,c.method,c.by,c.note,c.id].map(safe))]);
}
function initFinance(){
  $('detailEdit').insertAdjacentHTML('beforebegin','<button type="button" class="btn event-expenses-open" id="detailExpensesOpen">Gastos del evento</button>');
  Object.assign(types,{'finanzas-acuerdo':'Precio acordado','finanzas-extra':'Extra del acuerdo','finanzas-expense':'Gasto financiero','finanzas-expense-edit':'Gasto modificado','finanzas-cash':'Movimiento de caja','finanzas-anulacion':'Anulacion financiera'});
  $('detailReadOnly').querySelector('.detail-overview-grid').insertAdjacentHTML('afterend','<section id="detailFinance" class="detail-section"></section>');
  document.querySelector('.salon-module').insertAdjacentHTML('beforeend',`<div id="salon-finance" class="salon-view"><div class="finance-section-heading"><h2>Finanzas</h2><div class="actions"><button type="button" class="btn" id="financeCsv">Exportar CSV</button><button type="button" class="btn" id="financePdf">PDF mensual</button>${finButton('Nuevo gasto general','expense')}</div></div><div class="finance-filters"><div class="field"><label for="financeMonth">Mes</label><input id="financeMonth" type="month" min="1900-01" max="2199-12" required value="${today().slice(0,7)}"></div><div class="field"><label for="financeHall">Salon</label><select id="financeHall"></select></div></div><section class="finance-band"><h3>Caja · fecha de cobro / pago</h3><div id="financeCashMetrics" class="finance-metrics"></div></section><section class="finance-band"><h3>Prevision · fecha del evento</h3><p class="salon-muted">Reservas confirmadas, sin cotizaciones ni cancelados. Resultado segun importes registrados, no utilidad contable definitiva.</p><div id="financeForecastMetrics" class="finance-metrics"></div><p id="financeShared" class="salon-muted"></p></section><section class="finance-band"><h3>Eventos del mes</h3><div id="financeEvents"></div></section><section class="finance-band"><h3>Gastos generales</h3><div id="financeGeneral"></div></section><section class="finance-band"><h3>Movimientos de caja del mes</h3><div id="financeCashList"></div></section></div><dialog id="financeDialog" class="salon-dialog finance-dialog" aria-labelledby="financeDialogTitle"><div class="history-heading"><div><h2 id="financeDialogTitle"></h2><p id="financeDialogContext" class="salon-muted"></p></div><button type="button" class="btn small" id="financeDialogClose">Cerrar</button></div><form id="financeForm" class="form"><div id="financeFields"></div><div class="field"><label for="finBy">Registrado por</label><input id="finBy" maxlength="120" required></div><p id="financeMessage" class="invalid" role="status"></p><button type="submit" class="btn primary">Guardar registro</button></form></dialog>`);
  $('financeForm').addEventListener('submit',saveFinanceDialog);$('financeDialogClose').addEventListener('click',closeFinanceDialog);
  $('financeFields').addEventListener('input',syncExpensePayment);$('financeFields').addEventListener('change',syncExpensePayment);
  $('financeDialog').addEventListener('cancel',event=>{event.preventDefault();closeFinanceDialog();});
  ['financeMonth','financeHall'].forEach(id=>$(id).addEventListener('input',renderFinanceMonth));
  $('financeMonth').addEventListener('change',()=>{if(!$('financeMonth').value)$('financeMonth').value=today().slice(0,7);renderFinanceMonth();});
  $('financeCsv').addEventListener('click',financeCsv);$('financePdf').addEventListener('click',()=>financePdf());
  document.querySelector('.salon-module').addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b||api.saving())return;
    if(b.id==='detailExpensesOpen'&&!detailEditing){$('detailExpenses').scrollIntoView({block:'start'});$('detailExpensesTitle').focus({preventScroll:true});}
    if(b.dataset.finMode)openFinanceDialog({mode:b.dataset.finMode,eventId:b.dataset.finEvent,expenseId:b.dataset.finExpense,productId:b.dataset.finProduct,kind:b.dataset.finKind,record:b.dataset.finRecord});
    if(b.dataset.finPdfEvent)financePdf(b.dataset.finPdfEvent);
    if(b.dataset.finOpen&&openEventDetail(b.dataset.finOpen,'finance'))$('detailFinance').scrollIntoView({block:'start'});
  });
  window.addEventListener('elianne:restored',()=>{finContext=null;$('financeDialog').close();});
  window.addEventListener('beforeunload',event=>{if(finDialogDirty()){event.preventDefault();event.returnValue='';}});
}
