let catalogDraft=[],catalogBaseline='',catalogCategory='',catalogProducts=[];
const catalogDisabled=new Map();
const catalogItem=pid=>catalogProducts.find(p=>p.id===pid);
const catalogDirty=()=>JSON.stringify(catalogDraft)!==catalogBaseline||Boolean($('catalogDialog').querySelector('[data-cart-qty][aria-invalid="true"]'));
const catalogMin=i=>i.external&&i.external.status!=='cancelado'?Math.max(1,Number(i.external.qty)||0):1;
const catalogLocked=i=>i.external&&['recibido','devuelto'].includes(i.external.status);
function catalogPhoto(p){
  return `<span class="catalog-photo">${p?.photo?`<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" decoding="async">`:''}<span class="catalog-photo-empty" ${p?.photo?'hidden':''}>Sin foto</span></span>`;
}
function catalogMessage(message,error=false){$('catalogMessage').textContent=message;$('catalogMessage').classList.toggle('invalid',error);}
function catalogQuantity(input,min=1){
  try{const qty=api.quantity(input.value);if(qty<min)throw new Error('La cantidad minima es '+min+'.');input.setAttribute('aria-invalid','false');return qty;}
  catch(error){input.setAttribute('aria-invalid','true');catalogMessage(error.message,true);return null;}
}
function syncCatalogSaving(){
  if(!$('catalogDialog').open)return;
  if(api.saving())$('catalogDialog').querySelectorAll('button,input,select').forEach(el=>{if(!catalogDisabled.has(el))catalogDisabled.set(el,el.disabled);el.disabled=true;});
  else{catalogDisabled.forEach((disabled,el)=>{if(el.isConnected)el.disabled=disabled;});catalogDisabled.clear();updateCatalogTotals();}
}
function openCatalog(){
  if(api.saving())return;
  const [a,b]=period();
  if(!$('salonDate').value||!$('salonEnd').value||b<a){api.notify('Completa las fechas de salida y devolucion antes de seleccionar productos.',true);$('salonDate').focus();return;}
  catalogProducts=api.get().items;catalogDraft=JSON.parse(JSON.stringify(draft));catalogBaseline=JSON.stringify(catalogDraft);catalogCategory='';
  $('catalogSearch').value='';catalogMessage('');
  const eventHalls=readVenue('event').hallIds;
  $('catalogContext').textContent=[$('salonClient').value||'Nuevo evento',$('salonEventDate').value?reportDate($('salonEventDate').value):'',api.get().halls.filter(h=>eventHalls.includes(h.id)).map(h=>h.name).join(' + ')].filter(Boolean).join(' · ');
  $('catalogPeriod').textContent='Materiales: '+reportDate(a)+' al '+reportDate(b);
  renderCatalog(false);$('catalogDialog').showModal();$('catalogSearch').focus();
}
function closeCatalog(){
  if(api.saving()||(catalogDirty()&&!confirm('Hay una seleccion sin confirmar. Descartar estos cambios?')))return;
  $('catalogDialog').close();$('salonCatalogOpen').focus();
}
function renderCatalog(preserve=true){
  const categories=api.categories();
  catalogCategory=categories.find(c=>api.categoryKey(c)===api.categoryKey(catalogCategory))||'';
  $('catalogCategory').innerHTML='<option value="">Todas las categorias</option>'+categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $('catalogCategory').value=catalogCategory;
  renderCatalogProducts(preserve);renderCatalogCart(preserve);syncCatalogSaving();
}
function renderCatalogProducts(preserve=true){
  const quantities=new Map(preserve?[...$('catalogProducts').querySelectorAll('[data-catalog-qty]')].map(el=>[el.dataset.catalogQty,{value:el.value,invalid:el.getAttribute('aria-invalid')}]):[]);
  const query=$('catalogSearch').value.trim().toLocaleLowerCase(),[a,b]=period();
  const products=catalogProducts.filter(p=>(!catalogCategory||api.categoryKey(p.category)===api.categoryKey(catalogCategory))&&[p.name,p.code,p.category].join(' ').toLocaleLowerCase().includes(query));
  $('catalogResults').textContent=products.length+' '+(products.length===1?'modelo':'modelos');
  $('catalogProducts').innerHTML=products.length?products.map(p=>{
    const available=api.available(p.id,a,b,editing),state=api.extra(p.id).status;
    return `<article class="catalog-product" data-catalog-product="${esc(p.id)}">${catalogPhoto(p)}<div class="catalog-product-data"><h3>${esc(p.name)}</h3><p class="catalog-code">${esc(p.code||'Sin codigo')}</p><p class="catalog-availability ${available===0?'catalog-low':''}">Disponibles: ${available} <span>${esc(p.unit)}</span></p>${state!=='disponible'?`<p class="catalog-low">${prodStatus[state]}</p>`:''}<p class="catalog-selected" data-catalog-selected="${esc(p.id)}"></p><div class="catalog-product-actions"><div class="catalog-stepper"><button type="button" data-catalog-step="-1" aria-label="Reducir cantidad de ${esc(p.name)}" title="Reducir cantidad">&#8722;</button><input type="number" min="1" max="100000000" step="1" value="1" data-catalog-qty="${esc(p.id)}" aria-label="Cantidad de ${esc(p.name)}"><button type="button" data-catalog-step="1" aria-label="Aumentar cantidad de ${esc(p.name)}" title="Aumentar cantidad">+</button></div><button type="button" class="btn primary small" data-catalog-add="${esc(p.id)}">Agregar</button></div></div></article>`;
  }).join(''):`<div class="empty catalog-empty">${catalogProducts.length?'No hay productos para esta categoria o busqueda.':'No hay productos registrados en el inventario.'}</div>`;
  $('catalogProducts').querySelectorAll('[data-catalog-qty]').forEach(el=>{const previous=quantities.get(el.dataset.catalogQty);if(previous){el.value=previous.value;if(previous.invalid!==null)el.setAttribute('aria-invalid',previous.invalid);}});
  updateCatalogTotals();
}
function renderCatalogCart(preserve=true){
  const invalid=new Map(preserve?[...$('catalogCart').querySelectorAll('[data-cart-qty][aria-invalid="true"]')].map(el=>[el.dataset.cartQty,el.value]):[]);
  $('catalogCart').innerHTML=catalogDraft.length?catalogDraft.map(i=>{
    const p=catalogItem(i.productId);
    return `<div class="catalog-cart-row" data-cart-row="${esc(i.productId)}">${catalogPhoto(p)}<div class="catalog-cart-data"><h4>${esc(p?.name||'Producto eliminado')}</h4><p class="catalog-code">${esc(p?.code||'Sin codigo')}</p><div class="catalog-cart-actions"><input type="number" min="${catalogMin(i)}" max="100000000" step="1" value="${i.qty}" data-cart-qty="${esc(i.productId)}" aria-label="Seleccionadas de ${esc(p?.name||'Producto')}"><button type="button" class="btn small" data-catalog-remove="${esc(i.productId)}" ${catalogLocked(i)?'disabled':''}>Quitar</button></div><p class="catalog-coverage" data-catalog-coverage="${esc(i.productId)}"></p><button type="button" class="btn small catalog-rent" data-catalog-rent="${esc(i.productId)}" hidden>Alquiler externo</button></div></div>`;
  }).join(''):'<p class="empty">Sin productos seleccionados.</p>';
  $('catalogCart').querySelectorAll('[data-cart-qty]').forEach(el=>{if(invalid.has(el.dataset.cartQty)){el.value=invalid.get(el.dataset.cartQty);el.setAttribute('aria-invalid','true');}});
  updateCatalogTotals();
}
function updateCatalogTotals(){
  const [a,b]=period();let shortages=0;
  for(const i of catalogDraft){
    const need=Math.max(0,api.ownQty(i)-api.available(i.productId,a,b,editing));shortages+=need;
    const label=$('catalogCart').querySelector(`[data-catalog-coverage="${i.productId}"]`);
    if(label){label.textContent=need?`Faltan ${need} propios`:i.external&&i.external.status!=='cancelado'?`${i.external.qty} externos · ${rentalLabels[i.external.status]}`:'Cubierto con material propio';label.classList.toggle('catalog-low',need>0);}
    const rent=$('catalogCart').querySelector(`[data-catalog-rent="${i.productId}"]`);if(rent)rent.hidden=!need;
  }
  $('catalogProducts').querySelectorAll('[data-catalog-selected]').forEach(el=>{const i=catalogDraft.find(i=>i.productId===el.dataset.catalogSelected);el.textContent=i?'Seleccionados: '+i.qty:'';});
  $('catalogTotals').textContent=`${catalogDraft.length} ${catalogDraft.length===1?'modelo':'modelos'} · ${catalogDraft.reduce((sum,i)=>sum+i.qty,0)} unidades`;
  $('catalogShortage').hidden=!shortages;$('catalogShortage').textContent=`Faltan ${shortages} unidades propias por cubrir con alquiler externo.`;
  $('catalogConfirm').disabled=api.saving()||Boolean($('catalogCart').querySelector('[aria-invalid="true"]'));
}
function confirmCatalog(rentalPid){
  if(api.saving())return;
  try{
    if($('catalogCart').querySelector('[aria-invalid="true"]'))throw new Error('Revisa las cantidades de la seleccion.');
    const availableIds=new Set(api.get().items.map(p=>p.id));
    catalogDraft.forEach(i=>{if(!availableIds.has(i.productId))throw new Error('Un producto de la seleccion ya no existe.');if(api.quantity(i.qty)<catalogMin(i))throw new Error('Revisa la cantidad y el alquiler externo del producto.');});
    draft=JSON.parse(JSON.stringify(catalogDraft));renderDraft();$('catalogDialog').close();$('salonCatalogOpen').focus();
    if(rentalPid){const index=draft.findIndex(i=>i.productId===rentalPid);document.querySelector(`[data-draft-rent="${index}"]`)?.click();}
  }catch(error){catalogMessage(error.message,true);}
}
function initCatalog(){
  document.querySelector('.salon-module').insertAdjacentHTML('beforeend',`<dialog id="catalogDialog" class="catalog-dialog" aria-labelledby="catalogTitle" aria-describedby="catalogContext"><header class="catalog-heading"><div><p class="catalog-brand">ELIANNE</p><h2 id="catalogTitle">Seleccionar productos</h2><p id="catalogContext"></p><p id="catalogPeriod"></p></div><button type="button" class="btn" id="catalogClose">Cerrar</button></header><div class="catalog-layout"><section class="catalog-browser" aria-label="Catalogo de productos"><div class="catalog-category-tools"><div class="field"><label for="catalogCategory">Categoria</label><select id="catalogCategory"></select></div></div><div class="catalog-search"><label for="catalogSearch">Buscar producto</label><input id="catalogSearch" type="search" placeholder="Nombre o codigo"><span id="catalogResults" role="status"></span></div><div id="catalogProducts" class="catalog-products"></div></section><aside class="catalog-selection"><h3 id="catalogSelectionTitle" tabindex="-1">Seleccion del evento</h3><div id="catalogCart" class="catalog-cart"></div></aside></div><footer class="catalog-footer"><div><strong id="catalogTotals"></strong><p id="catalogShortage" class="catalog-low" hidden></p><p id="catalogMessage" role="status"></p></div><div class="catalog-footer-actions"><button type="button" class="btn catalog-mobile-selection" id="catalogViewSelection">Ver seleccion</button><button type="button" class="btn primary" id="catalogConfirm">Confirmar seleccion</button></div></footer></dialog>`);
  $('salonCatalogOpen').addEventListener('click',openCatalog);
  $('catalogClose').addEventListener('click',closeCatalog);
  $('catalogConfirm').addEventListener('click',()=>confirmCatalog());
  $('catalogViewSelection').addEventListener('click',()=>{$('catalogSelectionTitle').scrollIntoView({block:'start'});$('catalogSelectionTitle').focus({preventScroll:true});});
  $('catalogSearch').addEventListener('input',renderCatalogProducts);
  $('catalogCategory').addEventListener('change',()=>{catalogCategory=$('catalogCategory').value;renderCatalogProducts();});
  $('catalogDialog').addEventListener('cancel',event=>{event.preventDefault();closeCatalog();});
  $('catalogDialog').addEventListener('error',event=>{if(event.target.matches('.catalog-photo img')){event.target.hidden=true;event.target.nextElementSibling.hidden=false;}},true);
  $('catalogDialog').addEventListener('click',event=>{
    if(api.saving())return;
    const button=event.target.closest('button');if(!button)return;
    try{
      if(button.dataset.catalogStep){const input=button.closest('.catalog-stepper').querySelector('input');input.value=Math.min(100000000,Math.max(1,(Number(input.value)||1)+Number(button.dataset.catalogStep)));input.setAttribute('aria-invalid','false');}
      if(button.dataset.catalogAdd){
        const pid=button.dataset.catalogAdd,input=button.closest('[data-catalog-product]').querySelector('[data-catalog-qty]'),qty=catalogQuantity(input);if(qty===null)return;
        const existing=catalogDraft.find(i=>i.productId===pid);
        if(existing)existing.qty=api.quantity(existing.qty+qty);else catalogDraft.push({productId:pid,qty,returned:0,damaged:0,missing:0});
        input.value='1';catalogMessage('Agregado: '+catalogItem(pid).name);renderCatalogCart();
      }
      if(button.dataset.catalogRemove){const i=catalogDraft.find(i=>i.productId===button.dataset.catalogRemove);if(i&&catalogLocked(i))throw new Error('Un alquiler recibido conserva su registro.');catalogDraft=catalogDraft.filter(i=>i.productId!==button.dataset.catalogRemove);catalogMessage('');renderCatalogCart();}
      if(button.dataset.catalogRent)confirmCatalog(button.dataset.catalogRent);
    }catch(error){catalogMessage(error.message,true);}
  });
  $('catalogCart').addEventListener('input',event=>{
    const input=event.target;if(!input.dataset.cartQty)return;
    const i=catalogDraft.find(i=>i.productId===input.dataset.cartQty),qty=catalogQuantity(input,catalogMin(i));
    if(qty!==null){i.qty=qty;catalogMessage('');}updateCatalogTotals();
  });
  $('catalogProducts').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-catalog-qty]')){event.preventDefault();event.target.closest('[data-catalog-product]').querySelector('[data-catalog-add]').click();}});
  window.addEventListener('elianne:change',()=>{if($('catalogDialog').open){catalogProducts=api.get().items;renderCatalog();}});
  window.addEventListener('elianne:restored',()=>{$('catalogDialog').close();catalogDraft=[];catalogBaseline='';});
  window.addEventListener('elianne:saving',syncCatalogSaving);
  window.addEventListener('beforeunload',event=>{if($('catalogDialog').open&&catalogDirty()){event.preventDefault();event.returnValue='';}});
}
