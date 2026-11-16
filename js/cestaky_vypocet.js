// Cesťáky – čisté výpočty bez DOM (test testy/test_cestaky.mjs). Logika převzatá z webu dorostu (assets/js/cestaky.js – zapas(), vybrane()).
// Auto: km × 2 (tam a zpět) × počet aut × sazba; zápas busem se do aut nepočítá, platí jen zapsaná cena busu.
// Stejná pravidla úprav (meze, „neukládat, co se shoduje s výchozím“) má motor v CESTAKY_ (apps-script/Kod.gs) – změna tady = i tam.
//
// data = odpověď motoru `cestaky`: { obdobi: [{ id, nazev, kratce? }], tymy: [{ id, nazev, kratce? }], vychozi: { sazba, auta, pohary },
//   nastaveni: { sazba, auta, pohary } (výchozí přepsané uloženými), upravy: { <id zápasu>: { bus?, auta?, km?, busKc? } },
//   zapasy: [{ id, tym, obdobi, datum, souper, hriste, km, bus?, pohar? }] }

export const KLICE_NASTAVENI = ['sazba', 'auta', 'pohary'];
export const KLICE_ZAPASU = ['bus', 'auta', 'km', 'busKc'];

/** Výsledné hodnoty zápasu po úpravě: { ...z, bus, auta, km, busKc, autaKm, castka, upraveno }. */
export function zapasSUpravou(z, uprava, nastaveni) {
  const u = uprava || {};
  const n = nastaveni || {};
  const bus = u.bus != null ? u.bus : !!z.bus;
  const auta = u.auta != null ? u.auta : (n.auta || 0);
  const km = u.km != null ? u.km : z.km;
  const busKc = u.busKc != null ? u.busKc : 0;
  const autaKm = bus ? 0 : km * 2 * auta;
  const castka = bus ? busKc : autaKm * (n.sazba || 0);
  return Object.assign({}, z, { bus, auta, km, busKc, autaKm, castka, upraveno: !!uprava && Object.keys(uprava).length > 0 });
}

/** Zápasy podle týmu ('vse' | id týmu) a nastavení pohárů, s úpravami. */
export function vybrane(data, volby) {
  const tym = (volby && volby.tym) || 'vse';
  const n = (data && data.nastaveni) || {};
  const u = (data && data.upravy) || {};
  return ((data && data.zapasy) || [])
    .filter((z) => n.pohary || !z.pohar)
    .filter((z) => tym === 'vse' || z.tym === tym)
    .map((z) => zapasSUpravou(z, u[z.id], n));
}

const suma = (a) => a.reduce((s, z) => s + z.castka, 0);

/**
 * Dlaždice (celkem, pocet, km, busem), tabulka týmy × období a zápasy po obdobích (tým v pořadí tymy, pak datum).
 * Tabulka: { obdobi: [{ id, nazev, kratce }], radky: [{ id, nazev, obdobi: [Kč], celkem }], celkem: { obdobi, celkem } | null (jen u víc týmů) }.
 */
export function souhrn(data, volby) {
  const tym = (volby && volby.tym) || 'vse';
  const zv = vybrane(data, { tym });
  const vsechnyTymy = (data && data.tymy) || [];
  const tymy = vsechnyTymy.filter((t) => tym === 'vse' || t.id === tym);
  const obdobi = (data && data.obdobi) || [];
  const poradi = (id) => { const i = vsechnyTymy.findIndex((t) => t.id === id); return i < 0 ? 99 : i; };
  return {
    celkem: suma(zv),
    pocet: zv.length,
    km: zv.reduce((s, z) => s + z.autaKm, 0),
    busem: zv.filter((z) => z.bus).length,
    tabulka: {
      obdobi: obdobi.map((o) => ({ id: o.id, nazev: o.nazev, kratce: o.kratce || o.nazev })),
      radky: tymy.map((t) => {
        const zt = zv.filter((z) => z.tym === t.id);
        return { id: t.id, nazev: t.nazev, obdobi: obdobi.map((o) => suma(zt.filter((z) => z.obdobi === o.id))), celkem: suma(zt) };
      }),
      celkem: tymy.length > 1 ? { obdobi: obdobi.map((o) => suma(zv.filter((z) => z.obdobi === o.id))), celkem: suma(zv) } : null
    },
    obdobi: obdobi.map((o) => {
      const zo = zv.filter((z) => z.obdobi === o.id).sort((a, b) => poradi(a.tym) - poradi(b.tym) || String(a.datum).localeCompare(String(b.datum)));
      return { id: o.id, nazev: o.nazev, kratce: o.kratce || o.nazev, zapasy: zo, castka: suma(zo) };
    }).filter((o) => o.zapasy.length)
  };
}

// ---------------------------------------------------------------- úpravy (stejně jako CESTAKY_ v motoru)

/** Platná hodnota nastavení nebo úpravy zápasu, jinak chyba s českou hláškou. */
export function zkontroluj(k, v) {
  if (k === 'bus' || k === 'pohary') {
    if (typeof v !== 'boolean') throw new Error(k === 'bus' ? 'Bus musí být ano, nebo ne.' : 'Poháry musí být ano, nebo ne.');
    return v;
  }
  const x = typeof v === 'number' ? v : Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
  const mimo = (a, b) => !(typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) || !isFinite(x) || x < a || x > b;
  if (k === 'sazba') { if (mimo(0, 50)) throw new Error('Sazba musí být 0–50 Kč/km.'); return Math.round(x * 100) / 100; }
  if (k === 'auta') { if (mimo(0, 20) || Math.round(x) !== x) throw new Error('Počet aut musí být celé číslo 0–20.'); return x; }
  if (k === 'km') { if (mimo(0, 2000)) throw new Error('Km musí být 0–2000.'); return Math.round(x); }
  if (k === 'busKc') { if (mimo(0, 200000)) throw new Error('Cena busu musí být 0–200 000 Kč.'); return Math.round(x); }
  throw new Error('Neznámá hodnota: ' + k);
}

/** Úprava zápasu bez toho, co se shoduje s výchozím stavem (bus jako v zápase, auta = výchozí počet, km jako v zápase, cena busu 0); prázdná = null. */
export function cistaUprava(z, u, nastaveni) {
  const o = {};
  if (u && typeof u.bus === 'boolean' && u.bus !== !!z.bus) o.bus = u.bus;
  if (u && typeof u.auta === 'number' && u.auta !== (nastaveni || {}).auta) o.auta = u.auta;
  if (u && typeof u.km === 'number' && u.km !== z.km) o.km = u.km;
  if (u && typeof u.busKc === 'number' && u.busKc) o.busKc = u.busKc;
  return Object.keys(o).length ? o : null;
}

/**
 * Změna jako akce motoru cestakyUlozit { nastaveni?: { sazba?, auta?, pohary? }, zapas?: { id, zmeny: { bus?, auta?, km?, busKc? } }, vratitVse? }
 * (null = zrušit tu úpravu) nad daty z motoru → nové { nastaveni, upravy }. Aplikace tak změnu ukáže hned, motor ji pak uloží stejně.
 * Změna výchozího počtu aut zruší úpravy zápasů, které měly ručně právě nový výchozí počet (jako na webu dorostu).
 */
export function pouzij(data, p) {
  const vych = data.vychozi || {};
  const nast = Object.assign({}, p.vratitVse ? vych : data.nastaveni);
  const upravy = p.vratitVse ? {} : JSON.parse(JSON.stringify(data.upravy || {}));
  if (p.nastaveni) {
    KLICE_NASTAVENI.forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(p.nastaveni, k)) return;
      nast[k] = p.nastaveni[k] === null ? vych[k] : zkontroluj(k, p.nastaveni[k]);
    });
    if (Object.prototype.hasOwnProperty.call(p.nastaveni, 'auta')) {
      Object.keys(upravy).forEach((id) => {
        if (upravy[id].auta !== nast.auta) return;
        delete upravy[id].auta;
        if (!Object.keys(upravy[id]).length) delete upravy[id];
      });
    }
  }
  if (p.zapas) {
    const id = String(p.zapas.id || '');
    const z = (data.zapasy || []).find((x) => x.id === id);
    if (!z) throw new Error('Zápas v Cesťácích není – obnov stránku.');
    const u = Object.assign({}, upravy[id]);
    const zmeny = p.zapas.zmeny || {};
    KLICE_ZAPASU.forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(zmeny, k)) return;
      if (zmeny[k] === null) delete u[k]; else u[k] = zkontroluj(k, zmeny[k]);
    });
    const c = cistaUprava(z, u, nast);
    if (c) upravy[id] = c; else delete upravy[id];
  }
  return { nastaveni: nast, upravy };
}

// ---------------------------------------------------------------- formát

export const kc = (n) => Math.round(n || 0).toLocaleString('cs-CZ') + ' Kč';
export const cislo = (n) => Math.round(n || 0).toLocaleString('cs-CZ');
/** „2025-08-17“ → „17. 8.“ (rok je v nadpisu období), s rokem „17. 8. 2025“. */
export function den(iso, sRokem) {
  const [y, m, d] = String(iso || '').split('-');
  return d ? +d + '. ' + +m + '.' + (sRokem ? ' ' + y : '') : '';
}
