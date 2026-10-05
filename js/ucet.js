// Účet Asistenta ve Firebase (projekt asistent-michal): přihlášení e-mailem a heslem a kopie dat ze serveru.
//
// - Nové zařízení: e-mail + heslo → adresa motoru a klíč se načtou z účtu (Firestore uzivatele/{uid}.pripojeni).
//   Připojené zařízení je tam po přihlášení samo uloží – odtud je bere i server.
// - Server (firebase/functions) každých 10 minut (6–23 h) a na požádání (obnovHned) zavolá motor a uloží kopie
//   do Firestore (uzivatele/{uid}/data). Aplikace je ukáže hned po otevření a změny dostává živě; na motor
//   (Apps Script, 2–10 s) čeká jen u akcí a u kopií, které nejsou aktuální.
// - Kopie se nepoužije, když je starší než 30 min (server nejede) nebo když po ní v tomhle zařízení proběhla změna
//   (archivace, zápis, otevření konverzace…) či přímé čtení z motoru (Obnovit) – pak jde čtení na motor jako dřív.
// Knihovny Firebase se stahují, až když je účet v zařízení zapnutý; bez účtu jede aplikace jen s motorem.

import { uloziste } from './pomocne.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
// veřejná konfigurace webové aplikace Firebase – není tajná, přístup hlídá přihlášení a pravidla (firebase/firestore.rules)
const KONFIGURACE = { apiKey: 'AIzaSyCmDWoFls9B_ciy6Pr-8eqrE7wPAOiSdqo', authDomain: 'asistent-michal.firebaseapp.com', projectId: 'asistent-michal',
  appId: '1:411060741218:web:4fb0807954c0db35161d3b' };
const REGION = 'europe-west1';         // funkce v Belgii – vedle databáze (eur3)
const UCET = 'asistent.ucet';        // { email } – v tomhle zařízení je zapnutý účet (přihlášení drží Firebase)
const PLATNOST = 'asistent.kopie';   // { zmena: ms, primo: { id: ms } } – co v zařízení proběhlo po kopiích ze serveru
const MAX_STARI = 30 * 60e3;         // starší kopie = server asi nejede → motor
// fotbal, nastavení a reely server obnovuje jen jednou za hodinu / půl hodiny (mění se málo) – kopie platí déle
const MAX_STARI_ID = { info: 3 * 3600e3, fotbal: 3 * 3600e3, reely: 90 * 60e3 };
const REZERVA = 10e3;                // hodiny zařízení a serveru se můžou o pár vteřin lišit
const OBNOVIT_PO = 4 * 60e3;         // starší kopie → při otevření požádat server o čerstvé
const CEKAT_NA_KOPIE = 4000;         // déle se při startu na Firebase nečeká (pak motor jako dřív)
const OBNOVA_PO_ZMENE = 15e3;        // po změně z aplikace server kopie obnoví (ať jsou zase k použití)

// čtení, která můžou přijít z kopie (bez dalších parametrů); kalendář podle mřížky měsíce.
// Zdraví a počasí server nechystá (zdravotní data jen na Disku, počasí podle polohy telefonu) – ty jdou vždy z motoru.
const Z_KOPIE = ['info', 'schranka', 'posta', 'fotbal', 'reely', 'zmeny'];
// akce, které jen čtou – všechno ostatní mění data (i otevření konverzace: označí ji jako přečtenou)
export const CTENI = ['info', 'schranka', 'posta', 'kalendar', 'kalendare', 'pocasi', 'zdravi', 'fotbal', 'reely', 'dochazka', 'stitky',
  'kontakty', 'hledat', 'postaStitek', 'postaKategorie', 'auto', 'upozorneni', 'autoUctenkaFoto', 'zmeny']; // čtení bez kopie nic nezneplatní

const s = { fb: null, fbSlib: null, uzivatel: null, kopie: {}, server: null, pripraveno: null, odber: null, prvni: true,
  obnovuje: null, naposledyObnova: 0, casovac: 0, chyba: null, naKopie: [], naStav: [] };

export const nastaveno = () => !!KONFIGURACE.apiKey;
export const zapnuty = () => nastaveno() && !!uloziste.cti(UCET);
export const prihlasen = () => !!s.uzivatel;

/** Pro Nastavení: e-mail, přihlášení, kdy server naposledy obnovil kopie a s jakými chybami. */
export function stavUctu() {
  return { nastaveno: nastaveno(), zapnuty: zapnuty(), email: (uloziste.cti(UCET) || {}).email || '', prihlasen: !!s.uzivatel,
    server: s.server, obnovuje: !!s.obnovuje, chyba: s.chyba };
}

/** fn(idy) – změnily se kopie, které se dají použít (aplikace je načte znovu); fn() – změnil se stav účtu. */
export function naKopie(fn) { s.naKopie.push(fn); }
export function naStav(fn) { s.naStav.push(fn); }
function oznam(seznam, arg) { seznam.forEach((fn) => { try { fn(arg); } catch (e) { /* další posluchač */ } }); }

// ---------------------------------------------------------------- Firebase (stahuje se až při použití)

function nactiFirebase() {
  if (!s.fbSlib) {
    s.fbSlib = Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js', 'firebase-functions.js'].map((f) => import(SDK + f)))
      .then(([app, auth, fs, fn]) => {
        const a = app.initializeApp(KONFIGURACE);
        // bez okna/přesměrování Googlu (v aplikaci z plochy iPhonu nejde) – jen e-mail a heslo, přihlášení drží IndexedDB
        const ov = auth.initializeAuth(a, { persistence: [auth.indexedDBLocalPersistence, auth.browserLocalPersistence] });
        s.fb = { auth, fs, fn, ov, db: fs.getFirestore(a), funkce: fn.getFunctions(a, REGION) };
        return s.fb;
      })
      .catch((e) => { s.fbSlib = null; throw e; });
  }
  return s.fbSlib;
}

/** Při startu: obnoví přihlášení a začne odebírat kopie. Slib se splní po prvních kopiích, nejpozději do 4 s. */
export function spust() {
  if (!zapnuty()) return Promise.resolve();
  if (!s.pripraveno) {
    const kopie = nactiFirebase()
      .then((fb) => fb.ov.authStateReady().then(() => fb))
      .then((fb) => { s.uzivatel = fb.ov.currentUser; oznam(s.naStav); return s.uzivatel ? odebirej(fb) : null; })
      .catch((e) => { s.chyba = e; oznam(s.naStav); });
    s.pripraveno = Promise.race([kopie, new Promise((hotovo) => setTimeout(hotovo, CEKAT_NA_KOPIE))]);
  }
  return s.pripraveno;
}

function odebirej(fb) {
  if (s.odber) return null;
  s.prvni = true;
  return new Promise((hotovo) => {
    s.odber = fb.fs.onSnapshot(fb.fs.collection(fb.db, 'uzivatele', s.uzivatel.uid, 'data'), (snimek) => {
      const zmenene = [];
      snimek.docChanges().forEach((z) => {
        const id = z.doc.id;
        if (id === '_stav') { s.server = z.type === 'removed' ? null : z.doc.data(); return; }
        if (z.type === 'removed') delete s.kopie[id];
        else { s.kopie[id] = z.doc.data(); zmenene.push(id); }
      });
      s.chyba = null;
      if (s.prvni) {
        // první kopie si čtení při startu vezmou samy (čekají na ně) – jen případně požádat server o čerstvější
        s.prvni = false;
        hotovo();
        obnovStare();
      } else {
        const k = zmenene.filter(pouzitelna);
        if (k.length) oznam(s.naKopie, k);
      }
      oznam(s.naStav);
    }, (chyba) => { s.chyba = chyba; s.odber = null; hotovo(); oznam(s.naStav); });
  });
}

// ---------------------------------------------------------------- kopie pro čtení

function platnost() { return uloziste.cti(PLATNOST) || { zmena: 0, primo: {} }; }
function potvrzeno(id) { return (s.server && s.server.potvrzeno && s.server.potvrzeno[id]) || 0; }

function pouzitelna(id) {
  const kdy = potvrzeno(id), p = platnost();
  // po změně musí obnova začít až po ní (s rezervou na hodiny); po přímém čtení stačí novější kopie
  return !!(s.kopie[id] && kdy && Date.now() - kdy < (MAX_STARI_ID[id] || MAX_STARI) && kdy > (p.zmena || 0) + REZERVA && kdy > ((p.primo || {})[id] || 0));
}

/** Která kopie odpovídá čtení (nebo null). Kalendář: měsíc mřížky = 7 dní po jejím začátku (pondělí před 1. dnem). */
function idKopie(akce, data) {
  const navic = Object.keys(data).filter((k) => k !== 'znovu' && data[k] != null);
  if (Z_KOPIE.indexOf(akce) >= 0) return navic.length ? null : akce;
  if (akce === 'kalendar' && typeof data.od === 'number') {
    const d = new Date(data.od + 7 * 864e5);
    return 'kalendar_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  return null;
}

/** Data z kopie ze serveru pro čtení akce, nebo undefined (→ motor). Při startu počká na první kopie (nejvýš 4 s). */
export async function kopie(akce, data) {
  if (!zapnuty()) return undefined;
  await spust();
  const d = data || {};
  const id = idKopie(akce, d);
  if (!id || !pouzitelna(id)) return undefined;
  const k = s.kopie[id];
  if (akce === 'kalendar' && !(k.parametry && k.parametry.od === d.od && k.parametry.do === d.do)) return undefined;
  let vysledek;
  try { vysledek = JSON.parse(k.json); } catch (e) { return undefined; }
  // čas vytvoření = kdy server naposledy ověřil, že kopie platí (beze změny obsahu se dokument nepřepisuje)
  if (vysledek && typeof vysledek === 'object' && typeof vysledek.ted === 'number') vysledek.ted = Math.max(vysledek.ted, potvrzeno(id));
  return vysledek;
}

/** Čtení jde přímo na motor: starší kopie téhož se už nepoužije (ukázala by starší data, než aplikace má). */
export function primeCteni(akce, data) {
  if (!zapnuty()) return;
  const id = idKopie(akce, data || {});
  if (!id) return;
  const p = platnost();
  p.primo = Object.assign({}, p.primo, { [id]: Date.now() });
  uloziste.pis(PLATNOST, p);
}

/** Změna z aplikace (před odesláním i po odpovědi motoru): kopie z doby před ní neplatí; server je za chvíli obnoví. */
export function poZmene() {
  if (!zapnuty()) return;
  uloziste.pis(PLATNOST, Object.assign(platnost(), { zmena: Date.now() }));
  clearTimeout(s.casovac);
  s.casovac = setTimeout(() => obnovNaServeru(true), OBNOVA_PO_ZMENE);
}

/** Požádá server o čerstvé kopie (funkce obnovHned); výsledek přijde živě přes odběr. */
export function obnovNaServeru(vzdy) {
  if (!zapnuty() || !s.uzivatel) return Promise.resolve();
  if (s.obnovuje) return s.obnovuje;
  if (!vzdy && Date.now() - s.naposledyObnova < 60e3) return Promise.resolve();
  s.naposledyObnova = Date.now();
  s.obnovuje = nactiFirebase()
    .then((fb) => fb.fn.httpsCallable(fb.funkce, 'obnovHned', { timeout: 120000 })({ vse: !!vzdy })) // vse: i fotbal, nastavení, reely
    .then((r) => { s.chyba = null; return (r && r.data) || {}; })
    .catch((e) => { s.chyba = e; return null; })
    .finally(() => { s.obnovuje = null; oznam(s.naStav); });
  oznam(s.naStav);
  return s.obnovuje;
}

/** Otevření / návrat do aplikace: jsou-li kopie starší než 4 minuty, požádat server o nové. */
export function obnovStare() {
  if (!zapnuty() || !s.uzivatel || s.prvni) return;
  if (Date.now() - ((s.server && s.server.kdy) || 0) > OBNOVIT_PO) obnovNaServeru(false);
}

// ---------------------------------------------------------------- přihlášení

function chybaPrihlaseni(e) {
  const kod = String((e && e.code) || '');
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|invalid-login|missing-password/.test(kod)) return 'E-mail nebo heslo nesedí.';
  if (/too-many-requests/.test(kod)) return 'Moc pokusů – Firebase přihlašování na chvíli zablokoval. Zkus to za pár minut.';
  if (/network-request-failed/.test(kod)) return 'Firebase není dostupný (síť).';
  if (/user-disabled/.test(kod)) return 'Účet je vypnutý.';
  return 'Přihlášení se nepovedlo (' + (kod || (e && e.message) || 'neznámá chyba') + ').';
}

/** Přihlášení účtem; vrací připojení k motoru uložené v účtu (nebo null). Chyby česky. */
export async function prihlas(email, heslo) {
  let fb;
  try { fb = await nactiFirebase(); } catch (e) { throw new Error('Firebase se nenačetl – zkontroluj připojení k internetu.'); }
  try {
    s.uzivatel = (await fb.auth.signInWithEmailAndPassword(fb.ov, String(email || '').trim(), String(heslo || ''))).user;
  } catch (e) {
    throw new Error(chybaPrihlaseni(e));
  }
  uloziste.pis(UCET, { email: s.uzivatel.email || String(email).trim() });
  const doc = await fb.fs.getDoc(fb.fs.doc(fb.db, 'uzivatele', s.uzivatel.uid));
  const p = doc.exists() ? doc.data().pripojeni : null;
  s.pripraveno = null;
  spust();
  oznam(s.naStav);
  return p && p.url && p.klic ? { url: p.url, klic: p.klic } : null;
}

/** Uloží adresu motoru a klíč do účtu (odtud je bere server a nová zařízení). */
export async function ulozPripojeni(p) {
  if (!s.uzivatel || !p || !p.url || !p.klic) return false;
  const fb = await nactiFirebase();
  await fb.fs.setDoc(fb.fs.doc(fb.db, 'uzivatele', s.uzivatel.uid), { pripojeni: { url: p.url, klic: p.klic }, upraveno: Date.now() }, { merge: true });
  // hned první kopie (obnova spuštěná při přihlášení mohla doběhnout dřív, než bylo připojení v účtu)
  (s.obnovuje || Promise.resolve()).then(() => obnovNaServeru(true));
  return true;
}

/** Odhlásí účet v tomhle zařízení (připojení k motoru zůstává, jen bez kopií ze serveru). */
export async function odhlas() {
  if (s.odber) { s.odber(); s.odber = null; }
  clearTimeout(s.casovac);
  uloziste.smaz(UCET);
  uloziste.smaz(PLATNOST);
  Object.assign(s, { kopie: {}, server: null, pripraveno: null, prvni: true, chyba: null });
  if (s.fb && s.uzivatel) await s.fb.auth.signOut(s.fb.ov).catch(() => { /* odhlášení v zařízení stačí */ });
  s.uzivatel = null;
  oznam(s.naStav);
}
