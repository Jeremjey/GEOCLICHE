/* GéoCliché — stockage local (IndexedDB) : photos et dossiers */
(function (global) {
  'use strict';
  const NAME = 'geocliche', VERSION = 2;
  let dbp = null;

  function open() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open(NAME, VERSION);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' }).createIndex('ts', 'ts');
          if (!db.objectStoreNames.contains('dossiers')) db.createObjectStore('dossiers', { keyPath: 'id' });
        };
        r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); res(db); };
        r.onerror = () => { dbp = null; rej(r.error); };
      });
    }
    return dbp;
  }
  const done = (t) => new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Écriture annulée (stockage plein ?)'));
  });
  const result = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  // Repli pour les navigateurs qui refusent les Blob dans IndexedDB
  async function pack(b) { return b instanceof Blob ? { __buf: await b.arrayBuffer(), type: b.type } : b; }
  const unpack = (v) => (v && v.__buf ? new Blob([v.__buf], { type: v.type }) : v);
  function norm(r) { if (r) { r.blob = unpack(r.blob); r.thumb = unpack(r.thumb); } return r; }

  async function write(store, rec) {
    const db = await open();
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(rec);
    await done(t);
  }
  async function put(rec) {
    try { await write('photos', rec); }
    catch (e) {
      const msg = String((e && (e.name + ' ' + e.message)) || '');
      if (/DataClone|clone|Blob/i.test(msg)) {
        await write('photos', Object.assign({}, rec, { blob: await pack(rec.blob), thumb: await pack(rec.thumb) }));
      } else throw e;
    }
  }
  async function all() {
    const db = await open();
    const list = await result(db.transaction('photos').objectStore('photos').getAll());
    return list.map(norm).sort((a, b) => a.ts - b.ts);
  }
  async function get(id) {
    const db = await open();
    return norm(await result(db.transaction('photos').objectStore('photos').get(id)));
  }
  async function del(id) {
    const db = await open();
    const t = db.transaction('photos', 'readwrite');
    t.objectStore('photos').delete(id);
    await done(t);
  }
  async function clear() {
    const db = await open();
    const t = db.transaction('photos', 'readwrite');
    t.objectStore('photos').clear();
    await done(t);
  }
  async function putDossier(d) { await write('dossiers', d); }
  async function allDossiers() {
    const db = await open();
    return result(db.transaction('dossiers').objectStore('dossiers').getAll());
  }

  global.DB = { open, put, all, get, del, clear, putDossier, allDossiers };
})(window);
