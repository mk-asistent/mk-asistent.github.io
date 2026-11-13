// Krevní testy a další laboratorní výsledky – zašifrované Michalovým heslem. Soubor CLAUDE_SCHRANKA/ZDRAVI/KREV.json píše jen
// Claude nástrojem NASTROJE\asistent\zdravi_sifra (PBKDF2-SHA256 + AES-256-GCM); motor obálku jen pošle dál se Zdravím,
// rozšifruje ji až tohle zařízení. Zařízení si pamatuje klíč (ne heslo) v IndexedDB jako neexportovatelný CryptoKey –
// Zamknout nebo odhlášení ho smaže. Obsah: { odbery: [{ datum, duvod, laborator, shrnuti, ukoly: [], skupiny: [{ nazev,
// polozky: [{ n, h (číslo) | t (text), j, min, max, mimo, dobre, pozn }] }] }] } – nejnovější odběr první.

import { esc } from './pomocne.js';
import { IKONY } from './ikony.js';
import { hlavickaKarty, okno, toast } from './ui.js';

const DB = 'asistent-krev';
let odemceno = null;   // { sul, iv, obsah }
let pameti = null;     // { sul, klic } – i když IndexedDB nejde (soukromé okno), do zavření aplikace
let zkouseno = '';     // iv obálky, pro kterou se už zkoušel uložený klíč

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function platnaObalka(o) {
  return !!(o && o.v === 1 && typeof o.sul === 'string' && typeof o.iv === 'string' && typeof o.data === 'string' &&
    Number.isInteger(o.iter) && o.iter >= 100000 && o.iter <= 5000000);
}

export async function klicZHesla(heslo, o) {
  const zaklad = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(heslo).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(o.sul), iterations: o.iter, hash: 'SHA-256' }, zaklad,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
}

/** Obálka + klíč → obsah; špatný klíč nebo poškozená data → výjimka. */
export async function rozsifruj(o, klic) {
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(o.iv) }, klic, b64(o.data));
  return JSON.parse(new TextDecoder().decode(data));
}

// ---------------------------------------------------------------- klíč v zařízení

function db() {
  return new Promise((hotovo, chyba) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('klic');
    r.onsuccess = () => hotovo(r.result);
    r.onerror = () => chyba(r.error);
  });
}
async function ulozKlic(z) {
  pameti = z;
  try {
    const d = await db();
    await new Promise((hotovo, chyba) => { const t = d.transaction('klic', 'readwrite'); t.objectStore('klic').put(z, 'k'); t.oncomplete = hotovo; t.onerror = () => chyba(t.error); });
    d.close();
  } catch (e) { /* jen do zavření aplikace */ }
}
async function nactiKlic() {
  if (pameti) return pameti;
  try {
    const d = await db();
    const z = await new Promise((hotovo) => { const r = d.transaction('klic').objectStore('klic').get('k'); r.onsuccess = () => hotovo(r.result || null); r.onerror = () => hotovo(null); });
    d.close();
    return z;
  } catch (e) { return null; }
}
/** Zamknout / odhlášení: klíč pryč ze zařízení. */
export async function vymaz() {
  odemceno = null; pameti = null; zkouseno = '';
  try { const d = await db(); d.transaction('klic', 'readwrite').objectStore('klic').delete('k'); d.close(); } catch (e) { /* nic */ }
}

/** Odemčený obsah k téhle obálce (nebo null) – nová obálka se stejnou solí (Claude doplnil odběr) se odemkne uloženým klíčem. */
export function obsah(o) { return odemceno && o && odemceno.sul === o.sul && odemceno.iv === o.iv ? odemceno.obsah : null; }

/** Uložený klíč se zkusí jednou na obálku. true = odemklo se, překreslit. */
export async function zkusUlozeny(o) {
  if (!platnaObalka(o) || obsah(o) || zkouseno === o.iv) return false;
  zkouseno = o.iv;
  const z = await nactiKlic();
  if (!z || z.sul !== o.sul) return false;
  try { odemceno = { sul: o.sul, iv: o.iv, obsah: await rozsifruj(o, z.klic) }; return true; } catch (e) { return false; }
}

/** Klepnutí v kartě: odemknout (okno s heslem) / zamknout. true = změna, překreslit. */
export async function klik(co, o) {
  if (co === 'zamknout') { await vymaz(); toast('Zamčeno – klíč je z tohoto zařízení pryč'); return true; }
  if (co !== 'odemknout' || !platnaObalka(o)) return false;
  for (let pokus = 0; pokus < 3; pokus++) {
    const heslo = await okno({ ikona: IKONY.kapka, nadpis: pokus ? 'Heslo nesedí – zkus znovu' : 'Odemknout výsledky',
      text: 'Heslo ke zdravotním údajům. Zařízení si pak pamatuje klíč (ne heslo), dokud nedáš Zamknout.',
      pole: { popisek: 'Heslo', typ: 'password' }, ano: 'Odemknout' });
    if (!heslo) return false;
    try {
      const klic = await klicZHesla(heslo, o);
      odemceno = { sul: o.sul, iv: o.iv, obsah: await rozsifruj(o, klic) };
      zkouseno = o.iv;
      await ulozKlic({ sul: o.sul, klic });
      return true;
    } catch (e) { /* další pokus */ }
  }
  toast('Heslo nesedí', true);
  return false;
}

// ---------------------------------------------------------------- vykreslení (čisté – test testy/test_krev.mjs)

const cislo = (x) => String(x).replace('.', ',');
const datumCz = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? Number(m[3]) + '. ' + Number(m[2]) + '. ' + m[1] : esc(iso || ''); };
const jeCislo = (x) => typeof x === 'number' && isFinite(x);

/** ↑ / ↓ podle normy, ! = text mimo normu (1+, 3+), jinak '' */
export function smer(p) {
  if (jeCislo(p.h)) {
    if (jeCislo(p.max) && p.h > p.max) return '↑';
    if (jeCislo(p.min) && p.h < p.min) return '↓';
  }
  return p.mimo ? '!' : '';
}

function norma(p) {
  if (jeCislo(p.min) && jeCislo(p.max)) return 'norma ' + (p.min === p.max ? cislo(p.min) : cislo(p.min) + '–' + cislo(p.max));
  if (jeCislo(p.max)) return 'norma do ' + cislo(p.max);
  return p.norma ? 'norma ' + esc(p.norma) : '';
}

/** pruh: podbarvený rozsah normy, tečka = hodnota (osa ± čtvrtina rozsahu, vždy včetně hodnoty) */
function pas(p) {
  if (!jeCislo(p.h) || !jeCislo(p.min) || !jeCislo(p.max) || p.max <= p.min) return '';
  const r = p.max - p.min;
  const od = Math.min(p.min - r / 4, p.h), sir = Math.max(p.max + r / 4, p.h) - od;
  const x = (v) => Math.max(2, Math.min(98, (v - od) / sir * 100));
  return '<div class="krev-pas" aria-hidden="true"><i style="left:' + x(p.min).toFixed(1) + '%;width:' + (x(p.max) - x(p.min)).toFixed(1) + '%"></i>' +
    '<b style="left:' + x(p.h).toFixed(1) + '%"></b></div>';
}

function radek(p, driv) {
  const s = smer(p);
  const hodnota = jeCislo(p.h) ? cislo(p.h) : esc(p.t || '');
  const pod = [norma(p), driv != null ? 'minule ' + esc(cislo(driv)) : ''].filter(Boolean).join(' · ');
  return '<li class="krev-r' + (s ? ' krev-r--mimo' : p.dobre ? ' krev-r--dobre' : '') + '"><div class="krev-r__hlava"><span>' + esc(p.n) + '</span>' +
    '<span class="krev-r__h cisla">' + hodnota + (p.j ? ' <small>' + esc(p.j) + '</small>' : '') + (s ? ' <b class="krev-sipka">' + s + '</b>' : '') + '</span></div>' +
    pas(p) + (pod ? '<div class="krev-r__pod">' + pod + '</div>' : '') + (p.pozn ? '<p class="krev-r__pozn">' + esc(p.pozn) + '</p>' : '') + '</li>';
}

/** Karta: zamčená (tlačítko Odemknout), nebo nejnovější odběr – shrnutí, co udělat, mimo normu, dobré, vše po skupinách.
 *  text = formátování Claudova textu (zdravi.js textTydne: odstavce, odrážky, **tučně**). */
export function kartaKrveHtml(o, text) {
  if (!platnaObalka(o)) return '';
  return vysledkyHtml(obsah(o), text) || hlavickaKarty(IKONY.kapka, 'Krevní testy', '<span class="tag tag--seda">🔒 zamčeno</span>') +
    '<div class="dlazdice__telo krev-zamceno"><p>Výsledky jsou zašifrované tvým heslem – Google ani motor je nepřečtou.</p>' +
    '<button type="button" class="btn btn--primary" data-krev="odemknout">Odemknout</button></div>';
}

/** Rozšifrovaný obsah → karta s nejnovějším odběrem ('' = nic k ukázání). */
export function vysledkyHtml(ob, text) {
  const odbery = ob && Array.isArray(ob.odbery) ? ob.odbery : [];
  if (!odbery.length) return '';
  const o1 = odbery[0], minuly = odbery[1];
  const driv = {};
  if (minuly) (minuly.skupiny || []).forEach((sk) => (sk.polozky || []).forEach((p) => { if (jeCislo(p.h)) driv[sk.nazev + '|' + p.n] = p.h; }));
  const vse = [];
  (o1.skupiny || []).forEach((sk) => (sk.polozky || []).forEach((p) => vse.push({ sk, p })));
  const mimo = vse.filter((x) => smer(x.p));
  const dobre = vse.filter((x) => !smer(x.p) && x.p.dobre);
  const seznam = (xs) => '<ul class="krev-seznam">' + xs.map((x) => radek(x.p, driv[x.sk.nazev + '|' + x.p.n])).join('') + '</ul>';
  let h = hlavickaKarty(IKONY.kapka, 'Krevní testy · ' + datumCz(o1.datum), '<button type="button" class="btn btn--ghost krev-zamknout" data-krev="zamknout">Zamknout</button>') +
    '<div class="dlazdice__telo"><p class="krev-meta">' + [o1.duvod, o1.laborator ? 'laboratoř ' + o1.laborator : '', vse.length + ' hodnot, ' + mimo.length + ' mimo normu']
      .filter(Boolean).map(esc).join(' · ') + '</p>';
  if (o1.shrnuti) h += '<div class="tyden-claude krev-shrnuti">' + text(o1.shrnuti) + '</div>';
  if (Array.isArray(o1.ukoly) && o1.ukoly.length) h += '<h3 class="krev-nadpis">Co udělat</h3><ol class="krev-ukoly">' + o1.ukoly.map((u) => '<li>' + esc(u) + '</li>').join('') + '</ol>';
  if (mimo.length) h += '<h3 class="krev-nadpis">Mimo normu</h3>' + seznam(mimo);
  if (dobre.length) h += '<h3 class="krev-nadpis">Dobré zprávy</h3>' + seznam(dobre);
  h += '<h3 class="krev-nadpis">Všechny hodnoty</h3>' + (o1.skupiny || []).map((sk) => '<details class="krev-skupina"><summary>' + esc(sk.nazev) +
    ' <span class="muted">· ' + (sk.polozky || []).length + '</span></summary>' + seznam((sk.polozky || []).map((p) => ({ sk, p }))) + '</details>').join('');
  if (odbery.length > 1) h += '<p class="krev-meta">Předchozí odběry: ' + odbery.slice(1).map((x) => datumCz(x.datum)).join(', ') + '</p>';
  return h + '<p class="krev-meta">🔒 Rozšifrováno jen v tomto zařízení.</p></div>';
}
