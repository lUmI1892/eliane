/* The entire business state is persisted in one write, including its audit trail. */
(() => {
  'use strict';
  const KEY = 'elianneSalon.v3';
  const LEGACY = ['elianneInventory.v1', 'elianneSalonEvents.v1', 'elianneSalonExtras.v1'];
  const statuses = ['cotizacion', 'reservado', 'en-evento', 'devuelto', 'cerrado', 'cancelado'];
  const productStatuses = ['disponible', 'limpieza', 'mantenimiento', 'danado', 'baja'];
  const rentalStatuses=['pendiente','confirmado','recibido','devuelto','cancelado'];
  const ownQty=i=>i.qty-(i.external&&i.external.status!=='cancelado'?i.external.qty:0);
  const active = e => ['reservado', 'en-evento'].includes(e.status);
  const occupiesHall = e => ['reservado', 'en-evento', 'devuelto', 'cerrado'].includes(e.status);
  const DEFAULT_HALLS = [{id:'hall-1',name:'Elianne 1'},{id:'hall-2',name:'Elianne 2'},{id:'hall-3',name:'Elianne 3'}];
  const clone = v => JSON.parse(JSON.stringify(v));
  const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const today = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  };
  const fail = message => { throw new Error(message); };
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  const text = (v, label = 'Texto',limit=10000) => {
    if (v == null) return '';
    if (typeof v !== 'string' || v.length > limit) fail(label + ' invalido.');
    return v.trim();
  };
  const id = v => {
    if (typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v)) fail('Identificador invalido en los datos.');
    return v;
  };
  function quantity(v, label = 'Cantidad') {
    if (v === '' || v == null || !['number', 'string'].includes(typeof v) || (typeof v === 'string' && !v.trim())) fail(label + ' es obligatoria.');
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 0 || n > 100000000) fail(label + ' debe ser un entero entre 0 y 100000000.');
    return n;
  }
  function amount(v) {
    if (v === '' || v == null || !['number', 'string'].includes(typeof v)) fail('Costo invalido.');
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1e12) fail('Costo invalido.');
    return n;
  }
  function date(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) fail('Fecha invalida.');
    return v;
  }
  function photo(v) {
    if (!v) return '';
    if (typeof v !== 'string' || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(v)) fail('La foto debe estar incluida en formato JPG o PNG.');
    return v;
  }
  function normalizeHalls(halls = DEFAULT_HALLS) {
    if(!Array.isArray(halls)||halls.length!==3)fail('Deben existir los tres salones.');
    const result=DEFAULT_HALLS.map(h=>{
      const found=halls.find(x=>obj(x)&&x.id===h.id),name=found?text(found.name):'';
      if(!name||name.length>60)fail('Cada salon necesita un nombre de hasta 60 caracteres.');
      return {id:h.id,name};
    });
    if(new Set(result.map(h=>h.name.toLocaleLowerCase('es'))).size!==3)fail('Los nombres de los salones no pueden repetirse.');
    return result;
  }
  function normalizeVenue(e,eventDate) {
    const hallIds=e.hallIds??[];
    if(!Array.isArray(hallIds)||hallIds.some(h=>!DEFAULT_HALLS.some(x=>x.id===h))||new Set(hallIds).size!==hallIds.length)fail('Seleccion de salones invalida.');
    const venueMode=e.venueMode||'day',venueEndDate=date(e.venueEndDate||eventDate);
    if(!['day','hours'].includes(venueMode)||venueEndDate<eventDate)fail('Revisa las fechas de ocupacion del salon.');
    const clock=(value,label)=>{
      if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))fail(label+' invalida.');
      return value;
    };
    const startTime=venueMode==='hours'?clock(e.startTime,'Hora de inicio'):'00:00';
    const endTime=venueMode==='hours'?clock(e.endTime,'Hora de fin'):'00:00';
    const setupMinutes=quantity(e.setupMinutes??0,'Montaje'),cleanupMinutes=quantity(e.cleanupMinutes??0,'Limpieza');
    if(setupMinutes>2880||cleanupMinutes>2880)fail('Montaje y limpieza admiten hasta 2880 minutos cada uno.');
    const schedule={hallIds:[...hallIds],venueMode,venueEndDate,startTime,endTime,setupMinutes,cleanupMinutes};
    const span=venueRange({...schedule,eventDate});
    if(span.eventEnd<=span.eventStart||span.eventEnd-span.eventStart>366*1440)fail('El fin debe ser posterior al inicio y el periodo no puede superar 366 dias. Para terminar de madrugada, elige la fecha del dia siguiente.');
    return schedule;
  }
  function civilMinute(key,clock='00:00') {
    const [y,m,d]=key.split('-').map(Number),[h,min]=clock.split(':').map(Number);
    const value=new Date(0);value.setUTCFullYear(y,m-1,d);value.setUTCHours(h,min,0,0);
    return value.getTime()/60000;
  }
  function venueRange(e) {
    const start=civilMinute(e.eventDate||e.date,e.venueMode==='hours'?e.startTime:'00:00');
    const end=civilMinute(e.venueEndDate||e.eventDate||e.date,e.venueMode==='hours'?e.endTime:'00:00')+(e.venueMode==='hours'?0:1440);
    return {start:start-(e.setupMinutes||0),end:end+(e.cleanupMinutes||0),eventStart:start,eventEnd:end};
  }
  function hallConflicts(d,e) {
    const span=venueRange(e),halls=e.hallIds||[];
    return d.events.filter(other=>other.id!==e.id&&occupiesHall(other)&&(other.hallIds||[]).some(h=>halls.includes(h))).filter(other=>{
      const existing=venueRange(other);return span.start<existing.end&&existing.start<span.end;
    });
  }
  function checkHalls(d,e,ignoreUnassigned=false) {
    if(!e.hallIds.length)fail('Selecciona al menos un salon para el evento.');
    const conflict=hallConflicts(d,e)[0];
    if(conflict){
      const names=d.halls.filter(h=>e.hallIds.includes(h.id)&&conflict.hallIds.includes(h.id)).map(h=>h.name).join(', ');
      fail(names+' ya esta reservado para "'+conflict.client+'" en ese periodo, incluyendo montaje y limpieza.');
    }
    const span=venueRange(e),pending=d.events.find(other=>other.id!==e.id&&occupiesHall(other)&&!other.hallIds.length&&(()=>{const range=venueRange(other);return span.start<range.end&&range.start<span.end;})());
    if(pending&&!ignoreUnassigned)fail('El evento "'+pending.client+'" aun no tiene salon asignado en ese periodo. Asignale un salon antes de confirmar otra reserva.');
  }
  function normalizeProduct(p) {
    if (!obj(p)) fail('Producto invalido.');
    const name = text(p.name, 'Nombre');
    if (!name) fail('El producto necesita un nombre.');
    return { id: id(p.id), name, qty: quantity(p.qty), unit: text(p.unit) || 'unidades', code: text(p.code), category: text(p.category) || 'Otros', location: text(p.location), notes: text(p.notes), photo: photo(p.photo), updatedAt: Number(p.updatedAt) || Date.now() };
  }
  function normalizeRental(raw,total) {
    if(raw==null)return null;
    if(!obj(raw)||!rentalStatuses.includes(raw.status))fail('Estado del alquiler invalido.');
    const qty=quantity(raw.qty,'Cantidad alquilada');
    if(!qty||qty>total)fail('El alquiler debe cubrir entre 1 y la cantidad solicitada.');
    const supplier=text(raw.supplier),deliveryDate=date(raw.deliveryDate),returnDate=date(raw.returnDate);
    if(returnDate<deliveryDate)fail('Revisa las fechas del alquiler.');
    if(['confirmado','recibido','devuelto'].includes(raw.status)&&!supplier)fail('Escribe el proveedor antes de confirmar el alquiler.');
    const returned=quantity(raw.returned??0),damaged=quantity(raw.damaged??0),missing=quantity(raw.missing??0);
    if(returned+damaged+missing>qty||(raw.status==='devuelto'&&returned+damaged+missing!==qty))fail('Revisa el conteo del material alquilado.');
    const stamp=value=>value==null?null:Number.isFinite(value)&&Number.isFinite(new Date(value).getTime())?value:fail('Fecha de registro del alquiler invalida.');
    const receivedAt=stamp(raw.receivedAt),returnedAt=stamp(raw.returnedAt);
    if(['recibido','devuelto'].includes(raw.status)&&receivedAt==null)fail('Falta el registro de recepcion del alquiler.');
    if(raw.status==='devuelto'&&returnedAt==null)fail('Falta el registro de devolucion al proveedor.');
    return {qty,supplier,cost:raw.cost==null||raw.cost===''?null:amount(raw.cost),deliveryDate,returnDate,status:raw.status,notes:text(raw.notes),returned,damaged,missing,receivedAt,returnedAt};
  }
  function normalizeEvent(e) {
    if (!obj(e) || !Array.isArray(e.items) || !statuses.includes(e.status)) fail('Evento invalido.');
    const client = text(e.client), start = date(e.date), end = date(e.returnDate || e.date), eventDate = date(e.eventDate || e.date);
    if (!client || end < start) fail('Revisa el nombre y las fechas del evento.');
    const seen = new Set();
    const items = e.items.map(i => {
      if (!obj(i)) fail('Detalle de evento invalido.');
      const pid = id(i.productId);
      if (seen.has(pid)) fail('Hay productos repetidos en un evento.');
      seen.add(pid);
      const qty = quantity(i.qty);
      if (!qty) fail('La cantidad de salida debe ser mayor a cero.');
      return { productId: pid, qty, returned: quantity(i.returned ?? 0), damaged: quantity(i.damaged ?? 0), missing: quantity(i.missing ?? 0),external:normalizeRental(i.external,qty) };
    });
    const guestCount=e.guestCount==null||e.guestCount===''?null:quantity(e.guestCount,'Invitados');
    return { id: id(e.id), client, guestCount, eventDate, ...normalizeVenue(e,eventDate), date: start, returnDate: end, departureDate: e.departureDate ? date(e.departureDate) : '', type: text(e.type) || 'Otro', status: e.status, responsible: text(e.responsible), place: text(e.place), notes: text(e.notes), items, settledAt: Number(e.settledAt) || null, updatedAt: Number(e.updatedAt) || Date.now() };
  }
  function normalize(raw) {
    if (!obj(raw) || ![3,4].includes(raw.schemaVersion) || !Array.isArray(raw.items) || !Array.isArray(raw.events) || !obj(raw.extras) || !Array.isArray(raw.movements)) fail('El archivo no es un respaldo completo compatible.');
    const d = { schemaVersion: 4, revision: quantity(raw.revision ?? 0), halls:normalizeHalls(raw.halls), items: raw.items.map(normalizeProduct), events: raw.events.map(normalizeEvent), extras: {}, movements: [] };
    for (const collection of [d.items, d.events]) {
      if (new Set(collection.map(v => v.id)).size !== collection.length) fail('El respaldo tiene identificadores repetidos.');
    }
    Object.entries(raw.extras).forEach(([pid, ex]) => {
      id(pid);
      if (!obj(ex) || !productStatuses.includes(ex.status)) fail('Estado de producto invalido.');
      d.extras[pid] = { status: ex.status, minQty: quantity(ex.minQty ?? 0), cost: amount(ex.cost ?? 0) };
    });
    d.movements = raw.movements.map(m => {
      if (!obj(m) || !Number.isFinite(m.at) || !Number.isFinite(new Date(m.at).getTime()) || !Number.isSafeInteger(m.delta)) fail('Movimiento invalido.');
      return { id: id(m.id), at: m.at, productId: m.productId ? id(m.productId) : '', productName: text(m.productName), eventId: m.eventId ? id(m.eventId) : '', eventName: text(m.eventName), type: text(m.type), delta: m.delta, balance: quantity(m.balance ?? 0), detail: text(m.detail,'Detalle',25000), responsible: text(m.responsible) };
    });
    if (new Set(d.movements.map(m => m.id)).size !== d.movements.length) fail('Hay movimientos repetidos.');
    return d;
  }
  let data, expected, blocked = '',saving=false,initialized=!window.ElianneStorage,readable=false,persistedToken=null;
  function movement(d, type, p, delta, detail, e, responsible = '') {
    d.movements.unshift({ id: uid(), at: Date.now(), productId: p?.id || '', productName: p?.name || '', eventId: e?.id || '', eventName: e?.client || '', type, delta, balance: p?.qty || 0, detail, responsible: responsible || e?.responsible || '' });
  }
  const stateName=value=>({cotizacion:'Cotizacion',reservado:'Reservado','en-evento':'En evento',devuelto:'Devuelto',cerrado:'Cerrado',cancelado:'Cancelado'}[value]||value);
  function guestChange(before,after){
    if(before===after)return '';
    if(before==null)return after==null?'':`Se definieron ${after} invitados. Antes: sin definir.`;
    if(after==null)return `Invitados: de ${before} a sin definir.`;
    const difference=after-before,count=Math.abs(difference);
    const verb=difference>0?(count===1?'agrego':'agregaron'):(count===1?'redujo':'redujeron');
    return `Invitados: de ${before} a ${after}. Se ${verb} ${count} ${count===1?'persona':'personas'}.`;
  }
  function venueDescription(d,e){
    const halls=d.halls.filter(h=>e.hallIds.includes(h.id)).map(h=>h.name).join(' + ')||'Sin salon asignado';
    return `${halls}; ${e.eventDate} al ${e.venueEndDate}; ${e.venueMode==='hours'?e.startTime+' a '+e.endTime:'dia completo'}; montaje ${e.setupMinutes} min; limpieza ${e.cleanupMinutes} min`;
  }
  function eventChanges(d,before,after){
    const changes=[],guest=guestChange(before.guestCount,after.guestCount);
    if(guest)changes.push({type:'evento-invitados',detail:guest});
    for(const [field,label]of [['client','Cliente / evento'],['eventDate','Fecha del evento'],['date','Salida del material'],['returnDate','Devolucion prevista'],['type','Tipo de evento'],['place','Lugar'],['responsible','Responsable del evento'],['notes','Notas']]){
      if(before[field]!==after[field])changes.push({type:'evento-editado',detail:`${label}: de "${before[field]||'Sin definir'}" a "${after[field]||'Sin definir'}".`});
    }
    if(before.status!==after.status)changes.push({type:'evento-editado',detail:`Estado: de ${stateName(before.status)} a ${stateName(after.status)}.`});
    const schedule=e=>JSON.stringify([[...e.hallIds].sort(),e.venueMode,e.venueEndDate,e.startTime,e.endTime,e.setupMinutes,e.cleanupMinutes]);
    if(schedule(before)!==schedule(after))changes.push({type:'evento-editado',detail:`Salones y horario: de "${venueDescription(d,before)}" a "${venueDescription(d,after)}".`});
    const oldItems=new Map(before.items.map(i=>[i.productId,i.qty])),newItems=new Map(after.items.map(i=>[i.productId,i.qty]));
    for(const pid of new Set([...oldItems.keys(),...newItems.keys()])){
      const previous=oldItems.get(pid)||0,next=newItems.get(pid)||0;
      if(previous!==next)changes.push({type:'evento-editado',detail:`Material ${d.items.find(p=>p.id===pid)?.name||pid}: de ${previous} a ${next} unidades.`});
    }
    for(const pid of new Set([...before.items.map(i=>i.productId),...after.items.map(i=>i.productId)])){
      const previous=before.items.find(i=>i.productId===pid)?.external||null,next=after.items.find(i=>i.productId===pid)?.external||null;
      if(JSON.stringify(previous)!==JSON.stringify(next))changes.push({type:'alquiler-editado',detail:`Alquiler externo de ${d.items.find(p=>p.id===pid)?.name||pid}: antes ${rentalDescription(previous)}; ahora ${rentalDescription(next)}.`});
    }
    return changes;
  }
  function migrate() {
    const read = (key, fallback) => {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    };
    const d = normalize({ schemaVersion: 3, items: read(LEGACY[0], []), events: read(LEGACY[1], []), extras: read(LEGACY[2], {}), movements: [] });
    d.items.forEach(p => movement(d, 'saldo-inicial', p, p.qty, 'Saldo al iniciar el historial.'));
    // Old completed events did not adjust stock. Preserve them without applying retrospective losses.
    d.events.filter(e => ['devuelto', 'cerrado'].includes(e.status)).forEach(e => { e.settledAt = e.updatedAt; });
    return d;
  }
  function readPrevious(){
    expected = localStorage.getItem(KEY);
    const loaded = expected === null ? migrate() : normalize(JSON.parse(expected));
    readable=true;return loaded;
  }
  try {
    data=readPrevious();
  } catch (error) {
    blocked = 'No se pudieron leer los datos guardados. No se sobrescribiran. ' + error.message;
    data = { schemaVersion: 4, revision: 0, halls:clone(DEFAULT_HALLS), items: [], events: [], extras: {}, movements: [] };
  }
  function notify(message, error = false) {
    let el = document.getElementById('systemNotice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'systemNotice';
      el.setAttribute('role', 'status');
      const header=document.querySelector?.('.topbar');
      if(header)header.insertAdjacentElement('afterend',el);else document.body.appendChild(el);
    }
    const content=document.createElement('span');content.textContent=message;
    const close=document.createElement('button');close.type='button';close.className='notice-close';close.setAttribute('aria-label','Cerrar aviso');close.title='Cerrar aviso';close.textContent='\u00d7';close.addEventListener('click',()=>el.hidden=true);
    el.replaceChildren(content,close);
    el.className = error ? 'system-notice error' : 'system-notice';
    el.hidden = false;el.setAttribute('role',error?'alert':'status');
    clearTimeout(notify.timer);
    if (!error) notify.timer = setTimeout(() => { el.hidden = true; }, 6500);
  }
  let disabledDuringSave=[];
  function setSaving(value){
    saving=value;
    if(value){
      disabledDuringSave=[...(document.querySelectorAll?.('form input,form select,form textarea,form button,[data-action],#backupBtn,#restoreInput,#calendarNew,#calendarNewDay')||[])].map(el=>[el,el.disabled]);
      disabledDuringSave.forEach(([el])=>el.disabled=true);
    }else{disabledDuringSave.forEach(([el,disabled])=>el.disabled=disabled);disabledDuringSave=[];}
    const label=document.getElementById?.('saveState');if(label)label.textContent=value?'Guardando...':'Datos cargados';
    window.dispatchEvent(new Event('elianne:saving'));
  }
  function commit(action) {
    if (blocked) fail(blocked);
    if(!initialized)fail('Espera a que termine la carga de datos.');
    if(saving)fail('Hay un guardado en curso. Espera un momento antes de volver a guardar.');
    if (!window.ElianneStorage&&localStorage.getItem(KEY) !== expected) fail('Los datos cambiaron en otra pestaña. Recarga esta pagina antes de continuar.');
    const next = clone(data);
    action(next);
    next.revision = data.revision + 1;
    const checked = normalize(next), raw = JSON.stringify(checked);
    if(window.ElianneStorage){
      setSaving(true);
      return window.ElianneStorage.write(checked,persistedToken).then(token=>{
        persistedToken=token;data=checked;window.dispatchEvent(new Event('elianne:change'));
      }).catch(error=>{
        if(error?.name==='StorageConflictError')fail(error.message);
        if(error?.name==='QuotaExceededError')fail('No hay espacio suficiente para guardar la base local. Descarga un respaldo y revisa el espacio del disco o los permisos del navegador. El cambio no se confirmo.');
        fail('No se pudo confirmar el guardado en la base local. Conserva el formulario y descarga un respaldo. '+(error?.message||''));
      }).finally(()=>setSaving(false));
    }
    try { localStorage.setItem(KEY, raw); }
    catch { fail('No se pudo guardar: el almacenamiento esta lleno o bloqueado. Conserva el formulario y descarga un respaldo antes de continuar.'); }
    data = checked;
    expected = raw;
    window.dispatchEvent(new Event('elianne:change'));
  }
  const getExtra = (d, pid) => d.extras[pid] || { status: 'disponible', minQty: 0, cost: 0 };
  function range(e) {
    const departure = e.departureDate || today();
    return [e.status === 'en-evento' && departure < e.date ? departure : e.date, e.status === 'en-evento' && e.returnDate < today() ? '9999-12-31' : (e.returnDate || e.date)];
  }
  function reserved(d, pid, start = today(), end = start, except = null) {
    const points = [];
    d.events.filter(e => active(e) && e.id !== except).forEach(e => {
      const [a, b] = range(e), item=e.items.find(i=>i.productId===pid),qty=item?ownQty(item):0;
      if (!qty || a > end || b < start) return;
      points.push([a < start ? start : a, 0, qty], [b > end ? end : b, 1, -qty]);
    });
    points.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
    let current = 0, peak = 0;
    points.forEach(([, , delta]) => { current += delta; peak = Math.max(peak, current); });
    return peak;
  }
  function available(d, pid, start = today(), end = start, except = null) {
    const p = d.items.find(p => p.id === pid);
    if (!p || getExtra(d, pid).status !== 'disponible') return 0;
    return Math.max(0, p.qty - reserved(d, pid, start, end, except));
  }
  function checkReservation(d, e) {
    const [start, end] = range(e);
    e.items.forEach(i => {
      const p = d.items.find(p => p.id === i.productId);
      if (!p) fail('El evento contiene un producto que ya no existe.');
      const capacity = available(d, p.id, start, end, e.id);
      if (ownQty(i) > capacity) fail(p.name + ': solo hay ' + capacity + ' disponibles entre ' + start + ' y ' + end + '. Cubre el faltante con Alquiler externo.');
    });
  }
  function upsertProduct(payload) {
    const p = normalizeProduct(payload);
    return commit(d => {
      const old = d.items.find(x => x.id === p.id);
      if (p.code && d.items.some(x => x.id !== p.id && x.code.toLocaleLowerCase() === p.code.toLocaleLowerCase())) fail('Ese codigo ya pertenece a otro producto.');
      if (old && p.qty !== old.qty) fail('Usa Movimientos para cambiar la cantidad de un producto existente.');
      if (old) d.items = d.items.map(x => x.id === p.id ? p : x);
      else d.items.unshift(p);
      movement(d, old ? 'edicion' : 'alta', p, old ? 0 : p.qty, old ? 'Datos del producto actualizados.' : 'Producto incorporado.');
    });
  }
  function deleteProduct(pid) {
    return commit(d => {
      const p = d.items.find(p => p.id === pid);
      if (!p) fail('Producto no encontrado.');
      if (d.events.some(e => e.items.some(i => i.productId === pid))) fail('Este producto tiene eventos asociados. Usa el estado Baja para conservar su historial.');
      d.items = d.items.filter(p => p.id !== pid);
      delete d.extras[pid];
      movement(d, 'eliminacion', { ...p, qty: 0 }, -p.qty, 'Producto sin eventos eliminado.');
    });
  }
  function saveExtra(pid, extra) {
    return commit(d => {
      const p = d.items.find(p => p.id === pid);
      if (!p) fail('Selecciona un producto.');
      if (!productStatuses.includes(extra.status)) fail('Estado invalido.');
      if (extra.status !== 'disponible' && d.events.some(e => active(e) && e.items.some(i => i.productId === pid&&ownQty(i)>0))) fail('El producto tiene reservas activas. Reasigna o cancela esas reservas antes de bloquearlo.');
      d.extras[pid] = { status: extra.status, minQty: quantity(extra.minQty), cost: amount(extra.cost) };
      movement(d, 'estado-costo', p, 0, 'Estado: ' + extra.status + '; minimo: ' + extra.minQty + '; costo: Bs ' + extra.cost);
    });
  }
  function saveEvent(payload) {
    const e = normalizeEvent(payload);
    if (!e.responsible) fail('Escribe el responsable del evento.');
    if (e.items.length&&(e.eventDate < e.date || e.venueEndDate > e.returnDate)) fail('Las fechas del evento deben estar entre la salida y la devolucion del material.');
    if(!e.hallIds.length)fail('Selecciona al menos un salon para el evento.');
    return commit(d => {
      const old = d.events.find(x => x.id === e.id);
      if(old&&!Object.hasOwn(payload,'guestCount'))e.guestCount=old.guestCount;
      if (old && !['cotizacion', 'reservado'].includes(old.status)) fail('Solo puedes editar cotizaciones o reservas.');
      if (!['cotizacion', 'reservado'].includes(e.status)) fail('Usa los botones de salida y devolucion para cambiar de estado.');
      e.items.forEach(i => { if (!d.items.some(p => p.id === i.productId)) fail('Producto no encontrado.'); });
      if(old){
        old.items.filter(i=>i.external&&['recibido','devuelto'].includes(i.external.status)).forEach(i=>{
          if(JSON.stringify(e.items.find(j=>j.productId===i.productId)?.external)!==JSON.stringify(i.external))fail('Un alquiler recibido conserva su registro. Gestiona su devolucion desde Alquiler externo.');
        });
      }
      e.items.forEach(i=>{
        const previous=old?.items.find(j=>j.productId===i.productId)?.external;
        if(i.external&&['recibido','devuelto'].includes(i.external.status)&&JSON.stringify(previous)!==JSON.stringify(i.external))fail('Registra la recepcion desde Alquiler externo despues de guardar el evento.');
        checkRentalDates(e,i.external);
      });
      e.items.forEach(i => { i.returned = 0; i.damaged = 0; i.missing = 0; });
      e.settledAt = null;
      if (active(e)) {checkReservation(d, e);checkHalls(d,e);}
      if (old) d.events = d.events.map(x => x.id === e.id ? e : x);
      else d.events.unshift(e);
      const actor=text(payload.recordedBy)||e.responsible,note=text(payload.changeNote);
      if(old){
        eventChanges(d,old,e).reverse().forEach(change=>movement(d,change.type,null,0,change.detail,e,actor));
        if(note)movement(d,'evento-nota',null,0,note,e,actor);
      }else{
        movement(d,'evento-creado',null,0,`Evento creado. Estado: ${stateName(e.status)}. Invitados: ${e.guestCount==null?'sin definir':e.guestCount}.`,e,actor);
        e.items.filter(i=>i.external).forEach(i=>movement(d,'alquiler-'+i.external.status,null,0,`${d.items.find(p=>p.id===i.productId)?.name||i.productId}: ${rentalDescription(i.external)}.`,e,actor));
      }
    });
  }
  function rentalDescription(r){return r?`${r.qty} unidades, ${r.status}, proveedor ${r.supplier||'por definir'}, costo total ${r.cost==null?'sin definir':'Bs '+r.cost}, entrega ${r.deliveryDate}, devolucion ${r.returnDate}${r.notes?', nota: '+r.notes:''}`:'sin alquiler';}
  function checkRentalDates(e,r){
    if(r&&r.status!=='cancelado'&&(r.deliveryDate>e.date||r.returnDate<e.returnDate))fail('El alquiler debe llegar a mas tardar en la salida prevista y devolverse al proveedor despues del regreso del evento.');
  }
  function saveRental(eventId,pid,patch,recordedBy,nextStatus){
    const actor=text(recordedBy);if(!actor)fail('Escribe quien registra el alquiler.');
    return commit(d=>{
      const e=d.events.find(e=>e.id===eventId),i=e?.items.find(i=>i.productId===pid),old=i?.external;
      if(!old)fail('Primero asigna el alquiler al producto al editar el evento.');
      if(['devuelto','cancelado'].includes(old.status))fail('Este alquiler ya esta finalizado.');
      const next=nextStatus||old.status;
      const allowed={pendiente:['pendiente','confirmado','cancelado'],confirmado:['confirmado','recibido','cancelado'],recibido:['recibido','devuelto']};
      if(!allowed[old.status]?.includes(next))fail('Ese cambio de estado del alquiler no esta permitido.');
      if(['cancelado','cerrado','devuelto'].includes(e.status)&&['confirmado','recibido'].includes(next)&&next!==old.status)fail('El evento ya no admite recibir ni confirmar alquileres.');
      const proposed={...old,supplier:patch.supplier??old.supplier,cost:Object.hasOwn(patch,'cost')?patch.cost:old.cost,deliveryDate:patch.deliveryDate??old.deliveryDate,returnDate:patch.returnDate??old.returnDate,notes:patch.notes??old.notes,status:next};
      if(next==='recibido'&&old.status!=='recibido')proposed.receivedAt=Date.now();
      if(next==='devuelto'){
        if(!['devuelto','cerrado','cancelado'].includes(e.status))fail('Confirma primero el regreso del evento o cancela el evento antes de devolver al proveedor.');
        proposed.returned=quantity(patch.returned,'Regreso bueno al proveedor');proposed.damaged=quantity(patch.damaged,'Dañado del alquiler');
        if(proposed.returned+proposed.damaged>proposed.qty)fail('El conteo supera la cantidad alquilada.');
        proposed.missing=proposed.qty-proposed.returned-proposed.damaged;proposed.returnedAt=Date.now();
      }
      const r=normalizeRental(proposed,i.qty);checkRentalDates(e,r);
      if(next==='cancelado'&&e.status==='en-evento')fail('No puedes cancelar un alquiler con el evento en curso.');
      i.external=r;
      if(active(e))checkReservation(d,e);
      e.updatedAt=Date.now();
      if(JSON.stringify(old)!==JSON.stringify(r))movement(d,'alquiler-'+(next===old.status?'editado':next),null,0,`${d.items.find(p=>p.id===pid)?.name||pid}: ${rentalDescription(r)}.${next==='devuelto'?` Devuelto bueno ${r.returned}, dañado ${r.damaged}, faltante ${r.missing}.`:''}`,e,actor);
    });
  }
  function updateGuests(eventId,value,recordedBy,note=''){
    const count=value==null||value===''?null:quantity(value,'Invitados'),actor=text(recordedBy),detail=text(note);
    if(!actor)fail('Escribe quien registra el cambio.');
    return commit(d=>{
      const e=d.events.find(e=>e.id===eventId);if(!e)fail('Evento no encontrado.');
      const change=guestChange(e.guestCount,count);
      if(change&&['cerrado','cancelado'].includes(e.status))fail('El evento esta cerrado o cancelado. Puedes agregar una nota, pero no cambiar los invitados.');
      if(!change&&!detail)fail('No hay cambios en invitados. Escribe una nota para agregarla al historial.');
      e.guestCount=count;e.updatedAt=Date.now();
      movement(d,change?'evento-invitados':'evento-nota',null,0,[change,detail?'Nota: '+detail:''].filter(Boolean).join('\n'),e,actor);
    });
  }
  function transition(eventId, status) {
    return commit(d => {
      const e = d.events.find(e => e.id === eventId);
      if (!e) fail('Evento no encontrado.');
      const allowed = { cotizacion: ['reservado', 'cancelado'], reservado: ['en-evento', 'cancelado'], 'en-evento': [], devuelto: ['cerrado'], cerrado: [], cancelado: [] };
      if (!allowed[e.status].includes(status)) fail('Ese cambio de estado no esta permitido.');
      if(status==='cerrado'&&e.items.some(i=>i.external&&!['devuelto','cancelado'].includes(i.external.status)))fail('Todavia hay alquileres pendientes de devolver o cancelar con el proveedor.');
      if (['reservado', 'en-evento'].includes(status)) {
        const proposed = { ...e, status, departureDate: status === 'en-evento' ? today() : '' };
        checkReservation(d, proposed);
        checkHalls(d,proposed);
        if (status === 'en-evento') {
          if(e.items.some(i=>i.external&&['pendiente','confirmado'].includes(i.external.status)))fail('Falta recibir material de alquiler externo. Registra la recepcion antes de la salida.');
          const start = e.date < today() ? e.date : today();
          const end = e.returnDate < today() ? '9999-12-31' : e.returnDate;
          e.items.forEach(i => {
            const out = d.events.filter(other => other.id !== e.id && other.status === 'en-evento').reduce((sum, other) => {const j=other.items.find(j=>j.productId===i.productId);return sum+(j?ownQty(j):0);}, 0);
            if (out + ownQty(i) > (d.items.find(p => p.id === i.productId)?.qty || 0)) fail('Hay productos que todavia no regresaron de otro evento.');
          });
          e.items.forEach(i => { if (ownQty(i) > available(d, i.productId, start, end, e.id)) fail('No hay disponibilidad para realizar esta salida ahora.'); });
          e.departureDate = today();
        }
      }
      const previousStatus=e.status;e.status = status;
      e.updatedAt = Date.now();
      movement(d, 'evento-' + status, null, 0, `Estado: de ${stateName(previousStatus)} a ${stateName(status)}.`, e);
      if (status === 'en-evento') e.items.forEach(i => movement(d, 'salida', d.items.find(p => p.id === i.productId), 0, 'Salen ' + ownQty(i) + ' unidades propias y '+(i.qty-ownQty(i))+' de alquiler externo.', e));
    });
  }
  function counts(e, values) {
    if (!Array.isArray(values) || values.length !== e.items.length) fail('Faltan productos en la devolucion.');
    return e.items.map((i, index) => {
      const v = values[index];
      if (!obj(v) || v.productId !== i.productId) fail('El detalle de devolucion cambio. Recarga el evento.');
      const returned = quantity(v.returned, 'Regreso bueno'), damaged = quantity(v.damaged, 'Dañado');
      if (returned + damaged > ownQty(i)) fail('Regreso bueno + dañado no puede superar las ' + ownQty(i) + ' unidades propias que salieron.');
      return { ...i, returned, damaged, missing: ownQty(i) - returned - damaged };
    });
  }
  function saveHalls(halls) {
    const normalized=normalizeHalls(halls);
    return commit(d=>{d.halls=normalized;movement(d,'salones-configurados',null,0,normalized.map(h=>h.name).join(', '));});
  }
  function assignVenue(eventId,schedule) {
    return commit(d=>{
      const e=d.events.find(e=>e.id===eventId);if(!e)fail('Evento no encontrado.');
      const previous=venueDescription(d,e);
      Object.assign(e,normalizeVenue(schedule,e.eventDate));
      if(!e.hallIds.length)fail('Selecciona al menos un salon.');
      if(e.items.length&&e.venueEndDate>e.returnDate)fail('La ocupacion termina despues de la devolucion del material. Edita primero las fechas del evento.');
      if(occupiesHall(e))checkHalls(d,e,true);
      e.updatedAt=Date.now();const next=venueDescription(d,e);if(previous!==next)movement(d,'salones-asignados',null,0,`Salones y horario: de "${previous}" a "${next}".`,e);
    });
  }
  function saveReturn(eventId, values, finalize) {
    return commit(d => {
      const e = d.events.find(e => e.id === eventId);
      if (!e || e.status !== 'en-evento' || e.settledAt) fail('Solo se pueden registrar devoluciones de eventos en curso.');
      e.items = counts(e, values);
      if (finalize) {
        e.items.forEach(i => {
          const p = d.items.find(p => p.id === i.productId);
          if (!p) fail('Falta un producto del inventario.');
          const loss = i.damaged + i.missing;
          if (loss > p.qty) fail('La baja supera el stock actual de ' + p.name + '. Revisa los movimientos.');
          p.updatedAt = Date.now();
          movement(d, 'devolucion', p, 0, 'Regresan en buen estado ' + i.returned + ' unidades.', e);
          if (i.damaged) { p.qty -= i.damaged; movement(d, 'daño', p, -i.damaged, 'Unidades retiradas del stock utilizable por daño.', e); }
          if (i.missing) { p.qty -= i.missing; movement(d, 'faltante', p, -i.missing, 'Unidades faltantes retiradas del stock utilizable.', e); }
        });
        e.settledAt = Date.now();
        e.status = 'devuelto';
      } else movement(d, 'conteo', null, 0, 'Conteo parcial guardado; el material sigue reservado.', e);
      e.updatedAt = Date.now();
    });
  }
  function adjust(pid, type, qty, reason, responsible) {
    const n = quantity(qty);
    if (!n) fail('La cantidad debe ser mayor a cero.');
    if (!['compra', 'reparacion', 'recuperacion', 'baja', 'correccion-entrada', 'correccion-salida'].includes(type)) fail('Tipo de movimiento invalido.');
    reason = text(reason); responsible = text(responsible);
    if (!reason || !responsible) fail('Escribe el motivo y el responsable del movimiento.');
    return commit(d => {
      const p = d.items.find(p => p.id === pid);
      if (!p) fail('Selecciona un producto.');
      const delta = ['baja', 'correccion-salida'].includes(type) ? -n : n;
      const balance = p.qty + delta;
      if (balance < 0 || balance > 100000000) fail('El saldo resultante no es valido.');
      if (delta < 0 && d.events.some(e => active(e) && e.items.some(i => i.productId === pid) && reserved(d, pid, ...range(e)) > balance)) fail('La baja dejaria una reserva activa sin suficientes unidades. Reasigna esa reserva primero.');
      p.qty = balance;
      p.updatedAt = Date.now();
      movement(d, type, p, delta, reason, null, responsible);
    });
  }
  function prepareRestore(raw) {
    if (Array.isArray(raw)) {
      const imported = raw.map(p => normalizeProduct({ ...p, id: p.id || uid() }));
      const d = clone(data);
      if (d.events.some(e => e.items.some(i => !imported.some(p => p.id === i.productId)))) fail('Este respaldo antiguo dejaria eventos sin sus productos. Usa un respaldo completo.');
      d.items = imported;
      movement(d, 'restauracion-antigua', null, 0, 'Inventario de respaldo antiguo; se conservaron eventos y movimientos.');
      return normalize(d);
    }
    return normalize(raw);
  }
  function restore(raw) {
    const imported = normalize(raw);
    const result=commit(d => {
      Object.assign(d, imported);
      movement(d, 'restauracion', null, 0, 'Respaldo completo restaurado.');
    });
    if(result?.then)return result.then(()=>window.dispatchEvent(new Event('elianne:restored')));
    window.dispatchEvent(new Event('elianne:restored'));
  }
  const ready=window.ElianneStorage?window.ElianneStorage.open(readPrevious,normalize,()=>notify('Los datos cambiaron en otra pestaña. Recarga antes de seguir editando.',true)).then(result=>{
    data=result.data;persistedToken=result.token;blocked='';readable=true;
  }).catch(error=>{blocked='No se pudo abrir la base local. Los datos anteriores no se sobrescribieron. '+(error?.message||'');}).finally(()=>{
    initialized=true;document.getElementById('storageLoading')?.remove();if(blocked)notify(blocked,true);
  }):Promise.resolve();
  window.Elianne = { ready,isReady:()=>initialized,saving:()=>saving,get: () => clone(data), today, uid, quantity,ownQty,saveRental, backup: () => {if(!readable)fail('No se pudo leer la base local. No se generara un respaldo vacio.');return { ...clone(data), exportedAt: new Date().toISOString(), application: 'Inventario Elianne' };}, prepareRestore, restore, upsertProduct, deleteProduct, saveExtra, saveEvent, transition, saveReturn, adjust, notify, saveHalls, assignVenue, venueRange, occupiesHall,updateGuests,eventHistory:eventId=>clone(data.movements.filter(m=>m.eventId===eventId)),
    hallConflicts:e=>clone(hallConflicts(data,e)),onVenueDay:(e,key)=>{const span=venueRange(e),start=civilMinute(key);return span.start<start+1440&&start<span.end;},
    reserved: (pid, start, end, except) => reserved(data, pid, start, end, except), available: (pid, start, end, except) => available(data, pid, start, end, except), extra: pid => clone(getExtra(data, pid)), active, blocked: () => blocked };
  window.addEventListener('storage', e => { if (e.key === KEY) notify('Los datos cambiaron en otra pestaña. Recarga antes de seguir editando.', true); });
  window.addEventListener('beforeunload',event=>{if(saving){event.preventDefault();event.returnValue='';}});
  if (blocked&&!window.ElianneStorage) setTimeout(() => notify(blocked, true), 0);
})();
