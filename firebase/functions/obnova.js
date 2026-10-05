// Obnova dat Asistenta na serveru (Firebase): zeptá se motoru v Apps Scriptu na poštu, schránku, kalendář a rychlá
// čtení a vrátí je k uložení do Firestore. Aplikace je pak má hned po otevření (a živě); na motor čeká jen u akcí
// (odeslat, archivovat…) a u kopií, které nejsou aktuální. Čisté funkce – testuje je test.js bez sítě i Firebase.
//
// Nečte se: zdraví (zdravotní data zůstávají jen na Disku – Michalovo pravidlo) a počasí (motor ho počítá podle
// polohy telefonu a dotaz bez polohy by mu ji smazal = „poloha vypnutá“). Obojí si aplikace bere z motoru jako dřív.

const crypto = require('crypto');

// rychlá čtení v jedné dávce (motor víc souběžných dotazů řadí do fronty)
const DAVKA = ['info', 'schranka', 'fotbal', 'reely', 'zmeny'];
// co se přes den mění málo: obnoví se jen po svém intervalu (minuty); po změně z aplikace (obnovHned s vse) vždy
const INTERVALY_MIN = { info: 60, fotbal: 60, reely: 30 };

/** Co se z dávky tentokrát přeskočí: pomalé věci, dokud je jejich kopie mladší než interval (vse = nic). */
function coPreskocit(potvrzeno, ted, vse) {
  if (vse || !potvrzeno) return [];
  return Object.keys(INTERVALY_MIN).filter((id) => potvrzeno[id] && ted - potvrzeno[id] < INTERVALY_MIN[id] * 60e3 - 90e3);
}
const ADRESA_MOTORU = /^https:\/\/script\.google\.com\/macros\/(u\/\d+\/)?s\/[\w-]+\/exec$/;

/** Server volá jen motor v Apps Scriptu (nic jiného) a jen s klíčem, který vypadá jako klíč. */
function platnePripojeni(p) {
  return !!(p && typeof p.url === 'string' && ADRESA_MOTORU.test(p.url) && typeof p.klic === 'string' && p.klic.length >= 32 && p.klic.length <= 200);
}

// Google odpověď na POST občas ztratí: místo výsledku přijde úvod motoru (doGet) nebo 404 na googleusercontent.com.
// Server jen čte, takže pokus znovu nic nezdvojí.
const UVOD_MOTORU = 'Asistent – motor běží.';

/** Zavolá akci motoru (POST jako aplikace, přesměrování na odpověď sleduje fetch); ztracenou odpověď zkusí ještě 2×. */
async function volejMotor(pripojeni, akce, data, fetchFn, cekat) {
  const pauzy = cekat || [1500, 4000];
  for (let pokus = 0; ; pokus++) {
    try {
      return await jedenPokus(pripojeni, akce, data, fetchFn);
    } catch (e) {
      if (!e.ztracena || pokus >= pauzy.length) throw e;
      await new Promise((hotovo) => setTimeout(hotovo, pauzy[pokus]));
    }
  }
}

async function jedenPokus(pripojeni, akce, data, fetchFn) {
  const odpoved = await (fetchFn || fetch)(pripojeni.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({}, data, { akce, klic: pripojeni.klic })),
    redirect: 'follow',
    signal: AbortSignal.timeout(90000)
  });
  const text = await odpoved.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* níž */ }
  if (!json) {
    const chyba = new Error('Motor neodpověděl daty (HTTP ' + odpoved.status + ').');
    chyba.ztracena = text.trim() === UVOD_MOTORU || (odpoved.status === 404 && /googleusercontent\.com/.test(odpoved.url || ''));
    throw chyba;
  }
  if (json.ok !== true) throw new Error(json.chyba === 'klic' ? 'Klíč motoru nesedí.' : (json.chyba || 'Chyba motoru.'));
  return json.data;
}

/** Půlnoc daného dne v Praze → ms (letní čas i zimní). */
function pulnocPraha(rok, mesic, den) {
  const posun = (t) => {
    const casti = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Prague', hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t));
    const g = (typ) => Number(casti.find((x) => x.type === typ).value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - t;
  };
  const utc = Date.UTC(rok, mesic, den);
  return utc - posun(utc - posun(utc));
}

/** Mřížka měsíce jako v aplikaci (kalendar.js mrizkaMesice): 6 týdnů od pondělí před 1. dnem, čas Praha. */
function mrizkaMesice(ted, posunMesicu) {
  const dnes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit' }).format(new Date(ted)); // „2026-10“
  const d = new Date(Date.UTC(Number(dnes.slice(0, 4)), Number(dnes.slice(5, 7)) - 1 + posunMesicu, 1));
  const rok = d.getUTCFullYear(), mesic = d.getUTCMonth();
  const prvni = 1 - ((d.getUTCDay() + 6) % 7);
  return { klic: rok + '-' + String(mesic + 1).padStart(2, '0'), od: pulnocPraha(rok, mesic, prvni), do: pulnocPraha(rok, mesic, prvni + 42) };
}

/** Otisk obsahu bez času vytvoření (ted) – když se nezměnil, dokument se nepřepisuje (aplikace nestahuje znovu). */
function otisk(data) {
  const bezCasu = data && typeof data === 'object' && !Array.isArray(data) && 'ted' in data ? Object.assign({}, data, { ted: 0 }) : data;
  return crypto.createHash('sha1').update(JSON.stringify(bezCasu) || '').digest('hex');
}

/**
 * Jedna obnova: dávka rychlých čtení, pošta a kalendář na tento a příští měsíc – tři dotazy souběžně.
 * Vrací { kdy, data: { id: { data, parametry } }, chyby: [text] }; chyba jedné části nezastaví ostatní.
 */
async function obnov(pripojeni, moznosti) {
  const o = moznosti || {};
  const ted = o.ted || Date.now();
  const data = {}, chyby = [];
  const mesice = [0, 1].map((n) => mrizkaMesice(ted, n));
  const zDavky = (polozky, idy, parametry) => volejMotor(pripojeni, 'davka', { polozky }, o.fetch, o.cekat).then((vysledky) => {
    idy.forEach((id, i) => {
      const v = vysledky && vysledky[i];
      if (v && v.ok) data[id] = { data: v.data, parametry: parametry ? parametry[i] : null };
      else chyby.push(id + ': ' + ((v && v.chyba) || 'bez odpovědi'));
    });
  });
  const davka = DAVKA.filter((a) => (o.preskocit || []).indexOf(a) < 0);
  const casti = [
    ['dávka', zDavky(davka.map((akce) => ({ akce })), davka)],
    ['posta', volejMotor(pripojeni, 'posta', {}, o.fetch, o.cekat).then((d) => { data.posta = { data: d, parametry: null }; })],
    ['kalendář', zDavky(mesice.map((m) => ({ akce: 'kalendar', od: m.od, do: m.do })), mesice.map((m) => 'kalendar_' + m.klic),
      mesice.map((m) => ({ od: m.od, do: m.do })))]
  ];
  const vysledky = await Promise.allSettled(casti.map((c) => c[1]));
  vysledky.forEach((v, i) => { if (v.status === 'rejected') chyby.push(casti[i][0] + ': ' + String((v.reason && v.reason.message) || v.reason)); });
  return { kdy: ted, data, chyby };
}

module.exports = { volejMotor, pulnocPraha, mrizkaMesice, obnov, otisk, platnePripojeni, DAVKA, INTERVALY_MIN, coPreskocit };
