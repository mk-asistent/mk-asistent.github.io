// Skupiny účtů k označení na Instagramu (Michal 16. 10.: „chtěl bych si udělat nějaké skupiny na Instagram reely k označení
// (příběhů naplánovaných) a mít tam pak možnost přidávat si do těch skupin lidi“).
// Data: motor REELY/skupiny.json (píše jen motor) – přijdou s daty akcí reely i plakaty (pole skupiny), jinak akcí igSkupiny;
// zápis igSkupinaUlozit { id?, nazev?, ucty?, barva? } a igSkupinaSmazat { id } → { skupiny }.
// - Správa (okno Skupiny na stránce Reely a Nastavení → Instagram): vytvořit, přejmenovat, smazat s Vrátit, přidat lidi
//   (pole s @jménem + Enter, víc jmen naráz oddělených mezerou nebo čárkou), odebrat × u čipu, počet členů.
// - Čipy skupin u pole „Označit účty“ (reel, plakát, příběh z fotky – oznaceniHtml): klepnutí přidá všechny členy skupiny
//   (bez opakování), druhé klepnutí je odebere; počet účtů u pole a limit 20 na příspěvek / příběh (přes limit nic nepřidá
//   a řekne proč). Mění se přímo hodnota pole a událost input ji předá modulu okna (reely, plakaty, pribehy) – okno se
//   nepřekresluje (klávesnice v telefonu zůstane). Naposledy použitá skupina je v řadě první.
// Uživatelská jména jsou Michalova data – jen v zařízení a na Disku (a v soukromé kopii reelů na serveru); ukázka
// (js/ukazka.js) a testy mají vymyšlená.

import { stav, zmeneno, umiMotor } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, toastAkce, okno } from './ui.js';
import { otevriPanel } from './panely.js';
import { MAX_OZNACENI } from './ig_prubeh.js';

const ULOZISTE = 'asistent.ig.skupiny';           // { skupiny, kdy } – když reely ani plakáty v zařízení nejsou
const POSLEDNI = 'asistent.ig.skupinaPosledni';   // id naposledy použité skupiny (v řadě čipů první)
const MAX_VE_SKUPINE = 50;                         // jako motor (IG_MAX_VE_SKUPINE)
const MAX_SKUPIN = 30;                             // jako motor (IG_MAX_SKUPIN)
const MAX_NAZEV = 40;
const JMENO = /^[a-z0-9._]{1,30}$/i;               // jméno účtu na Instagramu (jako uctyKOznaceni a motor)

let vlastni = (() => { const v = uloziste.cti(ULOZISTE); return v && Array.isArray(v.skupiny) ? v : null; })();
let nacitam = false, nacteno = false, pokus = 0;
let fronta = Promise.resolve();                    // zápisy do motoru po sobě
const chyby = {};                                  // id skupiny (nebo 'novy') → text chyby u pole

export const umi = () => umiMotor('igSkupinaUlozit');

/** Skupiny: z dat reelů, jinak plakátů, jinak naposledy načtené samostatně (igSkupiny). */
export function seznam() {
  if (stav.reely && Array.isArray(stav.reely.skupiny)) return stav.reely.skupiny;
  if (stav.plakaty && Array.isArray(stav.plakaty.skupiny)) return stav.plakaty.skupiny;
  return vlastni ? vlastni.skupiny : [];
}
const najdi = (id) => seznam().find((s) => s.id === id) || null;

/** Starší kopie reelů ze serveru (před motorem se skupinami) je nemá – jednou je načíst samy (po chybě nejdřív za 5 minut). */
export function dotahni() {
  if (nacitam || nacteno || !umiMotor('igSkupiny') || Date.now() - pokus < 5 * 60e3) return;
  if ((stav.reely && Array.isArray(stav.reely.skupiny)) || (stav.plakaty && Array.isArray(stav.plakaty.skupiny))) return;
  nacitam = true;
  pokus = Date.now();
  volej('igSkupiny').then((v) => { nacteno = true; prijmi(v && v.skupiny); }).catch(() => { /* zkusí se při dalším otevření */ })
    .then(() => { nacitam = false; });
}

/** Nové skupiny do všech míst, kde je aplikace drží (a do zařízení), pak překreslit správu i čipy. */
function prijmi(skupiny) {
  if (!Array.isArray(skupiny)) return;
  // reely a plakáty si data ukládají pod svými klíči (js/reely.js, js/plakaty.js) – skupiny se uloží s nimi
  if (stav.reely) { stav.reely.skupiny = skupiny; uloziste.pis('asistent.data.reely', { data: stav.reely, kdy: Date.now() }); }
  if (stav.plakaty) { stav.plakaty.skupiny = skupiny; uloziste.pis('asistent.data.plakaty', { data: stav.plakaty, kdy: Date.now() }); }
  vlastni = { skupiny, kdy: Date.now() };
  uloziste.pis(ULOZISTE, vlastni);
  obnovVse();
  zmeneno();
}

/** Text pole → jména bez @ (malými, bez opakování) – i neplatná (kontrolu dělá uctyKOznaceni před odesláním). */
function jmenaZTextu(text) {
  const ven = [];
  String(text || '').split(/[\s,;]+/).map((u) => u.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)
    .forEach((u) => { if (ven.indexOf(u) < 0) ven.push(u); });
  return ven;
}

/** Skupiny v řadě čipů: naposledy použitá první, ostatní jak jdou. */
function poradi(sk) {
  const p = uloziste.cti(POSLEDNI);
  const i = sk.findIndex((s) => s.id === p);
  return i > 0 ? [sk[i]].concat(sk.slice(0, i), sk.slice(i + 1)) : sk;
}

const barva = (s) => ' ig-barva--' + (/^(zelena|modra|fialova|oranz|zluta|seda)$/.test(s.barva || '') ? s.barva : 'seda');
const lidi = (n) => n + ' ' + tvar(n, 'člověk', 'lidé', 'lidí');
const aktivni = (s, jmena) => s.ucty.length > 0 && s.ucty.every((u) => jmena.indexOf(u) >= 0);

// ---------------------------------------------------------------- čipy u pole „Označit účty“ / „Zmínit účty“

/**
 * Pole s účty a pod ním čipy skupin. o = { popisek, atribut (data-… pole modulu okna, např. 'data-rd="oznacit" data-pole="oznacit"'),
 * hodnota, popisekAtr? (atribut popisku – plakát mění text popisku sám) }.
 */
export function oznaceniHtml(o) {
  return '<div class="ig-oznaceni" data-ig-oznaceni><label><span class="label"' + (o.popisekAtr ? ' ' + o.popisekAtr : '') + '>' + esc(o.popisek) + '</span>' +
    '<input class="field" ' + o.atribut + ' data-ig-oznacit-pole value="' + esc(o.hodnota || '') + '" placeholder="např. @dorost_agro" ' +
      'autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
    '<div class="ig-cipy" data-ig-cipy>' + cipyHtml(o.hodnota) + '</div>' +
    '<p class="ig-cipy__varovani" data-ig-varovani role="status" hidden></p></div>';
}

function pocetHtml(n) {
  return '<span class="ig-cipy__pocet cisla' + (n > MAX_OZNACENI ? ' ig-cipy__pocet--moc' : '') + '" data-ig-pocet>' + n + ' / ' + MAX_OZNACENI + '</span>';
}

function cipyHtml(hodnota) {
  const jmena = jmenaZTextu(hodnota);
  if (!umi()) return pocetHtml(jmena.length);
  dotahni();
  const sk = poradi(seznam());
  return sk.map((s) => '<button type="button" class="chip ig-cip" data-ig-skupina="' + esc(s.id) + '" aria-pressed="' + aktivni(s, jmena) + '">' +
      '<i class="ig-sk-tecka' + barva(s) + '" aria-hidden="true"></i>' + esc(s.nazev) + '<span class="pocet cisla">' + s.ucty.length + '</span></button>').join('') +
    '<button type="button" class="odkaz ig-cipy__sprava" data-ig-skupiny-sprava>' + (sk.length ? 'Upravit skupiny' : IKONY.plus + '<span>Skupina lidí k označení</span>') + '</button>' +
    pocetHtml(jmena.length);
}

/** Stav čipů a počtu podle aktuální hodnoty pole (po psaní i po klepnutí na skupinu) – bez překreslení pole. */
function obnovCipy(box) {
  const pole = box.querySelector('[data-ig-oznacit-pole]');
  if (!pole) return;
  const jmena = jmenaZTextu(pole.value);
  box.querySelectorAll('[data-ig-skupina]').forEach((c) => { const s = najdi(c.dataset.igSkupina); c.setAttribute('aria-pressed', String(!!s && aktivni(s, jmena))); });
  const p = box.querySelector('[data-ig-pocet]');
  if (p) { p.textContent = jmena.length + ' / ' + MAX_OZNACENI; p.classList.toggle('ig-cipy__pocet--moc', jmena.length > MAX_OZNACENI); }
}

function varovani(box, text) {
  const v = box.querySelector('[data-ig-varovani]');
  if (!v) { if (text) toast(text, true); return; }
  v.textContent = text || '';
  v.hidden = !text;
}

/** Klepnutí na čip skupiny: všichni členové do pole (bez opakování, nejvýš 20), nebo – když už tam jsou – pryč (kromě těch,
 *  které drží jiná vybraná skupina). */
function prepniSkupinu(cip) {
  const box = cip.closest('[data-ig-oznaceni]');
  const pole = box && box.querySelector('[data-ig-oznacit-pole]');
  const s = najdi(cip.dataset.igSkupina);
  if (!pole || !s) return;
  const jmena = jmenaZTextu(pole.value);
  let nova;
  if (aktivni(s, jmena)) {
    const drzi = [];
    seznam().filter((x) => x.id !== s.id && aktivni(x, jmena)).forEach((x) => x.ucty.forEach((u) => drzi.push(u)));
    nova = jmena.filter((u) => s.ucty.indexOf(u) < 0 || drzi.indexOf(u) >= 0);
    varovani(box, '');
  } else {
    if (!s.ucty.length) { varovani(box, 'Skupina „' + s.nazev + '“ je zatím prázdná – lidi do ní přidáš v Upravit skupiny.'); return; }
    const pridat = s.ucty.filter((u) => jmena.indexOf(u) < 0);
    if (jmena.length + pridat.length > MAX_OZNACENI) {
      varovani(box, 'Se skupinou „' + s.nazev + '“ by to bylo ' + (jmena.length + pridat.length) + ' účtů – Instagram označí nejvýš ' + MAX_OZNACENI +
        ' na příspěvek i příběh. Nic jsem nepřidal, uber ručně nebo použij menší skupinu.');
      return;
    }
    nova = jmena.concat(pridat);
    uloziste.pis(POSLEDNI, s.id);
    varovani(box, '');
  }
  pole.value = nova.map((u) => '@' + u).join(', ');
  pole.dispatchEvent(new Event('input', { bubbles: true })); // modul okna (reely / plakaty / pribehy) si hodnotu vezme
  obnovCipy(box);
}

// psaní do pole účtů: počet a stav čipů hned (varování z klepnutí na skupinu zmizí)
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || !t.matches || !t.matches('[data-ig-oznacit-pole]')) return;
  const box = t.closest('[data-ig-oznaceni]');
  if (!box) return;
  if (e.isTrusted) varovani(box, '');
  obnovCipy(box);
});

// ---------------------------------------------------------------- správa skupin (okno Skupiny, Nastavení → Instagram)

/** Obsah správy (vložit do okna nebo do Nastavení) – překresluje se sám (obnovVse), Nastavení i okno ho jen vloží. */
export function spravaHtml() {
  dotahni();
  return '<div class="ig-sprava" data-ig-sprava>' + spravaVnitrek() + '</div>';
}

function spravaVnitrek() {
  const sk = seznam();
  return '<p class="napoveda">Lidé, které na Instagramu často označuješ (hráči, trenéři, soupeři). U „Označit účty“ v reelu, plakátu i příběhu ' +
      'je přidáš klepnutím na skupinu najednou, druhým klepnutím zase uberou. Do skupiny piš @jméno a Enter – víc jmen naráz odděl mezerou ' +
      'nebo čárkou. Jména zůstávají jen na tvém Disku a v zařízení.</p>' +
    '<div class="ig-sprava__novy"><input class="field" data-ig-sk-novy maxlength="' + MAX_NAZEV + '" placeholder="Název nové skupiny – třeba Dorost hráči" ' +
      'aria-label="Název nové skupiny" autocomplete="off"' + (sk.length >= MAX_SKUPIN ? ' disabled' : '') + '>' +
      '<button type="button" class="btn btn--primary btn--sm" data-ig-sk-zalozit' + (sk.length >= MAX_SKUPIN ? ' disabled' : '') + '>' + IKONY.plus + '<span>Vytvořit</span></button></div>' +
    chybaHtml('novy') +
    (sk.length ? '<div class="ig-sprava__seznam">' + sk.map(skupinaHtml).join('') + '</div>'
      : '<p class="ig-sprava__prazdne">Zatím žádná skupina. Napiš název a Vytvořit – pak do ní přidáš lidi.</p>') +
    (sk.length >= MAX_SKUPIN ? '<p class="napoveda">Skupin může být nejvýš ' + MAX_SKUPIN + '.</p>' : '');
}

function chybaHtml(klic) {
  return '<p class="pruh pruh-varovani ig-sprava__chyba" data-ig-sk-chyba="' + esc(klic) + '"' + (chyby[klic] ? '' : ' hidden') + '>' + esc(chyby[klic] || '') + '</p>';
}

function clenoveHtml(s) {
  return s.ucty.length
    ? '<ul class="ig-sk__clenove">' + s.ucty.map((u) => '<li class="ig-sk__clen"><span>@' + esc(u) + '</span><button type="button" class="ig-sk__odebrat" ' +
        'data-ig-sk-odebrat="' + esc(u) + '" aria-label="Odebrat @' + esc(u) + '">' + IKONY.zavrit + '</button></li>').join('') + '</ul>'
    : '<p class="ig-sk__prazdne">Zatím nikdo – napiš @jméno a Enter.</p>';
}

function hlavaHtml(s) {
  return '<i class="ig-sk-tecka' + barva(s) + '" aria-hidden="true"></i><b class="ig-sk__nazev">' + esc(s.nazev) + '</b>' +
    '<span class="ig-sk__pocet cisla">' + lidi(s.ucty.length) + '</span>';
}

function skupinaHtml(s) {
  const id = esc(s.id);
  return '<section class="ig-sk" data-ig-sk="' + id + '">' +
    '<div class="ig-sk__hlava"><span class="ig-sk__titul" data-ig-sk-titul>' + hlavaHtml(s) + '</span>' +
      '<span class="ig-sk__akce"><button type="button" class="btn btn--ghost btn--sm" data-ig-sk-prejmenovat="' + id + '">' + IKONY.psat + '<span>Přejmenovat</span></button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-ig-sk-smazat="' + id + '">' + IKONY.smazat + '<span>Smazat</span></button></span></div>' +
    '<div data-ig-sk-clenove>' + clenoveHtml(s) + '</div>' +
    '<div class="ig-sk__pridat"><input class="field" data-ig-sk-pridat="' + id + '" placeholder="@jméno a Enter" ' +
      'aria-label="Přidat lidi do skupiny ' + esc(s.nazev) + '" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-ig-sk-pridat-btn="' + id + '">' + IKONY.plus + '<span>Přidat</span></button></div>' +
    chybaHtml(s.id) + '</section>';
}

/** Překreslí správu (okno i Nastavení) a čipy u polí v otevřených oknech. Když se změnili jen členové a názvy (stejné skupiny
 *  ve stejném pořadí), jen po skupinách – pole přidání se nepřepíše (klávesnice v telefonu zůstane); jinak celá správa
 *  a rozepsané hodnoty polí s fokusem se vrátí. */
function obnovVse() {
  const idy = seznam().map((s) => s.id).join();
  document.querySelectorAll('[data-ig-sprava]').forEach((el) => {
    if (Array.from(el.querySelectorAll('[data-ig-sk]')).map((x) => x.dataset.igSk).join() === idy && idy) {
      seznam().forEach((s) => obnovSkupinu(s.id, el));
      return;
    }
    const a = document.activeElement;
    const ve = a && el.contains(a) && a.matches('input') ? (a.dataset.igSkPridat ? '[data-ig-sk-pridat="' + CSS.escape(a.dataset.igSkPridat) + '"]' : a.hasAttribute('data-ig-sk-novy') ? '[data-ig-sk-novy]' : '') : '';
    const hodnoty = {};
    el.querySelectorAll('[data-ig-sk-pridat], [data-ig-sk-novy]').forEach((i) => { hodnoty[i.dataset.igSkPridat || 'novy'] = i.value; });
    el.innerHTML = spravaVnitrek();
    el.querySelectorAll('[data-ig-sk-pridat], [data-ig-sk-novy]').forEach((i) => { const h = hodnoty[i.dataset.igSkPridat || 'novy']; if (h) i.value = h; });
    const zpet = ve && el.querySelector(ve);
    if (zpet) zpet.focus({ preventScroll: true });
  });
  obnovCipyVOknech();
}

/** Čipy u polí účtů v otevřených oknech (reel, plakát, příběh) podle nových skupin. */
function obnovCipyVOknech() {
  document.querySelectorAll('[data-ig-oznaceni]').forEach((box) => {
    const pole = box.querySelector('[data-ig-oznacit-pole]');
    const c = box.querySelector('[data-ig-cipy]');
    if (pole && c) { const h = cipyHtml(pole.value); if (c.innerHTML !== h) c.innerHTML = h; }
  });
}

/** Jen jedna skupina ve správě (v kořeni, jinak všude): hlavička, členové a chyba – pole přidání (a klávesnice) zůstane. */
function obnovSkupinu(id, koren) {
  const s = najdi(id);
  (koren || document).querySelectorAll('[data-ig-sk="' + CSS.escape(id) + '"]').forEach((el) => {
    if (!s) return;
    const t = el.querySelector('[data-ig-sk-titul]');
    if (t && t.innerHTML !== hlavaHtml(s)) t.innerHTML = hlavaHtml(s);
    const c = el.querySelector('[data-ig-sk-clenove]');
    if (c && c.innerHTML !== clenoveHtml(s)) c.innerHTML = clenoveHtml(s);
  });
  ukazChybu(id);
  if (!koren) obnovCipyVOknech();
}

function ukazChybu(klic, text) {
  if (text !== undefined) { if (text) chyby[klic] = text; else delete chyby[klic]; }
  document.querySelectorAll('[data-ig-sk-chyba="' + CSS.escape(klic) + '"]').forEach((p) => { p.textContent = chyby[klic] || ''; p.hidden = !chyby[klic]; });
}

/** Okno Skupiny (stránka Reely, „Upravit skupiny“ u pole účtů) – nad oknem reelu, plakátu nebo příběhu, když je otevřené. */
export function otevriSpravu() {
  if (!umi()) return;
  otevriPanel({
    id: 'ig-skupiny', trida: 'panel-okno panel-formular panel-skupiny', titul: 'Skupiny k označení',
    vykresli: spravaHtml,
    paticka: () => '<div class="akce"><button type="button" class="btn btn--primary" data-zavrit-panel>Hotovo</button></div>',
    zavritMimo: true,
    poOtevreni: (el) => {
      // na PC rovnou psát název nové skupiny / prvního člověka; na telefonu nic (klávesnice by vyskočila hned)
      const pole = !window.matchMedia('(pointer: coarse)').matches && el.querySelector(seznam().length ? '[data-ig-sk-pridat]' : '[data-ig-sk-novy]');
      if (pole) pole.focus(); else el.focus({ preventScroll: true });
    }
  });
}

/** Zápis do motoru po sobě. Odpověď motoru platí až po posledním čekajícím zápisu (jinak by při rychlém přidávání jmen
 *  na chvíli zmizelo to, co ještě čeká ve frontě – optimistická změna v zařízení je novější). */
let cekajici = 0;
function zapis(akce, data) {
  cekajici++;
  const vysledek = fronta.then(() => volej(akce, data)).then((v) => {
    if (--cekajici === 0) prijmi(v && v.skupiny);
    return v;
  }, (e) => { cekajici--; throw e; });
  fronta = vysledek.catch(() => {});
  return vysledek;
}

/** Optimisticky v zařízení: skupiny = nový seznam (motor ho potvrdí nebo opraví). */
function mistne(skupiny) {
  if (stav.reely) stav.reely.skupiny = skupiny;
  if (stav.plakaty) stav.plakaty.skupiny = skupiny;
  vlastni = { skupiny, kdy: Date.now() };
}

/** Po chybě zápisu: skupiny znovu z motoru (optimistická změna se vrátí). */
function zpetZMotoru() {
  volej('igSkupiny', { znovu: true }).then((v) => prijmi(v && v.skupiny)).catch(() => {});
}

async function zaloz(pole) {
  const nazev = String(pole.value || '').replace(/\s+/g, ' ').trim();
  if (!nazev) { ukazChybu('novy', 'Napiš název skupiny.'); pole.focus(); return; }
  if (nazev.length > MAX_NAZEV) { ukazChybu('novy', 'Název skupiny je nejvýš ' + MAX_NAZEV + ' znaků.'); return; }
  if (seznam().some((s) => s.nazev.toLowerCase() === nazev.toLowerCase())) { ukazChybu('novy', 'Skupina „' + nazev + '“ už je.'); return; }
  ukazChybu('novy', '');
  pole.disabled = true;
  try {
    const v = await zapis('igSkupinaUlozit', { nazev, ucty: [] });
    document.querySelectorAll('[data-ig-sk-novy]').forEach((i) => { i.value = ''; i.disabled = false; });
    toast('Skupina „' + nazev + '“ vytvořená – přidej do ní lidi');
    const nove = v && v.skupina && document.querySelector('[data-ig-sk-pridat="' + CSS.escape(v.skupina.id) + '"]');
    if (nove) { nove.focus(); nove.scrollIntoView({ block: 'nearest' }); }
  } catch (e) {
    document.querySelectorAll('[data-ig-sk-novy]').forEach((i) => { i.disabled = false; });
    ukazChybu('novy', e.message);
  }
}

/** Přidat lidi z pole (jedno i víc jmen oddělených mezerou, čárkou nebo středníkem; @ nevadí). */
function pridej(pole) {
  const id = pole.dataset.igSkPridat;
  const s = najdi(id);
  if (!s) return;
  const casti = String(pole.value || '').split(/[\s,;]+/).map((u) => u.trim().replace(/^@/, '')).filter(Boolean);
  if (!casti.length) { ukazChybu(id, 'Napiš jméno účtu na Instagramu (třeba @dorost_agro).'); return; }
  const spatne = casti.find((u) => !JMENO.test(u));
  if (spatne) { ukazChybu(id, 'Neplatné jméno účtu: „' + spatne + '“ – jen písmena bez diakritiky, číslice, tečka a podtržítko (nejvýš 30 znaků).'); return; }
  const nova = s.ucty.slice();
  casti.map((u) => u.toLowerCase()).forEach((u) => { if (nova.indexOf(u) < 0) nova.push(u); });
  if (nova.length === s.ucty.length) { ukazChybu(id, casti.length > 1 ? 'Všichni už ve skupině jsou.' : '@' + casti[0].toLowerCase() + ' už ve skupině je.'); pole.value = ''; return; }
  if (nova.length > MAX_VE_SKUPINE) { ukazChybu(id, 'Ve skupině může být nejvýš ' + MAX_VE_SKUPINE + ' účtů (teď ' + s.ucty.length + ').'); return; }
  ukazChybu(id, '');
  pole.value = '';
  ulozCleny(s, nova);
}

function odeber(id, ucet) {
  const s = najdi(id);
  if (!s) return;
  ulozCleny(s, s.ucty.filter((u) => u !== ucet));
}

function ulozCleny(s, ucty) {
  mistne(seznam().map((x) => (x.id === s.id ? Object.assign({}, x, { ucty }) : x)));
  obnovSkupinu(s.id);
  zmeneno();
  zapis('igSkupinaUlozit', { id: s.id, ucty }).catch((e) => { ukazChybu(s.id, e.message); zpetZMotoru(); });
}

async function prejmenuj(id) {
  const s = najdi(id);
  if (!s) return;
  const nazev = await okno({ ikona: IKONY.lide, nadpis: 'Přejmenovat skupinu', text: lidi(s.ucty.length) + ' ve skupině – zůstanou.',
    pole: { popisek: 'Název', hodnota: s.nazev, placeholder: 'třeba Dorost hráči' }, ano: 'Uložit' });
  if (!nazev || nazev === s.nazev) return;
  zapis('igSkupinaUlozit', { id, nazev }).then(() => toast('Přejmenováno na „' + nazev + '“')).catch((e) => { ukazChybu(id, e.message); toast(e.message, true); });
}

/** Smazat hned (bez dotazu) s Vrátit v oznámení – Vrátit uloží celou skupinu zpět se stejným id. */
function smaz(id) {
  const s = najdi(id);
  if (!s) return;
  const zaloha = JSON.parse(JSON.stringify(s));
  mistne(seznam().filter((x) => x.id !== id));
  delete chyby[id];
  obnovVse();
  zmeneno();
  zapis('igSkupinaSmazat', { id })
    .then(() => toastAkce('Skupina „' + zaloha.nazev + '“ smazaná', 'Vrátit', () => {
      zapis('igSkupinaUlozit', zaloha).then(() => toast('Skupina „' + zaloha.nazev + '“ je zpět')).catch((e) => toast(e.message, true));
    }))
    .catch((e) => { toast(e.message, true); zpetZMotoru(); });
}

// ---------------------------------------------------------------- ovládání (klepnutí z reely.klikReely, Enter v polích)

export function klikSkupiny(el) {
  if (el.dataset.igSkupina) { prepniSkupinu(el); return true; }
  if (el.hasAttribute('data-ig-skupiny-sprava')) { otevriSpravu(); return true; }
  if (el.hasAttribute('data-ig-sk-zalozit')) {
    const pole = el.closest('[data-ig-sprava]') && el.closest('[data-ig-sprava]').querySelector('[data-ig-sk-novy]');
    if (pole) zaloz(pole);
    return true;
  }
  if (el.dataset.igSkPridatBtn) {
    const pole = el.closest('[data-ig-sk]') && el.closest('[data-ig-sk]').querySelector('[data-ig-sk-pridat]');
    if (pole) pridej(pole);
    return true;
  }
  if (el.dataset.igSkOdebrat) { const sk = el.closest('[data-ig-sk]'); if (sk) odeber(sk.dataset.igSk, el.dataset.igSkOdebrat); return true; }
  if (el.dataset.igSkPrejmenovat) { prejmenuj(el.dataset.igSkPrejmenovat); return true; }
  if (el.dataset.igSkSmazat) { smaz(el.dataset.igSkSmazat); return true; }
  return false;
}

// Enter v poli přidání = Přidat (pole zůstane ve fokusu na další jméno), v poli nové skupiny = Vytvořit
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (!t || !t.matches) return;
  if (t.matches('[data-ig-sk-pridat]')) { e.preventDefault(); pridej(t); } else if (t.matches('[data-ig-sk-novy]')) { e.preventDefault(); zaloz(t); }
});
