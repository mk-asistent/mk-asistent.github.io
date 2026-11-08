// Náhledy tipů uložené v zařízení (Michal 8. 11.: „trochu se to načítá a není to moc plynulé“). IndexedDB: 'ikony' (malé obrázky
// do seznamu), 'nahled:<id>' (snímky a přepis), 'video:<id>' (video). Jen na tomhle zařízení, na server ani do repa nic nejde;
// po rozhodnutí o tipu a po odhlášení se maže. Když úložiště nejde (soukromé okno, plné), nic se neděje – stáhne se z motoru.
const DB = 'asistent-tipy';
const STORE = 'tipy';
let spojeni = null;

function db() {
  if (!spojeni) {
    spojeni = new Promise((ok, chyba) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => chyba(r.error);
    });
    spojeni.catch(() => { spojeni = null; });
  }
  return spojeni;
}

function akce(rezim, f) {
  return db().then((d) => new Promise((ok, chyba) => {
    const t = d.transaction(STORE, rezim);
    const r = f(t.objectStore(STORE));
    t.oncomplete = () => ok(r.result);
    t.onerror = t.onabort = () => chyba(t.error);
  }));
}

export const cti = (klic) => akce('readonly', (s) => s.get(klic)).catch(() => undefined);
export const pis = (klic, hodnota) => akce('readwrite', (s) => s.put(hodnota, klic)).catch(() => undefined);
export const smaz = (klic) => akce('readwrite', (s) => s.delete(klic)).catch(() => undefined);
export const klice = () => akce('readonly', (s) => s.getAllKeys()).catch(() => []);
export const vymaz = () => akce('readwrite', (s) => s.clear()).catch(() => undefined);

/** Base64 → bajty po kouskách, ať se stránka při převodu videa nezasekne. */
export async function zBase64(b) {
  const KUS = 262144; // násobek 4
  const vysledek = new Uint8Array(Math.floor(b.length / 4) * 3 - (b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0));
  let j = 0;
  for (let i = 0; i < b.length; i += KUS) {
    const kus = atob(b.slice(i, i + KUS));
    for (let n = 0; n < kus.length; n++) vysledek[j++] = kus.charCodeAt(n);
    await new Promise((hotovo) => setTimeout(hotovo));
  }
  return vysledek;
}
