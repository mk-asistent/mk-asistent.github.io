// Náhled přílohy e-mailu (Michal 20. 10.: „dokážeme na gmailu náhled pdf? … v poště na webu“). Klepnutí na přílohu
// v detailu e-mailu → motor pošle obsah (akce postaPriloha, base64) → okno uprostřed, na telefonu přes celou obrazovku:
// PDF stránku po stránce (pdf.js 4.10.38 v js/vendor – bajtově stejné jako npm i cdnjs, ověřeno 20. 10. 2026;
// isEvalSupported: false kvůli CVE-2024-4367), obrázek celý, jiný soubor jen Stáhnout / Sdílet. Stránky PDF se kreslí,
// až dojedou k obrazovce. Načtené přílohy si modul pamatuje do zavření aplikace (nejvýš ~60 MB). Načítá se až při použití.

import { volej } from './api.js';
import { otevriPanel, obnovPanel, jeOtevreny, elementPanelu } from './panely.js';
import { esc } from './pomocne.js';
import { toast, kostra } from './ui.js';
import { IKONY } from './ikony.js';

const OKNO = 'priloha';
const PDFJS = './vendor/pdfjs-4.10.38/';
const ZOOMY = [0.75, 1, 1.5, 2, 3];
const MAX_PAMET = 60 * 1024 * 1024;

const pamet = new Map(); // „zprava:i“ → { nazev, typ, velikost, b64, bajty }
let akt = null;          // otevřená příloha: { klic, info, stav: 'nacita' | 'hotovo' | 'chyba', chyba, data, druh, zoom, doc, stranek, url }

const naPc = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function velikost(b) {
  if (!(b > 0)) return '';
  return b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' kB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
}

/** pdf | obrazek | soubor – podle typu a přípony */
export function druhPrilohy(nazev, typ) {
  const n = String(nazev || '').toLowerCase(), t = String(typ || '').toLowerCase();
  if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
  if (/^image\/(png|jpe?g|gif|webp|bmp)$/.test(t) || /\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return 'obrazek';
  return 'soubor';
}

function zBase64(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function typSouboru(data) {
  if (data.typ) return data.typ;
  const d = druhPrilohy(data.nazev, '');
  return d === 'pdf' ? 'application/pdf' : 'application/octet-stream';
}

/** info = { zprava, i, nazev, velikost, odkaz (vlákno v Gmailu) } */
export function otevriPrilohu(info) {
  zavriPdf();
  akt = { klic: info.zprava + ':' + info.i, info, stav: 'nacita', druh: druhPrilohy(info.nazev, ''), zoom: 1 };
  otevriPanel({
    id: OKNO, trida: 'panel-okno panel-priloha',
    titul: () => (akt ? akt.info.nazev : 'Příloha'),
    vpravo: vpravoHtml,
    vykresli: teloHtml,
    paticka: patickaHtml,
    zavritMimo: true,
    poOtevreni: (el) => {
      el.addEventListener('click', klikVOkne);
      el.focus({ preventScroll: true });
    },
    poVykresleni: poVykresleni,
    priZavreni: () => { if (!jeOtevreny(OKNO)) { zavriPdf(); akt = null; } }
  });
  nacti(akt);
}

function nacti(a) {
  const ulozena = pamet.get(a.klic);
  if (ulozena) { hotovo(a, ulozena); return; }
  a.stav = 'nacita';
  volej('postaPriloha', { zprava: a.info.zprava, i: a.info.i, nazev: a.info.nazev })
    .then((data) => {
      data.bajty = zBase64(data.data);
      data.b64 = data.data;
      delete data.data;
      ulozDoPameti(a.klic, data);
      if (akt === a) hotovo(a, data);
    })
    .catch((e) => {
      if (akt !== a) return;
      a.stav = 'chyba';
      a.chyba = e.message;
      obnovPanel(OKNO);
    });
}

function ulozDoPameti(klic, data) {
  pamet.set(klic, data);
  let celkem = 0;
  pamet.forEach((d) => { celkem += d.bajty.length; });
  for (const [k, d] of pamet) {
    if (celkem <= MAX_PAMET || k === klic) break;
    celkem -= d.bajty.length;
    pamet.delete(k);
  }
}

function hotovo(a, data) {
  a.data = data;
  a.druh = druhPrilohy(data.nazev, data.typ);
  a.soubor = typeof File === 'function' ? new File([data.bajty], data.nazev, { type: typSouboru(data) }) : null;
  a.stav = 'hotovo';
  obnovPanel(OKNO);
}

// ---------------------------------------------------------------- vykreslení okna

function vpravoHtml() {
  if (!akt || akt.stav !== 'hotovo' || akt.druh !== 'pdf') return '';
  const i = ZOOMY.indexOf(akt.zoom);
  return '<div class="pri-zoom" role="group" aria-label="Velikost">' +
    '<button type="button" class="btn btn--ikona" data-pri-zoom="-1" aria-label="Zmenšit" title="Zmenšit"' + (i <= 0 ? ' disabled' : '') + '>−</button>' +
    '<button type="button" class="btn btn--ghost btn--sm cisla" data-pri-zoom="0" title="Na šířku okna">' + Math.round(akt.zoom * 100) + ' %</button>' +
    '<button type="button" class="btn btn--ikona" data-pri-zoom="1" aria-label="Zvětšit" title="Zvětšit"' + (i >= ZOOMY.length - 1 ? ' disabled' : '') + '>+</button></div>';
}

function teloHtml() {
  if (!akt) return '';
  const info = akt.info;
  if (akt.stav === 'nacita') {
    return '<div class="pri-nacita"><p>' + IKONY.priloha + '<span>Stahuji přílohu z Gmailu' + (info.velikost ? ' · ' + esc(velikost(info.velikost)) : '') + '…</span></p>' + kostra(4) + '</div>';
  }
  if (akt.stav === 'chyba') {
    return '<div class="pri-zprava"><i class="kruh">' + IKONY.priloha + '</i><b>Přílohu se nepodařilo načíst</b><span>' + esc(akt.chyba || '') + '</span>' +
      '<button type="button" class="btn btn--primary" data-pri-znovu>Zkusit znovu</button></div>';
  }
  const d = akt.data;
  if (akt.druh === 'obrazek') {
    return '<div class="pri-obrazek"><img src="data:' + esc(typSouboru(d)) + ';base64,' + d.b64 + '" alt="' + esc(d.nazev) + '"></div>';
  }
  if (akt.druh === 'pdf') return '<div class="pri-pdf" data-pri-pdf><p class="pri-pdf__stav">Otevírám PDF…</p></div>';
  return '<div class="pri-zprava"><i class="kruh">' + IKONY.priloha + '</i><b>' + esc(d.nazev) + '</b><span>' + esc(velikost(d.velikost)) +
    ' · náhled tohohle typu souboru aplikace neumí. Stáhni ho' + (akt.info.odkaz ? ', nebo otevři v Gmailu' : '') + '.</span></div>';
}

function patickaHtml() {
  if (!akt) return '';
  const tl = [];
  if (akt.info.odkaz) tl.push('<a class="btn btn--ghost" href="' + esc(akt.info.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.posta + '<span>Otevřít v Gmailu</span></a>');
  if (akt.stav === 'hotovo') {
    if (naPc() && akt.druh !== 'soubor') tl.push('<button type="button" class="btn btn--ghost" data-pri-otevrit title="Ve vlastní záložce prohlížeče (hledání v textu, tisk)">' + IKONY.sipka + '<span>Otevřít v prohlížeči</span></button>');
    const sdilet = !naPc() && akt.soubor && navigator.canShare && navigator.canShare({ files: [akt.soubor] });
    tl.push(sdilet
      ? '<button type="button" class="btn btn--primary" data-pri-sdilet>' + IKONY.odeslat + '<span>Uložit / sdílet</span></button>'
      : '<button type="button" class="btn btn--primary" data-pri-stahnout>' + IKONY.stahnout + '<span>Stáhnout</span></button>');
  }
  const pocet = akt.stranek ? '<span class="pri-stranek">' + akt.stranek + (akt.stranek === 1 ? ' strana' : akt.stranek < 5 ? ' strany' : ' stran') + '</span>' : '';
  return '<div class="akce akce--priloha">' + pocet + tl.join('') + '</div>';
}

function poVykresleni(el) {
  if (akt && akt.stav === 'hotovo' && akt.druh === 'pdf') nactiPdf(el);
}

// ---------------------------------------------------------------- PDF (pdf.js)

let pdfjsSlib = null;
function pdfjs() {
  if (!pdfjsSlib) {
    pdfjsSlib = import(PDFJS + 'pdf.min.js').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL(PDFJS + 'pdf.worker.min.js', import.meta.url).href;
      return m;
    }).catch((e) => { pdfjsSlib = null; throw e; });
  }
  return pdfjsSlib;
}

async function nactiPdf(el) {
  const a = akt;
  const misto = el.querySelector('[data-pri-pdf]');
  if (!misto) return;
  try {
    if (!a.doc) {
      const p = await pdfjs();
      // kopie bajtů – pdf.js je předá workeru (původní pole by se vyprázdnilo a Stáhnout by nemělo co)
      a.doc = await p.getDocument({ data: a.data.bajty.slice(), isEvalSupported: false, enableXfa: false }).promise;
      a.stranek = a.doc.numPages;
      const prvni = await a.doc.getPage(1);
      const vp = prvni.getViewport({ scale: 1 });
      a.pomer = vp.width / vp.height;
    }
    if (akt !== a || !misto.isConnected) return;
    postavStranky(misto, a);
    // počet stran do patičky, zoom do hlavičky (bez překreslení těla – stránky by se kreslily znovu)
    const pata = el.querySelector('.panel-paticka'), vpravo = el.querySelector('.panel-vpravo');
    if (pata) pata.innerHTML = patickaHtml();
    if (vpravo) vpravo.innerHTML = vpravoHtml();
  } catch (e) {
    if (akt !== a) return;
    misto.innerHTML = '<div class="pri-zprava"><i class="kruh">' + IKONY.priloha + '</i><b>PDF se nepodařilo zobrazit</b><span>' +
      esc(e && e.name === 'PasswordException' ? 'Je chráněné heslem – stáhni ho a otevři jinde.' : 'Soubor je poškozený nebo neobvyklý – zkus ho stáhnout.') + '</span></div>';
  }
}

function postavStranky(misto, a) {
  if (a.pozorovatel) a.pozorovatel.disconnect();
  misto.innerHTML = '';
  misto.style.setProperty('--pri-zoom', a.zoom);
  for (let n = 1; n <= a.stranek; n++) {
    const s = document.createElement('div');
    s.className = 'pri-stranka';
    s.dataset.strana = n;
    s.style.aspectRatio = String(a.pomer || 0.707);
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', 'Strana ' + n + ' z ' + a.stranek);
    misto.appendChild(s);
  }
  const koren = misto.closest('.panel-telo');
  a.pozorovatel = new IntersectionObserver((zaznamy) => {
    zaznamy.forEach((z) => { if (z.isIntersecting) vykresliStranku(z.target, a); });
  }, { root: koren, rootMargin: '800px 0px' });
  misto.querySelectorAll('.pri-stranka').forEach((s) => a.pozorovatel.observe(s));
}

async function vykresliStranku(div, a) {
  const zoom = a.zoom;
  if (div.dataset.vykresleno === String(zoom) || div.dataset.kresli === String(zoom)) return;
  div.dataset.kresli = String(zoom);
  try {
    const page = await a.doc.getPage(Number(div.dataset.strana));
    const vp1 = page.getViewport({ scale: 1 });
    div.style.aspectRatio = String(vp1.width / vp1.height);
    const sirka = div.clientWidth || 600;
    let meritko = sirka / vp1.width * Math.min(window.devicePixelRatio || 1, 2);
    if (vp1.width * meritko > 4096) meritko = 4096 / vp1.width; // obří plátno by v telefonu došlo paměti
    const vp = page.getViewport({ scale: meritko });
    const platno = document.createElement('canvas');
    platno.width = Math.floor(vp.width);
    platno.height = Math.floor(vp.height);
    await page.render({ canvasContext: platno.getContext('2d'), viewport: vp }).promise;
    if (akt !== a || a.zoom !== zoom) return;
    div.replaceChildren(platno);
    div.dataset.vykresleno = String(zoom);
  } catch (e) {
    if (akt === a) div.textContent = 'Stranu ' + div.dataset.strana + ' se nepodařilo vykreslit.';
  } finally {
    if (div.dataset.kresli === String(zoom)) delete div.dataset.kresli;
  }
}

function zmenZoom(smer) {
  if (!akt || !akt.doc) return;
  const i = ZOOMY.indexOf(akt.zoom);
  akt.zoom = smer === 0 ? 1 : ZOOMY[Math.max(0, Math.min(ZOOMY.length - 1, i + smer))];
  const el = elementPanelu(OKNO);
  const misto = el && el.querySelector('[data-pri-pdf]');
  if (!misto) return;
  // pozice v dokumentu zůstane (poměr posunu), stránky se překreslí v nové velikosti
  const telo = misto.closest('.panel-telo');
  const pomer = telo.scrollHeight ? telo.scrollTop / telo.scrollHeight : 0;
  misto.style.setProperty('--pri-zoom', akt.zoom);
  misto.querySelectorAll('.pri-stranka').forEach((s) => { delete s.dataset.vykresleno; });
  telo.scrollTop = pomer * telo.scrollHeight;
  if (akt.pozorovatel) {
    akt.pozorovatel.disconnect();
    misto.querySelectorAll('.pri-stranka').forEach((s) => akt.pozorovatel.observe(s));
  }
  el.querySelector('.panel-vpravo').innerHTML = vpravoHtml();
}

function zavriPdf() {
  if (!akt) return;
  if (akt.pozorovatel) akt.pozorovatel.disconnect();
  if (akt.doc) { try { akt.doc.destroy(); } catch (e) { /* nic */ } }
  if (akt.url) URL.revokeObjectURL(akt.url);
  akt.doc = null;
  akt.url = null;
}

// ---------------------------------------------------------------- tlačítka v okně (vlastní posluchač – app.js je nezná)

function adresaSouboru() {
  if (!akt.url) akt.url = URL.createObjectURL(new Blob([akt.data.bajty], { type: typSouboru(akt.data) }));
  return akt.url;
}

function klikVOkne(e) {
  const el = e.target.closest('[data-pri-zoom], [data-pri-znovu], [data-pri-stahnout], [data-pri-sdilet], [data-pri-otevrit]');
  if (!el || !akt) return;
  e.stopPropagation();
  if (el.dataset.priZoom !== undefined) { zmenZoom(Number(el.dataset.priZoom)); return; }
  if (el.hasAttribute('data-pri-znovu')) { akt.stav = 'nacita'; obnovPanel(OKNO); nacti(akt); return; }
  if (el.hasAttribute('data-pri-sdilet')) {
    // iPhone: share jen přímo v klepnutí (soubor je připravený dopředu) – žádné await před ním
    navigator.share({ files: [akt.soubor], title: akt.data.nazev }).catch((chyba) => {
      if (chyba && chyba.name !== 'AbortError') toast('Sdílení se nepovedlo – ' + chyba.message, true);
    });
    return;
  }
  if (el.hasAttribute('data-pri-stahnout')) {
    const odkaz = document.createElement('a');
    odkaz.href = adresaSouboru();
    odkaz.download = akt.data.nazev;
    document.body.appendChild(odkaz);
    odkaz.click();
    odkaz.remove();
    return;
  }
  if (el.hasAttribute('data-pri-otevrit')) window.open(adresaSouboru(), '_blank', 'noopener');
}
