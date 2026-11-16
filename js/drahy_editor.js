// Editor drah kamery v Asistentovi (Michal 16. 11.: „já to chtěl mít ale na tom webu… tam to nedokážeme?“).
// Stejné ovládání jako místní editor na domácím PC (veo-reel\editor.html): ● Nahrávat dráhu → video se rozjede a výřez jede za
// ukazatelem (myš i prst), zastavené video jde doladit tažením, ←/→ po snímcích, mezerník přehrát, 1–5 rychlost, R nahrávání,
// výchozí rychlost 0,5×, ořez Začátek zde / Konec zde / Celý klip (výchozí z PC, obvykle 10–19 s), graf dráhy.
// Rozdíl: video je malý náhled bez zvuku (REELY/klipy, 640 px – domácí PC), body dráhy se ale ukládají ve zdrojových px
// (1920 × 1080) jako v editoru na PC; náhled hotového klipu nerenderuje server, je tu živý výřez 3 : 4 vedle.
// Uložení: reelDrahaUlozit → REELY/drahy/<id>.json (píše motor), domácí PC si dráhu převezme při dalším export_reely.py.
// Modul načte js/reely_plan_stranka.js až po klepnutí na Upravit dráhy.

import { volej, jeDemo } from './api.js';
import { esc, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, potvrd } from './ui.js';
import { otevriPanel, zavriPanel, jeOtevreny, elementPanelu } from './panely.js';
import * as Pamet from './tipy_pamet.js';
import * as RP from './reely_plan.js';

const OKNO = 'drahy-editor';
const HUSTOTA = 0.08;      // jak často se při nahrávání zapisuje bod (s) – jako editor.html
const RYCHLOSTI = [['0.5', '0,5×'], ['0.75', '0,75×'], ['1', '1×'], ['0.25', '0,25×'], ['0.15', '0,15×']];
const KLAVESY_RYCHLOSTI = { 1: 0.5, 2: 0.75, 3: 1, 4: 0.25, 5: 0.15 };

const e = { dil: null, moznosti: {}, klipy: [], i: -1, nacita: '', chyba: '', url: '', nacteno: false, klice: [], orezOd: 0, orezDo: 9999,
  zmena: false, nahravam: false, tahne: false, mysX: null, zdrojW: 0, zdrojH: 0, vyrezW: 0, ukladam: false, koncepty: {} };
let video = null;

const el = (sel) => { const p = elementPanelu(OKNO); return p ? p.querySelector(sel) : null; };
const klip = () => e.klipy[e.i] || null;
const maDrahu = (k) => !!(k && (k.rucne || k.drahaZWebu));

/** Otevře editor pro díl plánu. moznosti = { naPlan(plan) – nový stav plánu po uložení, editorPc – adresa místního editoru }. */
export function otevri(dil, moznosti) {
  if (e.dil && e.dil.id !== dil.id) e.koncepty = {};
  e.dil = dil;
  e.moznosti = moznosti || {};
  e.klipy = [];
  e.i = -1;
  e.chyba = '';
  e.nacita = 'Načítám klipy…';
  otevriPanel({
    id: OKNO, trida: 'panel-okno panel-formular panel-reel de-okno', titul: () => 'Dráhy · ' + (e.dil ? e.dil.nazev : ''),
    vykresli: kostraHtml, paticka: () => '<div class="de-pata" data-de-pata></div>',
    poOtevreni: (p) => { pripravPlatno(p); p.focus({ preventScroll: true }); },
    priZavreni: zavreno
  });
  const klic = dil.skupina || dil.reel || '';
  volej('reelKlipy', { dil: klic }).then((d) => {
    e.klipy = (d && d.klipy) || [];
    e.nacita = '';
    if (!e.klipy.length) { e.chyba = 'Klipy tohohle dílu na Disku nejsou – domácí PC je nahraje při dalším exportu reelů.'; obnov(); return; }
    const prvni = e.klipy.findIndex((k) => !maDrahu(k));
    nactiKlip(prvni >= 0 ? prvni : 0);
  }, (chyba) => { e.nacita = ''; e.chyba = (chyba && chyba.message) || 'Klipy se nenačetly.'; obnov(); });
}

function zavreno() {
  if (e.zmena && klip()) {
    e.koncepty[klip().id] = { klice: e.klice.slice(), od: e.orezOd, do: e.orezDo };
    toast('Neuložená dráha zůstala rozpracovaná – při dalším otevření pokračuješ');
  }
  if (video) { video.pause(); video.removeAttribute('src'); }
  if (e.url) URL.revokeObjectURL(e.url);
  e.url = '';
  e.nacteno = false;
  e.nahravam = false;
  e.zmena = false;
}

// ---------------------------------------------------------------- vzhled okna (jednou), pak jen dílčí překreslení

function kostraHtml() {
  const tl = (atr, text, trida) => '<button type="button" class="btn ' + (trida || 'btn--ghost') + '" ' + atr + ' disabled>' + text + '</button>';
  return '<div class="de" data-oblast="reely">' +
    '<div class="de__levy">' +
      '<div class="de__obraz"><canvas class="de__platno" data-de-platno aria-label="Snímek klipu – výřez se vede ukazatelem nebo prstem"></canvas>' +
        '<div class="de__zprava" data-de-zprava></div></div>' +
      '<div class="de__radek">' + tl('data-de-nahrat', '● Nahrávat dráhu', 'btn--plan de__nahrat') + tl('data-de-prehrat', '▶ Přehrát') +
        '<input type="range" class="de__posuvnik" data-de-posuvnik min="0" max="1000" value="0" aria-label="Čas v klipu" disabled>' +
        '<span class="de__cas cisla" data-de-cas>0.00 / 0.00 s</span></div>' +
      '<div class="de__radek"><span class="label de__label">Rychlost</span>' +
        RYCHLOSTI.map((r) => '<button type="button" class="chip de__rychlost" data-de-rychlost="' + r[0] + '" aria-pressed="false" disabled>' + r[1] + '</button>').join('') +
        tl('data-de-krok="-0.1"', '◀ −0,1 s') + tl('data-de-krok="0.1"', '+0,1 s ▶') + '</div>' +
      '<div class="de__radek"><span class="label de__label">Ořez</span>' + tl('data-de-zacatek', 'Začátek zde') + tl('data-de-konec', 'Konec zde') +
        tl('data-de-cely', 'Celý klip') + '<b class="de__orez cisla" data-de-orez>—</b></div>' +
      '<canvas class="de__graf" data-de-graf aria-label="Graf dráhy v čase"></canvas>' +
      '<p class="napoveda de__klavesy"><kbd>mezerník</kbd> přehrát/pauza · <kbd>←</kbd> <kbd>→</kbd> po snímcích · <kbd>1</kbd>–<kbd>5</kbd> rychlost · ' +
        '<kbd>R</kbd> nahrávání · zastavené video dolaď tažením</p>' +
    '</div>' +
    '<div class="de__pravy">' +
      '<div class="de__nahled"><canvas data-de-nahled width="240" height="320" aria-label="Živý náhled výřezu"></canvas><small>Výřez do reelu (3 : 4)</small></div>' +
      '<div class="de__body"><span class="cisla" data-de-pocet>0 bodů</span><button type="button" class="btn btn--ghost btn--sm" data-de-smazat disabled>Smazat vše</button></div>' +
      '<div class="label">Klipy dílu</div><ul class="de__klipy" data-de-klipy></ul>' +
    '</div></div>';
}

function pripravPlatno(p) {
  if (!video) {
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.addEventListener('seeked', () => { kresli(); graf(); });
    video.addEventListener('timeupdate', () => { const s = el('[data-de-posuvnik]'); if (s && video.duration) s.value = (video.currentTime / video.duration) * 1000; });
    video.addEventListener('play', () => dalsiSnimek(smyckaPrehravani));
    video.addEventListener('pause', () => { if (e.nahravam) prepniNahravani(false); tlacitkoPrehrat(); });
    video.addEventListener('ended', () => { if (e.nahravam) prepniNahravani(false); tlacitkoPrehrat(); });
    video.addEventListener('loadedmetadata', poNacteni);
  }
  video.className = 'de__video';
  p.querySelector('.de').appendChild(video); // v DOMu (skrytě) – Safari jinak snímky nekreslí
  const platno = p.querySelector('[data-de-platno]');
  platno.addEventListener('pointermove', (ev) => {
    if (!e.nacteno) return;
    e.mysX = xZUdalosti(ev);
    if (e.nahravam || e.tahne) { zapis(e.mysX); kresli(); if (!e.nahravam) graf(); }
  });
  platno.addEventListener('pointerdown', (ev) => {
    if (!e.nacteno) return;
    if (e.nahravam) { e.mysX = xZUdalosti(ev); return; } // prst při nahrávání: výřez hned tam, kam sáhl
    e.tahne = true;
    try { platno.setPointerCapture(ev.pointerId); } catch (x) { /* nic */ }
    e.mysX = xZUdalosti(ev); zapis(e.mysX); kresli(); graf();
  });
  platno.addEventListener('pointerup', (ev) => {
    if (!e.tahne) return;
    e.tahne = false;
    try { platno.releasePointerCapture(ev.pointerId); } catch (x) { /* nic */ }
    graf();
  });
  platno.addEventListener('pointerleave', () => { if (!e.nahravam) e.mysX = null; });
  obnov();
}

/** Překreslí seznam klipů, zprávu, tlačítka a patičku (plátno a graf mají vlastní kreslení). */
function obnov() {
  if (!jeOtevreny(OKNO)) return;
  const zprava = el('[data-de-zprava]');
  if (zprava) {
    zprava.textContent = e.chyba || e.nacita || '';
    zprava.hidden = !(e.chyba || e.nacita);
    zprava.classList.toggle('de__zprava--chyba', !!e.chyba);
  }
  const p = elementPanelu(OKNO);
  p.querySelectorAll('.de__levy [disabled], .de__levy [data-de-rychlost], [data-de-smazat]').forEach((b) => { b.disabled = !e.nacteno; });
  p.querySelectorAll('.de__levy button, [data-de-smazat], [data-de-posuvnik]').forEach((b) => { b.disabled = !e.nacteno; });
  const ul = el('[data-de-klipy]');
  if (ul) {
    ul.innerHTML = e.klipy.map((k, i) => {
      const stav = e.koncepty[k.id] || (i === e.i && e.zmena) ? ['rozpracováno', 'warn'] : k.drahaZWebu ? ['uloženo', 'ok'] : k.rucne ? ['ruční', 'ok'] : ['automatická', 'seda'];
      return '<li><button type="button" class="de__klip' + (i === e.i ? ' de__klip--vybrany' : '') + '" data-de-klip="' + i + '"' + (i === e.i ? ' aria-current="true"' : '') + '>' +
        '<b>' + esc(k.strelec || k.id) + '</b><small>' + esc([k.minuta, k.souper].filter(Boolean).join(' · ')) + '</small>' +
        '<span class="tag tag--' + stav[1] + '" data-de-stav-klipu>' + stav[0] + '</span></button></li>';
    }).join('');
  }
  pata();
}

function pata() {
  const pt = el('[data-de-pata]');
  if (!pt) return;
  const vse = e.klipy.length > 0 && e.klipy.every(maDrahu) && !e.zmena;
  const reel = e.dil && e.dil.format === 'reel' && e.dil.reel && ['plan', 'nachystano', 'drahy'].indexOf(e.dil.stav) >= 0 && !e.dil.pozadano;
  pt.innerHTML = (e.moznosti.editorPc ? '<a class="odkaz de__pc" href="' + esc(e.moznosti.editorPc) + '" target="_blank" rel="noopener" ' +
      'title="Editor na domácím PC (doma na Wi-Fi i z mobilu)">editor na PC</a>' : '') +
    '<span class="napoveda de__ulozeni" data-de-ulozeni>' + (e.ukladam ? 'Ukládám…' : e.zmena ? 'Neuloženo' : vse ? 'Všechny klipy mají dráhu' : '') + '</span>' +
    (vse && reel ? '<button type="button" class="btn btn--ghost" data-de-udelat>' + IKONY.reely + '<span>Udělej reel</span></button>' : '') +
    '<button type="button" class="btn btn--plan" data-de-ulozit' + (e.nacteno && !e.ukladam ? '' : ' disabled') + '>' + IKONY.fajfka + '<span>Uložit dráhu</span></button>';
}

// ---------------------------------------------------------------- klip

async function nactiKlip(i) {
  const pred = klip();
  if (pred && e.zmena) e.koncepty[pred.id] = { klice: e.klice.slice(), od: e.orezOd, do: e.orezDo };
  if (e.nahravam) prepniNahravani(false);
  const k = e.klipy[i];
  if (!k) return;
  e.i = i;
  const koncept = e.koncepty[k.id];
  e.klice = (koncept ? koncept.klice : k.klice || []).map((z) => ({ t: +z.t, x: Math.round(+z.x) })).sort((a, b) => a.t - b.t);
  e.orezOd = koncept ? koncept.od : k.od != null ? +k.od : 0;
  e.orezDo = koncept ? koncept.do : k.do != null ? +k.do : 9999;
  e.zmena = !!koncept;
  e.nacteno = false;
  e.chyba = '';
  e.nacita = 'Načítám klip…';
  obnov();
  try {
    const klic = 'rk-video:' + k.id + ':' + (k.bajtu || 0);
    let v = await Pamet.cti(klic);
    if (!v) {
      const r = await volej('reelKlip', { id: k.id });
      v = { typ: r.typ || 'video/mp4', bajty: await Pamet.zBase64(r.data) };
      if (!jeDemo()) Pamet.pis(klic, v);
    }
    if (e.i !== i || !jeOtevreny(OKNO)) return; // mezitím jiný klip / zavřeno
    if (e.url) URL.revokeObjectURL(e.url);
    e.url = URL.createObjectURL(new Blob([v.bajty], { type: v.typ }));
    video.src = e.url;
  } catch (chyba) {
    if (e.i !== i) return;
    e.nacita = '';
    e.chyba = 'Klip se nenačetl: ' + ((chyba && chyba.message) || 'chyba');
    obnov();
  }
}

function poNacteni() {
  const k = klip();
  if (!k || !jeOtevreny(OKNO)) return;
  e.zdrojW = k.sirka || video.videoWidth;
  e.zdrojH = k.vyska || video.videoHeight;
  e.vyrezW = RP.sirkaVyrezu(e.zdrojW, e.zdrojH);
  const platno = el('[data-de-platno]');
  platno.width = Math.min(960, video.videoWidth);
  platno.height = Math.round(platno.width * video.videoHeight / video.videoWidth);
  if (!e.klice.length) e.klice = [{ t: 0, x: Math.round((e.zdrojW - e.vyrezW) / 2) }];
  nastavRychlost(0.5);
  e.nacteno = true;
  e.nacita = '';
  video.currentTime = 0;
  obnov();
  kresli();
  graf();
}

// ---------------------------------------------------------------- kreslení (jako editor.html)

function dalsiSnimek(fn) {
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(fn);
  else requestAnimationFrame(fn);
}
function smyckaPrehravani() {
  if (!video || video.paused || !jeOtevreny(OKNO)) return;
  kresli();
  dalsiSnimek(smyckaPrehravani);
}

/** Poloha výřezu v čase; mezi body plynule (smoothstep) – stejně jako editor.html a veo_reel.py. */
function xVCase(t) {
  const k = e.klice;
  if (!k.length) return (e.zdrojW - e.vyrezW) / 2;
  if (t <= k[0].t) return k[0].x;
  if (t >= k[k.length - 1].t) return k[k.length - 1].x;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i], b = k[i + 1];
    if (t >= a.t && t <= b.t) {
      let u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      u = u * u * (3 - 2 * u);
      return a.x + (b.x - a.x) * u;
    }
  }
  return k[k.length - 1].x;
}

function kresli() {
  if (!e.nacteno || !jeOtevreny(OKNO)) return;
  const platno = el('[data-de-platno]');
  const ctx = platno.getContext('2d');
  const W = platno.width, H = platno.height, m = W / e.zdrojW;
  ctx.drawImage(video, 0, 0, W, H);
  const xZdroj = e.nahravam && e.mysX !== null ? e.mysX : xVCase(video.currentTime);
  const x = xZdroj * m, sirka = e.vyrezW * m;
  const vReelu = video.currentTime >= e.orezOd && video.currentTime <= e.orezDo;
  ctx.fillStyle = 'rgba(0,0,0,.58)';
  ctx.fillRect(0, 0, x, H);
  ctx.fillRect(x + sirka, 0, W - x - sirka, H);
  const t = Math.max(2, W / 300);
  ctx.strokeStyle = e.nahravam ? '#22dd66' : (vReelu ? '#d91e26' : '#7a7a86');
  ctx.lineWidth = t;
  ctx.strokeRect(x + t / 2, t / 2, sirka - t, H - t);
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + sirka / 2, 0); ctx.lineTo(x + sirka / 2, H); ctx.stroke();
  if (!vReelu) {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = '600 ' + Math.round(W / 34) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('mimo ořez — v reelu nebude', W / 2, H / 2);
    ctx.textAlign = 'left';
  }
  // živý náhled výřezu (místo serverového „Uložit a vyrobit video“)
  const n = el('[data-de-nahled]');
  if (n) {
    const p = video.videoWidth / e.zdrojW;
    n.getContext('2d').drawImage(video, xZdroj * p, 0, e.vyrezW * p, video.videoHeight, 0, 0, n.width, n.height);
  }
  const cas = el('[data-de-cas]');
  if (cas) cas.textContent = video.currentTime.toFixed(2) + ' / ' + (video.duration || 0).toFixed(2) + ' s';
}

/** Křivka dráhy v čase a šedé pásy mimo ořez (jako editor.html). */
function graf() {
  const g = el('[data-de-graf]');
  if (!g) return;
  const s = g.getBoundingClientRect();
  g.width = Math.max(200, Math.round(s.width));
  g.height = 96;
  const c = g.getContext('2d'), W = g.width, H = g.height, maxX = Math.max(1, e.zdrojW - e.vyrezW);
  const css = getComputedStyle(g);
  c.clearRect(0, 0, W, H);
  c.fillStyle = css.getPropertyValue('--bg-soft') || '#eee';
  c.fillRect(0, 0, W, H);
  const d = video && video.duration;
  if (d) {
    const a = (Math.max(0, e.orezOd) / d) * W, b = (Math.min(d, e.orezDo) / d) * W;
    c.fillStyle = 'rgba(128,128,140,.30)';
    c.fillRect(0, 0, a, H);
    c.fillRect(b, 0, W - b, H);
    c.strokeStyle = '#22aa55'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(a, 0); c.lineTo(a, H); c.stroke();
    c.beginPath(); c.moveTo(b, 0); c.lineTo(b, H); c.stroke();
  }
  if (d && e.klice.length) {
    c.strokeStyle = (css.getPropertyValue('--o-reely') || '#b0368f').trim(); c.lineWidth = 2; c.beginPath();
    e.klice.forEach((k, i) => {
      const px = (k.t / d) * W, py = H - 8 - (k.x / maxX) * (H - 16);
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    });
    c.stroke();
    const ph = (video.currentTime / d) * W;
    c.strokeStyle = 'rgba(128,128,140,.9)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(ph, 0); c.lineTo(ph, H); c.stroke();
  }
  const pocet = el('[data-de-pocet]');
  if (pocet) pocet.textContent = e.klice.length + ' ' + tvar(e.klice.length, 'bod', 'body', 'bodů');
  const orez = el('[data-de-orez]');
  if (orez && d) {
    const a = Math.max(0, e.orezOd), b = Math.min(d, e.orezDo);
    orez.textContent = a.toFixed(1) + ' – ' + b.toFixed(1) + ' s (' + (b - a).toFixed(1) + ' s)';
  }
}

// ---------------------------------------------------------------- záznam dráhy (jako editor.html)

function xZUdalosti(ev) {
  const r = el('[data-de-platno]').getBoundingClientRect();
  const px = ((ev.clientX - r.left) / r.width) * e.zdrojW;
  return Math.max(0, Math.min(e.zdrojW - e.vyrezW, Math.round(px - e.vyrezW / 2)));
}

function zapis(x) {
  const t = +video.currentTime.toFixed(2);
  const i = e.klice.findIndex((k) => Math.abs(k.t - t) < HUSTOTA / 2);
  if (i >= 0) e.klice[i].x = x; else e.klice.push({ t, x });
  e.klice.sort((a, b) => a.t - b.t);
  if (!e.zmena) { e.zmena = true; obnov(); }
}

/** Při nahrávání zapisujeme i když ukazatel stojí – jinak by záběr ujížděl. */
function smycka() {
  if (!e.nahravam || !jeOtevreny(OKNO)) return;
  if (!video.paused && e.mysX !== null) zapis(e.mysX);
  kresli();
  dalsiSnimek(smycka);
}

function tlacitkoPrehrat() {
  const b = el('[data-de-prehrat]');
  if (b) b.textContent = video && !video.paused ? '⏸ Pauza' : '▶ Přehrát';
}

function prepniNahravani(zapnout) {
  e.nahravam = zapnout;
  const b = el('[data-de-nahrat]');
  if (b) {
    b.classList.toggle('de__nahrat--bezi', zapnout);
    b.textContent = zapnout ? '■ Zastavit nahrávání' : '● Nahrávat dráhu';
  }
  if (zapnout) {
    if (video.currentTime >= video.duration - 0.05) video.currentTime = 0;
    video.play().catch(() => { /* nic */ });
    dalsiSnimek(smycka);
  } else {
    video.pause();
    graf();
  }
  tlacitkoPrehrat();
}

function krok(d) {
  if (e.nahravam) prepniNahravani(false);
  video.pause();
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + d));
  tlacitkoPrehrat();
}

function nastavRychlost(r) {
  video.playbackRate = r;
  const p = elementPanelu(OKNO);
  if (p) p.querySelectorAll('[data-de-rychlost]').forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.deRychlost - r) < 1e-6)));
}

function prehrat() {
  if (video.paused) video.play().catch(() => { /* nic */ }); else video.pause();
  tlacitkoPrehrat();
}

// ---------------------------------------------------------------- uložení

async function uloz() {
  const k = klip();
  if (!k || !e.nacteno || e.ukladam) return;
  if (e.nahravam) prepniNahravani(false); // jinak by nahrávání psalo body i do uložené dráhy
  const pred = { klice: k.klice, od: k.od, do: k.do, drahaZWebu: k.drahaZWebu };
  const odeslat = { id: k.id, klice: e.klice.map((b) => ({ t: b.t, x: b.x })), od: Math.max(0, e.orezOd), do: e.orezDo >= 9000 ? null : e.orezDo };
  try { RP.zkontrolujDrahu(k, odeslat); } catch (chyba) { toast(chyba.message, true); return; }
  // hned v aplikaci, chyba = zpět
  Object.assign(k, { klice: odeslat.klice, od: odeslat.od, do: odeslat.do, drahaZWebu: true });
  e.ukladam = true;
  e.zmena = false;
  delete e.koncepty[k.id];
  obnov();
  try {
    const r = await volej('reelDrahaUlozit', odeslat);
    if (r && r.klip) Object.assign(k, r.klip);
    if (r && r.plan) {
      const d = (r.plan.dily || []).find((x) => x.id === e.dil.id);
      if (d) e.dil = d;
      if (e.moznosti.naPlan) e.moznosti.naPlan(r.plan);
    }
    e.ukladam = false;
    const dalsi = e.klipy.findIndex((x) => !maDrahu(x));
    toast(dalsi >= 0 ? 'Dráha uložená – další klip' : 'Dráha uložená – všechny klipy dílu mají dráhu');
    if (dalsi >= 0 && jeOtevreny(OKNO)) nactiKlip(dalsi); else obnov();
  } catch (chyba) {
    Object.assign(k, pred);
    e.ukladam = false;
    e.zmena = true;
    obnov();
    toast('Neuložilo se: ' + ((chyba && chyba.message) || 'chyba'), true);
  }
}

function udelejReel() {
  volej('reelUdelat', { dil: e.dil.id }).then((d) => {
    const x = (d.dily || []).find((y) => y.id === e.dil.id);
    if (x) e.dil = x;
    if (e.moznosti.naPlan) e.moznosti.naPlan(d);
    toast(d.zalozeno ? 'Claude reel složí na domácím PC' : 'O reel už je požádáno');
    obnov();
  }, (chyba) => toast('Nepovedlo se: ' + ((chyba && chyba.message) || 'chyba'), true));
}

async function zavritSDotazem() {
  if (e.zmena && !(await potvrd('Zahodit neuloženou dráhu?', { text: 'Změny dráhy a ořezu tohohle klipu se neuloží.', ano: 'Zahodit', ton: 'nebezpeci' }))) return;
  if (klip()) delete e.koncepty[klip().id];
  e.zmena = false;
  zavriPanel();
}

// ---------------------------------------------------------------- ovládání

document.addEventListener('click', (ev) => {
  const p = elementPanelu(OKNO);
  if (!p || !p.contains(ev.target)) return;
  const b = ev.target.closest('button, a');
  if (!b) return;
  if (b.matches('[data-zavrit-panel]')) {
    if (e.zmena) { ev.preventDefault(); ev.stopImmediatePropagation(); zavritSDotazem(); }
    return;
  }
  const ds = b.dataset;
  if (ds.deKlip != null) { if (+ds.deKlip !== e.i) nactiKlip(+ds.deKlip); return; }
  if (b.hasAttribute('data-de-ulozit')) { uloz(); return; }
  if (b.hasAttribute('data-de-udelat')) { udelejReel(); return; }
  if (!e.nacteno) return;
  if (b.hasAttribute('data-de-nahrat')) prepniNahravani(!e.nahravam);
  else if (b.hasAttribute('data-de-prehrat')) prehrat();
  else if (ds.deRychlost) nastavRychlost(+ds.deRychlost);
  else if (ds.deKrok) krok(+ds.deKrok);
  else if (b.hasAttribute('data-de-zacatek')) {
    e.orezOd = +video.currentTime.toFixed(2);
    if (e.orezDo <= e.orezOd) e.orezDo = Math.min(video.duration, e.orezOd + 5);
    zmeneno(); kresli(); graf();
  } else if (b.hasAttribute('data-de-konec')) {
    e.orezDo = +video.currentTime.toFixed(2);
    if (e.orezOd >= e.orezDo) e.orezOd = Math.max(0, e.orezDo - 5);
    zmeneno(); kresli(); graf();
  } else if (b.hasAttribute('data-de-cely')) {
    e.orezOd = 0; e.orezDo = video.duration || 9999;
    zmeneno(); kresli(); graf();
  } else if (b.hasAttribute('data-de-smazat')) {
    potvrd('Smazat celou dráhu?', { text: 'Zůstane jeden bod uprostřed – dráhu pak nahraješ znovu.', ano: 'Smazat', ton: 'nebezpeci' }).then((ano) => {
      if (!ano) return;
      e.klice = [{ t: 0, x: Math.round((e.zdrojW - e.vyrezW) / 2) }];
      zmeneno(); kresli(); graf();
    });
  }
}, true);

function zmeneno() { if (!e.zmena) { e.zmena = true; obnov(); } }

document.addEventListener('input', (ev) => {
  if (!ev.target.matches || !ev.target.matches('[data-de-posuvnik]') || !video || !video.duration) return;
  video.currentTime = (ev.target.value / 1000) * video.duration;
});

// klávesy jako editor.html; Esc s neuloženou dráhou se zeptá (zachytit dřív než app.js, které by okno zavřelo)
window.addEventListener('keydown', (ev) => {
  if (!jeOtevreny(OKNO) || document.querySelector('.okno-pozadi')) return;
  if (ev.key === 'Escape') { if (e.zmena) { ev.preventDefault(); ev.stopImmediatePropagation(); zavritSDotazem(); } return; }
  if (!e.nacteno || (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) && ev.target.type !== 'range') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === 'ArrowLeft') krok(-1 / 30);
  else if (ev.key === 'ArrowRight') krok(1 / 30);
  else if (ev.key === ' ') prehrat();
  else if (ev.key.toLowerCase() === 'r') prepniNahravani(!e.nahravam);
  else if (KLAVESY_RYCHLOSTI[ev.key]) nastavRychlost(KLAVESY_RYCHLOSTI[ev.key]);
  else return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
}, true);

window.addEventListener('resize', () => { if (jeOtevreny(OKNO)) graf(); });
