// The uploaded font file is kept in IndexedDB, so it survives a reload without bloating the project.
const DB = "3dtools.letters";
const STORE = "fonts";

const open = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export const saveCustomFont = (bytes) =>
  tx("readwrite", (s) => s.put(bytes, "custom")).catch(() => {});
export const loadCustomFont = () => tx("readonly", (s) => s.get("custom")).catch(() => null);
