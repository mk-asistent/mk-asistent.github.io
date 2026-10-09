// Reely: hotové reely z fotbalu (domácí PC → Disk → motor). U každého popisek s tlačítkem Kopírovat (vložit do Instagramu),
// video na Disku Google (otevře ho aplikace Disk nebo prohlížeč – jen Michalův účet, nic veřejného) a stav „je na Instagramu“.
// Popisek se tu jen kopíruje – jediná pravda je soubor popisky\*.txt na PC. Na Dnes limetková karta „Reel k vyvěšení“.
// S propojeným Instagramem (IG_TOKEN v motoru) jde reel naplánovat: motor ho v daný čas zveřejní sám (spouštěč každých 10 min).

import { stav, zmeneno, umiMotor, hooky } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, dm, DNY_KR, rozdilDni, zacatekTydne, pridejDny, terminDatum, isoDatum, tvar, kdyKratce } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, toastAkce, kostra, chybaHtml, segment, potvrd } from './ui.js';
import { otevriPanel, zavriPanel, obnovPanel, elementPanelu } from './panely.js';

const ULOZISTE = 'asistent.data.reely';
const FILTR = 'asistent.reely.filtr';
const CERSTVY_DNI = 7; // na Dnes jen reel ze zápasu za poslední týden
let filtr = uloziste.cti(FILTR) || 'vse';

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.reely = v.data;
}

export function nactiReely(znovu) {
  if (!umiMotor('reely') || stav.nacita.reely) return Promise.resolve();
  stav.nacita.reely = true;
  stav.chyby.reely = null;
  return volej('reely', znovu ? { znovu: true } : {})
    .then((data) => { stav.reely = data; uloziste.pis(ULOZISTE, { data, kdy: Date.now() }); })
    .catch((e) => { stav.chyby.reely = e; })
    .then(() => { stav.nacita.reely = false; zmeneno(); });
}

export function dotahni() {
  if (umiMotor('reely') && !stav.reely && !stav.nacita.reely && !stav.chyby.reely) nactiReely();
}

function seznam() { return (stav.reely && stav.reely.reely) || []; }
function zverejneno(r) { return !!(stav.reely && stav.reely.zverejneno && stav.reely.zverejneno[r.id]); }
function plan(r) { return (stav.reely && stav.reely.plan && stav.reely.plan[r.id]) || null; }
const naplanovano = (r) => { const p = plan(r); return !!(p && ['ceka', 'nahrava', 'zverejnuji'].indexOf(p.stav) >= 0); };
const instagram = () => (stav.reely && stav.reely.instagram) || { nastaveno: false };
/** Popisek, který půjde na Instagram: upravený v aplikaci (jen pro ten příspěvek), jinak ten z PC. */
const popisekReelu = (r) => (stav.reely && stav.reely.popiskyPlanu && stav.reely.popiskyPlanu[r.id]) || r.popisek;
// u dorostu označit i účet dorostu (Michal 5. 10.); co Michal u týmu napíše jinak, si aplikace zapamatuje
const VYCHOZI_OZNACENI = { dorost: '@dorost_agro' };
let rp = null; // rozpracovaný plán (okno Naplánovat na Instagram)
const kdyPlan = (t) => DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + ' ' + new Date(t).getHours() + ':' + String(new Date(t).getMinutes()).padStart(2, '0');
const datumReelu = (r) => terminDatum(r.datum) || Date.parse(r.vyrobeno) || 0;
const najdi = (id) => seznam().find((r) => r.id === id);

/** Nezveřejněné reely ze zápasů za poslední týden (nejnovější první) – Dnes a odznak v panelu. */
export function kVyveseni() {
  return seznam().filter((r) => !zverejneno(r) && !naplanovano(r) && (r.popisek || r.video) && rozdilDni(datumReelu(r)) >= -CERSTVY_DNI);
}

export function podnadpis() {
  if (!stav.reely) return stav.chyby.reely ? 'Reely se nenačetly' : 'Načítám…';
  const n = seznam().length, k = seznam().filter((r) => !zverejneno(r)).length;
  return n ? n + ' ' + tvar(n, 'reel', 'reely', 'reelů') + (k ? ' · ' + k + ' ' + tvar(k, 'čeká', 'čekají', 'čeká') + ' na Instagram' : ' · všechny zveřejněné') +
    (stav.reely.aktualizovano ? ' · z PC ' + esc(kdyKratce(Date.parse(stav.reely.aktualizovano))) : '') : 'Hotové reely z domácího PC';
}

function delka(s) { s = Math.round(s || 0); return s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : ''; }

function nazevTymu(klic) {
  const t = ((stav.fotbal && stav.fotbal.data && stav.fotbal.data.tymy) || []).find((x) => x.klic === klic);
  return t ? t.nazev : { A: 'A-tým', B: 'B-tým', dorost: 'Dorost' }[klic] || klic;
}

/** Náhled 9:16 s tlačítkem přehrát (odkaz na video na Disku), nebo stav, proč video ještě není. */
function nahledHtml(r) {
  const obr = r.nahled ? '<img src="' + esc(r.nahled) + '" alt="">' : '<span class="reel__prazdny">' + IKONY.reely + '</span>';
  const cas = r.delka ? '<span class="reel__delka cisla">' + delka(r.delka) + '</span>' : '';
  if (r.odkaz) {
    return '<a class="reel__nahled" href="' + esc(r.odkaz) + '" target="_blank" rel="noopener noreferrer" aria-label="Přehrát video na Disku Google">' +
      obr + '<span class="reel__play">' + IKONY.prehrat + '</span>' + cas + '</a>';
  }
  return '<span class="reel__nahled">' + obr + '<span class="reel__ceka">' + (r.video ? 'nahrává se na Disk' : 'video se dělá') + '</span>' + cas + '</span>';
}

function kopirovatHtml(r, popisek) {
  return r.popisek ? '<button type="button" class="btn btn--cerne" data-reel-kopirovat="' + esc(r.id) + '">' + IKONY.kopirovat + '<span>' + (popisek || 'Kopírovat popisek') + '</span></button>' : '';
}

function reelHtml(r) {
  const z = zverejneno(r);
  const t = datumReelu(r);
  const meta = [DNY_KR[new Date(t).getDay()] + ' ' + dm(t), (r.zapasy[0] || {}).soutez, r.varianta, r.velikost ? Math.round(r.velikost) + ' MB' : ''].filter(Boolean);
  return '<li class="reel' + (z ? ' reel--venku' : '') + '" data-reel="' + esc(r.id) + '">' + nahledHtml(r) +
    '<div class="reel__telo">' +
      '<div class="reel__hlava"><div class="reel__stitky">' + r.tymy.map((k) => '<span class="tag tag--seda">' + esc(nazevTymu(k)) + '</span>').join('') +
        (z ? '<span class="tag tag--ok">' + IKONY.fajfka + 'na Instagramu od ' + esc(dm(terminDatum(stav.reely.zverejneno[r.id]))) + '</span>'
          : stitekPlanu(r)) + '</div>' +
      '<b class="reel__nazev">' + esc(r.nazev) + '</b>' +
      '<small class="reel__meta">' + esc(meta.join(' · ')) + '</small></div>' +
      // popisek vždy celý (Michal 5. 10.) – před kopírováním ho chce přečíst
      (r.popisek ? (popisekReelu(r) !== r.popisek ? '<span class="tag tag--plan reel__upraveno">upravený popisek pro Instagram</span>' : '') +
        '<div class="reel__popisek">' + esc(popisekReelu(r)) + '</div>'
        : '<p class="reel__bez">Popisek zatím není – připíše ho Claude při výrobě reelu.</p>') +
      (plan(r) && plan(r).stav === 'chyba' ? '<p class="reel__chyba">Na Instagram se nepodařilo: ' + esc(plan(r).chyba || '') + '</p>' : '') +
      (plan(r) && plan(r).stav === 'hotovo' && plan(r).pribehChyba ? '<p class="reel__chyba">Reel vyšel, příběh ne: ' + esc(plan(r).pribehChyba) + '</p>' : '') +
      '<div class="reel__akce">' + planAkceHtml(r) + kopirovatHtml(r) +
        (r.odkaz ? '<a class="btn btn--ghost" href="' + esc(r.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.prehrat + '<span>Video</span></a>' : '') +
        '<button type="button" class="btn btn--ghost reel__prepinac" data-reel-zverejneno="' + esc(r.id) + '" aria-pressed="' + z + '" title="' +
          (z ? 'Vrátit mezi nezveřejněné' : 'Označit, že reel už je na Instagramu') + '">' + IKONY.fajfka + '<span>Zveřejněno</span></button>' +
      '</div>' +
    '</div></li>';
}

/** Stav reelu, který ještě není zveřejněný: naplánováno na čas, nahrává se, nepovedlo se, nebo čeká. */
function stitekPlanu(r) {
  const p = plan(r);
  if (p && p.stav === 'ceka') {
    return '<span class="tag tag--plan">' + IKONY.kalendar + 'vyjde ' + esc(kdyPlan(p.kdy)) + (p.pribeh ? ' + příběh' : '') + '</span>' +
      (p.oznacit && p.oznacit.length ? '<span class="tag tag--seda">označí ' + esc(p.oznacit.map((u) => '@' + u).join(', ')) + '</span>' : '');
  }
  if (p && (p.stav === 'nahrava' || p.stav === 'zverejnuji')) return '<span class="tag tag--plan">' + IKONY.obnovit + 'nahrává se na Instagram</span>';
  if (p && p.stav === 'chyba') return '<span class="tag tag--danger">nepovedlo se – naplánuj znovu</span>';
  return '<span class="tag tag--danger">čeká na Instagram</span>';
}

/** Naplánovat (s propojeným Instagramem), u naplánovaného Změnit a Zrušit, u zveřejněného odkaz na příspěvek. */
function planAkceHtml(r) {
  const p = plan(r);
  if (p && p.stav === 'hotovo' && p.odkaz) {
    return '<a class="btn btn--ghost" href="' + esc(p.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.odkaz + '<span>Na Instagramu</span></a>';
  }
  if (!instagram().nastaveno || zverejneno(r) || !r.odkaz || !r.popisek || !umiMotor('reelNaplanovat')) return '';
  if (p && (p.stav === 'nahrava' || p.stav === 'zverejnuji')) return '';
  if (p && p.stav === 'ceka') {
    return '<button type="button" class="btn btn--plan" data-reel-naplanovat="' + esc(r.id) + '">' + IKONY.kalendar + '<span>Změnit čas</span></button>' +
      '<button type="button" class="btn btn--ghost" data-reel-zrusit-plan="' + esc(r.id) + '">' + IKONY.zavrit + '<span>Zrušit plán</span></button>';
  }
  return '<button type="button" class="btn btn--plan" data-reel-naplanovat="' + esc(r.id) + '">' + IKONY.kalendar + '<span>Naplánovat na Instagram</span></button>';
}

/** Výchozí čas: nejbližší 18:00 (večer mají reely klubu nejvíc přehrání), u změny dosavadní čas. */
function vychoziCas(r) {
  const p = plan(r);
  let t;
  if (p && p.stav === 'ceka') t = p.kdy;
  else {
    const d = new Date();
    if (d.getHours() >= 17) d.setDate(d.getDate() + 1);
    d.setHours(18, 0, 0, 0);
    t = d.getTime();
  }
  const d = new Date(t);
  return isoDatum(t) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function oznaceniTymu(r) {
  const ulozene = uloziste.cti('asistent.ig.oznacit') || {};
  const k = r.tymy[0] || '';
  return k in ulozene ? ulozene[k] : VYCHOZI_OZNACENI[k] || '';
}

/** Okno Naplánovat na Instagram: čas, účty k označení a popisek (úprava jen pro tenhle příspěvek). */
function otevriPlan(r) {
  const p = plan(r);
  rp = { id: r.id, kdy: vychoziCas(r), oznacit: p && p.stav === 'ceka' && p.oznacit ? p.oznacit.map((u) => '@' + u).join(', ') : oznaceniTymu(r),
    popisek: popisekReelu(r), ukladam: false,
    // Michal 9. 10.: „u reelů to přidání rovnou do příběhu“ – výchozí zapnuto, pamatuje se poslední volba
    pribeh: p && p.stav === 'ceka' ? !!p.pribeh : uloziste.cti('asistent.ig.pribeh') !== false };
  const moje = rp;
  otevriPanel({
    id: 'reel-plan', trida: 'panel-okno panel-formular', titul: 'Naplánovat na Instagram', vykresli: planHtml,
    paticka: () => '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
      '<button type="button" class="btn btn--plan" data-rp-ulozit' + (rp && rp.ukladam ? ' disabled' : '') + '>' + IKONY.kalendar + '<span>' +
      (rp && rp.ukladam ? 'Ukládám…' : 'Naplánovat') + '</span></button></div>',
    poOtevreni: (el) => { const pole = el.querySelector('[data-rp="kdy"]'); if (pole) pole.focus(); },
    priZavreni: () => { if (rp === moje) rp = null; }
  });
}

function planHtml() {
  if (!rp) return '';
  const r = najdi(rp.id);
  const ucet = instagram().ucet ? '@' + instagram().ucet : 'klubový Instagram';
  // <textarea> zahodí první odřádkování obsahu – když popisek začíná prázdným řádkem, přidat jedno navíc
  const text = /^\r?\n/.test(rp.popisek) ? '\n' + rp.popisek : rp.popisek;
  return '<div class="formular">' +
    '<p class="napoveda">' + esc(r ? r.nazev : '') + ' vyjde na ' + esc(ucet) + ' sám v zadaný čas (do 10 minut). Video jde v původní kvalitě z Disku.</p>' +
    '<label><span class="label">Kdy</span><input class="field" type="datetime-local" data-rp="kdy" value="' + esc(rp.kdy) + '"></label>' +
    '<label><span class="label">Označit účty</span><input class="field" data-rp="oznacit" value="' + esc(rp.oznacit) + '" placeholder="např. @dorost_agro" ' +
      'autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
    '<label class="prepinac-radek"><span><b>I do příběhu</b><small>stejné video rovnou i do příběhu (story)</small></span>' +
      '<span class="prepinac"><input type="checkbox" data-rp-pribeh' + (rp.pribeh ? ' checked' : '') + '><span></span></span></label>' +
    '<label><span class="label">Popisek na Instagram</span><textarea class="odpoved reel-plan__popisek" data-rp="popisek" rows="12">' + esc(text) + '</textarea></label>' +
    '<p class="napoveda">Úprava popisku platí jen pro tenhle příspěvek – soubor s popiskem na PC zůstává, jak je.</p>' +
    '<p class="pruh pruh-varovani" data-rp-chyba hidden></p></div>';
}

async function ulozPlan() {
  const ukaz = (t) => { const el = elementPanelu('reel-plan'); const ch = el && el.querySelector('[data-rp-chyba]'); if (ch) { ch.textContent = t; ch.hidden = !t; } };
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(rp.kdy || '');
  if (!m) { ukaz('Vyber datum a čas.'); return; }
  if (!String(rp.popisek || '').trim()) { ukaz('Popisek je prázdný.'); return; }
  const kdy = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  const r = najdi(rp.id);
  const pribeh = !!rp.pribeh;
  rp.ukladam = true;
  obnovPanel('reel-plan');
  try {
    const v = await volej('reelNaplanovat', { id: rp.id, kdy, oznacit: rp.oznacit, popisek: rp.popisek, pribeh });
    uloziste.pis('asistent.ig.pribeh', pribeh);
    stav.reely.plan = v.plan || {};
    stav.reely.popiskyPlanu = v.popisky || {};
    uloziste.pis(ULOZISTE, { data: stav.reely, kdy: Date.now() });
    if (r && r.tymy[0]) { const ul = uloziste.cti('asistent.ig.oznacit') || {}; ul[r.tymy[0]] = rp.oznacit; uloziste.pis('asistent.ig.oznacit', ul); }
    zavriPanel();
    toast('Naplánováno – vyjde ' + kdyPlan(kdy) + (pribeh ? ' i v příběhu' : ''));
    zmeneno();
  } catch (e) {
    if (!rp) return;
    rp.ukladam = false;
    obnovPanel('reel-plan');
    ukaz(e.message);
  }
}

/** Psaní do okna plánu (pole se nepřekreslují, jen se pamatuje hodnota). */
export function vstupReely(e) {
  const t = e.target;
  if (!rp || !t.matches) return false;
  if (t.matches('[data-rp-pribeh]')) { rp.pribeh = t.checked; return true; }
  if (!t.matches('[data-rp]')) return false;
  rp[t.dataset.rp] = t.value;
  return true;
}

function nadpisTydne(pondeli) {
  const r = Math.round((zacatekTydne(Date.now()) - pondeli) / (7 * 864e5));
  const rozsah = dm(pondeli) + ' – ' + dm(pridejDny(pondeli, 6));
  return r === 0 ? 'Tento týden · ' + rozsah : r === 1 ? 'Minulý týden · ' + rozsah : rozsah;
}

function vyhovuje(r) {
  if (filtr === 'vse') return true;
  if (filtr === 'ceka') return !zverejneno(r);
  return r.tymy.indexOf(filtr) >= 0;
}

export function vykresliReely(el) {
  if (!stav.reely) {
    el.innerHTML = '<div class="card">' + (stav.chyby.reely ? chybaHtml(stav.chyby.reely, 'data-reely-znovu') : kostra(3)) + '</div>';
    return;
  }
  const vse = seznam();
  const tymy = [];
  vse.forEach((r) => r.tymy.forEach((k) => { if (tymy.indexOf(k) < 0) tymy.push(k); }));
  if (filtr !== 'vse' && filtr !== 'ceka' && tymy.indexOf(filtr) < 0) filtr = 'vse';
  const volby = [['vse', 'Vše', vse.length], ['ceka', 'Čeká na Instagram', vse.filter((r) => !zverejneno(r)).length]]
    .concat(tymy.length > 1 ? tymy.map((k) => [k, nazevTymu(k), vse.filter((r) => r.tymy.indexOf(k) >= 0).length]) : []);
  let h = '<div class="reely-stranka">' + (vse.length ? '<div class="filtry">' + segment(volby, filtr, 'data-reely-filtr', 'Filtr reelů') + '</div>' : '');
  if (stav.chyby.reely) h += chybaHtml(stav.chyby.reely, 'data-reely-znovu');
  const vidim = vse.filter(vyhovuje);
  if (!vse.length) {
    h += '<div class="card"><div class="prazdne">Zatím tu žádný reel není. Hotové reely sem posílá domácí PC – po dokončení reelu export ' +
      '<code>NASTROJE\\asistent\\reely\\export_reely.py</code> nahraje popisek a video na Disk.</div></div>';
  } else if (!vidim.length) {
    h += '<div class="card"><div class="prazdne">' + (filtr === 'ceka' ? 'Všechny reely už jsou na Instagramu.' : 'Žádný reel.') + '</div></div>';
  } else {
    const tydny = [];
    vidim.forEach((r) => {
      const pondeli = zacatekTydne(datumReelu(r));
      const t = tydny.find((x) => x.pondeli === pondeli) || (tydny.push({ pondeli, reely: [] }), tydny[tydny.length - 1]);
      t.reely.push(r);
    });
    h += tydny.map((t) => '<section class="reely-tyden"><h2 class="reely-tyden__nadpis">' + esc(nadpisTydne(t.pondeli)) + '</h2>' +
      '<ul class="reely-seznam">' + t.reely.map(reelHtml).join('') + '</ul></section>').join('');
  }
  h += '<p class="napoveda reely-napoveda">Videa jsou na tvém Disku Google (CLAUDE_SCHRANKA/REELY) a otevře je jen tvůj účet. ' +
    'Do Fotek v iPhonu: v aplikaci Disk ⋯ → Poslat kopii → Uložit video. Popisek se mění jen na PC (popisky\\…txt).</p>';
  el.innerHTML = h + '</div>';
}

/** Limetková karta na Dnes (vzor PriorAuth „Další krok“): nejnovější nezveřejněný reel, Kopírovat a Video jedním ťuknutím. */
export function kartaDnesHtml() {
  const k = kVyveseni();
  if (!k.length) return '';
  const r = k[0];
  return '<div class="dalsi-krok reel-krok">' +
    '<div class="reel-krok__hlava"><small>' + IKONY.reely + 'Reel k vyvěšení' + (k.length > 1 ? ' · ' + k.length : '') + '</small>' +
      '<button type="button" class="reel-krok__sipka" data-cil="reely" aria-label="Všechny reely" title="Všechny reely">' + IKONY.sipka + '</button></div>' +
    '<div class="reel-krok__obsah">' + nahledHtml(r) +
      '<div class="reel-krok__text"><b>' + esc(r.nazev) + '</b><small>' + esc([r.tymNazev, (r.zapasy[0] || {}).soutez].filter(Boolean).join(' · ')) + '</small></div></div>' +
    (r.popisek ? '<div class="reel-krok__popisek">' + esc(r.popisek) + '</div>' : '<q>Popisek zatím není.</q>') +
    '<div class="reel-krok__akce">' + kopirovatHtml(r) +
      (r.odkaz ? '<a class="btn btn--ghost" href="' + esc(r.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.prehrat + '<span>Video</span></a>' : '') + '</div>' +
  '</div>';
}

/** Tlačítko na stránku Reely (stránka Fotbal, karta Fotbal na Dnes). */
hooky.reelyTlacitko = (trida) => (umiMotor('reely')
  ? '<button type="button" class="' + (trida || 'chip') + ' reely-tl" data-cil="reely">' + IKONY.reely + '<span>Reely</span>' +
    (kVyveseni().length ? '<span class="pocet cisla">' + kVyveseni().length + '</span>' : '') + '</button>' : '');

/** Do schránky: na https přes Clipboard API, jinak (starší Safari, http) označením textu v <textarea>. */
async function kopiruj(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* náhradní cesta níž */ }
  const t = document.createElement('textarea');
  t.value = text;
  t.setAttribute('readonly', '');
  t.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  document.body.appendChild(t);
  t.focus();
  t.select();
  t.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  t.remove();
  return ok;
}

function oznac(id, ano) {
  if (!stav.reely) return;
  const puvodni = stav.reely.zverejneno || {};
  stav.reely.zverejneno = Object.assign({}, puvodni);
  if (ano) stav.reely.zverejneno[id] = isoDatum(Date.now()); else delete stav.reely.zverejneno[id];
  zmeneno();
  volej('reelStav', { id, zverejneno: ano })
    .then((v) => {
      stav.reely.zverejneno = v.zverejneno || {};
      uloziste.pis(ULOZISTE, { data: stav.reely, kdy: Date.now() });
      toast(ano ? 'Zapsáno – reel je na Instagramu' : 'Vráceno mezi nezveřejněné');
    })
    .catch((e) => { stav.reely.zverejneno = puvodni; toast(e.message, true); })
    .then(zmeneno);
}

export function klikReely(el) {
  if (el.dataset.reelKopirovat) {
    const r = najdi(el.dataset.reelKopirovat);
    if (!r) return true;
    kopiruj(popisekReelu(r)).then((ok) => {
      if (!ok) { toast('Kopírování nejde – podrž prst na textu popisku a zkopíruj ho ručně.', true); return; }
      if (zverejneno(r)) toast('Popisek zkopírovaný');
      else toastAkce('Popisek zkopírovaný – vlož ho do Instagramu', 'Zveřejněno', () => oznac(r.id, true));
    });
    return true;
  }
  if (el.dataset.reelZverejneno) {
    const r = najdi(el.dataset.reelZverejneno);
    if (r) oznac(r.id, !zverejneno(r));
    return true;
  }
  if (el.dataset.reelNaplanovat) {
    const r = najdi(el.dataset.reelNaplanovat);
    if (r) otevriPlan(r);
    return true;
  }
  if (el.hasAttribute('data-rp-ulozit')) { if (rp && !rp.ukladam) ulozPlan(); return true; }
  if (el.dataset.reelZrusitPlan) {
    const r = najdi(el.dataset.reelZrusitPlan);
    if (!r) return true;
    potvrd('Zrušit naplánované zveřejnění?', { text: r.nazev + ' – na Instagram pak nepůjde sám.', ano: 'Zrušit plán', ne: 'Nechat' }).then((ano) => {
      if (!ano) return;
      volej('reelZrusitPlan', { id: r.id })
        .then((v) => { stav.reely.plan = v.plan || {}; uloziste.pis(ULOZISTE, { data: stav.reely, kdy: Date.now() }); toast('Plán zrušený'); })
        .catch((e) => toast(e.message, true))
        .then(zmeneno);
    });
    return true;
  }
  if (el.dataset.reelyFiltr) { filtr = el.dataset.reelyFiltr; uloziste.pis(FILTR, filtr); zmeneno(); return true; }
  if (el.hasAttribute('data-reely-znovu')) { nactiReely(true); return true; }
  return false;
}
