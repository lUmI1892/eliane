/* Keep full documents and migration copies outside localStorage's small quota. */
(() => {
  'use strict';
  const NAME='elianneSalonData', KEY='elianneSalon.v3';
  const SOURCE_KEYS=[KEY,'elianneInventory.v1','elianneSalonEvents.v1','elianneSalonExtras.v1'];
  let db=null, channel=null;
  const token=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
  const error=(name,message)=>Object.assign(new Error(message),{name});
  function connect(){
    if(!globalThis.indexedDB)return Promise.reject(error('StorageUnavailableError','Este navegador no permite abrir la base local.'));
    return new Promise((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>finish(error('StorageUnavailableError','La base local esta bloqueada. Cierra las otras pestañas del sistema y vuelve a abrirlo.')),8000);
      const finish=(failure,value)=>{if(settled){value?.close();return;}settled=true;clearTimeout(timer);failure?reject(failure):resolve(value);};
      let request;try{request=indexedDB.open(NAME,1);}catch(e){finish(e);return;}
      request.onupgradeneeded=()=>{const database=request.result;for(const name of ['state','legacy'])if(!database.objectStoreNames.contains(name))database.createObjectStore(name);};
      request.onerror=()=>finish(request.error);
      request.onblocked=()=>finish(error('StorageUnavailableError','Otra pestaña bloqueo la apertura de los datos. Cierra las otras pestañas del sistema.'));
      request.onsuccess=()=>{
        const database=request.result;
        database.onversionchange=()=>{database.close();if(db===database)db=null;};
        finish(null,database);
      };
    });
  }
  function read(store,key){
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get(key);let result;
      req.onsuccess=()=>result=req.result;
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||req.error);tx.onabort=()=>reject(tx.error||error('AbortError','No se pudo leer la base local.'));
    });
  }
  function createInitial(makeData){
    let sources={};
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['state','legacy'],'readwrite'),store=tx.objectStore('state'),req=store.get('main');
      let chosen,created=false,failure;
      req.onsuccess=()=>{
        try{
          if(req.result){chosen=req.result;return;}
          sources=Object.fromEntries(SOURCE_KEYS.map(key=>[key,localStorage.getItem(key)]));
          const initial={token:token(),data:makeData()};
          if(SOURCE_KEYS.some(key=>localStorage.getItem(key)!==sources[key]))throw error('StorageConflictError','Los datos cambiaron durante la migracion. Cierra las otras pestañas y recarga.');
          chosen=initial;created=true;store.put(initial,'main');
          for(const [key,raw]of Object.entries(sources))if(raw!==null)tx.objectStore('legacy').put({raw,archivedAt:Date.now()},key);
        }catch(e){failure=e;tx.abort();}
      };
      tx.oncomplete=()=>resolve({record:chosen,created,sources});
      tx.onerror=()=>reject(failure||tx.error||req.error);
      tx.onabort=()=>reject(failure||tx.error||error('AbortError','No se completo la migracion.'));
    });
  }
  async function verifyMigration(result,validate){
    const actual=await read('state','main');
    validate(actual?.data);
    if(actual.token!==result.record.token||JSON.stringify(actual.data)!==JSON.stringify(result.record.data))throw error('StorageConflictError','La copia local cambio durante la verificacion. Recarga para leer la ultima version.');
    for(const [key,raw]of Object.entries(result.sources)){
      if(raw===null)continue;
      const archived=await read('legacy',key);
      if(archived?.raw!==raw)throw error('StorageVerificationError','No se verifico la copia anterior. Los datos originales se conservaron.');
    }
    // Only remove duplicates after both the live document and exact originals were read back.
    for(const key of SOURCE_KEYS.filter(key=>key!==KEY)){
      const raw=result.sources[key];
      if(raw!==null&&localStorage.getItem(key)===raw){try{localStorage.removeItem(key);}catch{/* The verified database is already authoritative. */}}
    }
    if(localStorage.getItem(KEY)===result.sources[KEY]){
      try{localStorage.setItem(KEY,JSON.stringify({backend:'indexeddb',database:NAME,version:1}));}catch{/* No localStorage capacity is required for future saves. */}
    }
    return actual;
  }
  async function open(makeData,validate,onExternal){
    db=await connect();
    let record=await read('state','main');
    if(!record){
      const result=await createInitial(makeData);
      record=result.created?await verifyMigration(result,validate):result.record;
    }
    const data=validate(record?.data);
    if(typeof BroadcastChannel==='function'){
      channel=new BroadcastChannel(NAME);
      channel.onmessage=()=>onExternal();
    }
    return {data,token:record.token};
  }
  function write(data,expected){
    if(!db)return Promise.reject(error('StorageUnavailableError','La base local esta cerrada. Recarga antes de seguir.'));
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),req=store.get('main'),next=token();let failure;
      req.onsuccess=()=>{
        try{
          if(req.result?.token!==expected)throw error('StorageConflictError','Los datos cambiaron en otra pestaña. Recarga antes de continuar.');
          store.put({data,token:next},'main');
        }catch(e){failure=e;tx.abort();}
      };
      tx.oncomplete=()=>{try{channel?.postMessage({token:next});}catch{}resolve(next);};
      tx.onerror=()=>reject(failure||tx.error||req.error);
      tx.onabort=()=>reject(failure||tx.error||error('AbortError','No se confirmo el guardado.'));
    });
  }
  window.ElianneStorage={open,write,name:NAME};
})();
