// Reely → Plán, Zápasy, Nápady – čisté funkce bez DOM (test testy/test_reely_plan.mjs).
// Zimní plán Instagramu (díly po vlnách), seznam zápasů s auditem „co je na Instagramu“ a zásobník nápadů na jednom místě.
//
// Data na Disku CLAUDE_SCHRANKA/REELY (motor je čte akcí `reelyPlan`):
//   plan.json         – píše jen Claude: { nazev, editor: { pc, mobil }, vlny: [{ id, nazev }], dily: [díl], napady: [{ id, nazev, popis }] }
//                       díl = { id, nazev, popis, vlna, termin: 'RRRR-MM-DD' | null, cas, format: reel | karusel | pribeh, tym?, zapasy?: [id],
//                               klipu?, reel?: id reelu (i budoucí), skupina?: skupina v editoru drah, poznamka? }
//   zapasy_audit.json – píše jen Claude: { zapasy: { <id zápasu>: { veo, ig, stav: na_ig | chybi | bez_zaznamu | nedavat, poznamka? } }, mimo: [zápas] }
//   vyroba.json       – píše jen domácí PC (export_reely.py): { dily: { <id reelu | skupina>: { datum?, klipu, drahRucne, deska, popisek, reel } } }
//   plan_moje.json    – píše jen motor: Michalovy změny { dily: { <id>: { termin?, cas?, poznamka?, drahyHotove?, hotovo?, zruseno?, pozadano? } },
//                       vlastni: [díl], napady: [nápad], kdy }
//
// JÁDRO (od „JÁDRO“ po „KONEC JÁDRA“) má motor doslova stejné jako PLAN_DILU_ v apps-script/Kod.gs – změna tady = i tam.
// Ukázka (js/ukazka.js) ho používá jako napodobený motor.

// ---------------------------------------------------------------- JÁDRO
export const STAVY = ['plan', 'nachystano', 'drahy', 'reel', 'naplanovano', 'vyveseno'];
export const FORMATY = ['reel', 'karusel', 'pribeh'];
export const TYMY = ['A', 'B', 'dorost', 'zaci'];
const STAVY_ZAPASU = ['na_ig', 'chybi', 'bez_zaznamu', 'nedavat'];
const AKTIVNI_IG = ['ceka', 'nahrava', 'zverejnuji', 'chyba']; // položka REELY_PLAN, která ještě nevyšla
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const CAS = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[a-z0-9][a-z0-9_-]{0,59}$/i;
const REEL = /^reel_[0-9a-z_-]{1,80}$/i;
export const MAX_VLASTNICH = 100;
export const MAX_NAPADU = 100;
const FLAGY = ['drahyHotove', 'hotovo', 'zruseno'];

function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : null; }
function ma(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function radek(s, max) { return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function odstavce(s, max) { return typeof s === 'string' ? s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : ''; }
export function platneDatum(s) {
  if (typeof s !== 'string' || !DATUM.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function pridejDny(s, n) {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Jeden díl (z plan.json i vlastní) vyčištěný, nebo null. */
function cistyDil(o, vlny) {
  o = obj(o) || {};
  const id = radek(o.id, 60);
  const nazev = radek(o.nazev, 80);
  if (!ID.test(id) || !nazev) return null;
  const d = { id: id, nazev: nazev, popis: odstavce(o.popis, 600), vlna: vlny[o.vlna] ? o.vlna : '',
    termin: platneDatum(o.termin) ? o.termin : null, cas: CAS.test(String(o.cas || '')) ? o.cas : '17:00',
    format: FORMATY.indexOf(o.format) >= 0 ? o.format : 'reel' };
  if (TYMY.indexOf(o.tym) >= 0) d.tym = o.tym;
  const zapasy = (Array.isArray(o.zapasy) ? o.zapasy : []).map(function (x) { return radek(x, 80); }).filter(Boolean).slice(0, 20);
  if (zapasy.length) d.zapasy = zapasy;
  if (typeof o.klipu === 'number' && o.klipu >= 0 && o.klipu <= 99) d.klipu = Math.round(o.klipu);
  if (REEL.test(String(o.reel || ''))) d.reel = o.reel;
  if (radek(o.skupina, 60)) d.skupina = radek(o.skupina, 60);
  if (radek(o.napad, 60)) d.napad = radek(o.napad, 60);
  if (odstavce(o.poznamka, 600)) d.poznamka = odstavce(o.poznamka, 600);
  return d;
}

function cistyNapad(o) {
  o = obj(o) || {};
  const id = radek(o.id, 60), nazev = radek(o.nazev, 80);
  return ID.test(id) && nazev ? { id: id, nazev: nazev, popis: odstavce(o.popis, 600) } : null;
}

function bezDuplicit(seznam) {
  const videno = {};
  return seznam.filter(function (x) { if (!x || videno[x.id]) return false; videno[x.id] = true; return true; });
}

/** plan.json → { nazev, aktualizovano, editor, vlny, dily, napady } (neplatné položky vynechá). */
export function plan(x) {
  x = obj(x) || {};
  const vlny = bezDuplicit((Array.isArray(x.vlny) ? x.vlny : []).map(function (v) {
    v = obj(v) || {};
    return ID.test(radek(v.id, 60)) && radek(v.nazev, 80) ? { id: radek(v.id, 60), nazev: radek(v.nazev, 80) } : null;
  }));
  const znameVlny = {};
  vlny.forEach(function (v) { znameVlny[v.id] = true; });
  const e = obj(x.editor) || {};
  const adresa = function (s) { return /^https?:\/\/[^\s"'<>]+$/.test(String(s || '')) ? String(s) : ''; };
  return {
    nazev: radek(x.nazev, 80) || 'Plán', aktualizovano: radek(x.aktualizovano, 40),
    editor: { pc: adresa(e.pc), mobil: adresa(e.mobil) }, vlny: vlny,
    dily: bezDuplicit((Array.isArray(x.dily) ? x.dily : []).map(function (d) { return cistyDil(d, znameVlny); })),
    napady: bezDuplicit((Array.isArray(x.napady) ? x.napady : []).map(cistyNapad))
  };
}

/** Michalovy změny jednoho dílu – jen platné hodnoty. */
function cistaZmena(u) {
  u = obj(u) || {};
  const r = {};
  if (ma(u, 'termin') && (u.termin === null || platneDatum(u.termin))) r.termin = u.termin;
  if (CAS.test(String(u.cas || ''))) r.cas = u.cas;
  if (odstavce(u.poznamka, 600)) r.poznamka = odstavce(u.poznamka, 600);
  FLAGY.forEach(function (k) { if (u[k] === true) r[k] = true; });
  if (typeof u.pozadano === 'number' && u.pozadano > 0) r.pozadano = u.pozadano;
  return r;
}

/** plan_moje.json → { dily: { id: změny }, vlastni: [díl se změnami], napady, kdy }. */
export function moje(x, p) {
  x = obj(x) || {};
  const znameVlny = {};
  ((p && p.vlny) || []).forEach(function (v) { znameVlny[v.id] = true; });
  const dily = {};
  const dx = obj(x.dily) || {};
  Object.keys(dx).forEach(function (id) { if (ID.test(id)) { const c = cistaZmena(dx[id]); if (Object.keys(c).length) dily[id] = c; } });
  // vlastní díl nese i Michalovu poznámku (poznamka) a příznaky přímo v sobě
  const vlastni = bezDuplicit((Array.isArray(x.vlastni) ? x.vlastni : []).map(function (o) {
    const d = cistyDil(o, znameVlny);
    return d ? Object.assign(d, cistaZmena(o)) : null;
  })).slice(0, MAX_VLASTNICH);
  return { dily: dily, vlastni: vlastni, napady: bezDuplicit((Array.isArray(x.napady) ? x.napady : []).map(cistyNapad)).slice(0, MAX_NAPADU),
    kdy: radek(x.kdy, 40) };
}

/** Díly plánu s Michalovými změnami + vlastní díly; nápady bez těch, které už jsou v plánu. */
export function spoj(p, m) {
  const dily = p.dily.map(function (d) {
    const u = m.dily[d.id] || {};
    const r = Object.assign({}, d);
    if (ma(u, 'termin')) { r.terminPlan = d.termin; r.termin = u.termin; }
    if (u.cas) r.cas = u.cas;
    if (u.poznamka) r.poznamkaMoje = u.poznamka;
    FLAGY.forEach(function (k) { if (u[k]) r[k] = true; });
    if (u.pozadano) r.pozadano = u.pozadano;
    return r;
  }).concat(m.vlastni.map(function (d) {
    const r = Object.assign({}, d, { vlastni: true });
    if (r.poznamka) { r.poznamkaMoje = r.poznamka; delete r.poznamka; }
    return r;
  }));
  const vPlanu = {};
  dily.forEach(function (d) { if (d.napad && !d.zruseno) vPlanu[d.napad] = true; });
  const napady = p.napady.map(function (n) { return Object.assign({}, n); })
    .concat(m.napady.map(function (n) { return Object.assign({}, n, { vlastni: true }); }))
    .filter(function (n) { return !vPlanu[n.id]; });
  return { dily: dily, napady: napady };
}

/** Výroba dílu z vyroba.json: skupina editoru má přednost (klipy, dráhy), deska / popisek / reel podle id reelu.
 *  Záznam reelu jiného data (stejný soupeř loni) se nebere – datumy = data zápasů dílu. */
export function vyrobaDilu(d, vyroba, datumy) {
  const v = obj(vyroba) || {};
  const sk = d.skupina ? obj(v[d.skupina]) : null;
  let r = d.reel ? obj(v[d.reel]) : null;
  if (r && r.datum && datumy && datumy.length && datumy.indexOf(r.datum) < 0) r = null;
  const z = sk || r;
  if (!z) return null;
  const cislo = function (n) { return typeof n === 'number' && n > 0 ? Math.round(n) : 0; };
  return { klipu: cislo(z.klipu), drahRucne: Math.min(cislo(z.drahRucne), cislo(z.klipu)), deska: !!(r && r.deska),
    popisek: !!(r && r.popisek), reel: !!(r && r.reel) };
}

/**
 * Stav dílu (od nejdál): vyveseno (reel je zveřejněný / ruční hotovo / všechny zápasy dílu už na IG) → naplanovano (aktivní
 * položka REELY_PLAN) → reel (reel s videem v reely.json) → drahy (všechny klipy mají ruční dráhu, nebo Michal zaškrtl) →
 * nachystano (klipy / deska / popisek z PC) → plan.
 * ctx = { reely: { id: { video } }, zverejneno: REELY_STAV, planIg: REELY_PLAN, audit: { id zápasu: { ig } }, vyroba, datumy: { id zápasu: datum } }
 */
export function stavDilu(d, ctx) {
  ctx = ctx || {};
  const datumy = (d.zapasy || []).map(function (id) { return (ctx.datumy || {})[id]; }).filter(Boolean);
  const v = vyrobaDilu(d, ctx.vyroba, datumy);
  const pl = d.reel ? obj((ctx.planIg || {})[d.reel]) : null;
  const audit = ctx.audit || {};
  const zverejneno = d.reel ? (ctx.zverejneno || {})[d.reel] : '';
  const naIgZapasy = (d.zapasy || []).length > 0 && d.zapasy.every(function (id) { return audit[id] && audit[id].ig; });
  const r = { stav: 'plan', vyroba: v };
  if (d.hotovo || zverejneno || (pl && pl.stav === 'hotovo' && !pl.jenPribeh) || naIgZapasy) {
    r.stav = 'vyveseno';
    r.naIg = zverejneno || (naIgZapasy ? d.zapasy.map(function (id) { return audit[id].ig; }).sort().pop() : '');
  } else if (pl && AKTIVNI_IG.indexOf(pl.stav) >= 0 && !pl.jenPribeh) {
    r.stav = 'naplanovano';
    r.planKdy = pl.kdy || null;
    if (pl.stav === 'chyba') r.chybaIg = true;
  } else if (d.reel && obj((ctx.reely || {})[d.reel]) && ctx.reely[d.reel].video) r.stav = 'reel';
  else if (d.drahyHotove || (v && v.klipu > 0 && v.drahRucne >= v.klipu)) r.stav = 'drahy';
  else if (v && (v.klipu > 0 || v.deska || v.popisek)) r.stav = 'nachystano';
  return r;
}

/** Klíče, které Michal smí změnit; u vlastního dílu i jeho obsah. */
const ZMENY_VSUDE = ['termin', 'cas', 'poznamka', 'drahyHotove', 'hotovo', 'zruseno'];
const ZMENY_VLASTNI = ['nazev', 'popis', 'vlna', 'format', 'tym'];

function zkontrolujZmenu(k, v, vlny) {
  if (k === 'termin') { if (v !== null && !platneDatum(v)) throw new Error('Termín musí být datum RRRR-MM-DD.'); return v; }
  if (k === 'cas') { if (v !== null && !CAS.test(String(v))) throw new Error('Čas musí být HH:MM.'); return v; }
  if (k === 'poznamka' || k === 'popis') { if (v !== null && typeof v !== 'string') throw new Error('Text musí být text.'); return v === null ? null : odstavce(v, 600); }
  if (FLAGY.indexOf(k) >= 0) { if (typeof v !== 'boolean' && v !== null) throw new Error('Musí být ano, nebo ne.'); return v === true; }
  if (k === 'nazev') { if (!radek(v, 80)) throw new Error('Díl musí mít název.'); return radek(v, 80); }
  if (k === 'vlna') { if (v && !vlny[v]) throw new Error('Neznámá vlna.'); return v || ''; }
  if (k === 'format') { if (FORMATY.indexOf(v) < 0) throw new Error('Neznámý formát.'); return v; }
  if (k === 'tym') { if (v && TYMY.indexOf(v) < 0) throw new Error('Neznámý tým.'); return v || null; }
  throw new Error('Neznámá změna: ' + k);
}

/**
 * Akce reelyPlanUlozit nad vyčištěnými daty → nové „moje“ (obsah plan_moje.json bez kdy):
 *   { dil: { id, zmeny: { termin?, cas?, poznamka?, drahyHotove?, hotovo?, zruseno?, (u vlastního i nazev, popis, vlna, format, tym) } } }
 *     null = vrátit podle plánu (u vlastního dílu termin null = bez termínu); co se shoduje s plánem, se neukládá
 *   { novy: { nazev, popis?, termin?, cas?, vlna?, format?, tym?, napad? } }   vlastní díl (i z nápadu – nápad pak zmizí ze zásobníku)
 *   { napad: { nazev, popis? } | { id, smazat: true } }                        vlastní nápad
 *   { posun: { ids?: [id] | vlna?: id, dni } }                                  posun termínů; díly naplánované, vyvěšené a zrušené zůstanou
 *   { pozadano: id }                                                             (motor) Michal klepl „Udělej reel“
 * ted = ms (id nového dílu / nápadu), stavy = { id dílu: stav } (pro posun).
 */
export function zmen(p, m, d, ted, stavy) {
  d = obj(d) || {};
  const r = JSON.parse(JSON.stringify({ dily: m.dily, vlastni: m.vlastni, napady: m.napady }));
  const vlny = {};
  p.vlny.forEach(function (v) { vlny[v.id] = true; });
  const zPlanu = function (id) { return p.dily.filter(function (x) { return x.id === id; })[0] || null; };
  const vlastni = function (id) { return r.vlastni.filter(function (x) { return x.id === id; })[0] || null; };
  const noveId = function (pred) {
    let id = pred + Math.floor(ted || 0).toString(36);
    for (let i = 2; zPlanu(id) || vlastni(id) || r.napady.some(function (n) { return n.id === id; }) || p.napady.some(function (n) { return n.id === id; }); i++) {
      id = pred + Math.floor(ted || 0).toString(36) + '-' + i;
    }
    return id;
  };
  /** Změna jednoho dílu (plánový → přepis v dily, vlastní → přímo). */
  const zmenJeden = function (id, zmeny) {
    const pd = zPlanu(id), vd = vlastni(id);
    if (!pd && !vd) throw new Error('Díl v plánu není – obnov stránku.');
    Object.keys(zmeny).forEach(function (k) {
      if (ZMENY_VSUDE.indexOf(k) < 0 && !(vd && ZMENY_VLASTNI.indexOf(k) >= 0)) throw new Error('Tohle se u dílu z plánu měnit nedá: ' + k);
      const v = zkontrolujZmenu(k, zmeny[k], vlny);
      if (vd) {
        if (v === null || v === false || v === '') { if (k === 'termin') vd.termin = null; else if (k !== 'nazev') delete vd[k]; }
        else vd[k] = v;
        if (k === 'cas' && !vd.cas) vd.cas = '17:00';
        return;
      }
      const u = r.dily[id] || {};
      const vychozi = k === 'termin' ? pd.termin : k === 'cas' ? pd.cas : undefined;
      if (v === null || v === false || v === '' || (vychozi !== undefined && v === vychozi)) delete u[k]; else u[k] = v;
      if (Object.keys(u).length) r.dily[id] = u; else delete r.dily[id];
    });
  };
  const n = ['dil', 'novy', 'napad', 'posun', 'pozadano'].filter(function (k) { return d[k] != null; });
  if (n.length !== 1) throw new Error('Není co uložit.');
  if (d.dil) {
    const x = obj(d.dil) || {};
    const zmeny = obj(x.zmeny);
    if (!zmeny || !Object.keys(zmeny).length) throw new Error('Není co uložit.');
    zmenJeden(String(x.id || ''), zmeny);
  } else if (d.novy) {
    const x = obj(d.novy) || {};
    if (r.vlastni.length >= MAX_VLASTNICH) throw new Error('Vlastních dílů je moc (' + MAX_VLASTNICH + ') – nějaké smaž.');
    const novy = { id: noveId('m-'), nazev: zkontrolujZmenu('nazev', x.nazev, vlny), popis: x.popis == null ? '' : zkontrolujZmenu('popis', x.popis, vlny),
      vlna: zkontrolujZmenu('vlna', x.vlna || '', vlny), termin: x.termin == null ? null : zkontrolujZmenu('termin', x.termin, vlny),
      cas: x.cas == null ? '17:00' : zkontrolujZmenu('cas', x.cas, vlny), format: x.format == null ? 'reel' : zkontrolujZmenu('format', x.format, vlny) };
    if (x.tym) novy.tym = zkontrolujZmenu('tym', x.tym, vlny);
    if (x.napad) {
      const na = p.napady.concat(r.napady).filter(function (o) { return o.id === x.napad; })[0];
      if (!na) throw new Error('Nápad už v zásobníku není – obnov stránku.');
      novy.napad = na.id;
      if (!novy.popis) novy.popis = na.popis;
    }
    r.vlastni.push(novy);
  } else if (d.napad) {
    const x = obj(d.napad) || {};
    if (x.smazat === true) {
      const pred = r.napady.length;
      r.napady = r.napady.filter(function (o) { return o.id !== x.id; });
      if (r.napady.length === pred) throw new Error('Smazat jde jen vlastní nápad.');
    } else {
      if (r.napady.length >= MAX_NAPADU) throw new Error('Nápadů je moc (' + MAX_NAPADU + ').');
      r.napady.push({ id: noveId('n-'), nazev: zkontrolujZmenu('nazev', x.nazev, vlny), popis: x.popis == null ? '' : zkontrolujZmenu('popis', x.popis, vlny) });
    }
  } else if (d.posun) {
    const x = obj(d.posun) || {};
    const dni = Number(x.dni);
    if (!isFinite(dni) || Math.round(dni) !== dni || dni === 0 || Math.abs(dni) > 120) throw new Error('Posun musí být celý počet dní (nejvýš 120).');
    const ids = Array.isArray(x.ids) ? x.ids.map(String) : null;
    if (!ids && !(x.vlna && vlny[x.vlna])) throw new Error('Vyber díly nebo vlnu.');
    const spojene = spoj(p, { dily: r.dily, vlastni: r.vlastni, napady: r.napady }).dily;
    let posunuto = 0;
    spojene.forEach(function (sd) {
      if (ids ? ids.indexOf(sd.id) < 0 : sd.vlna !== x.vlna) return;
      const st = (stavy || {})[sd.id];
      if (!sd.termin || sd.zruseno || st === 'naplanovano' || st === 'vyveseno') return;
      zmenJeden(sd.id, { termin: pridejDny(sd.termin, dni) });
      posunuto++;
    });
    if (!posunuto) throw new Error('Žádný díl s termínem k posunu.');
  } else {
    const id = String(d.pozadano);
    if (!zPlanu(id) && !vlastni(id)) throw new Error('Díl v plánu není – obnov stránku.');
    if (vlastni(id)) vlastni(id).pozadano = ted; else r.dily[id] = Object.assign(r.dily[id] || {}, { pozadano: ted });
  }
  return r;
}

/** Krátký název klubu („FK Agro Vnorovy“ → „Vnorovy“) – jako exportér reelů. */
export function kratkyKlub(n) {
  let s = String(n || '').replace(/["„“”]/g, '').trim().replace(/,?\s*z\.\s*s\.?$/i, '');
  for (let i = 0; i < 3; i++) s = s.replace(/^(FK|TJ|SK|FC|SFK|MFK|AFC|FKM|SC|1\.\s*FC|Sokol|Agro|Slavoj|Spartak|Baník|Slovan)\s+/i, '');
  return s || String(n || '');
}

/**
 * Odpověď akce reelyPlan: { nazev, aktualizovano, editor, vlny, dily (se stavem), napady, zapasy, mimo, bilance }.
 * zdroje = { plan, moje, audit, vyroba, fotbal, reely: [{ id, video, zapasy }], zverejneno, planIg }
 */
export function vystup(z) {
  const p = z.plan, m = z.moje;
  const audit = obj(z.audit) || {};
  const auditZ = obj(audit.zapasy) || {};
  const mimo = (Array.isArray(audit.mimo) ? audit.mimo : []).filter(function (x) { return x && ID.test(String(x.id || '')); });
  const fotbal = (obj(z.fotbal) && Array.isArray(z.fotbal.zapasy)) ? z.fotbal : { zapasy: [], detaily: {} };
  const reely = {};
  (z.reely || []).forEach(function (r) { if (r && r.id) reely[r.id] = r; });
  const datumy = {}, ig = {};
  fotbal.zapasy.forEach(function (x) { datumy[x.id] = String(x.zacatek || '').slice(0, 10); });
  mimo.forEach(function (x) { datumy[x.id] = x.datum; });
  Object.keys(auditZ).forEach(function (id) { ig[id] = { ig: auditZ[id] && auditZ[id].ig }; });
  mimo.forEach(function (x) { ig[x.id] = { ig: x.ig }; });
  const ctx = { reely: reely, zverejneno: obj(z.zverejneno) || {}, planIg: obj(z.planIg) || {}, audit: ig,
    vyroba: obj(obj(z.vyroba) && z.vyroba.dily) || {}, datumy: datumy };
  const s = spoj(p, m);
  const dily = s.dily.map(function (d) { return Object.assign(d, stavDilu(d, ctx)); });
  const dilyZapasu = {};
  dily.forEach(function (d) { (d.zapasy || []).forEach(function (id) { (dilyZapasu[id] = dilyZapasu[id] || []).push(d.id); }); });
  // reel k zápasu: podle id, jinak podle data a týmu (motor posílá zápasy reelů bez id)
  const reelZapasu = {};
  (z.reely || []).forEach(function (r) {
    (r.zapasy || []).forEach(function (x) {
      const k = x && (x.id || (x.datum && x.tym ? x.datum + '|' + x.tym : ''));
      if (k && !reelZapasu[k]) reelZapasu[k] = r.id;
    });
  });
  const zAuditu = function (id) {
    const a = obj(auditZ[id]) || {};
    return { veo: a.veo || null, ig: platneDatum(a.ig) ? a.ig : null, stavIg: STAVY_ZAPASU.indexOf(a.stav) >= 0 ? a.stav : 'neznamy',
      poznamka: radek(a.poznamka, 300) };
  };
  const zapasy = fotbal.zapasy.map(function (x) {
    const det = obj((fotbal.detaily || {})[x.id]) || {};
    const strana = x.doma ? 'domaci' : 'hoste';
    const strelci = (Array.isArray(det.goly) ? det.goly : []).filter(function (g) { return g && g.strana === strana; })
      .map(function (g) { return { min: g.min, hrac: radek(g.hrac, 60), pozn: radek(g.pozn, 30) }; });
    return Object.assign({ id: x.id, tym: x.tym, datum: datumy[x.id], domaci: kratkyKlub(x.domaci), hoste: kratkyKlub(x.hoste), doma: !!x.doma,
      skore: x.vysledek || '', strelci: strelci, dily: dilyZapasu[x.id] || [], reel: reelZapasu[x.id] || reelZapasu[datumy[x.id] + '|' + x.tym] || null }, zAuditu(x.id));
  });
  const mimoV = mimo.map(function (x) {
    return { id: x.id, tym: x.tym, tymNazev: radek(x.tymNazev, 40), datum: x.datum, domaci: radek(x.domaci, 60), hoste: radek(x.hoste, 60),
      doma: true, skore: radek(x.skore, 10), strelci: [], dily: dilyZapasu[x.id] || [], reel: null, veo: x.veo || null,
      ig: platneDatum(x.ig) ? x.ig : null, stavIg: STAVY_ZAPASU.indexOf(x.stav) >= 0 ? x.stav : 'neznamy', poznamka: radek(x.poznamka, 300) };
  });
  return { nazev: p.nazev, aktualizovano: p.aktualizovano, editor: p.editor, vlny: p.vlny, dily: dily, napady: s.napady,
    zapasy: zapasy, mimo: mimoV, bilance: bilance(zapasy), kdy: m.kdy };
}

/** Bilance zápasů (bez „mimo“): zapasu, natoceno (vše kromě bez záznamu), naIg, chybi, bezZaznamu, nedavat. */
export function bilance(zapasy) {
  const b = { zapasu: zapasy.length, natoceno: 0, naIg: 0, chybi: 0, bezZaznamu: 0, nedavat: 0 };
  zapasy.forEach(function (x) {
    if (x.stavIg === 'na_ig') b.naIg++;
    else if (x.stavIg === 'chybi') b.chybi++;
    else if (x.stavIg === 'bez_zaznamu') b.bezZaznamu++;
    else if (x.stavIg === 'nedavat') b.nedavat++;
    if (x.stavIg !== 'bez_zaznamu' && x.stavIg !== 'neznamy') b.natoceno++;
  });
  return b;
}
// ---------------------------------------------------------------- KONEC JÁDRA

// ---------------------------------------------------------------- jen aplikace
export const NAZVY_STAVU = { plan: 'V plánu', nachystano: 'Nachystáno', drahy: 'Dráhy hotové', reel: 'Reel hotový',
  naplanovano: 'Naplánováno', vyveseno: 'Vyvěšeno' };
export const NAZVY_TYMU = { A: 'Áčko', B: 'Benfika', dorost: 'Dorost', zaci: 'Žáci' };
export const NAZVY_IG = { na_ig: 'Na IG', chybi: 'Chybí', bez_zaznamu: 'Bez záznamu', nedavat: 'Nedávat', neznamy: '?' };
export const NAZVY_FORMATU = { reel: 'Reel', karusel: 'Karusel', pribeh: 'Příběh' };
const DNY = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];

/** „Ne 22. 11.“ (rok jen mimo letošek a příští rok… u zimního plánu ne), bez data „bez termínu“. */
export function denADatum(s, ted) {
  if (!platneDatum(s)) return 'bez termínu';
  const d = new Date(s + 'T12:00:00Z');
  const rok = new Date(ted || Date.now()).getFullYear();
  const r = d.getUTCFullYear();
  return DNY[d.getUTCDay()] + ' ' + d.getUTCDate() + '. ' + (d.getUTCMonth() + 1) + '.' + (r < rok || r > rok + 1 ? ' ' + r : '');
}

/** Díly podle termínu (bez termínu na konec, pak podle pořadí v plánu), zrušené pryč (pokud volby.zrusene). */
export function serad(dily) {
  return dily.map(function (d, i) { return [d, i]; }).sort(function (a, b) {
    const x = a[0].termin || '9999', y = b[0].termin || '9999';
    return x < y ? -1 : x > y ? 1 : (a[0].cas || '') < (b[0].cas || '') ? -1 : (a[0].cas || '') > (b[0].cas || '') ? 1 : a[1] - b[1];
  }).map(function (x) { return x[0]; });
}

/** Filtr: { stav: 'vse' | stav | 'aktivni' (vše kromě vyvěšených), tym: 'vse' | tým, vlna: 'vse' | id, zrusene: bool }. */
export function filtruj(dily, f) {
  f = f || {};
  return dily.filter(function (d) {
    if (d.zruseno && !f.zrusene) return false;
    if (f.stav === 'aktivni' && d.stav === 'vyveseno') return false;
    if (f.stav && f.stav !== 'vse' && f.stav !== 'aktivni' && d.stav !== f.stav) return false;
    if (f.tym && f.tym !== 'vse' && d.tym !== f.tym) return false;
    if (f.vlna && f.vlna !== 'vse' && d.vlna !== f.vlna) return false;
    return true;
  });
}

/** Sloupce Plánu na široké obrazovce: [{ stav, nazev, dily }] v pořadí STAVY, díly podle termínu, bez zrušených. */
export function sloupce(dily) {
  const zive = serad(filtruj(dily, {}));
  return STAVY.map(function (s) { return { stav: s, nazev: NAZVY_STAVU[s], dily: zive.filter(function (d) { return d.stav === s; }) }; });
}

/** „dráhy 2/3“ – null, když díl klipy nemá. */
export function drahyText(d) {
  const v = d.vyroba;
  if (v && v.klipu) return 'dráhy ' + v.drahRucne + '/' + v.klipu;
  return d.klipu ? d.klipu + ' klipů' : null;
}

/** Co jde s dílem udělat podle stavu (klíče tlačítek; první = hlavní). Editor jen s adresou editoru. */
export function akce(d, maEditor) {
  const a = [];
  const reel = d.format === 'reel' && d.reel;
  if (d.stav === 'nachystano' || d.stav === 'plan') { if (maEditor && (d.vyroba || d.skupina)) a.push('editor'); if (reel && d.stav === 'nachystano') a.push('drahyHotove'); }
  if (d.stav === 'drahy') { if (reel) a.push(d.pozadano ? 'cekaNaReel' : 'udelatReel'); if (maEditor) a.push('editor'); }
  if (d.stav === 'reel') a.push('naplanovat', 'otevritReel');
  if (d.stav === 'naplanovano') a.push('otevritReel');
  if (d.stav !== 'vyveseno' && !reel) a.push('hotovo');
  if (d.stav !== 'vyveseno' && d.stav !== 'naplanovano') a.push('posun');
  a.push('poznamka');
  return a;
}

/** Zápasy do sloupců podle týmu: Áčko · Dorost · Benfika (podle data), „mimo“ (žáci) jako poslední skupina. */
export function zapasySloupce(zapasy, mimo) {
  const r = ['A', 'dorost', 'B'].map(function (t) {
    return { tym: t, nazev: NAZVY_TYMU[t], zapasy: zapasy.filter(function (z) { return z.tym === t; })
      .sort(function (a, b) { return a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0; }) };
  });
  if (mimo && mimo.length) r.push({ tym: 'mimo', nazev: 'Mimo soutěže', zapasy: mimo.slice() });
  return r;
}

/** Štítek zápasu: „Na IG 13. 9.“ / „Chybí“ / „Bez záznamu“ / „Nedávat“. */
export function stitekZapasu(z) {
  if (z.stavIg === 'na_ig' && z.ig) { const d = new Date(z.ig + 'T12:00:00Z'); return 'Na IG ' + d.getUTCDate() + '. ' + (d.getUTCMonth() + 1) + '.'; }
  return NAZVY_IG[z.stavIg] || '?';
}

/** Střelci krátce: „Gazárek 2×, Janoušek“ – příjmení (první slovo „Příjmení Jméno“ z fotbal.cz), v pořadí gólů. */
export function strelciText(strelci) {
  const poradi = [], pocet = {};
  (strelci || []).forEach(function (g) {
    const j = String(g.hrac || '').split(' ')[0] || '?';
    if (!pocet[j]) poradi.push(j);
    pocet[j] = (pocet[j] || 0) + 1;
  });
  return poradi.map(function (j) { return pocet[j] > 1 ? j + ' ' + pocet[j] + '×' : j; }).join(', ');
}

/** Adresa editoru drah: na PC místní, na telefonu adresa v síti (editor běží jen na domácím PC). S dílem rovnou jeho záložka
 *  v editoru: ?skupina=<skupina dílu>, jinak ?tyden=<datum zápasu> (editor z toho vezme pondělí). */
export function editorOdkaz(editor, naPc, dil, datum) {
  if (!editor) return '';
  const zaklad = (naPc ? editor.pc || editor.mobil : editor.mobil || editor.pc) || '';
  if (!zaklad || !dil) return zaklad;
  const par = dil.skupina ? 'skupina=' + encodeURIComponent(dil.skupina) : platneDatum(datum) ? 'tyden=' + datum : '';
  return par ? zaklad + (zaklad.indexOf('?') < 0 ? '?' : '&') + par : zaklad;
}
