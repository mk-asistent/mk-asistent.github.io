// Spojení s motorem (Apps Script). Adresa a klíč jsou jen v tomhle zařízení (localStorage na vlastní adrese aplikace).
// Volání je „jednoduchý“ POST s text/plain – prohlížeč nedělá předběžný dotaz CORS a Apps Script ho umí obsloužit.

import { uloziste } from './pomocne.js';
import { ukazkaVolej } from './ukazka.js';

const KLIC = 'asistent.pripojeni';

export function pripojeni() { return uloziste.cti(KLIC); }
export function jePripojeno() { const p = pripojeni(); return !!(p && (p.demo || (p.url && p.klic))); }
export function jeDemo() { const p = pripojeni(); return !!(p && p.demo); }
export function ulozPripojeni(p) { uloziste.pis(KLIC, p); }
export function zapomenPripojeni() { uloziste.smaz(KLIC); }

export class ChybaApi extends Error {
  constructor(zprava, kod) {
    super(zprava);
    this.kod = kod || '';
  }
}

// Rychlá čtení, která se při startu sejdou najednou, jdou v jednom požadavku (akce motoru „davka“): Apps Script
// víc souběžných dotazů řadí do fronty – deset naráz znamenalo i půl minuty čekání (měřeno 5. 10.). Pošta, schránka
// a kalendář jdou zvlášť (jsou pomalejší a Dnes je potřebuje hned), zápisy vždy zvlášť.
const V_DAVCE = ['info', 'pocasi', 'zdravi', 'fotbal', 'reely', 'dochazka', 'stitky', 'kontakty'];
let fronta = null;

function umiDavku() {
  const info = uloziste.cti('asistent.info');
  return !!(info && Array.isArray(info.akce) && info.akce.indexOf('davka') >= 0);
}

async function odesliDavku() {
  const polozky = fronta;
  fronta = null;
  if (polozky.length === 1) {
    const x = polozky[0];
    volejPrimo(x.akce, x.data).then(x.ok, x.chyba);
    return;
  }
  try {
    const vysledky = await volejPrimo('davka', { polozky: polozky.map((x) => Object.assign({}, x.data, { akce: x.akce })) });
    polozky.forEach((x, i) => {
      const v = vysledky && vysledky[i];
      if (v && v.ok) x.ok(v.data); else x.chyba(new ChybaApi((v && v.chyba) || 'Motor neodpověděl.', 'motor'));
    });
  } catch (e) {
    polozky.forEach((x) => x.chyba(e));
  }
}

/** Zavolá akci motoru; vrací data, nebo vyhodí ChybaApi se srozumitelnou zprávou. */
export async function volej(akce, data, jinePripojeni) {
  const p = jinePripojeni || pripojeni();
  if (!p) throw new ChybaApi('Aplikace není připojená k motoru.', 'nepripojeno');
  if (p.demo) return ukazkaVolej(akce, data || {});
  if (!jinePripojeni && V_DAVCE.indexOf(akce) >= 0 && umiDavku()) {
    return new Promise((ok, chyba) => {
      if (!fronta) { fronta = []; setTimeout(odesliDavku, 0); }
      fronta.push({ akce, data: data || {}, ok, chyba });
    });
  }
  return volejPrimo(akce, data, p);
}

async function volejPrimo(akce, data, jinePripojeni) {
  const p = jinePripojeni || pripojeni();
  if (!p) throw new ChybaApi('Aplikace není připojená k motoru.', 'nepripojeno');
  const ovladac = new AbortController();
  const casovac = setTimeout(() => ovladac.abort(), 45000);
  let odpoved;
  try {
    odpoved = await fetch(p.url, {
      method: 'POST',
      body: JSON.stringify(Object.assign({}, data, { akce, klic: p.klic })),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      credentials: 'omit',
      redirect: 'follow',
      signal: ovladac.signal
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new ChybaApi('Motor dlouho neodpovídá – zkus to za chvíli.', 'sit');
    throw new ChybaApi(navigator.onLine === false ? 'Jsi offline – ukazuju uložená data.' : 'Motor není dostupný (síť nebo adresa).', 'sit');
  } finally {
    clearTimeout(casovac);
  }
  let json = null;
  try { json = await odpoved.json(); } catch (e) { /* níž */ }
  if (!json) {
    throw new ChybaApi('Motor neodpověděl daty – zkontroluj adresu a nasazení s přístupem „Kdokoli“.', 'format');
  }
  // Schránka pro Clauda (skript pro diktování z iPhonu) odpovídá {ok: 'ano'|'ne'} – to není motor aplikace
  if (json.ok === 'ano' || json.ok === 'ne') {
    throw new ChybaApi('Tahle adresa patří Schránce pro Clauda (diktování z iPhonu), ne motoru. Vlož adresu projektu „Asistent“.', 'jinySkript');
  }
  if (json.ok !== true) {
    if (json.chyba === 'klic') throw new ChybaApi('Klíč nesedí – zkontroluj ho v Nastavení.', 'klic');
    throw new ChybaApi(json.chyba || 'Neznámá chyba motoru.', 'motor');
  }
  return json.data;
}
