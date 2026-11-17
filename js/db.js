// IndexedDB: historial de documentos, firma, materias, ajustes y sesión de escaneo.
const DB_NAME = 'escaner-libre', DB_VER = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id', autoIncrement: true }).createIndex('created', 'created');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    let out;
    const r = fn(s);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transacción abortada (¿almacenamiento lleno?)'));
  });
}

export const kv = {
  get: key => tx('kv', 'readonly', s => s.get(key)),
  set: (key, val) => tx('kv', 'readwrite', s => s.put(val, key)),
  del: key => tx('kv', 'readwrite', s => s.delete(key)),
};

export const docs = {
  add: doc => tx('docs', 'readwrite', s => s.add(doc)),
  put: doc => tx('docs', 'readwrite', s => s.put(doc)),
  get: id => tx('docs', 'readonly', s => s.get(id)),
  del: id => tx('docs', 'readwrite', s => s.delete(id)),
  clear: () => tx('docs', 'readwrite', s => s.clear()),
  // lista sin blobs pesados: los blobs en IDB son referencias, no se leen hasta usarlos
  all: () => tx('docs', 'readonly', s => s.getAll()),
};

export async function requestPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { }
}
