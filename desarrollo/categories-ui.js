let categoryOrigin=null,categoryBaseline='';
const categoryFormDirty=()=>categoryOrigin&&$('newCategoryName').value!==categoryBaseline;
function openCategoryDialog(){
  if(api.saving())return;
  categoryOrigin='inventory';
  $('newCategoryName').value='';
  categoryBaseline=$('newCategoryName').value;$('categoryMessage').textContent='';$('categoryDialog').showModal();$('newCategoryName').focus();
}
function closeCategoryDialog(){
  if(api.saving()||(categoryFormDirty()&&!confirm('Hay una categoria sin guardar. Descartar ese nombre?')))return;
  categoryOrigin=null;$('categoryDialog').close();$('inventoryCategoryAdd').focus();
}
function initCategories(){
  types['categoria-creada']='Categoria creada';
  document.querySelector('.salon-module').insertAdjacentHTML('beforeend','<dialog id="categoryDialog" class="salon-dialog category-dialog" aria-labelledby="categoryTitle"><div class="history-heading"><h2 id="categoryTitle">Nueva categoria</h2><button id="categoryDialogClose" class="btn small" type="button">Cerrar</button></div><form id="newCategoryForm" class="form"><div class="field"><label for="newCategoryName">Nombre de la categoria</label><input id="newCategoryName" maxlength="100" autocomplete="off" required></div><p id="categoryMessage" class="invalid" role="status"></p><button type="submit" class="btn primary">Guardar categoria</button></form></dialog>');
  $('inventoryCategoryAdd').addEventListener('click',openCategoryDialog);
  $('categoryDialogClose').addEventListener('click',closeCategoryDialog);
  $('categoryDialog').addEventListener('cancel',event=>{event.preventDefault();closeCategoryDialog();});
  $('newCategoryForm').addEventListener('submit',async event=>{
    event.preventDefault();if(api.saving())return;
    try{
      const name=$('newCategoryName').value;await api.addCategory(name);
      const saved=api.categories().find(c=>api.categoryKey(c)===api.categoryKey(name));
      categoryOrigin=null;$('categoryDialog').close();
      $('categoryInput').value=saved;$('categoryInput').focus();api.notify('Categoria creada: '+saved+'.');
    }catch(error){$('categoryMessage').textContent=error.message;}
  });
  window.addEventListener('elianne:restored',()=>{categoryOrigin=null;$('categoryDialog').close();});
  window.addEventListener('beforeunload',event=>{if(categoryFormDirty()){event.preventDefault();event.returnValue='';}});
}
