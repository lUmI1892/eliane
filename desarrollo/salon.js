(() => {
  'use strict';
  const api = window.Elianne;
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = api.today;
  const money = v => Number(v || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const statuses = { cotizacion: 'Cotizacion', reservado: 'Reservado', 'en-evento': 'En evento', devuelto: 'Devuelto', cerrado: 'Cerrado', cancelado: 'Cancelado' };
  const prodStatus = { disponible: 'Disponible', limpieza: 'En limpieza', mantenimiento: 'Mantenimiento', danado: 'Dañado', baja: 'Baja' };
  const types = { 'saldo-inicial': 'Saldo inicial', alta: 'Alta', edicion: 'Edicion', compra: 'Compra', reparacion: 'Reparacion', recuperacion: 'Recuperacion', baja: 'Baja', 'correccion-entrada': 'Correccion +', 'correccion-salida': 'Correccion -', salida: 'Salida', devolucion: 'Devolucion', 'daño': 'Daño', faltante: 'Faltante' };
  let draft = [], editing = null;
  let eventPriceBaseline='',eventPriceExpected=null;
  let eventPaymentId=api.uid();
  let selectedDay = today(), calendarMonth = today().slice(0, 7);
  let assigning=null;
  let historyEventId=null;
  const hallColors={'hall-1':{accent:'#d32f2f',tint:'#fde8e7',ink:'#9b1c1c'},'hall-2':{accent:'#16803c',tint:'#e2f4e8',ink:'#12602d'},'hall-3':{accent:'#2563eb',tint:'#e8efff',ink:'#1e40af'}};
  const hallNames=e=>api.get().halls.filter(h=>(e.hallIds||[]).includes(h.id)).map(h=>h.name).join(' + ')||'Sin salon asignado';
  const hallDots=e=>(e.hallIds||[]).map(id=>`<i class="hall-dot" style="background:${hallColors[id].accent}"></i>`).join('')||'<i class="hall-dot unassigned-dot"></i>';
  const venueLabel=e=>(e.venueMode==='hours'?e.startTime+' a '+e.endTime:'Dia completo')+(e.venueEndDate!==e.eventDate?' · hasta '+e.venueEndDate:'');
  const returns = new Map();
  const product = pid => api.get().items.find(p => p.id === pid);
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  /* REPORT-PDF */
  /* RENTALS-UI */
  /* EVENT-DETAIL */
  /* CATALOG-UI */
  /* CATEGORIES-UI */
  /* FINANCE-UI */
  async function run(action, success = 'Guardado correctamente.') {
    try { await action(); api.notify(success); return true; }
    catch (error) { api.notify(error.message, true); return false; }
  }
  function init() {
    document.querySelector('.app').insertAdjacentHTML('beforeend', `
      <section class="salon-module" aria-label="Control de eventos">
        <nav class="salon-tabs" aria-label="Secciones del salon">
          ${[['calendar','Agenda'],['events','Eventos'],['finance','Finanzas'],['inventory','Inventario'],['returns','Salida y devolucion'],['settings','Stock y costos'],['movements','Movimientos'],['alerts','Alertas'],['reports','Reportes']].map(([key,label],i)=>`<button type="button" class="btn salon-tab ${i===0?'active':''}" data-tab="${key}" aria-pressed="${i===0}">${label}</button>`).join('')}
        </nav>
        <div id="salon-calendar" class="salon-view active">
          <div class="agenda-heading"><div><h2>Agenda de salones</h2><div id="agendaMetrics" class="agenda-metrics"></div></div><div class="actions"><button class="btn" type="button" id="hallConfigOpen">Salones</button><button class="btn primary" type="button" id="calendarNew">Nuevo evento</button></div></div>
          <div id="calendarPending" class="venue-pending" hidden></div>
          <div class="calendar-toolbar">
            <div class="calendar-month-nav"><button type="button" class="btn icon-btn" id="calendarPrev" aria-label="Mes anterior" title="Mes anterior">&#8249;</button><h3 id="calendarTitle" aria-live="polite"></h3><button type="button" class="btn icon-btn" id="calendarNext" aria-label="Mes siguiente" title="Mes siguiente">&#8250;</button><button type="button" class="btn" id="calendarToday">Hoy</button></div>
            <div class="calendar-pickers"><input type="month" id="calendarMonth" aria-label="Ir al mes" min="1900-01" max="2199-12"><select id="calendarHall" aria-label="Filtrar por salon"></select><select id="calendarFilter" aria-label="Filtrar agenda"><option value="">Todos los eventos</option><option value="occupied">Reservas confirmadas</option><option value="cotizacion">Cotizaciones</option><option value="finished">Finalizados</option></select></div>
          </div>
          <div id="calendarHallLegend" class="calendar-legend" aria-label="Salones de la agenda"></div>
          <div class="agenda-layout">
            <div class="calendar-board"><div class="calendar-weekdays" aria-hidden="true">${['Lun','Mar','Mie','Jue','Vie','Sab','Dom'].map(d=>`<span>${d}</span>`).join('')}</div><div id="calendarDays" class="calendar-days" aria-label="Dias del mes"></div></div>
            <aside class="agenda-day"><div class="agenda-day-heading"><h3 id="calendarDayTitle"></h3><button type="button" class="btn small" id="calendarNewDay">Agregar evento</button></div><div id="calendarHallStatus"></div><div id="calendarDayEvents" class="salon-list" aria-live="polite"></div></aside>
          </div>
        </div>
        <div id="salon-inventory" class="salon-view"><div class="inventory-heading"><h2>Inventario</h2><div class="actions" id="inventoryExports"></div></div></div>
        <div id="salon-events" class="salon-view">
          <div class="salon-grid">
            <form class="form" id="salonEventForm">
              <h2 id="salonEventTitle">Nuevo evento</h2>
              <p class="event-form-intro">Completa estas 4 secciones en orden y guarda el evento al final.</p>
              <section class="event-form-step event-step-data" aria-labelledby="eventStepData">
                <header class="event-step-heading"><span class="event-step-number" aria-hidden="true">1</span><div><h3 id="eventStepData">Datos del evento</h3><p>Cliente, invitados y responsable.</p></div></header>
              <div class="field"><label for="salonClient">Cliente / evento</label><input id="salonClient" required></div>
              <div class="field"><label for="salonGuests">Cantidad de invitados</label><input id="salonGuests" type="number" min="0" max="100000000" step="1" placeholder="Sin definir"></div>
              <div class="row">
                <div class="field"><label for="salonType">Tipo</label><select id="salonType">${['Boda','Cumpleaños','Corporativo','Bautizo','Graduacion','Otro'].map(x=>`<option>${x}</option>`).join('')}</select></div>
                <div class="field"><label for="salonStatus">Estado</label><select id="salonStatus"><option value="cotizacion">Cotizacion</option><option value="reservado">Reservado</option></select></div>
              </div>
              <div class="field"><label for="salonResp">Responsable</label><input id="salonResp" required></div>
              <div class="field"><label for="salonPlace">Lugar</label><input id="salonPlace"></div>
              <div class="field"><label for="salonNotes">Notas</label><textarea id="salonNotes"></textarea></div>
              </section>
              <section class="event-form-step event-step-venue" aria-labelledby="eventStepVenue">
                <header class="event-step-heading"><span class="event-step-number" aria-hidden="true">2</span><div><h3 id="eventStepVenue">Fechas y salón</h3><p>Reserva el espacio y define su horario.</p></div></header>
                <div class="field"><label for="salonEventDate">Fecha del evento</label><input id="salonEventDate" type="date" required></div>
                ${venueFields('event')}
              </section>
              <section class="event-form-step event-step-material" aria-labelledby="eventStepMaterial">
                <header class="event-step-heading"><span class="event-step-number" aria-hidden="true">3</span><div><h3 id="eventStepMaterial">Productos y material</h3><p>Elige los productos y cuándo salen y regresan.</p></div></header>
              <div class="row">
                <div class="field"><label for="salonDate">Fecha de salida</label><input id="salonDate" type="date" required></div>
                <div class="field"><label for="salonEnd">Devolucion prevista</label><input id="salonEnd" type="date" required></div>
              </div>
              <button type="button" class="btn primary catalog-open" id="salonCatalogOpen">Seleccionar productos con fotos</button>
              <div class="salon-assign">
                <div class="field"><label for="salonProduct">Producto</label><select id="salonProduct"></select></div>
                <div class="field"><label for="salonQty">Cantidad</label><input id="salonQty" type="number" min="1" step="1"></div>
                <button type="button" class="btn" id="salonAddItem">Agregar</button>
              </div>
              <div id="salonDraft"></div>
              <section id="salonRentalsDraft" class="rental-draft-section" hidden></section>
              </section>
              <section class="event-form-step event-step-payment" aria-labelledby="eventStepPayment">
                <header class="event-step-heading"><span class="event-step-number" aria-hidden="true">4</span><div><h3 id="eventStepPayment">Precio, abonos y saldo</h3><p>Registra lo acordado y el dinero recibido.</p></div></header>
              <div class="field"><label for="salonBasePrice">Precio base acordado (Bs)</label><input id="salonBasePrice" type="number" min="0" max="1000000000000" step="0.01" placeholder="Sin definir"></div>
              <div class="field"><label id="salonPaymentLabel" for="salonPaymentAmount">Anticipo recibido (Bs)</label><input id="salonPaymentAmount" type="number" min="0" max="1000000000000" step="0.01" placeholder="0.00"></div>
              <div id="salonPaymentFields" class="event-payment-fields" hidden><div class="row"><div class="field"><label for="salonPaymentDate">Fecha del abono</label><input id="salonPaymentDate" type="date" value="${today()}" max="${today()}"></div><div class="field"><label for="salonPaymentMethod">Medio de pago</label><select id="salonPaymentMethod">${['Efectivo','Transferencia','QR','Tarjeta','Otro'].map(x=>`<option>${x}</option>`).join('')}</select></div></div><div class="field"><label for="salonPaymentNote">Referencia del abono</label><input id="salonPaymentNote" maxlength="300"></div></div>
              <dl class="event-payment-summary"><div><dt>Total acordado</dt><dd><output id="salonPaymentTotal"></output></dd></div><div id="salonPreviousPaymentRow" hidden><dt>Pagado anteriormente</dt><dd><output id="salonPreviousPayment"></output></dd></div><div><dt>Total pagado</dt><dd><output id="salonPaymentPaid"></output></dd></div><div><dt>Saldo pendiente</dt><dd><output id="salonPaymentBalance"></output></dd></div><div id="salonPaymentCreditRow" hidden><dt>Saldo a favor del cliente</dt><dd><output id="salonPaymentCredit"></output></dd></div></dl>
              </section>
              <div id="eventChangeMeta" class="event-change-meta" hidden><div class="field"><label for="salonRecordedBy">Cambio registrado por</label><input id="salonRecordedBy" maxlength="120"></div><div class="field"><label for="salonChangeNote">Motivo / solicitud del cliente</label><textarea id="salonChangeNote" maxlength="10000"></textarea></div></div>
              <div class="actions"><button class="btn primary" type="submit">Guardar evento</button><button class="btn" type="button" id="salonClearEvent">Limpiar</button></div>
            </form>
            <div class="salon-event-column">
              <h2>Eventos registrados</h2>
              <div class="event-list-filters">
                <div class="field"><label for="salonEventMonth">Mes del evento</label><input id="salonEventMonth" type="month" min="1900-01" max="2199-12" value="${today().slice(0,7)}" required></div>
                <div class="field"><label for="salonEventHall">Salon</label><select id="salonEventHall"></select></div>
                <div class="field"><label for="salonEventFilter">Estado</label><select id="salonEventFilter"><option value="">Todos los estados</option>${Object.entries(statuses).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
                <div class="field event-list-search"><label for="salonEventSearch">Buscar eventos</label><input id="salonEventSearch" type="search" placeholder="Evento, producto o responsable"></div>
              </div>
              <p id="salonEventSelection" class="salon-muted event-list-summary" role="status"></p>
              <div class="salon-list" id="salonEventList"></div>
            </div>
          </div>
        </div>
        <div id="salon-returns" class="salon-view"><div class="salon-list" id="salonReturnList"></div></div>
        <div id="salon-alerts" class="salon-view"><div class="salon-alerts" id="salonAlertList"></div></div>
        <div id="salon-settings" class="salon-view">
          <div class="salon-grid">
            <form class="form" id="salonExtraForm"><h2>Estado y costo</h2>
              <div class="field"><label for="extraProduct">Producto</label><select id="extraProduct" required></select></div>
              <div class="field"><label for="extraStatus">Estado</label><select id="extraStatus">${Object.entries(prodStatus).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
              <div class="row"><div class="field"><label for="extraMin">Stock minimo</label><input id="extraMin" type="number" min="0" step="1" required></div><div class="field"><label for="extraCost">Costo de reposicion (Bs)</label><input id="extraCost" type="number" min="0" step="0.01" required></div></div>
              <button type="submit" class="btn primary">Guardar datos</button>
            </form>
            <div class="salon-event-column"><h2>Disponibilidad por periodo</h2><div class="row"><div class="field"><label for="stockStart">Desde</label><input id="stockStart" type="date" value="${today()}"></div><div class="field"><label for="stockEnd">Hasta</label><input id="stockEnd" type="date" value="${today()}"></div></div><div class="salon-list" id="salonStockList"></div></div>
          </div>
        </div>
        <div id="salon-movements" class="salon-view">
          <form class="form movement-form" id="movementForm"><h2>Nuevo movimiento</h2>
            <div class="row"><div class="field"><label for="moveProduct">Producto</label><select id="moveProduct" required></select></div><div class="field"><label for="moveType">Movimiento</label><select id="moveType">${['compra','reparacion','recuperacion','baja','correccion-entrada','correccion-salida'].map(k=>`<option value="${k}">${types[k]}</option>`).join('')}</select></div></div>
            <div class="row"><div class="field"><label for="moveQty">Cantidad</label><input id="moveQty" type="number" min="1" step="1" required></div><div class="field"><label for="moveResp">Responsable</label><input id="moveResp" required></div></div>
            <div class="field"><label for="moveReason">Motivo</label><input id="moveReason" required></div><div class="actions"><button type="submit" class="btn primary">Registrar movimiento</button></div>
          </form>
          <div class="salon-tools"><input id="moveSearch" type="search" placeholder="Buscar en el historial" aria-label="Buscar movimientos"><button type="button" class="btn" id="moveCsv">Exportar movimientos CSV</button></div>
          <div id="movementList"></div>
        </div>
        <div id="salon-reports" class="salon-view"><div class="report-heading"><h2>Reportes</h2></div><div class="report-filters"><div class="field"><label for="reportFrom">Eventos desde</label><input id="reportFrom" type="date"></div><div class="field"><label for="reportTo">Eventos hasta</label><input id="reportTo" type="date"></div><div class="field"><label for="reportHall">Salon</label><select id="reportHall"><option value="">Todos los salones</option></select></div><div class="field"><label for="reportStatus">Estado del evento</label><select id="reportStatus"><option value="">Todos los estados</option>${Object.entries(statuses).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></div><label class="report-check"><input id="reportDetails" type="checkbox" checked> Incluir ficha de cada evento</label></div><p id="reportSelection" class="salon-muted" aria-live="polite"></p><div id="salonReportList" class="report-grid"></div></div>
        <dialog id="hallConfigDialog" class="salon-dialog" aria-labelledby="hallConfigTitle"><form id="hallConfigForm" class="form"><h2 id="hallConfigTitle">Salones</h2>${api.get().halls.map(h=>`<div class="field"><label for="name-${h.id}">Nombre ${h.id.slice(-1)}</label><input id="name-${h.id}" maxlength="60" required></div>`).join('')}<p id="hallConfigError" class="invalid" role="status"></p><div class="actions"><button class="btn" type="button" data-close-dialog="hallConfigDialog">Cancelar</button><button class="btn primary" type="submit">Guardar nombres</button></div></form></dialog>
        <dialog id="assignDialog" class="salon-dialog" aria-labelledby="assignTitle"><form id="assignForm" class="form"><h2 id="assignTitle">Asignar salones</h2><p id="assignDate" class="salon-muted"></p>${venueFields('assign')}<p id="assignError" class="invalid" role="status"></p><div class="actions"><button class="btn" type="button" data-close-dialog="assignDialog">Cancelar</button><button class="btn primary" type="submit">Guardar asignacion</button></div></form></dialog>
        <dialog id="eventHistoryDialog" class="salon-dialog history-dialog" aria-labelledby="historyTitle"><div class="history-heading"><div><h2 id="historyTitle">Historial del evento</h2><p id="historySummary" class="salon-muted"></p></div><button class="btn small" type="button" data-close-dialog="eventHistoryDialog">Cerrar</button></div><form id="historyForm" class="form history-form"><div class="row"><div class="field"><label for="historyGuests">Invitados actuales</label><input id="historyGuests" type="number" min="0" max="100000000" step="1" placeholder="Sin definir"></div><div class="field"><label for="historyBy">Registrado por</label><input id="historyBy" maxlength="120" required></div></div><div class="field"><label for="historyNote">Nota / solicitud del cliente</label><textarea id="historyNote" maxlength="10000"></textarea></div><p id="historyMessage" role="status"></p><div class="actions"><button class="btn primary" type="submit">Guardar cambio o nota</button></div></form><div class="history-toolbar"><h3>Cambios registrados</h3><button id="historyExport" type="button" class="btn small">Exportar historial CSV</button></div><ol id="historyTimeline" class="history-timeline"></ol></dialog>
      </section>`);
    $('salon-inventory').append(document.querySelector('.stats'), document.querySelector('.layout'));
    $('inventoryExports').append($('excelBtn'), $('pdfBtn'));
    initRentals();
    initCatalog();
    initCategories();
    initEventDetail();
    initFinance();
    document.querySelector('.salon-module').addEventListener('click', click);
    document.querySelector('.salon-module').addEventListener('input', input);
    $('calendarDays').addEventListener('keydown', event => {
      const day=event.target.closest('[data-calendar-date]'); if(!day)return;
      const d=localDate(day.dataset.calendarDate), weekday=(d.getDay()+6)%7;
      const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-weekday,End:6-weekday}[event.key];
      if(delta===undefined)return;
      event.preventDefault();d.setDate(d.getDate()+delta);selectDay(dateKey(d),true);
    });
    $('salonEventForm').addEventListener('submit', saveEvent);
    $('salonEventMonth').addEventListener('change',()=>{if(!$('salonEventMonth').value)$('salonEventMonth').value=today().slice(0,7);renderEvents();});
    $('salonExtraForm').addEventListener('submit', e => { e.preventDefault(); run(() => api.saveExtra($('extraProduct').value, { status: $('extraStatus').value, minQty: $('extraMin').value, cost: $('extraCost').value })); });
    ['reportFrom','reportTo','reportHall','reportStatus'].forEach(id=>$(id).addEventListener('change',renderReports));
    $('extraProduct').addEventListener('change', loadExtras);
    $('hallConfigForm').addEventListener('submit',e=>{
      e.preventDefault();dialogSave('hallConfigDialog','hallConfigError',()=>api.saveHalls(api.get().halls.map(h=>({id:h.id,name:$('name-'+h.id).value}))));
    });
    $('assignForm').addEventListener('submit',e=>{
      e.preventDefault();dialogSave('assignDialog','assignError',()=>api.assignVenue(assigning,readVenue('assign')));
    });
    $('historyForm').addEventListener('submit',async event=>{
      event.preventDefault();const eventId=historyEventId;
      try{
        await api.updateGuests(eventId,$('historyGuests').value,$('historyBy').value,$('historyNote').value);
        $('historyGuests').value=api.get().events.find(e=>e.id===eventId)?.guestCount??'';$('historyNote').value='';
        $('historyMessage').textContent='Cambio registrado en el historial.';$('historyMessage').className='history-success';renderHistory();
        detailHistorySaved();
      }catch(error){$('historyMessage').textContent=error.message;$('historyMessage').className='invalid';}
    });
    $('movementForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (await run(() => api.adjust($('moveProduct').value, $('moveType').value, $('moveQty').value, $('moveReason').value, $('moveResp').value))) { $('moveQty').value = ''; $('moveReason').value = ''; }
    });
    window.addEventListener('elianne:change', refresh);
    window.addEventListener('elianne:restored', () => { returns.clear(); resetEvent();if($('eventHistoryDialog').open)$('eventHistoryDialog').close();historyEventId=null; refresh(); });
    refresh();
  }
  function showTab(key) {
    if(key!=='event-detail'&&detailEventId&&!leaveEventDetail())return false;
    const activeKey=key==='event-detail'?detailReturnTab:key;
    document.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === activeKey); b.setAttribute('aria-pressed', String(b.dataset.tab === activeKey)); });
    document.querySelectorAll('.salon-view').forEach(v => v.classList.toggle('active', v.id === 'salon-' + key));
    return true;
  }
  function venueFields(prefix) {
    return `<fieldset class="venue-fields"><legend>Salones y ocupacion</legend><div class="hall-choices" id="${prefix}Halls">${api.get().halls.map(h=>`<label class="hall-choice"><input type="checkbox" name="${prefix}Hall" value="${h.id}"><i class="hall-dot" style="background:${hallColors[h.id].accent}"></i><span data-hall-name="${h.id}">${esc(h.name)}</span></label>`).join('')}</div><div class="venue-mode" role="group" aria-label="Tipo de reserva"><label><input type="radio" name="${prefix}Mode" value="day" checked>Dia completo</label><label><input type="radio" name="${prefix}Mode" value="hours">Por horario</label></div><div class="field"><label for="${prefix}VenueEnd">Fecha de fin de ocupacion</label><input id="${prefix}VenueEnd" type="date" required></div><div id="${prefix}Hours" class="row" hidden><div class="field"><label for="${prefix}StartTime">Hora de inicio</label><input id="${prefix}StartTime" type="time"></div><div class="field"><label for="${prefix}EndTime">Hora de fin</label><input id="${prefix}EndTime" type="time"></div></div><div class="row"><div class="field"><label for="${prefix}Setup">Montaje (minutos)</label><input id="${prefix}Setup" type="number" min="0" max="2880" step="1" value="0" required></div><div class="field"><label for="${prefix}Cleanup">Limpieza (minutos)</label><input id="${prefix}Cleanup" type="number" min="0" max="2880" step="1" value="0" required></div></div></fieldset>`;
  }
  function readVenue(prefix) {
    return {hallIds:[...document.querySelectorAll(`input[name="${prefix}Hall"]:checked`)].map(el=>el.value),venueMode:document.querySelector(`input[name="${prefix}Mode"]:checked`).value,venueEndDate:$(prefix+'VenueEnd').value,startTime:$(prefix+'StartTime').value,endTime:$(prefix+'EndTime').value,setupMinutes:$(prefix+'Setup').value,cleanupMinutes:$(prefix+'Cleanup').value};
  }
  function setVenue(prefix,e) {
    document.querySelectorAll(`input[name="${prefix}Hall"]`).forEach(el=>el.checked=(e.hallIds||[]).includes(el.value));
    document.querySelector(`input[name="${prefix}Mode"][value="${e.venueMode||'day'}"]`).checked=true;
    $(prefix+'VenueEnd').value=e.venueEndDate||e.eventDate||'';
    $(prefix+'StartTime').value=e.venueMode==='hours'?e.startTime:'';$(prefix+'EndTime').value=e.venueMode==='hours'?e.endTime:'';
    $(prefix+'Setup').value=e.setupMinutes||0;$(prefix+'Cleanup').value=e.cleanupMinutes||0;syncVenueMode(prefix);
  }
  function syncVenueMode(prefix) {
    const hours=document.querySelector(`input[name="${prefix}Mode"]:checked`).value==='hours';
    $(prefix+'Hours').hidden=!hours;$(prefix+'StartTime').required=hours;$(prefix+'EndTime').required=hours;
  }
  async function dialogSave(dialog,error,action) {
    try{await action();$(dialog).close();api.notify('Guardado correctamente.');}catch(e){$(error).textContent=e.message;}
  }
  function openAssignment(id) {
    const e=api.get().events.find(e=>e.id===id);if(!e)return;
    assigning=id;$('assignTitle').textContent=e.client;$('assignDate').textContent='Inicio del evento: '+longDate(e.eventDate);$('assignError').textContent='';setVenue('assign',e);$('assignDialog').showModal();
  }
  const guestsLabel=e=>e.guestCount==null?'Sin definir':String(e.guestCount);
  function openHistory(id){
    if(detailEventId===id){$('detailHistorySection').scrollIntoView({block:'start'});$('historyGuests').focus();return;}
    const e=api.get().events.find(e=>e.id===id);if(!e)return;
    historyEventId=id;$('historyGuests').value=e.guestCount??'';$('historyGuests').disabled=['cerrado','cancelado'].includes(e.status);
    $('historyBy').value='';$('historyNote').value='';$('historyMessage').textContent='';renderHistory();$('eventHistoryDialog').showModal();
  }
  function renderHistory(){
    if(!historyEventId)return;
    const e=api.get().events.find(e=>e.id===historyEventId);
    if(!e){if($('eventHistoryDialog').open)$('eventHistoryDialog').close();historyEventId=null;return;}
    $('historyTitle').textContent=e.client;
    $('historySummary').textContent=`Evento: ${e.eventDate} · ${hallNames(e)} · Invitados: ${guestsLabel(e)}`;
    const labels={'evento-creado':'Evento creado','evento-editado':'Cambio del evento','evento-invitados':'Invitados','evento-nota':'Nota del evento','salones-asignados':'Salones y horario',conteo:'Conteo de devolucion',salida:'Salida de material',devolucion:'Devolucion','daño':'Daño',faltante:'Faltante'};
    Object.entries(types).filter(([key])=>key.startsWith('alquiler-')).forEach(([key,label])=>labels[key]=label);
    const entries=api.eventHistory(e.id);
    $('historyTimeline').innerHTML=entries.length?entries.map(m=>`<li class="history-entry"><div class="history-entry-head"><strong>${esc(labels[m.type]||(m.type.startsWith('evento-')?'Estado: '+(statuses[m.type.slice(7)]||m.type.slice(7)):m.type))}</strong><time datetime="${new Date(m.at).toISOString()}">${esc(new Date(m.at).toLocaleString('es-BO',{dateStyle:'medium',timeStyle:'short'}))}</time></div><p class="history-detail">${esc(m.detail)}</p><p class="salon-muted">Responsable registrado: ${esc(m.responsible||'No registrado')}${m.productName?' · '+esc(m.productName):''}</p></li>`).join(''):'<li class="empty">Todavia no hay cambios registrados para este evento.</li>';
  }
  function exportHistory(){
    const e=api.get().events.find(e=>e.id===historyEventId);if(!e)return;
    csv('historial-evento',[['Evento','Fecha del evento','Fecha del registro','Tipo','Detalle','Responsable registrado'],...api.eventHistory(e.id).map(m=>[m.eventName||e.client,e.eventDate,new Date(m.at).toLocaleString('es-BO'),m.type,m.detail,m.responsible])]);
  }
  function refreshHallNames() {
    const halls=api.get().halls;
    for(const id of ['calendarHall','salonEventHall']){
      const current=$(id).value;
      $(id).innerHTML='<option value="">Todos los salones</option>'+halls.map(h=>`<option value="${h.id}">${esc(h.name)}</option>`).join('')+'<option value="unassigned">Sin salon asignado</option>';
      $(id).value=current;
    }
    document.querySelectorAll('[data-hall-name]').forEach(el=>el.textContent=halls.find(h=>h.id===el.dataset.hallName)?.name||'');
    $('calendarHallLegend').innerHTML=halls.map(h=>`<span><i data-hall-legend="${h.id}" style="background:${hallColors[h.id].accent}" aria-hidden="true">${h.id.slice(-1)}</i>${esc(h.name)}</span>`).join('')+'<span><i class="unassigned-dot" aria-hidden="true">?</i>Sin asignar</span>';
  }
  function period() { const a = $('salonDate').value || today(); return [a, $('salonEnd').value || a]; }
  function selectOptions(el, items, label) {
    const current = el.value;
    el.innerHTML = items.map(p => `<option value="${esc(p.id)}">${esc(label(p))}</option>`).join('');
    if (items.some(p => p.id === current)) el.value = current;
  }
  function refreshSelects() {
    const items = api.get().items, [a,b] = period();
    selectOptions($('salonProduct'), items, p => p.name + ' · disp. ' + api.available(p.id, a, b, editing));
    selectOptions($('extraProduct'), items, p => p.name);
    selectOptions($('moveProduct'), items, p => p.name);
  }
  function loadExtras() {
    const ex = api.extra($('extraProduct').value);
    $('extraStatus').value = ex.status; $('extraMin').value = ex.minQty; $('extraCost').value = ex.cost;
  }
  function refresh() {
    refreshHallNames();refreshSelects(); loadExtras(); renderDraft(); renderEvents(); renderReturns(); renderAlerts(); renderStock(); renderMovements(); renderReports(); renderCalendar();if($('eventHistoryDialog').open)renderHistory();
    renderEventDetail();
    renderFinanceMonth();
    updateEventPaymentPreview();
  }
  const localDate = key => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d || 1,12); };
  const dateKey = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const longDate = key => localDate(key).toLocaleDateString('es-BO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  function calendarEvents() {
    const filter = $('calendarFilter').value,hall=$('calendarHall').value;
    return api.get().events.filter(e=>e.status!=='cancelado'&&matchesHall(e,hall)&&(!filter || (filter==='occupied'?api.occupiesHall(e):filter==='finished'?['devuelto','cerrado'].includes(e.status):e.status===filter))).sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.client.localeCompare(b.client,'es'));
  }
  const matchesHall=(e,hall)=>!hall||(hall==='unassigned'?!e.hallIds.length:e.hallIds.includes(hall));
  function calendarChip(e) {
    const ids=Object.keys(hallColors).filter(id=>e.hallIds.includes(id));
    const color=ids.length===1?hallColors[ids[0]]:{accent:'#64748b',tint:'#eef2f5',ink:'#36434e'};
    const markers=ids.length?ids.map(id=>`<i class="calendar-chip-hall" data-chip-hall="${id}" style="background:${hallColors[id].accent}">${id.slice(-1)}</i>`).join(''):'<i class="calendar-chip-hall unassigned-dot">?</i>';
    return `<button type="button" class="calendar-event venue-event ${e.status==='cotizacion'?'quote-chip':''}" data-open-detail="${esc(e.id)}" style="--hall-accent:${color.accent};--hall-tint:${color.tint};--hall-ink:${color.ink}" aria-label="${esc('Abrir evento: '+e.client+' - '+hallNames(e))}" title="${esc(e.client+' | '+hallNames(e)+' | '+venueLabel(e)+' | '+statuses[e.status])}"><span class="calendar-chip-halls" aria-hidden="true">${markers}</span><span class="calendar-chip-label">${e.status==='cotizacion'?'Cot. ':''}${esc(e.client)}</span></button>`;
  }
  function calendarHallMarkers(events,halls){
    if(!events.length)return '';
    const marks=halls.map(h=>{
      const list=events.filter(e=>e.hallIds.includes(h.id));
      if(!list.length)return '<span class="calendar-hall-mark is-empty"></span>';
      const confirmed=list.some(api.occupiesHall),color=hallColors[h.id];
      return `<span class="calendar-hall-mark ${confirmed?'is-booked':'is-quote'}" data-hall-marker="${h.id}" data-marker-state="${confirmed?'booked':'quote'}" style="--marker-color:${color.accent}" title="${esc(h.name+': '+(confirmed?'Reserva confirmada':'Cotizacion'))}">${h.id.slice(-1)}</span>`;
    }).join('');
    const unknown=events.some(e=>!e.hallIds.length);
    return `<span class="calendar-hall-marks ${unknown?'has-unassigned':''}" aria-hidden="true">${marks}${unknown?'<span class="calendar-hall-mark is-unassigned" title="Sin salon asignado">?</span>':''}</span>`;
  }
  function renderHallStatus() {
    const all=api.get(),booked=all.events.filter(e=>api.occupiesHall(e)&&api.onVenueDay(e,selectedDay)),unknown=booked.filter(e=>!e.hallIds.length);
    const dayStart=Date.parse(selectedDay+'T00:00:00Z')/60000;
    $('calendarHallStatus').innerHTML=all.halls.map(h=>{
      const list=booked.filter(e=>e.hallIds.includes(h.id));
      const label=list.length?(list.some(e=>{const span=api.venueRange(e);return span.start<=dayStart&&span.end>=dayStart+1440;})?'Reservado todo el dia':list.length+' reserva'+(list.length>1?'s':'')+' por horario'):unknown.length?'Por revisar':'Sin reservas';
      return `<div class="hall-day-status"><span><i class="hall-dot" style="background:${hallColors[h.id].accent}"></i>${esc(h.name)}</span><strong class="${list.length?'hall-busy':unknown.length?'invalid':'hall-free'}">${label}</strong></div>`;
    }).join('')+(unknown.length?`<p class="salon-muted invalid">${unknown.length} evento(s) sin salon asignado para este dia.</p>`:'');
  }
  function moveMonth(delta) {
    const d = localDate(calendarMonth+'-01'); d.setMonth(d.getMonth()+delta);
    const key = dateKey(d);
    if(key<'1900-01-01'||key>'2199-12-31')return;
    calendarMonth=key.slice(0,7); selectedDay=calendarMonth===today().slice(0,7)?today():calendarMonth+'-01'; renderCalendar();
  }
  function selectDay(key,focus=false) {
    if(key<'1900-01-01'||key>'2199-12-31')return;
    selectedDay=key;calendarMonth=key.slice(0,7);renderCalendar();
    if(focus)document.querySelector(`[data-calendar-date="${key}"]`).focus();
  }
  function renderCalendar() {
    const first = localDate(calendarMonth+'-01'), offset = (first.getDay()+6)%7;
    const count = new Date(first.getFullYear(),first.getMonth()+1,0,12).getDate(), cells = Math.ceil((offset+count)/7)*7;
    const halls=api.get().halls,all = api.get().events.filter(e=>e.status!=='cancelado'&&matchesHall(e,$('calendarHall').value)), events = calendarEvents();
    const dayEventsFor=key=>events.filter(e=>api.onVenueDay(e,key));
    $('calendarTitle').textContent=first.toLocaleDateString('es-BO',{month:'long',year:'numeric'});
    $('calendarMonth').value=calendarMonth;
    $('calendarPrev').disabled=calendarMonth==='1900-01'; $('calendarNext').disabled=calendarMonth==='2199-12';
    const lastKey=calendarMonth+'-'+String(count).padStart(2,'0'),thisMonth=all.filter(e=>api.onVenueDay(e,calendarMonth+'-01')||api.onVenueDay(e,lastKey)||(e.eventDate>=calendarMonth+'-01'&&e.eventDate<=lastKey));
    const occupied=Array.from({length:count},(_,i)=>calendarMonth+'-'+String(i+1).padStart(2,'0')).filter(key=>thisMonth.some(e=>api.occupiesHall(e)&&api.onVenueDay(e,key)));
    $('agendaMetrics').innerHTML=`<span><strong>${thisMonth.length}</strong> eventos este mes</span><span><strong>${occupied.length}</strong> fechas con reserva</span><span><strong>${thisMonth.filter(e=>e.status==='cotizacion').length}</strong> cotizaciones</span>`;
    const pending=api.get().events.filter(e=>api.occupiesHall(e)&&!e.hallIds.length&&((e.eventDate||e.date).slice(0,7)===calendarMonth));
    $('calendarPending').hidden=!pending.length;$('calendarPending').innerHTML=pending.length?`${pending.length} evento(s) de este mes sin salon asignado. <button type="button" class="btn small" id="showUnassigned">Revisar eventos</button>`:'';
    $('calendarDays').innerHTML=Array.from({length:cells},(_,index)=>{
      const d=new Date(first.getFullYear(),first.getMonth(),index-offset+1,12), key=dateKey(d), dayEvents=dayEventsFor(key), current=key.slice(0,7)===calendarMonth;
      const confirmed=dayEvents.filter(api.occupiesHall).length;
      const rooms=halls.filter(h=>dayEvents.some(e=>e.hallIds.includes(h.id))).map(h=>h.name).join(', ');
      const label=longDate(key)+'. '+(dayEvents.length?dayEvents.length+' eventos, '+confirmed+' confirmados. '+rooms+(dayEvents.some(e=>!e.hallIds.length)?'. Hay eventos sin salon asignado.':''):'Sin eventos registrados.');
      const hallSet=[...new Set(dayEvents.filter(api.occupiesHall).flatMap(e=>e.hallIds))];
      const tint=hallSet.length===1?`style="--day-hall-tint:${hallColors[hallSet[0]].tint}"`:'';
      return `<div class="calendar-day-cell"><button type="button" class="calendar-day ${!current?'outside-month':''} ${key===today()?'is-today':''} ${key===selectedDay?'is-selected':''} ${confirmed?'has-booking':''}" ${tint} data-calendar-date="${key}" aria-label="${esc(label)}" aria-pressed="${key===selectedDay}" ${key===today()?'aria-current="date"':''}><span class="day-number">${d.getDate()}</span>${dayEvents.length>2?`<span class="calendar-day-count">${dayEvents.length} ev.</span>`:''}<span class="day-mobile-status">${dayEvents.length?dayEvents.length+' ev.':''}</span>${calendarHallMarkers(dayEvents,halls)}</button><div class="day-events" data-detail-day="${key}">${dayEvents.slice(0,2).map(calendarChip).join('')}</div></div>`;
    }).join('');
    $('calendarDayTitle').textContent=longDate(selectedDay);
    renderHallStatus();const selected=dayEventsFor(selectedDay);
    $('calendarDayEvents').innerHTML=selected.length?selected.map(e=>`<article class="salon-card agenda-event"><span class="event-status event-${e.status}">${statuses[e.status]}</span><h3>${esc(e.client)}</h3><p class="venue-badge">${hallDots(e)}${esc(hallNames(e))}</p><p>Evento: ${esc(e.eventDate)} · Invitados: ${guestsLabel(e)}</p><p>${esc(venueLabel(e))}</p>${e.setupMinutes||e.cleanupMinutes?`<p class="salon-muted">Montaje: ${e.setupMinutes} min · Limpieza: ${e.cleanupMinutes} min</p>`:''}<p>${esc(e.type)}${e.place?' · '+esc(e.place):''}</p><p class="salon-muted">Responsable: ${esc(e.responsible||'Sin asignar')}</p><p class="salon-muted">Salida: ${esc(e.date)}<br>Devolucion: ${esc(e.returnDate)}</p><div class="salon-actions">${button('Ver evento','view',e.id)}${button('Historial','history',e.id)}${['cotizacion','reservado'].includes(e.status)?button('Editar','edit',e.id):''}${button(e.hallIds.length?'Salones / horario':'Asignar salon','assign',e.id)}</div></article>`).join(''):'<div class="empty">Sin eventos registrados para esta fecha.</div>';
  }
  function newEventFromCalendar() {
    if((editing||draft.length||$('salonClient').value)&&!confirm('Hay un evento en edicion. Reemplazar el formulario por uno nuevo?'))return;
    resetEvent();
    ['salonEventDate','salonDate','salonEnd'].forEach(key=>$(key).value=selectedDay);
    setVenue('event',{eventDate:selectedDay,hallIds:api.get().halls.some(h=>h.id===$('calendarHall').value)?[$('calendarHall').value]:[]});
    $('salonEventMonth').value=selectedDay.slice(0,7);renderEvents();
    refreshSelects(); renderDraft(); showTab('events'); $('salonClient').focus();
  }
  function renderDraft() {
    const [a,b] = period();
    $('salonDraft').innerHTML = draft.length ? `<div class="table-wrap"><table class="salon-table"><thead><tr><th>Producto</th><th>Necesita</th><th>Propios / disponibles</th><th></th></tr></thead><tbody>${draft.map((i,n)=>`<tr data-draft-row="${n}"><td>${esc(product(i.productId)?.name || 'Producto eliminado')}<p data-draft-coverage class="salon-muted"></p></td><td>${i.qty}</td><td><output data-draft-own>${api.ownQty(i)}</output> / ${api.available(i.productId,a,b,editing)}</td><td><div class="draft-actions"><button type="button" class="btn small" data-draft-rent="${n}">Alquiler externo</button><button type="button" class="btn small danger" data-remove="${n}">Quitar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Sin productos asignados.</div>';
    renderRentalDraft();updateDraftCoverage();
  }
  function summary(e,financial=false) {
    const f=financial?api.financeEvent(e.id):null;
    return `<div><h3>${esc(e.client)}</h3><p class="venue-badge">${hallDots(e)}${esc(hallNames(e))}</p><div class="meta"><span class="pill">Evento: ${esc(e.eventDate||e.date)}</span><span class="pill">Invitados: ${guestsLabel(e)}</span><span class="pill status-${e.status}">${statuses[e.status]}</span><span class="pill">Resp.: ${esc(e.responsible || 'Sin asignar')}</span></div>${f?`<dl class="event-payment-summary event-card-payment"><div><dt>Total acordado</dt><dd>${finMoney(f.total)}</dd></div><div><dt>Pagado neto</dt><dd>${finMoney(f.received)}</dd></div><div><dt>Saldo pendiente</dt><dd>${finMoney(f.pending)}</dd></div>${f.credit?`<div><dt>Saldo a favor</dt><dd>${finMoney(f.credit)}</dd></div>`:''}</dl>`:''}<p class="salon-muted">${esc(venueLabel(e))}</p><p class="salon-muted">Material: ${esc(e.date)} al ${esc(e.returnDate)}</p>${e.place?`<p class="salon-muted">${esc(e.place)}</p>`:''}${e.notes?`<p class="salon-muted">${esc(e.notes)}</p>`:''}${rentalSummary(e)}${hasRental(e)?button('Alquiler externo','rentals',e.id):''}</div>`;
  }
  function button(label, action, id, cls = '') { return `<button type="button" class="btn small ${cls}" data-action="${action}" data-event="${esc(id)}">${label}</button>`; }
  function readTable(e) {
    if(!e.items.length)return '<p class="salon-muted">Sin materiales asignados.</p>';
    return `<div class="table-wrap"><table class="salon-table"><thead><tr><th>Producto</th><th>Propios</th><th>Regreso propio</th><th>Dañado propio</th><th>Falta propio</th></tr></thead><tbody>${e.items.map(i=>`<tr><td>${esc(product(i.productId)?.name || 'Producto eliminado')}${i.external?`<br><span class="salon-muted">Externos: ${i.qty-api.ownQty(i)}</span>`:''}</td><td>${api.ownQty(i)}</td><td>${i.returned}</td><td>${i.damaged}</td><td>${i.missing}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderEvents() {
    const search = $('salonEventSearch').value.trim().toLocaleLowerCase(), filter = $('salonEventFilter').value;
    const month=$('salonEventMonth').value||today().slice(0,7),hall=$('salonEventHall').value;
    const events = api.get().events.filter(e => (e.eventDate||e.date).slice(0,7)===month && matchesHall(e,hall) && (!filter || e.status === filter) && [e.client,e.responsible,e.place,e.notes,e.eventDate,e.date,e.returnDate,hallNames(e),...e.items.map(i=>product(i.productId)?.name || '')].join(' ').toLocaleLowerCase().includes(search)).sort((a,b)=>(a.eventDate||a.date).localeCompare(b.eventDate||b.date)||a.client.localeCompare(b.client,'es'));
    const monthLabel=localDate(month+'-01').toLocaleDateString('es-BO',{month:'long',year:'numeric'});
    $('salonEventSelection').textContent=`${events.length} ${events.length===1?'evento':'eventos'} · ${monthLabel} · ${$('salonEventHall').selectedOptions[0]?.textContent||'Todos los salones'}`;
    $('salonEventList').innerHTML = events.length ? events.map(e=>`<article class="salon-card" data-event-entry="${esc(e.id)}"><div class="salon-mini">${summary(e,true)}<div class="salon-actions">${['cotizacion','reservado'].includes(e.status)?button('Editar','edit',e.id):''}${e.status==='cotizacion'?button('Reservar','reserve',e.id,'primary'):''}${['cotizacion','reservado'].includes(e.status)?button('Cancelar','cancel',e.id,'danger'):''}${e.status!=='cancelado'?button(e.hallIds.length?'Salones / horario':'Asignar salon','assign',e.id):''}${button('Historial','history',e.id)}${button('PDF entrega','pdf',e.id)}</div></div>${readTable(e)}</article>`).join('') : '<div class="empty">No hay eventos en esta vista.</div>';
    document.querySelectorAll('#salonEventList [data-event-entry]').forEach(card=>{
      const id=card.dataset.eventEntry,f=api.financeEvent(id);
      card.querySelector('.salon-actions').insertAdjacentHTML('afterbegin',finButton('Agregar gasto','expense',id)+button('Ver evento','view',id));
      card.querySelector('[data-fin-mode="expense"]').classList.add('event-expenses-open');
      const costs=document.createElement('p');costs.className='event-card-expenses';costs.textContent='Gastos registrados: '+finMoney(f.cost)+(f.unknown?' + costos por definir':'');card.querySelector('.event-card-payment').after(costs);
    });
  }
  function returnValues(e) { return returns.get(e.id) || e.items.map(i=>({ productId: i.productId, returned: String(i.returned), damaged: String(i.damaged) })); }
  function renderReturns() {
    const events = api.get().events.filter(e=>['reservado','en-evento','devuelto'].includes(e.status)).sort((a,b)=>a.date.localeCompare(b.date));
    $('salonReturnList').innerHTML = events.length ? events.map(e => {
      const editable = e.status === 'en-evento', values = returnValues(e);
      const table = editable ? `<div class="table-wrap"><table class="salon-table return-table"><thead><tr><th>Producto propio</th><th>Sale propio</th><th>Regreso bueno</th><th>Dañado</th><th>Falta</th></tr></thead><tbody>${e.items.map((i,n)=>`<tr data-return-row="${n}"><td>${esc(product(i.productId)?.name || 'Producto eliminado')}</td><td>${api.ownQty(i)}</td><td><input aria-label="Regreso bueno ${esc(product(i.productId)?.name || '')}" data-return="returned" data-index="${n}" data-event="${esc(e.id)}" type="number" min="0" max="${api.ownQty(i)}" step="1" value="${esc(values[n].returned)}"></td><td><input aria-label="Dañado ${esc(product(i.productId)?.name || '')}" data-return="damaged" data-index="${n}" data-event="${esc(e.id)}" type="number" min="0" max="${api.ownQty(i)}" step="1" value="${esc(values[n].damaged)}"></td><td><output data-missing>${Math.max(0,api.ownQty(i)-Number(values[n].returned)-Number(values[n].damaged))}</output></td></tr>`).join('')}</tbody></table></div>` : readTable(e);
      return `<article class="salon-card" data-return-card="${esc(e.id)}"><div class="salon-mini">${summary(e)}<div class="salon-actions">${e.status==='reservado'?button('Sale a evento','out',e.id,'blue'):''}${editable?button('Guardar conteo','count',e.id)+button('Confirmar devolucion','return',e.id,'primary'):''}${e.status==='devuelto'?button('Cerrar','close',e.id):''}${button('Historial','history',e.id)}${button('PDF devolucion','return-pdf',e.id)}</div></div>${table}<p class="return-feedback" aria-live="polite"></p></article>`;
    }).join('') : '<div class="empty">No hay eventos pendientes de salida, devolucion o cierre.</div>';
    events.filter(e=>e.status==='en-evento').forEach(e=>validateReturnUI(e));
  }
  function validateReturnUI(e) {
    const card = document.querySelector(`[data-return-card="${e.id}"]`);
    if (!card) return;
    let invalid = false;
    returnValues(e).forEach((v,n) => {
      const row = card.querySelector(`[data-return-row="${n}"]`);
      const good = Number(v.returned), bad = Number(v.damaged), qty = api.ownQty(e.items[n]);
      const valid = v.returned !== '' && v.damaged !== '' && Number.isInteger(good) && Number.isInteger(bad) && good >= 0 && bad >= 0 && good + bad <= qty;
      row.querySelectorAll('input').forEach(input=>input.setAttribute('aria-invalid', String(!valid)));
      row.querySelector('[data-missing]').textContent = valid ? qty-good-bad : 'Revisar';
      invalid ||= !valid;
    });
    const feedback = card.querySelector('.return-feedback');
    feedback.classList.toggle('invalid', invalid);
    feedback.textContent = invalid ? 'Revisa las cantidades: regreso bueno + dañado no puede superar lo que salio.' : returns.has(e.id) ? 'Conteo sin guardar.' : '';
    card.querySelectorAll('[data-action="count"], [data-action="return"]').forEach(b=>b.disabled=invalid);
  }
  function renderStock() {
    const a = $('stockStart').value || today(), b = $('stockEnd').value || a;
    if (b < a) { $('salonStockList').innerHTML = '<p class="invalid">La fecha final debe ser igual o posterior a la inicial.</p>'; return; }
    const items = api.get().items;
    $('salonStockList').innerHTML = items.length ? items.map(p=>{ const ex=api.extra(p.id); return `<article class="salon-card"><h3>${esc(p.name)}</h3><div class="meta"><span class="pill">Utilizable ${p.qty}</span><span class="pill qty">Disponible ${api.available(p.id,a,b)}</span><span class="pill">Reserva maxima ${api.reserved(p.id,a,b)}</span><span class="pill">${prodStatus[ex.status]}</span><span class="pill">Minimo ${ex.minQty}</span><span class="pill">Reposicion Bs ${money(ex.cost)}</span></div></article>`; }).join('') : '<div class="empty">No hay productos.</div>';
  }
  function alertBlocks() {
    const d = api.get(), codes = new Map(), duplicates = [];
    d.items.forEach(p=>{ if(p.code) { const key=p.code.toLocaleLowerCase(); if(codes.has(key)) duplicates.push(p.code); codes.set(key,p); } });
    const conflict = d.events.filter(api.active).filter(e=>e.items.some(i=>api.ownQty(i)>api.available(i.productId,e.date,e.returnDate,e.id)));
    return [
      ['Stock bajo',d.items.filter(p=>api.extra(p.id).minQty>0 && api.available(p.id)<=api.extra(p.id).minQty).map(p=>`${p.name}: disponible hoy ${api.available(p.id)}, minimo ${api.extra(p.id).minQty}.`)],
      ['Reservas por revisar',conflict.map(e=>`${e.client}: hay productos sin disponibilidad suficiente para el periodo reservado.`)],
      ...rentalAlertBlocks(d),
      ['Salones pendientes',d.events.filter(e=>api.occupiesHall(e)&&!e.hallIds.length).map(e=>`${e.eventDate}: ${e.client} no tiene salon asignado.`)],
      ['Cruces de salones',d.events.filter(e=>api.occupiesHall(e)&&api.hallConflicts(e).length).map(e=>`${e.eventDate}: ${e.client} tiene un cruce de horario en ${hallNames(e)}.`)],
      ['Devoluciones vencidas',d.events.filter(e=>e.status==='en-evento'&&e.returnDate<today()).map(e=>`${e.client}: devolucion prevista ${e.returnDate}. El material sigue bloqueado.`)],
      ['Productos bloqueados',d.items.filter(p=>api.extra(p.id).status!=='disponible').map(p=>`${p.name}: ${prodStatus[api.extra(p.id).status]}.`)],
      ['Daños y faltantes',d.events.filter(e=>e.items.some(i=>i.damaged||i.missing)).map(e=>`${e.client}: dañado ${e.items.reduce((s,i)=>s+i.damaged,0)}, faltante ${e.items.reduce((s,i)=>s+i.missing,0)}.${e.settledAt?'':' Pendiente de confirmar devolucion.'}`)],
      ['Cantidades por revisar',d.events.filter(e=>e.items.some(i=>i.returned+i.damaged>i.qty)).map(e=>`${e.client}: el conteo anterior supera la salida. Corrige antes de confirmar.`)],
      ['Codigos repetidos',duplicates],
      ['Eventos proximos',d.events.filter(e=>api.active(e)&&(e.eventDate||e.date)>=today()).sort((a,b)=>(a.eventDate||a.date).localeCompare(b.eventDate||b.date)).slice(0,10).map(e=>`${e.eventDate||e.date}: ${e.client}.`)]
    ];
  }
  function renderAlerts() { $('salonAlertList').innerHTML = alertBlocks().map(([label,lines])=>`<article class="salon-card ${lines.length?'has-alert':''}"><h3>${label}</h3>${lines.length?`<ul>${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:'<p class="salon-muted">Sin novedades.</p>'}</article>`).join(''); }
  function renderMovements() {
    const query = $('moveSearch').value.toLocaleLowerCase();
    const list = api.get().movements.filter(m=>[m.type,m.productName,m.eventName,m.detail,m.responsible].join(' ').toLocaleLowerCase().includes(query));
    $('movementList').innerHTML = list.length ? `<div class="table-wrap"><table class="salon-table movement-table"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Producto / evento</th><th>Cambio</th><th>Saldo utilizable</th><th>Responsable / detalle</th></tr></thead><tbody>${list.map(m=>`<tr><td>${esc(new Date(m.at).toLocaleString('es-BO'))}</td><td>${esc(types[m.type] || m.type)}</td><td>${esc(m.productName)}${m.eventName?`<br>${esc(m.eventName)}`:''}</td><td>${m.delta>0?'+':''}${m.delta}</td><td>${m.productId?m.balance:'—'}</td><td>${esc(m.responsible)}<br>${esc(m.detail)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No hay movimientos en esta vista.</div>';
  }
  function renderReports() {
    const d=api.get(), total=d.items.reduce((s,p)=>s+p.qty*api.extra(p.id).cost,0);
    const selected=$('reportHall').value;
    $('reportHall').innerHTML='<option value="">Todos los salones</option><option value="unassigned">Sin salon asignado</option>'+d.halls.map(h=>`<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('');$('reportHall').value=selected;
    const events=reportEvents(),invalid=$('reportFrom').value&&$('reportTo').value&&$('reportFrom').value>$('reportTo').value;
    const countLabel=events.length===1?'1 evento seleccionado':`${events.length} eventos seleccionados`;
    $('reportSelection').textContent=invalid?'Revisa el periodo: la fecha inicial no puede ser posterior a la final.':countLabel;
    $('reportSelection').classList.toggle('invalid',Boolean(invalid));
    $('salonReportList').innerHTML=`<article class="salon-card"><h3>Inventario valorizado</h3><p>Bs ${money(total)}</p><button type="button" class="btn primary" data-report="inventory">PDF inventario</button></article><article class="salon-card"><h3>Eventos</h3><p>${countLabel}</p><button type="button" class="btn primary" data-report="events" ${invalid?'disabled':''}>PDF eventos</button><button type="button" class="btn" data-report="csv" ${invalid?'disabled':''}>Exportar eventos CSV</button></article><article class="salon-card"><h3>Movimientos</h3><p>${d.movements.length} registros</p><button type="button" class="btn" data-report="movements">Exportar movimientos CSV</button></article>`;
    renderRentalReportButton();$('rentalCsv').disabled=Boolean(invalid);
  }
  function reportEvents(){
    const from=$('reportFrom').value,to=$('reportTo').value,hall=$('reportHall').value,status=$('reportStatus').value;
    return api.get().events.filter(e=>(!from||e.eventDate>=from)&&(!to||e.eventDate<=to)&&(!status||e.status===status)&&(!hall||(hall==='unassigned'?!e.hallIds.length:e.hallIds.includes(hall)))).sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||a.client.localeCompare(b.client,'es'));
  }
  function resetEventPayment(){
    eventPaymentId=api.uid();$('salonPaymentAmount').value='';$('salonPaymentDate').value=today();$('salonPaymentMethod').value='Efectivo';$('salonPaymentNote').value='';
  }
  function updateEventPaymentPreview(){
    if(!$('salonPaymentAmount'))return;
    let f=null;if(editing){try{f=api.financeEvent(editing);}catch{}}
    $('salonPaymentLabel').textContent=editing?'Nuevo abono recibido (Bs)':'Anticipo recibido (Bs)';$('salonPreviousPaymentRow').hidden=!editing;
    $('salonPreviousPayment').textContent=finMoney(f?.received||0);
    let positive=false;
    try{
      if(!$('salonBasePrice').checkValidity()||!$('salonPaymentAmount').checkValidity())throw new Error('Importe invalido');
      const base=api.moneyCents($('salonBasePrice').value,true),amount=api.moneyCents($('salonPaymentAmount').value,true)||0;
      positive=amount>0;
      const total=base===null?null:base+(f?.extras||0),alreadySaved=f?.cash.some(c=>c.id===eventPaymentId&&!c.voidedAt),paid=(f?.received||0)+(alreadySaved?0:amount);
      if(!Number.isSafeInteger(paid)||total!==null&&!Number.isSafeInteger(total))throw new Error('Importe fuera de limite');
      const credit=total===null?0:Math.max(0,paid-total);
      $('salonPaymentTotal').textContent=finMoney(total);$('salonPaymentPaid').textContent=finMoney(paid);$('salonPaymentBalance').textContent=finMoney(total===null?null:Math.max(0,total-paid));$('salonPaymentCredit').textContent=finMoney(credit);$('salonPaymentCreditRow').hidden=!credit;
    }catch{
      ['salonPaymentTotal','salonPaymentPaid','salonPaymentBalance'].forEach(id=>$(id).textContent='Revisar importe');$('salonPaymentCreditRow').hidden=true;
    }
    $('salonPaymentFields').hidden=!positive;$('salonPaymentDate').required=positive;$('salonPaymentDate').max=today();
    if(!api.saving())['salonPaymentDate','salonPaymentMethod','salonPaymentNote'].forEach(id=>$(id).disabled=!positive);
  }
  async function saveEvent(event) {
    event.preventDefault();
    const payload={id:editing||api.uid(),client:$('salonClient').value,guestCount:$('salonGuests').value,eventDate:$('salonEventDate').value,...readVenue('event'),date:$('salonDate').value,returnDate:$('salonEnd').value,type:$('salonType').value,status:$('salonStatus').value,responsible:$('salonResp').value,place:$('salonPlace').value,notes:$('salonNotes').value,recordedBy:$('salonRecordedBy').value,changeNote:$('salonChangeNote').value,items:draft,updatedAt:Date.now()};
    if(!editing||$('salonBasePrice').value!==eventPriceBaseline){payload.basePrice=$('salonBasePrice').value;if(editing)payload.expectedBasePrice=eventPriceExpected;}
    if($('salonPaymentAmount').value!==''&&Number($('salonPaymentAmount').value)!==0){payload.payment={id:eventPaymentId,amount:$('salonPaymentAmount').value,date:$('salonPaymentDate').value,method:$('salonPaymentMethod').value,note:$('salonPaymentNote').value};if(editing)payload.expectedBasePrice=eventPriceExpected;}
    if(await run(()=>api.saveEvent(payload))) {if(!detailEditing){$('salonEventMonth').value=payload.eventDate.slice(0,7);renderEvents();}resetEvent();if(detailEditing)finishDetailEdit();}
  }
  function resetEvent() { editing=null; draft=[];eventPriceBaseline='';eventPriceExpected=null; $('salonEventForm').reset();resetEventPayment();syncVenueMode('event');$('eventChangeMeta').hidden=true;$('salonRecordedBy').required=false; $('salonEventTitle').textContent='Nuevo evento'; refreshSelects(); renderDraft();updateEventPaymentPreview(); }
  function editEvent(id,inline=false) {
    const e=api.get().events.find(e=>e.id===id);
    if(!e) return;
    editing=id; draft=JSON.parse(JSON.stringify(e.items));
    eventPriceExpected=api.financeEvent(id).contract.base;$('salonBasePrice').value=eventPriceExpected===null?'':eventPriceExpected/100;eventPriceBaseline=$('salonBasePrice').value;
    resetEventPayment();
    [['salonClient',e.client],['salonEventDate',e.eventDate||e.date],['salonDate',e.date],['salonEnd',e.returnDate],['salonType',e.type],['salonStatus',e.status],['salonResp',e.responsible],['salonPlace',e.place],['salonNotes',e.notes]].forEach(([key,value])=>$(key).value=value);
    $('salonGuests').value=e.guestCount??'';$('eventChangeMeta').hidden=false;$('salonRecordedBy').required=true;$('salonRecordedBy').value='';$('salonChangeNote').value='';
    setVenue('event',e);$('salonEventTitle').textContent='Editar evento'; refreshSelects(); renderDraft();updateEventPaymentPreview(); if(!inline)showTab('events'); $('salonClient').focus();
  }
  function eventPdf(id,kind) {
    const e=api.get().events.find(e=>e.id===id); if(!e) return;
    reportPdf(kind==='Entrega'?'Ficha de entrega':'Control de devolucion',eventReportBlocks(e,kind),'evento-'+kind.toLowerCase(),e.client+' / '+reportDate(e.eventDate));
  }
  function reportDate(value){return value?value.split('-').reverse().join('/'):'Sin registrar';}
  function eventReportBlocks(e,kind='Ficha'){
    const blocks=[{type:'heading',text:e.client},{type:'table',columns:['Datos del evento','Detalle'],widths:[145,378],rows:[
      ['Fecha del evento',reportDate(e.eventDate)],['Tipo / estado',`${e.type} / ${statuses[e.status]}`],['Salon',hallNames(e)],['Invitados',guestsLabel(e)],
      ['Ocupacion',e.venueMode==='hours'?`${reportDate(e.eventDate)} ${e.startTime} a ${reportDate(e.venueEndDate)} ${e.endTime}`:`${reportDate(e.eventDate)} al ${reportDate(e.venueEndDate)} - dia completo`],
      ['Montaje / limpieza',`${e.setupMinutes} min / ${e.cleanupMinutes} min`],['Responsable',e.responsible||'Sin registrar'],['Lugar',e.place||'Sin registrar'],
      ['Salida de materiales',reportDate(e.departureDate||e.date)+(e.departureDate?' (salida registrada)':' (prevista)')],['Devolucion prevista',reportDate(e.returnDate)]
    ]}];
    if(e.date.slice(0,4)<'2000')blocks.push({type:'text',text:'REVISAR FECHA: la salida prevista de materiales esta registrada como '+reportDate(e.date)+'.',bold:true,color:[0.62,0.16,0.20]});
    if(kind==='Devolucion'){
      const confirmed=['devuelto','cerrado'].includes(e.status)&&Boolean(e.settledAt);
      blocks.push({type:'heading',text:confirmed?'Devolucion confirmada':'Devolucion pendiente de confirmar'});
      blocks.push({type:'text',text:confirmed?'Conteo guardado al confirmar la devolucion.':'Conteo provisional guardado. Por revisar no significa faltante confirmado.',color:[0.34,0.40,0.44]});
      if(e.items.length)blocks.push({type:'table',columns:['Producto propio / codigo','Propios','Bueno','Dañado',confirmed?'Faltante':'Por revisar'],widths:[243,65,65,65,85],rows:e.items.map(i=>{const p=product(i.productId),qty=api.ownQty(i);return[(p?.name||'Producto')+'\nCod.: '+(p?.code||'-'),qty,i.returned,i.damaged,confirmed?i.missing:i.returned+i.damaged>qty?'Revisar':qty-i.returned-i.damaged];})});
      else blocks.push({type:'text',text:'Sin materiales asignados.'});
      if(e.items.some(i=>i.returned+i.damaged>api.ownQty(i)||(confirmed&&i.returned+i.damaged+i.missing!==api.ownQty(i))))blocks.push({type:'text',text:'REVISAR CONTEO: hay cantidades que no coinciden con el material propio asignado.',bold:true,color:[0.62,0.16,0.20]});
    }else{
      blocks.push({type:'heading',text:kind==='Entrega'?'Materiales para entregar':'Materiales asignados'});
      if(e.items.length)blocks.push(hasRental(e)?{type:'table',columns:['Codigo','Producto / unidad','Propios','Externos'],widths:[70,285,78,90],rows:e.items.map(i=>{const p=product(i.productId);return[p?.code||'-',(p?.name||'Producto')+'\n'+(p?.unit||'unidades'),api.ownQty(i),i.qty-api.ownQty(i)];})}:{type:'table',columns:['Codigo','Producto','Cantidad','Unidad'],widths:[70,285,78,90],rows:e.items.map(i=>{const p=product(i.productId);return[p?.code||'-',p?.name||'Producto',i.qty,p?.unit||'unidades'];})});
      else blocks.push({type:'text',text:'Sin materiales asignados.'});
      if(kind==='Entrega')blocks.push({type:'text',text:e.status==='cancelado'?'EVENTO CANCELADO - no autoriza entrega.':e.departureDate?'Salida registrada el '+reportDate(e.departureDate)+'.':'Asignacion prevista. La salida aun no ha sido registrada.',bold:true});
    }
    if(hasRental(e)){
      blocks.push({type:'heading',text:'Alquiler externo - no pertenece al inventario propio'},{type:'table',columns:['Producto / proveedor','Cant.','Estado','Total Bs','Entrega / devolucion'],widths:[188,44,94,77,120],rows:e.items.filter(i=>i.external).map(i=>{const r=i.external;return[(product(i.productId)?.name||'Producto')+'\nProveedor: '+(r.supplier||'Por definir'),r.qty,rentalLabels[r.status],r.cost==null?'Sin definir':money(r.cost),reportDate(r.deliveryDate)+'\n'+reportDate(r.returnDate)];})});
      e.items.filter(i=>i.external?.status==='devuelto').forEach(i=>{const r=i.external;blocks.push({type:'text',text:`${product(i.productId)?.name||'Producto'} - Al proveedor: bueno ${r.returned}, dañado ${r.damaged}, faltante ${r.missing}.`});});
      if(e.items.some(i=>['pendiente','confirmado'].includes(i.external?.status)))blocks.push({type:'text',text:'PENDIENTE: hay material externo sin recibir. No autoriza salida.',bold:true,color:[0.62,0.16,0.20]});
    }
    if(e.notes)blocks.push({type:'heading',text:'Observaciones'},{type:'text',text:e.notes});
    if(kind!=='Ficha')blocks.push({type:'signatures'});
    return blocks;
  }
  function csv(name,rows) {
    const cell=v=>{let s=String(v??''); if(/^[=+@\-\t\r]/.test(s))s="'"+s; return '"'+s.replace(/"/g,'""')+'"';};
    download(name+'-'+today()+'.csv','\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  }
  function report(kind) {
    const d=api.get();
    if(kind==='inventory')reportPdf('Inventario valorizado',[{type:'text',text:'Valor de reposicion estimado: Bs '+money(d.items.reduce((sum,p)=>sum+p.qty*api.extra(p.id).cost,0)),bold:true},{type:'text',text:'Existencias actuales. No es un reporte de ingresos ni de utilidad.'},{type:'table',columns:['Producto / codigo / ubicacion','Utilizable','Disp. hoy','Costo Bs','Valor Bs'],widths:[223,65,65,80,90],rows:d.items.map(p=>[`${p.name}\nCod.: ${p.code||'-'} / ${p.location||'Sin ubicacion'}\n${prodStatus[api.extra(p.id).status]}`,p.qty,api.available(p.id),money(api.extra(p.id).cost),money(p.qty*api.extra(p.id).cost)])}],'inventario-valorizado');
    if(kind==='events'){
      const events=reportEvents(),known=events.filter(e=>e.guestCount!=null),blocks=[{type:'heading',text:'Resumen de eventos'},{type:'text',text:`Periodo: ${$('reportFrom').value?reportDate($('reportFrom').value):'sin limite inicial'} al ${$('reportTo').value?reportDate($('reportTo').value):'sin limite final'}\nSalon: ${$('reportHall').selectedOptions[0].textContent}\nEstado: ${$('reportStatus').selectedOptions[0].textContent}`},{type:'text',text:`Eventos: ${events.length} | Invitados registrados: ${known.reduce((sum,e)=>sum+e.guestCount,0)} | Eventos con invitados sin definir: ${events.length-known.length}`,bold:true}];
      if(events.length)blocks.push({type:'table',columns:['Fecha','Evento','Salon','Invitados','Estado'],widths:[66,156,119,66,116],rows:events.map(e=>[reportDate(e.eventDate),e.client,hallNames(e),guestsLabel(e),statuses[e.status]])});
      else blocks.push({type:'text',text:'No hay eventos para los filtros seleccionados.'});
      if($('reportDetails').checked)events.forEach(e=>blocks.push({type:'page',context:e.client+' / '+reportDate(e.eventDate)},...eventReportBlocks(e)));
      reportPdf('Reporte de eventos',blocks,'eventos-elianne');
    }
    if(kind==='csv')csv('eventos-elianne',[['Evento','Fecha del evento','Invitados','Salones','Ocupacion','Fin de ocupacion','Montaje minutos','Limpieza minutos','Salida prevista','Salida registrada','Devolucion prevista','Estado','Producto','Solicitado total','Regreso bueno propio','Dañado propio','Situacion devolucion propia','Faltante confirmado','Por revisar propio','Propios','Externos','Proveedor externo','Estado alquiler','Costo total alquiler Bs'],...reportEvents().flatMap(e=>(e.items.length?e.items:[null]).map(i=>{const confirmed=['devuelto','cerrado'].includes(e.status)&&Boolean(e.settledAt),own=i?api.ownQty(i):0,r=i?.external;return[e.client,e.eventDate||e.date,e.guestCount??'',hallNames(e),venueLabel(e),e.venueEndDate,e.setupMinutes,e.cleanupMinutes,e.date,e.departureDate,e.returnDate,statuses[e.status],i?product(i.productId)?.name:'',i?.qty??'',i?.returned??'',i?.damaged??'',confirmed?'Confirmada':'Sin confirmar',i&&confirmed?i.missing:'',i&&!confirmed?(i.returned+i.damaged>own?'Revisar':own-i.returned-i.damaged):'',i?own:'',i?i.qty-own:'',r?.supplier||'',r?rentalLabels[r.status]:'',r?.cost??''];}))]);
    if(kind==='rentals-csv')csv('alquileres-externos',[['Evento','Fecha evento','Estado evento','Producto','Cantidad externa','Proveedor','Costo total Bs','Entrega prevista','Devolucion prevista','Estado alquiler','Devuelto bueno','Dañado externo','Faltante externo','Observaciones'],...reportEvents().flatMap(e=>e.items.filter(i=>i.external).map(i=>{const r=i.external;return[e.client,e.eventDate,statuses[e.status],product(i.productId)?.name,r.qty,r.supplier,r.cost??'',r.deliveryDate,r.returnDate,rentalLabels[r.status],r.returned,r.damaged,r.missing,r.notes];}))]);
    if(kind==='movements') csv('movimientos-elianne',[['Fecha','Movimiento','Producto','Evento','Cambio','Saldo utilizable','Responsable','Detalle'],...d.movements.map(m=>[new Date(m.at).toLocaleString('es-BO'),types[m.type]||m.type,m.productName,m.eventName,m.delta,m.balance,m.responsible,m.detail])]);
  }
  async function click(event) {
    const target=event.target.closest('button'); if(!target)return;
    if(target.dataset.openDetail){openEventDetail(target.dataset.openDetail,'calendar',target.closest('[data-detail-day]')?.dataset.detailDay);return;}
    if(target.dataset.calendarDate&&event.target.closest('.calendar-day-cell .calendar-day')){selectDay(target.dataset.calendarDate);return;}
    if(target.dataset.tab) showTab(target.dataset.tab);
    if(target.dataset.closeDialog)$(target.dataset.closeDialog).close();
    if(target.id==='hallConfigOpen'){
      api.get().halls.forEach(h=>$('name-'+h.id).value=h.name);$('hallConfigError').textContent='';$('hallConfigDialog').showModal();
    }
    if(target.id==='showUnassigned'){$('calendarHall').value='unassigned';$('calendarFilter').value='';renderCalendar();}
    if(target.dataset.calendarDate) selectDay(target.dataset.calendarDate,true);
    if(target.id==='calendarPrev')moveMonth(-1);
    if(target.id==='calendarNext')moveMonth(1);
    if(target.id==='calendarToday')selectDay(today());
    if(['calendarNew','calendarNewDay'].includes(target.id))newEventFromCalendar();
    if(target.id==='salonClearEvent'){if(detailEditing){cancelDetailEdit();return;}resetEvent();}
    if(target.id==='salonAddItem') run(()=>{
      const pid=$('salonProduct').value, qty=api.quantity($('salonQty').value);
      if(!pid||!qty)throw new Error('Selecciona un producto y una cantidad mayor a cero.');
      const existing=draft.find(i=>i.productId===pid);
      if(existing) existing.qty=api.quantity(existing.qty+qty); else draft.push({productId:pid,qty,returned:0,damaged:0,missing:0});
      $('salonQty').value=''; renderDraft();
    },'Producto agregado al evento.');
    if(target.dataset.remove!==undefined){draft.splice(Number(target.dataset.remove),1);renderDraft();}
    if(target.id==='moveCsv') report('movements');
    if(target.id==='historyExport')exportHistory();
    if(target.dataset.report) report(target.dataset.report);
    const action=target.dataset.action,id=target.dataset.event;
    if(!action)return;
    if(action==='expenses'){if(openEventDetail(id,'events')){$('detailExpenses').scrollIntoView({block:'start'});$('detailExpensesTitle').focus({preventScroll:true});}return;}
    if(action==='finance'){if(openEventDetail(id,'events'))$('detailFinance').scrollIntoView({block:'start'});return;}
    if(action==='edit'){if(target.closest('#salon-calendar')){if(openEventDetail(id,'calendar'))startDetailEdit();}else editEvent(id);}
    if(action==='assign')openAssignment(id);
    if(action==='history')openHistory(id);
    if(action==='view')openEventDetail(id,target.closest('#salon-calendar')?'calendar':target.closest('#salon-returns')?'returns':'events');
    if(action==='pdf'||action==='return-pdf')eventPdf(id,action==='pdf'?'Entrega':'Devolucion');
    if(action==='cancel'&&confirm('Cancelar este evento y liberar sus reservas?'))run(()=>api.transition(id,'cancelado'));
    if(action==='reserve')run(()=>api.transition(id,'reservado'));
    if(action==='out'&&confirm('Confirmar la salida de los productos de este evento?'))run(()=>api.transition(id,'en-evento'),'Salida registrada.');
    if(action==='close'&&confirm('Cerrar el evento? El historial quedara conservado.'))run(()=>api.transition(id,'cerrado'));
    if(action==='count'||action==='return'){
      const e=api.get().events.find(e=>e.id===id); if(!e)return;
      const values=returnValues(e), finalize=action==='return';
      if(finalize){
        const damaged=values.reduce((s,i)=>s+Number(i.damaged),0),missing=e.items.reduce((s,i,n)=>s+api.ownQty(i)-Number(values[n].returned)-Number(values[n].damaged),0);
        if(!confirm(`Confirmar devolucion del material PROPIO? Se retiraran del stock utilizable ${damaged} unidades dañadas y ${missing} faltantes. Los alquileres se devuelven por separado desde Alquiler externo. Esta devolucion quedara cerrada para edicion.`))return;
      }
      if(await run(()=>api.saveReturn(id,values,finalize),finalize?'Devolucion confirmada y stock actualizado.':'Conteo guardado. El material sigue reservado.')){returns.delete(id);renderReturns();renderEventDetail();}
    }
  }
  function input(event) {
    const input=event.target;
    if(['salonBasePrice','salonPaymentAmount'].includes(input.id))updateEventPaymentPreview();
    if(input.matches('[data-return]')){
      const e=api.get().events.find(e=>e.id===input.dataset.event); if(!e)return;
      const values=returnValues(e); values[Number(input.dataset.index)][input.dataset.return]=input.value; returns.set(e.id,values); validateReturnUI(e); return;
    }
    if(input.id==='calendarMonth'&&/^\d{4}-\d{2}$/.test(input.value)&&input.value>='1900-01'&&input.value<='2199-12'){calendarMonth=input.value;selectedDay=calendarMonth+'-01';renderCalendar();}
    if(['calendarFilter','calendarHall'].includes(input.id))renderCalendar();
    if(input.name==='eventMode')syncVenueMode('event');
    if(input.name==='assignMode')syncVenueMode('assign');
    if(['salonDate','salonEnd','salonEventDate'].includes(input.id)) {
      if(input.id==='salonEventDate'&&input.value){if(!$('salonDate').value)$('salonDate').value=input.value;if(!$('salonEnd').value||$('salonEnd').value<input.value)$('salonEnd').value=input.value;}
      if(input.id==='salonDate'&&input.value){if(!$('salonEventDate').value)$('salonEventDate').value=input.value;if(!$('salonEnd').value||$('salonEnd').value<input.value)$('salonEnd').value=input.value;}
      if(!$('eventVenueEnd').value||$('eventVenueEnd').value<$('salonEventDate').value)$('eventVenueEnd').value=$('salonEventDate').value;
      refreshSelects();renderDraft();
    }
    if(['salonEventSearch','salonEventFilter','salonEventMonth','salonEventHall'].includes(input.id))renderEvents();
    if(['stockStart','stockEnd'].includes(input.id))renderStock();
    if(input.id==='moveSearch')renderMovements();
  }
  window.addEventListener('beforeunload',event=>{if(returns.size){event.preventDefault();event.returnValue='';}});
  init();
})();
