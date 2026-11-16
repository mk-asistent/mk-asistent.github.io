// Tréninky (Michal 16. 11.: „chtěl bych si to v Asistentovi uložit a pak z toho dělat takovou vlastní studnici nápadů na tréninky“).
// Cviky z reelů (chat „Tréninky video“, zkratka Do tréninků): karty píše Claude do CLAUDE_SCHRANKA/TRENINKY/cviky, video, snímky
// a přepis jsou soukromé v TRENINKY/nahledy a do aplikace jdou jen v odpovědi motoru (stejně jako náhledy tipů v Knihovně).
// Seznam s filtrem podle zaměření a hledáním, okno cviku: video vlevo, popis, organizace, na co dávat pozor, varianty, moje hvězdy,
// oblíbené a poznámka. Video, snímky a karty zůstávají v zařízení (js/tipy_pamet.js) – podruhé se otevřou hned.
// Modul načte app.js až na stránce Tréninky; klepnutí a psaní si obsluhuje sám (atributy data-tr-…).

import { zmeneno } from './stav.js';
import { volej, jeDemo } from './api.js';
import { esc, uloziste, velkePrvni, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, kostra, chybaHtml, segment } from './ui.js';
import { otevriPanel, obnovPanel, jeOtevreny } from './panely.js';
import * as Pamet from './tipy_pamet.js';

const ULOZISTE = 'asistent.data.treninky';
const VOLBY = 'asistent.volby.treninky';
const OKNO = 'tr-cvik';
const OBNOVA_PO = 120000; // seznam z motoru znovu nejdřív po 2 min (z minula se ukáže hned)

const ulozeno = uloziste.cti(ULOZISTE);
const volby = uloziste.cti(VOLBY) || {};
const t = {
  data: (ulozeno && ulozeno.data) || null, kdy: (ulozeno && ulozeno.kdy) || 0, nacita: false, chyba: null,
  ikony: null, ikonyNacita: false,
  cviky: {},   // id → { data, nacita, chyba } – celá karta
  nahledy: {}, // id → { data, nacita, chyba, videoUrl, videoNacita, videoChyba, videoEl }
  filtr: volby.filtr || 'vse', dotaz: '', vybrany: null
};

const posledni = new WeakMap();
function nastav(el, html) {
  if (!el || posledni.get(el) === html) return;
  posledni.set(el, html);
  el.innerHTML = html;
}
const jpeg = (b) => 'data:image/jpeg;base64,' + b;
const bezZnacek = (s) => String(s || '').replace(/\*\*/g, '');
/** `**…**` → podbarvení (to nejdůležitější), stejně jako u tipů v Knihovně. */
const podbarvit = (html) => html.replace(/\*\*([^*\n]+?)\*\*/g, '<mark class="kn-dulezite">$1</mark>').replace(/\*\*/g, '');
const odstavce = (s) => String(s || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).map((x) => '<p>' + podbarvit(esc(x).replace(/\n/g, '<br>')) + '</p>').join('');
const bez = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------------------------------------------------------------- data

export function nactiTreninky(znovu) {
  if (t.nacita || (!znovu && t.data && Date.now() - t.kdy < OBNOVA_PO)) return;
  t.nacita = true;
  t.chyba = null;
  volej('treninky').then((d) => { prijmi(d); }, (e) => { t.chyba = e; })
    .then(() => {
      t.nacita = false;
      zmeneno();
      // motor čte nové karty po 25 (soubor z Disku ~1 s) – zbytek hned dalším dotazem
      if (t.data && t.data.neuplne && !t.chyba) setTimeout(() => nactiTreninky(true), 300);
    });
}

function prijmi(d) {
  t.data = d;
  t.kdy = Date.now();
  if (!jeDemo()) uloziste.pis(ULOZISTE, { data: d, kdy: t.kdy });
}

function nactiIkony() {
  if (t.ikony || t.ikonyNacita) return;
  t.ikonyNacita = true;
  Pamet.cti('tr-ikony').then((m) => { if (m && !t.ikony) { t.ikony = m; zmeneno(); } });
  volej('treninkyNahledy').then((r) => { t.ikony = (r && r.tipy) || {}; if (!jeDemo()) Pamet.pis('tr-ikony', t.ikony); }, () => { t.ikony = t.ikony || {}; })
    .then(() => { t.ikonyNacita = false; zmeneno(); });
}

/** Ze zařízení, jinak z motoru a uložit. */
async function zPametiNeboMotoru(klic, akce, data, vyber) {
  const z = await Pamet.cti(klic);
  if (z) return z;
  const r = vyber(await volej(akce, data));
  if (r && !jeDemo()) Pamet.pis(klic, r);
  return r;
}

function nactiCvik(id) {
  if (t.cviky[id]) return;
  const c = t.cviky[id] = { nacita: true };
  zPametiNeboMotoru('tr-cvik:' + id, 'treninkCvik', { id }, (r) => r && r.cvik)
    .then((d) => { c.data = d; }, (e) => { c.chyba = e; })
    .then(() => { c.nacita = false; prekresliOkno(id); });
  // karta se mohla změnit (Claude ji opravil) – po otevření z paměti se potichu dotáhne čerstvá
  Pamet.cti('tr-cvik:' + id).then((z) => {
    if (!z) return;
    volej('treninkCvik', { id }).then((r) => {
      if (r && r.cvik && JSON.stringify(r.cvik) !== JSON.stringify(z)) { c.data = r.cvik; Pamet.pis('tr-cvik:' + id, r.cvik); prekresliOkno(id); }
    }, () => {});
  });
}

function nactiNahled(id) {
  if (t.nahledy[id]) return;
  const ind = t.ikony && t.ikony[id];
  if (t.ikony && !t.ikonyNacita && !ind) { t.nahledy[id] = { data: null }; return; } // náhled k cviku není
  const n = t.nahledy[id] = { nacita: true };
  if (ind && ind.video) nactiVideo(id); // video hned, ne až po snímcích
  zPametiNeboMotoru('tr-nahled:' + id, 'treninkNahled', { id }, (r) => r && r.nahled)
    .then((d) => { n.data = d; if (d && d.video) nactiVideo(id); }, (e) => { n.chyba = e; })
    .then(() => { n.nacita = false; prekresliOkno(id); });
}

function nactiVideo(id) {
  const n = t.nahledy[id];
  if (!n || (n.data && !n.data.video) || n.videoUrl || n.videoNacita) return;
  n.videoNacita = true;
  n.videoChyba = false;
  (async () => {
    let v = await Pamet.cti('tr-video:' + id);
    if (!v) {
      const r = await volej('treninkVideo', { id });
      v = { typ: r.typ || 'video/mp4', bajty: await Pamet.zBase64(r.data) };
      if (!jeDemo()) Pamet.pis('tr-video:' + id, v);
    }
    // nejvýš 3 videa v paměti
    Object.keys(t.nahledy).filter((x) => x !== id && t.nahledy[x].videoUrl && x !== t.vybrany).slice(0, -2).forEach((x) => {
      URL.revokeObjectURL(t.nahledy[x].videoUrl);
      delete t.nahledy[x].videoUrl;
      delete t.nahledy[x].videoEl;
    });
    n.videoUrl = URL.createObjectURL(new Blob([v.bajty], { type: v.typ }));
  })().catch(() => { n.videoChyba = true; }).then(() => { n.videoNacita = false; prekresliOkno(id); });
}

function moje(id) { return (t.data && t.data.moje && t.data.moje.polozky && t.data.moje.polozky[id]) || {}; }

/** Hvězdy, oblíbené, poznámka: hned v aplikaci, pak do motoru (chyba = zpět a oznámení). */
function zmenMoje(id, zmena) {
  if (!t.data) return;
  const puv = JSON.parse(JSON.stringify(t.data.moje || { polozky: {} }));
  const o = Object.assign({}, moje(id), zmena);
  if (!o.hvezdy) delete o.hvezdy;
  if (!o.oblibene) delete o.oblibene;
  if (!o.poznamka) delete o.poznamka;
  t.data.moje = t.data.moje || { polozky: {} };
  t.data.moje.polozky[id] = o;
  zmeneno();
  aktualizujMojeVOkne(id);
  volej('treninkMoje', Object.assign({ id }, zmena)).then((d) => {
    if (d && d.moje && t.data) { t.data.moje = d.moje; if (!jeDemo()) uloziste.pis(ULOZISTE, { data: t.data, kdy: t.kdy }); zmeneno(); }
  }, (e) => {
    t.data.moje = puv;
    zmeneno();
    aktualizujMojeVOkne(id);
    toast('Neuložilo se: ' + ((e && e.message) || 'chyba'), true);
  });
}

// ---------------------------------------------------------------- seznam

function cviky() { return (t.data && t.data.cviky) || []; }

function vybrane() {
  const q = bez(t.dotaz).split(/\s+/).filter(Boolean);
  return cviky().filter((c) => {
    if (t.filtr === 'oblibene' && !moje(c.id).oblibene) return false;
    if (t.filtr !== 'vse' && t.filtr !== 'oblibene' && (c.zamereni || []).indexOf(t.filtr) < 0) return false;
    if (!q.length) return true;
    const text = bez([c.nazev, c.kratce, (c.zamereni || []).join(' '), c.forma, (c.kategorie || []).join(' '), c.autor].join(' '));
    return q.every((s) => text.indexOf(s) >= 0);
  });
}

function filtryHtml() {
  const vse = cviky();
  if (!vse.length) return '';
  const pocty = {};
  vse.forEach((c) => (c.zamereni || []).forEach((z) => { pocty[z] = (pocty[z] || 0) + 1; }));
  const obl = vse.filter((c) => moje(c.id).oblibene).length;
  const volbyF = [['vse', 'Vše', vse.length]].concat(obl ? [['oblibene', '★ Oblíbené', obl]] : [])
    .concat(Object.keys(pocty).sort((a, b) => pocty[b] - pocty[a] || a.localeCompare(b, 'cs')).map((z) => [z, velkePrvni(z), pocty[z]]));
  return segment(volbyF, t.filtr, 'data-tr-filtr', 'Zaměření');
}

function kartaHtml(c) {
  const ind = t.ikony && t.ikony[c.id];
  const m = moje(c.id);
  const meta = [c.hraci ? c.hraci + ' hráčů' : '', c.delka].filter(Boolean).join(' · ');
  return '<li><button type="button" class="tr-karta" data-tr-otevri="' + esc(c.id) + '">' +
    '<span class="tr-karta__obr">' + (ind && ind.ikona ? '<img src="' + jpeg(ind.ikona) + '" alt="" loading="lazy">' : '<i>' + IKONY.treninky + '</i>') +
      (ind && ind.video ? '<em class="tr-karta__video">' + IKONY.prehrat + '</em>' : '') + '</span>' +
    '<span class="tr-karta__telo">' +
      ((c.zamereni || []).length ? '<span class="tr-karta__stitky">' + c.zamereni.slice(0, 2).map((z) => '<span class="tag tag--seda">' + esc(z) + '</span>').join('') + '</span>' : '') +
      '<b>' + esc(c.nazev) + '</b>' +
      (c.kratce ? '<small>' + esc(bezZnacek(c.kratce)) + '</small>' : '') +
      '<span class="tr-karta__meta">' + (meta ? '<span>' + esc(meta) + '</span>' : '') +
        (m.hvezdy ? '<span class="tr-karta__hvezdy" aria-label="' + m.hvezdy + ' z 5">' + '★'.repeat(m.hvezdy) + '</span>' : '') +
        (m.oblibene ? '<span class="tr-karta__obl" aria-label="Oblíbený">♥</span>' : '') + '</span>' +
    '</span></button></li>';
}

function obsahHtml() {
  if (!t.data) {
    if (t.chyba) return '<section class="card">' + chybaHtml(t.chyba, 'data-tr-znovu') + '</section>';
    return '<section class="card">' + kostra(6) + '</section>';
  }
  if (!cviky().length) {
    return '<div class="prazdne prazdne--velke"><i class="kruh">' + IKONY.treninky + '</i><b>Zatím tu nejsou žádné cviky</b>' +
      '<span>Claude je připravuje z reelů v chatu „Tréninky video“. Další cvik pošli z Instagramu přes Sdílet → Do tréninků.</span></div>';
  }
  const s = vybrane();
  if (!s.length) return '<div class="prazdne"><b>Nic neodpovídá</b><span>Zkus jiné zaměření nebo hledání.</span></div>';
  return '<ul class="tr-mrizka">' + s.map(kartaHtml).join('') + '</ul>';
}

export function vykresliTreninky(el) {
  nactiTreninky(false);
  nactiIkony();
  if (!el.querySelector('#tr-obsah')) {
    posledni.delete(el);
    el.innerHTML = '<div class="tr-lista"><label class="kn-hledat tr-hledat">' + IKONY.hledat +
      '<input type="search" id="tr-hledat" data-tr-hledat placeholder="Hledat cvik…" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Hledat cvik"></label>' +
      '<div class="tr-filtry" id="tr-filtry"></div></div><div id="tr-obsah"></div>';
    el.querySelector('#tr-hledat').value = t.dotaz;
  }
  nastav(el.querySelector('#tr-filtry'), filtryHtml());
  nastav(el.querySelector('#tr-obsah'), obsahHtml());
}

export function podnadpis() {
  const n = cviky().length;
  if (!t.data) return t.chyba ? 'Tréninky se nenačetly' : 'Studnice cviků z reelů';
  const obl = cviky().filter((c) => moje(c.id).oblibene).length;
  return n + ' ' + tvar(n, 'cvik', 'cviky', 'cviků') + (obl ? ' · ' + obl + ' ' + tvar(obl, 'oblíbený', 'oblíbené', 'oblíbených') : '') + ' · z reelů a metodiky';
}

// ---------------------------------------------------------------- okno cviku

function hvezdyHtml(id) {
  const m = moje(id);
  return '<div class="kn-hvezdy tr-hvezdy" role="group" aria-label="Moje hodnocení">' + [1, 2, 3, 4, 5].map((i) => '<button type="button" class="kn-hvezda' +
    (m.hvezdy >= i ? ' plna' : '') + '" data-tr-hvezdy="' + i + '" aria-pressed="' + (m.hvezdy === i) + '" aria-label="' + i + ' z 5">' + IKONY.hvezda + '</button>').join('') + '</div>';
}

function mediaHtml(id) {
  const n = t.nahledy[id];
  const ind = t.ikony && t.ikony[id];
  const d = n && n.data;
  const plakat = (d && (d.snimky || [])[0]) || (d && d.miniatura) || (ind && ind.ikona);
  if (n && n.videoUrl && !n.videoChyba) return '<div class="tr-video" data-tr-video></div>';
  if ((!n || n.nacita || n.videoNacita) && (ind ? ind.video : true) && !(n && n.videoChyba) && !(d && !d.video)) {
    return '<div class="kn-tip__ceka">' + (plakat ? '<img src="' + jpeg(plakat) + '" alt="">' : '') + '<span>' + IKONY.prehrat + 'Načítám video…</span></div>';
  }
  if (d && (d.snimky || []).length) {
    return '<div class="kn-tip__snimky">' + d.snimky.map((b, i) => '<img src="' + jpeg(b) + '" alt="Snímek ' + (i + 1) + ' z videa">').join('') + '</div>' +
      (n.videoChyba ? '<p class="kn-tip__pozn">Video se nepodařilo načíst, proto jsou tu snímky. <button type="button" class="odkaz" data-tr-video-znovu>Zkusit znovu</button></p>' : '');
  }
  if (plakat) return '<div class="kn-tip__snimky kn-tip__snimky--jeden"><img src="' + jpeg(plakat) + '" alt="Náhled"></div>';
  return '<div class="tr-video tr-video--nic"><i>' + IKONY.treninky + '</i><span>Video k cviku není – odkaz na originál je vpravo.</span></div>';
}

function detailHtml() {
  const id = t.vybrany;
  const idx = cviky().find((c) => c.id === id) || {};
  const c = (t.cviky[id] && t.cviky[id].data) || idx;
  const nacitaKartu = t.cviky[id] && t.cviky[id].nacita && !t.cviky[id].data;
  const n = t.nahledy[id];
  const m = moje(id);
  const stitky = (c.zamereni || []).map((z) => '<span class="tag tag--ok">' + esc(z) + '</span>').join('') +
    (c.forma ? '<span class="tag tag--seda">' + esc(c.forma) + '</span>' : '') +
    (c.kategorie || []).map((k) => '<span class="tag tag--seda">' + esc(k) + '</span>').join('');
  const fakta = [['Hráči', c.hraci], ['Prostor', c.prostor], ['Délka', c.delka], ['Intenzita', c.intenzita], ['Pomůcky', (c.pomucky || []).join(', ')]]
    .filter((f) => f[1]).map((f) => '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>').join('');
  const seznam = (nadpis, body) => ((body || []).length ? '<section class="tr-sekce"><h3>' + nadpis + '</h3><ul>' + body.map((b) => '<li>' + podbarvit(esc(b)) + '</li>').join('') + '</ul></section>' : '');
  const prepis = c.prepis || (n && n.data && n.data.prepis) || '';
  const text = n && n.data && n.data.text;
  return '<div class="tr-detail">' +
    '<div class="tr-detail__media">' + mediaHtml(id) +
      (c.odkaz || (n && n.data && n.data.odkaz) ? '<a class="tr-original" href="' + esc(c.odkaz || n.data.odkaz) + '" target="_blank" rel="noopener">Originál na Instagramu' + IKONY.odkaz + '</a>' : '') +
      (c.autor ? '<small class="tr-autor">' + esc(c.autor) + '</small>' : '') + '</div>' +
    '<div class="tr-detail__text">' +
      (stitky ? '<div class="tr-stitky">' + stitky + '</div>' : '') +
      (c.kratce ? '<div class="tr-kratce">' + odstavce(c.kratce) + '</div>' : '') +
      (fakta ? '<dl class="tr-fakta">' + fakta + '</dl>' : '') +
      (nacitaKartu ? kostra(4) : '') +
      ((c.organizace || []).length ? '<section class="tr-sekce"><h3>Organizace a průběh</h3>' + c.organizace.map(odstavce).join('') + '</section>' : '') +
      seznam('Na co dávat pozor', c.body) + seznam('Varianty a ztížení', c.varianty) +
      '<section class="tr-sekce tr-moje"><h3>Moje</h3><div class="tr-moje__radek">' + hvezdyHtml(id) +
        '<button type="button" class="btn btn--sm ' + (m.oblibene ? 'btn--primary' : 'btn--ghost') + '" data-tr-oblibene aria-pressed="' + !!m.oblibene + '">' +
          (m.oblibene ? '♥ V oblíbených' : '♡ Do oblíbených') + '</button></div>' +
        '<textarea class="tr-poznamka" data-tr-poznamka rows="2" placeholder="Poznámka – kdy jsem to zkoušel, co upravit…">' + esc(m.poznamka || '') + '</textarea></section>' +
      (prepis ? '<details class="kn-tip__blok"><summary>Přepis – co je ve videu řečeno</summary><div class="kn-tip__prepis">' + odstavce(prepis) + '</div></details>' : '') +
      (text ? '<details class="kn-tip__blok"><summary>Text příspěvku</summary><div class="kn-tip__prepis">' + odstavce(text) + '</div></details>' : '') +
    '</div></div>';
}

function otevri(id) {
  t.vybrany = id;
  nactiCvik(id);
  nactiNahled(id);
  const n = t.nahledy[id];
  if (n && n.data && n.data.video && !n.videoChyba) nactiVideo(id);
  otevriPanel({
    id: OKNO, trida: 'panel-okno panel-reel tr-okno',
    titul: () => { const c = cviky().find((x) => x.id === t.vybrany); return c ? c.nazev : 'Cvik'; },
    vykresli: detailHtml,
    poVykresleni: pripojVideo,
    priZavreni: () => { t.vybrany = null; },
    zavritMimo: true
  });
}

/** Video je jeden prvek po celou dobu otevření – překreslení okna (karta dorazila, hvězdy) ho jen přesune, nevytvoří znovu. */
function pripojVideo(el) {
  const misto = el.querySelector('[data-tr-video]');
  const n = t.nahledy[t.vybrany];
  if (!misto || !n || !n.videoUrl) return;
  if (!n.videoEl) {
    const v = document.createElement('video');
    v.className = 'kn-tip__video';
    v.controls = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.src = n.videoUrl;
    v.addEventListener('error', () => { n.videoChyba = true; Pamet.smaz('tr-video:' + t.vybrany); prekresliOkno(t.vybrany); });
    n.videoEl = v;
  }
  misto.appendChild(n.videoEl);
}

function prekresliOkno(id) { if (t.vybrany === id && jeOtevreny(OKNO)) obnovPanel(OKNO); }

/** Hvězdy a oblíbené bez překreslení okna (rozehrané video běží dál). */
function aktualizujMojeVOkne(id) {
  if (t.vybrany !== id || !jeOtevreny(OKNO)) return;
  const el = document.querySelector('[data-panel="' + OKNO + '"]');
  if (!el) return;
  const m = moje(id);
  el.querySelectorAll('[data-tr-hvezdy]').forEach((b) => {
    const i = Number(b.dataset.trHvezdy);
    b.classList.toggle('plna', m.hvezdy >= i);
    b.setAttribute('aria-pressed', String(m.hvezdy === i));
  });
  const o = el.querySelector('[data-tr-oblibene]');
  if (o) {
    o.className = 'btn btn--sm ' + (m.oblibene ? 'btn--primary' : 'btn--ghost');
    o.setAttribute('aria-pressed', String(!!m.oblibene));
    o.textContent = m.oblibene ? '♥ V oblíbených' : '♡ Do oblíbených';
  }
}

// ---------------------------------------------------------------- události

document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('[data-tr-otevri], [data-tr-filtr], [data-tr-znovu], [data-tr-hvezdy], [data-tr-oblibene], [data-tr-video-znovu]');
  if (!el) return;
  if (el.dataset.trOtevri) { otevri(el.dataset.trOtevri); return; }
  if (el.dataset.trFiltr) {
    t.filtr = el.dataset.trFiltr === t.filtr && t.filtr !== 'vse' ? 'vse' : el.dataset.trFiltr;
    uloziste.pis(VOLBY, { filtr: t.filtr });
    zmeneno();
    return;
  }
  if (el.hasAttribute('data-tr-znovu')) { nactiTreninky(true); zmeneno(); return; }
  const id = t.vybrany;
  if (!id) return;
  if (el.dataset.trHvezdy) { const i = Number(el.dataset.trHvezdy); zmenMoje(id, { hvezdy: moje(id).hvezdy === i ? 0 : i }); return; }
  if (el.hasAttribute('data-tr-oblibene')) { zmenMoje(id, { oblibene: !moje(id).oblibene }); return; }
  if (el.hasAttribute('data-tr-video-znovu')) {
    const n = t.nahledy[id];
    if (n) { n.videoChyba = false; delete n.videoEl; }
    nactiVideo(id);
    prekresliOkno(id);
  }
});

document.addEventListener('input', (e) => {
  if (!e.target.matches || !e.target.matches('[data-tr-hledat]')) return;
  t.dotaz = e.target.value;
  zmeneno();
});

// poznámka se uloží po opuštění pole (ne při každém písmenu)
document.addEventListener('change', (e) => {
  if (!e.target.matches || !e.target.matches('[data-tr-poznamka]') || !t.vybrany) return;
  const text = e.target.value.trim();
  if (text !== (moje(t.vybrany).poznamka || '')) zmenMoje(t.vybrany, { poznamka: text });
});
