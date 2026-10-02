// Pošta: jedna schránka pro oba účty (osobní Gmail + pracovní), čtení celých e-mailů, odpověď, přeposlání,
// nový e-mail, archiv. Na telefonu se e-mail otevře přes celou obrazovku, na iPadu a PC vedle seznamu.

import { stav, zmeneno } from './stav.js';
import { volej } from './api.js';
import {
  esc, kdyKratce, kdyDlouze, prvniRadek, iniciala, odstin, sOdkazy, velikost, jmenaAdres, uloziste
} from './pomocne.js';
import { otevriPanel, obnovPanel, zavriPanel, jeOtevreny, elementPanelu } from './panely.js';
import { toast, kostra, chybaHtml, segment, prizpusobVysku } from './ui.js';
import { IKONY } from './ikony.js';

const DVA_SLOUPCE = window.matchMedia('(min-width: 1000px)');
const ULOZISTE = 'asistent.data.posta';
const KONCEPT = 'asistent.koncept.';
let posledniDetail = '';

// ---------------------------------------------------------------- data

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.posta = v.data;
}

export function nactiPostu(znovu) {
  if (stav.nacita.posta) return;
  stav.nacita.posta = true;
  stav.chyby.posta = null;
  zmeneno();
  return volej('posta', { znovu: !!znovu })
    .then((data) => {
      stav.posta = data;
      uloziste.pis(ULOZISTE, { data, kdy: Date.now() });
    })
    .catch((e) => { stav.chyby.posta = e; })
    .then(() => { stav.nacita.posta = false; zmeneno(); });
}

/** Všechny zprávy obou účtů (+ souhrny firemní pošty z PC), nejnovější nahoře. */
export function vsechnyZpravy() {
  const p = stav.posta;
  if (!p) return [];
  const pc = p.firemni && p.firemni.zpravy && !(p.pracovni && p.pracovni.length)
    ? p.firemni.zpravy.map((m) => Object.assign({}, m, { id: 'pc-' + m.id, ucet: 'pracovni', zPc: true }))
    : [];
  return (p.osobni || []).map((m) => Object.assign({ ucet: 'osobni' }, m))
    .concat((p.pracovni || []).map((m) => Object.assign({ ucet: 'pracovni' }, m)), pc)
    .sort((a, b) => b.kdy - a.kdy);
}

export function neprectene() { return vsechnyZpravy().filter((m) => m.neprectena); }
export function maPracovni() { return !!(stav.posta && (stav.posta.pracovniAdresa || (stav.posta.firemni && stav.posta.firemni.zpravy))); }

/** Změna přímo v uložených seznamech (vsechnyZpravy vrací kopie). */
function upravVSeznamech(id, fn) {
  if (!stav.posta) return;
  ['osobni', 'pracovni'].forEach((ucet) => (stav.posta[ucet] || []).forEach((m, i, seznam) => { if (m.id === id) fn(m, i, seznam); }));
}

// ---------------------------------------------------------------- seznam

export function zpravaRadekHtml(m, ukazUcet) {
  const aktivni = DVA_SLOUPCE.matches && stav.pohled === 'posta' && stav.otevreneVlakno === m.id ? ' aktivni' : '';
  const stitek = ukazUcet ? '<span class="ucet ucet-' + m.ucet + '">' + (m.ucet === 'pracovni' ? 'Pracovní' : 'Osobní') + '</span>' : '';
  return '<li class="' + (m.neprectena ? 'neprect' : 'prect') + aktivni + '"><button type="button" class="radek radek-posta" data-vlakno="' + esc(m.id) + '">' +
    '<span class="avatar" style="--h:' + odstin(m.od) + '" aria-hidden="true">' + esc(iniciala(m.od)) + '</span>' +
    '<span class="radek-obsah">' +
      '<span class="radek-hora">' + (m.neprectena ? '<span class="tecka" aria-label="nepřečtené"></span>' : '') +
        '<span class="radek-titul orez-1">' + esc(m.od) + '</span><span class="radek-cas cisla">' + esc(kdyKratce(m.kdy)) + '</span></span>' +
      '<span class="radek-predmet orez-1">' + esc(m.predmet) + (m.pocet > 1 ? ' <span class="pocet">' + m.pocet + '</span>' : '') + '</span>' +
      '<span class="radek-pod orez-2">' + stitek + esc(m.ukazka || '') + '</span>' +
    '</span></button></li>';
}

function seznamHtml() {
  // filtry (Vše / Nepřečtené / Osobní / Pracovní) jsou v záložkách hlavičky, na širokém okně v postranním panelu
  const filtr = stav.filtrPosty;
  let h = '';
  if (!stav.posta) return h + '<div class="card">' + (stav.chyby.posta ? chybaHtml(stav.chyby.posta, 'data-posta-znovu') : kostra(6)) + '</div>';
  if (filtr === 'pracovni' && !maPracovni()) {
    return h + '<div class="card"><div class="prazdne">Pracovní pošta zatím není připojená. ' +
      '<button type="button" class="odkaz" data-otevri-nastaveni="posta">Nastavení pošty</button></div></div>';
  }
  let zpravy = vsechnyZpravy();
  if (filtr === 'osobni') zpravy = zpravy.filter((m) => m.ucet === 'osobni');
  else if (filtr === 'pracovni') zpravy = zpravy.filter((m) => m.ucet === 'pracovni');
  else if (filtr === 'neprectene') zpravy = zpravy.filter((m) => m.neprectena);
  if (stav.chyby.posta) h += '<p class="pruh pruh-varovani">' + esc(stav.chyby.posta.message) + ' Ukazuju naposledy načtené.</p>';
  if (!zpravy.length) {
    return h + '<div class="card"><div class="prazdne">' + (filtr === 'neprectene' ? 'Všechno přečteno.' : 'Za poslední dva týdny nic.') + '</div></div>';
  }
  return h + '<div class="card"><ul class="seznam seznam-posta">' + zpravy.map((m) => zpravaRadekHtml(m, maPracovni() && filtr !== 'osobni' && filtr !== 'pracovni')).join('') + '</ul></div>';
}

/** Pohled Pošta: kostra (seznam | detail) se vytvoří jednou, detail se překresluje jen při změně vlákna. */
export function vykresliPostu(el) {
  if (!el.querySelector('.posta-rozlozeni')) {
    el.innerHTML = '<div class="posta-rozlozeni"><div class="posta-seznam" id="posta-seznam"></div>' +
      '<div class="posta-detail" id="posta-detail"></div></div>';
    posledniDetail = '';
  }
  el.querySelector('#posta-seznam').innerHTML = seznamHtml();
  if (DVA_SLOUPCE.matches) vykresliDetail();
}

function klicDetailu() {
  const id = stav.otevreneVlakno;
  const st = id && stav.vlakna[id];
  return id ? id + ':' + (st ? (st.nacita ? 'n' : '') + (st.chyba ? 'e' : '') + (st.verze || 0) : '-') + ':' + JSON.stringify(stav.rozbaleneZpravy) : '';
}

function vykresliDetail(vynutit) {
  const el = document.getElementById('posta-detail');
  if (!el) return;
  const klic = klicDetailu();
  if (!vynutit && klic === posledniDetail) return;
  posledniDetail = klic;
  const id = stav.otevreneVlakno;
  if (!id) {
    el.innerHTML = '<div class="posta-prazdny">' + IKONY.posta + '<p>Vyber zprávu vlevo.</p></div>';
    return;
  }
  el.innerHTML = '<div class="detail-lista">' + akceHlavickyHtml(id) + '</div><div class="detail-telo">' + vlaknoHtml(id) + '</div>' +
    '<div class="detail-paticka">' + akceVlaknaHtml(id) + '</div>';
  pripravTelaZprav(el);
}

// ---------------------------------------------------------------- vlákno

export function otevriVlakno(id) {
  const m = vsechnyZpravy().find((x) => x.id === id);
  if (m && m.zPc) { if (m.odkaz && m.odkaz !== '#') window.open(m.odkaz, '_blank', 'noopener'); return; }
  stav.otevreneVlakno = id;
  stav.rozbaleneZpravy = {};
  if (m && m.neprectena) upravVSeznamech(id, (x) => { x.neprectena = false; });
  if (!DVA_SLOUPCE.matches) {
    otevriPanel({
      id: 'vlakno', trida: 'panel-bocni panel-vlakno', titul: '',
      vpravo: () => akceHlavickyHtml(stav.otevreneVlakno),
      vykresli: () => vlaknoHtml(stav.otevreneVlakno),
      paticka: () => akceVlaknaHtml(stav.otevreneVlakno),
      poVykresleni: pripravTelaZprav,
      priZavreni: () => { stav.otevreneVlakno = null; }
    });
  }
  nactiVlakno(id);
  zmeneno();
}

function nactiVlakno(id, znovu) {
  const st = stav.vlakna[id];
  if (st && st.data && !znovu) { obnovDetail(id); return; }
  stav.vlakna[id] = Object.assign({}, st, { nacita: true, chyba: null });
  obnovDetail(id);
  volej('vlakno', { id })
    .then((data) => { stav.vlakna[id] = { data, verze: Date.now() }; })
    .catch((e) => { stav.vlakna[id] = Object.assign({}, stav.vlakna[id], { nacita: false, chyba: e }); })
    .then(() => obnovDetail(id));
}

function obnovDetail(id) {
  if (stav.otevreneVlakno !== id) return;
  if (DVA_SLOUPCE.matches) vykresliDetail(true);
  else if (jeOtevreny('vlakno')) obnovPanel('vlakno');
}

function vlaknoHtml(id) {
  const st = stav.vlakna[id] || {};
  const souhrn = vsechnyZpravy().find((m) => m.id === id);
  const d = st.data;
  const predmet = (d && d.predmet) || (souhrn && souhrn.predmet) || '';
  const ucet = (d && d.ucet) || (souhrn && souhrn.ucet);
  let h = '<div class="vlakno"><h1 class="vlakno-predmet">' + esc(predmet) + '</h1>';
  if (maPracovni() && ucet) h += '<span class="ucet ucet-' + ucet + '">' + (ucet === 'pracovni' ? 'Pracovní' : 'Osobní') + '</span>';
  if (d) {
    if (d.skryto) h += '<p class="vlakno-skryto">Starších zpráv: ' + d.skryto + ' – jsou v Gmailu.</p>';
    h += d.zpravy.map((z, i) => zpravaHtml(z, i === d.zpravy.length - 1 || !!stav.rozbaleneZpravy[z.id])).join('');
  } else if (st.chyba) {
    h += '<div class="card">' + chybaHtml(st.chyba, 'data-vlakno-znovu="' + esc(id) + '"') + '</div>';
  } else {
    h += '<div class="card">' + kostra(5) + '</div>';
  }
  return h + '</div>';
}

function zpravaHtml(z, rozbalena) {
  const kdo = z.odeMe ? 'Já' : z.od;
  const hlava = '<button type="button" class="zprava-hlava" data-rozbal-zpravu="' + esc(z.id) + '" aria-expanded="' + rozbalena + '">' +
    '<span class="avatar maly" style="--h:' + odstin(z.od) + '" aria-hidden="true">' + esc(iniciala(z.od)) + '</span>' +
    '<span class="zprava-kdo"><b>' + esc(kdo) + '</b><small class="orez-1">' +
      (rozbalena ? 'komu: ' + esc(jmenaAdres(z.komu)) + (z.kopie ? ' · kopie: ' + esc(jmenaAdres(z.kopie)) : '') : esc(prvniRadek(z.text, 120))) +
    '</small></span><span class="zprava-cas cisla">' + esc(kdyDlouze(z.kdy)) + '</span></button>';
  if (!rozbalena) return '<article class="zprava sbalena">' + hlava + '</article>';
  // obrázky z webu až na klepnutí – načtení by odesílateli prozradilo otevření i adresu (Gmail je proxuje, my ne)
  const skryteObrazky = z.html && maVzdaleneObrazky(z.html) && !stav.obrazky[z.id];
  const telo = z.html
    ? (skryteObrazky ? '<div class="zprava-obrazky">' + IKONY.obrazek + '<span>Obrázky z webu jsou skryté.</span>' +
        '<button type="button" class="odkaz" data-obrazky="' + esc(z.id) + '">Zobrazit</button></div>' : '') +
      '<div class="zprava-html"><iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" data-html-zpravy="' + esc(z.id) + '" title="Text e-mailu"></iframe></div>'
    : '<div class="zprava-text">' + sOdkazy(z.text || '') + '</div>';
  const prilohy = z.prilohy && z.prilohy.length
    ? '<ul class="prilohy">' + z.prilohy.map((p) => '<li>' + IKONY.priloha + '<span class="orez-1">' + esc(p.nazev) + '</span><small>' + esc(velikost(p.velikost)) + '</small></li>').join('') + '</ul>'
    : '';
  return '<article class="zprava">' + hlava + telo + prilohy + '</article>';
}

function akceHlavickyHtml(id) {
  const st = stav.vlakna[id];
  const odkaz = st && st.data ? st.data.odkaz : (vsechnyZpravy().find((m) => m.id === id) || {}).odkaz;
  return '<button type="button" class="btn btn--ikona" data-oznacit="archivovat" aria-label="Archivovat" title="Archivovat">' + IKONY.archiv + '</button>' +
    '<button type="button" class="btn btn--ikona" data-oznacit="neprectene" aria-label="Označit jako nepřečtené" title="Označit jako nepřečtené">' + IKONY.neprectene + '</button>' +
    (odkaz && odkaz !== '#' ? '<a class="btn btn--ikona" href="' + esc(odkaz) + '" target="_blank" rel="noopener" aria-label="Otevřít v Gmailu" title="Otevřít v Gmailu">' + IKONY.ven + '</a>' : '');
}

function akceVlaknaHtml() {
  return '<div class="vlakno-akce">' +
    '<button type="button" class="btn btn--primary" data-psat="odpoved">' + IKONY.odpovedet + '<span>Odpovědět</span></button>' +
    '<button type="button" class="btn btn--ghost" data-psat="vsem">' + IKONY.vsem + '<span>Všem</span></button>' +
    '<button type="button" class="btn btn--ghost" data-psat="preposlat">' + IKONY.preposlat + '<span>Přeposlat</span></button></div>';
}

function maVzdaleneObrazky(html) {
  return /<img[^>]+src\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i.test(html);
}

/** Tělo HTML e-mailu: bezpečný rámec (bez skriptů), přizpůsobení šířce displeje a výšce obsahu. */
function pripravTelaZprav(koren) {
  const st = stav.vlakna[stav.otevreneVlakno];
  if (!st || !st.data) return;
  koren.querySelectorAll('iframe[data-html-zpravy]').forEach((ramec) => {
    const z = st.data.zpravy.find((x) => x.id === ramec.dataset.htmlZpravy);
    if (!z) return;
    ramec.addEventListener('load', () => prizpusobRamec(ramec), { once: true });
    // druhá, přísnější pravidla uvnitř rámce: dokud Michal neklepne „Zobrazit“, žádné obrázky ani písma z webu
    const zakazObrazku = stav.obrazky[z.id] ? '' :
      '<meta http-equiv="Content-Security-Policy" content="img-src data: cid:; media-src \'none\'; font-src data:">';
    ramec.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank">' + zakazObrazku +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<style>html,body{margin:0;padding:0;background:#fff;color:#1d1d1f;overflow:hidden}' +
      'body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:4px 2px 10px;overflow-wrap:anywhere}' +
      'img{max-width:100%;height:auto}a{color:#2f5bd3}pre{white-space:pre-wrap}' +
      'blockquote{margin:0 0 0 .4em;padding-left:.8em;border-left:3px solid #d9d9de;color:#555}</style></head><body>' +
      z.html + '</body></html>';
  });
}

function prizpusobRamec(ramec) {
  const doc = ramec.contentDocument;
  if (!doc || !doc.body) return;
  const prepocitej = () => {
    doc.body.style.transform = '';
    doc.body.style.width = '';
    const sirka = ramec.clientWidth;
    const obsah = doc.documentElement.scrollWidth;
    let meritko = 1;
    if (obsah > sirka + 2) { // široké e-maily (600 px) zmenšit na šířku displeje
      meritko = sirka / obsah;
      doc.body.style.width = obsah + 'px';
      doc.body.style.transformOrigin = '0 0';
      doc.body.style.transform = 'scale(' + meritko + ')';
    }
    ramec.style.height = Math.ceil(doc.documentElement.scrollHeight * meritko) + 'px';
  };
  prepocitej();
  Array.from(doc.images).forEach((img) => { if (!img.complete) img.addEventListener('load', prepocitej, { once: true }); });
}

// ---------------------------------------------------------------- psaní

function posledniCizi(d) {
  for (let i = d.zpravy.length - 1; i >= 0; i--) if (!d.zpravy[i].odeMe) return d.zpravy[i];
  return d.zpravy[d.zpravy.length - 1];
}

function bezPredpony(s) { return String(s || '').replace(/^\s*((re|fw|fwd|odp|vs|tr)\s*:\s*)+/i, ''); }

export function otevriPsani(rezim) {
  const id = stav.otevreneVlakno;
  const d = id && stav.vlakna[id] && stav.vlakna[id].data;
  if (rezim !== 'novy' && !d) { toast('Počkej, až se zpráva načte.'); return; }
  const cil = d ? posledniCizi(d) : null;
  const info = (stav.info && stav.info.posta) || {};
  const ucet = d ? (d.ucet || 'osobni') : (stav.filtrPosty === 'pracovni' && info.pracovniAdresa ? 'pracovni' : 'osobni');
  const klic = KONCEPT + rezim + '.' + (cil ? cil.id : 'novy');
  const koncept = uloziste.cti(klic) || {};
  let komu = '';
  if (rezim === 'odpoved') komu = cil.od + ' <' + cil.odAdresa + '>';
  if (rezim === 'vsem') {
    const ja = [info.osobniAdresa, info.pracovniAdresa].filter(Boolean).map((a) => a.toLowerCase());
    komu = [cil.od + ' <' + cil.odAdresa + '>'].concat(String(cil.komu || '').split(','), String(cil.kopie || '').split(','))
      .map((a) => a.trim()).filter((a) => a && !ja.some((x) => a.toLowerCase().indexOf(x) >= 0)).join(', ');
  }
  stav.psani = { rezim, ucet, zpravaId: cil ? cil.id : null, vlaknoId: id || null, klic, komu,
    predmet: rezim === 'novy' ? '' : (rezim === 'preposlat' ? 'Fwd: ' : 'Re: ') + bezPredpony(d.predmet), citace: cil ? cil.text : '' };
  otevriPanel({
    id: 'psani', trida: 'panel-okno panel-psani',
    titul: { odpoved: 'Odpověď', vsem: 'Odpověď všem', preposlat: 'Přeposlat', novy: 'Nový e-mail' }[rezim],
    vpravo: () => '<button type="button" class="btn btn--primary" data-odeslat>' + IKONY.odeslat + '<span>Odeslat</span></button>',
    vykresli: () => psaniHtml(koncept),
    poOtevreni: (el) => {
      const pole = el.querySelector(rezim === 'novy' || rezim === 'preposlat' ? '[data-psani-komu]' : '[data-psani-text]');
      const text = el.querySelector('[data-psani-text]');
      if (text) prizpusobVysku(text);
      if (pole && !pole.value) pole.focus(); else if (text) text.focus();
    },
    priZavreni: () => { stav.psani = null; }
  });
}

function psaniHtml(koncept) {
  const p = stav.psani;
  const info = (stav.info && stav.info.posta) || {};
  const adresaOd = p.ucet === 'pracovni' ? info.pracovniAdresa : info.osobniAdresa;
  let h = '<div class="psani">';
  if (p.rezim === 'novy' && info.pracovniAdresa) {
    h += '<div class="psani-radek"><span class="psani-popisek">Od</span>' +
      segment([['osobni', 'Osobní'], ['pracovni', 'Pracovní']], p.ucet, 'data-psani-ucet', 'Z kterého účtu') + '</div>';
  } else if (adresaOd) {
    h += '<div class="psani-radek"><span class="psani-popisek">Od</span><span class="psani-hodnota">' + esc(adresaOd) + '</span></div>';
  }
  if (p.ucet === 'pracovni' && info.pracovniAdresa && info.lzeOdesilatZPracovni === false) {
    h += '<p class="pruh pruh-varovani">Z pracovní adresy zatím odesílat nejde – v Gmailu chybí „Odesílat poštu jako“. Návod je v Nastavení → Pošta.</p>';
  }
  if (p.rezim === 'odpoved' || p.rezim === 'vsem') {
    h += '<div class="psani-radek"><span class="psani-popisek">Komu</span><span class="psani-hodnota">' + esc(jmenaAdres(p.komu)) + '</span></div>';
  } else {
    h += '<label class="psani-radek"><span class="psani-popisek">Komu</span><input type="email" multiple data-psani-komu autocomplete="email" ' +
      'inputmode="email" autocapitalize="off" spellcheck="false" placeholder="adresa@…" value="' + esc(koncept.komu || '') + '"></label>';
  }
  if (p.rezim === 'novy') {
    h += '<label class="psani-radek"><span class="psani-popisek">Předmět</span><input type="text" data-psani-predmet value="' + esc(koncept.predmet || '') + '"></label>';
  } else {
    h += '<div class="psani-radek"><span class="psani-popisek">Předmět</span><span class="psani-hodnota">' + esc(p.predmet) + '</span></div>';
  }
  h += '<textarea class="psani-text" data-psani-text rows="6" placeholder="Text zprávy…">' + esc(koncept.text || '') + '</textarea>';
  if (p.citace) h += '<details class="psani-citace"><summary>Původní zpráva</summary><div>' + esc(prvniRadek(p.citace, 3000)) + '</div></details>';
  if (koncept.text) h += '<button type="button" class="odkaz psani-zahodit" data-zahodit-koncept>Zahodit rozepsaný text</button>';
  return h + '</div>';
}

function ulozKoncept() {
  const el = elementPanelu('psani');
  if (!el || !stav.psani) return;
  const hodnota = (sel) => { const x = el.querySelector(sel); return x ? x.value : ''; };
  const koncept = { text: hodnota('[data-psani-text]'), komu: hodnota('[data-psani-komu]'), predmet: hodnota('[data-psani-predmet]') };
  if (koncept.text.trim() || koncept.komu.trim() || koncept.predmet.trim()) uloziste.pis(stav.psani.klic, koncept);
  else uloziste.smaz(stav.psani.klic);
}

async function odeslat(tlacitko) {
  const p = stav.psani;
  const el = elementPanelu('psani');
  if (!p || !el) return;
  const text = el.querySelector('[data-psani-text]').value;
  if (!text.trim()) { toast('Napiš text zprávy.'); el.querySelector('[data-psani-text]').focus(); return; }
  const data = { rezim: p.rezim, id: p.zpravaId, text, ucet: p.ucet };
  if (p.rezim === 'preposlat' || p.rezim === 'novy') {
    data.komu = el.querySelector('[data-psani-komu]').value.trim();
    if (!data.komu) { toast('Doplň adresáta.'); el.querySelector('[data-psani-komu]').focus(); return; }
  }
  if (p.rezim === 'novy') data.predmet = el.querySelector('[data-psani-predmet]').value.trim();
  tlacitko.disabled = true;
  tlacitko.querySelector('span').textContent = 'Odesílám…';
  try {
    await volej('odeslat', data);
    uloziste.smaz(p.klic);
    const vlakno = p.vlaknoId;
    zavriPanel();
    toast('Odesláno ✓');
    if (vlakno) nactiVlakno(vlakno, true);
    nactiPostu(true);
  } catch (e) {
    tlacitko.disabled = false;
    tlacitko.querySelector('span').textContent = 'Odeslat';
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------- označení a archiv

async function oznac(jak) {
  const id = stav.otevreneVlakno;
  if (!id) return;
  try {
    await volej('oznacit', { id, jak });
    if (jak === 'archivovat') {
      upravVSeznamech(id, (m, i, seznam) => seznam.splice(i, 1));
      toast('Archivováno');
    } else {
      upravVSeznamech(id, (m) => { m.neprectena = jak === 'neprectene'; });
      toast('Označeno jako nepřečtené');
    }
    stav.otevreneVlakno = null;
    if (jeOtevreny('vlakno')) zavriPanel();
    zmeneno();
    nactiPostu(true);
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------- ovládání

export function klikPosta(el) {
  if (el.dataset.vlakno) { otevriVlakno(el.dataset.vlakno); return true; }
  if (el.dataset.filtrPosty) {
    stav.filtrPosty = el.dataset.filtrPosty;
    uloziste.pis('asistent.filtrPosty', stav.filtrPosty);
    zmeneno();
    return true;
  }
  if (el.dataset.psat) { otevriPsani(el.dataset.psat); return true; }
  if (el.hasAttribute('data-odeslat')) { odeslat(el); return true; }
  if (el.dataset.oznacit) { oznac(el.dataset.oznacit); return true; }
  if (el.dataset.rozbalZpravu) {
    const st = stav.vlakna[stav.otevreneVlakno];
    const posledni = st && st.data && st.data.zpravy[st.data.zpravy.length - 1];
    if (posledni && posledni.id === el.dataset.rozbalZpravu) return true; // poslední zůstává otevřená
    stav.rozbaleneZpravy[el.dataset.rozbalZpravu] = !stav.rozbaleneZpravy[el.dataset.rozbalZpravu];
    obnovDetail(stav.otevreneVlakno);
    return true;
  }
  if (el.dataset.vlaknoZnovu) { nactiVlakno(el.dataset.vlaknoZnovu, true); return true; }
  if (el.dataset.obrazky) { stav.obrazky[el.dataset.obrazky] = true; obnovDetail(stav.otevreneVlakno); return true; }
  if (el.hasAttribute('data-posta-znovu')) { nactiPostu(true); return true; }
  if (el.dataset.psaniUcet && stav.psani) {
    ulozKoncept();
    stav.psani.ucet = el.dataset.psaniUcet;
    const koncept = uloziste.cti(stav.psani.klic) || {};
    const panel = elementPanelu('psani');
    if (panel) { panel.querySelector('.panel-telo').innerHTML = psaniHtml(koncept); }
    return true;
  }
  if (el.hasAttribute('data-zahodit-koncept') && stav.psani) {
    uloziste.smaz(stav.psani.klic);
    zavriPanel();
    toast('Rozepsaný text zahozen');
    return true;
  }
  return false;
}

let casovacKonceptu;
export function vstupPosta(e) {
  const t = e.target;
  if (!t.closest || !t.closest('[data-panel="psani"]')) return false;
  if (t.matches('[data-psani-text]')) prizpusobVysku(t);
  clearTimeout(casovacKonceptu);
  casovacKonceptu = setTimeout(ulozKoncept, 400);
  return true;
}

/** Při otočení iPadu / změně šířky okna přepnout mezi panelem a dvěma sloupci. */
DVA_SLOUPCE.addEventListener('change', () => {
  if (DVA_SLOUPCE.matches && jeOtevreny('vlakno')) {
    const id = stav.otevreneVlakno;
    zavriPanel();
    setTimeout(() => { stav.otevreneVlakno = id; posledniDetail = ''; zmeneno(); }, 300);
  } else {
    posledniDetail = '';
    zmeneno();
  }
});
