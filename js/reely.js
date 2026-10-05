// Reely: hotové reely z fotbalu (domácí PC → Disk → motor). U každého popisek s tlačítkem Kopírovat (vložit do Instagramu),
// video na Disku Google (otevře ho aplikace Disk nebo prohlížeč – jen Michalův účet, nic veřejného) a stav „je na Instagramu“.
// Popisek se tu jen kopíruje – jediná pravda je soubor popisky\*.txt na PC. Na Dnes limetková karta „Reel k vyvěšení“.

import { stav, zmeneno, umiMotor, hooky } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, dm, DNY_KR, rozdilDni, zacatekTydne, pridejDny, terminDatum, isoDatum, tvar, kdyKratce } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, toastAkce, kostra, chybaHtml, segment } from './ui.js';

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
const datumReelu = (r) => terminDatum(r.datum) || Date.parse(r.vyrobeno) || 0;
const najdi = (id) => seznam().find((r) => r.id === id);

/** Nezveřejněné reely ze zápasů za poslední týden (nejnovější první) – Dnes a odznak v panelu. */
export function kVyveseni() {
  return seznam().filter((r) => !zverejneno(r) && (r.popisek || r.video) && rozdilDni(datumReelu(r)) >= -CERSTVY_DNI);
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
          : '<span class="tag tag--danger">čeká na Instagram</span>') + '</div>' +
      '<b class="reel__nazev">' + esc(r.nazev) + '</b>' +
      '<small class="reel__meta">' + esc(meta.join(' · ')) + '</small></div>' +
      // popisek vždy celý (Michal 5. 10.) – před kopírováním ho chce přečíst
      (r.popisek ? '<div class="reel__popisek">' + esc(r.popisek) + '</div>'
        : '<p class="reel__bez">Popisek zatím není – připíše ho Claude při výrobě reelu.</p>') +
      '<div class="reel__akce">' + kopirovatHtml(r) +
        (r.odkaz ? '<a class="btn btn--ghost" href="' + esc(r.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.prehrat + '<span>Video</span></a>' : '') +
        '<button type="button" class="btn btn--ghost reel__prepinac" data-reel-zverejneno="' + esc(r.id) + '" aria-pressed="' + z + '" title="' +
          (z ? 'Vrátit mezi nezveřejněné' : 'Označit, že reel už je na Instagramu') + '">' + IKONY.fajfka + '<span>Zveřejněno</span></button>' +
      '</div>' +
    '</div></li>';
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
    kopiruj(r.popisek).then((ok) => {
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
  if (el.dataset.reelyFiltr) { filtr = el.dataset.reelyFiltr; uloziste.pis(FILTR, filtr); zmeneno(); return true; }
  if (el.hasAttribute('data-reely-znovu')) { nactiReely(true); return true; }
  return false;
}
