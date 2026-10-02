// Fotbal: zápasy našich týmů z fotbal.cz (nástroj v Chromu → schránka → motor) – poslední výsledky, další zápasy
// a převod vybraných týmů do kalendářů Google („⚽ A-tým“…). Kalendář pak ukazuje zápasy všude (Dnes, týden, Zdraví).

import { stav, zmeneno, umiMotor, hooky } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, dm, hhmm, DNY_KR, rozdilDni, kdyKratce } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, hlavickaKarty } from './ui.js';

const ULOZISTE = 'asistent.data.fotbal';

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.fotbal = v.data;
}

export function nactiFotbal() {
  if (!umiMotor('fotbal') || stav.nacita.fotbal) return Promise.resolve();
  stav.nacita.fotbal = true;
  stav.chyby.fotbal = null;
  return volej('fotbal')
    .then((data) => {
      stav.fotbal = data;
      uloziste.pis(ULOZISTE, { data, kdy: Date.now() });
      // motor při změně dat sám obnovil kalendáře → načíst je znovu
      if (data && data.kalendar && (data.kalendar.pridano || data.kalendar.upraveno) && hooky.obnovKalendar) hooky.obnovKalendar();
    })
    .catch((e) => { stav.chyby.fotbal = e; })
    .then(() => { stav.nacita.fotbal = false; zmeneno(); });
}

export function dotahni() {
  if (umiMotor('fotbal') && !stav.fotbal && !stav.nacita.fotbal && !stav.chyby.fotbal) nactiFotbal();
}

function data() { return stav.fotbal && stav.fotbal.data; }
export function maData() { return !!(data() && data().zapasy && data().zapasy.length); }

const cas = (z) => Date.parse(z.zacatek);
function klub(n) { return String(n || '').replace(/["„“”]/g, '').replace(/,?\s*z\.\s*s\.?$/i, '').replace(/^((FK|TJ|SK|FC|SFK|MFK|AFC|SC|Sokol|Agro)\s+)+/i, '').trim() || n; }
function souper(z) { return klub(z.doma ? z.hoste : z.domaci); }
/** Výhra / remíza / prohra z pohledu našeho týmu. */
function vrp(z) {
  const m = /^(\d+)\s*:\s*(\d+)/.exec(z.vysledek || '');
  if (!m) return '';
  const my = +(z.doma ? m[1] : m[2]), oni = +(z.doma ? m[2] : m[1]);
  return my > oni ? 'V' : my < oni ? 'P' : 'R';
}
function kdy(t) {
  const r = rozdilDni(t);
  return (r === 0 ? 'dnes' : r === 1 ? 'zítra' : r === -1 ? 'včera' : DNY_KR[new Date(t).getDay()] + ' ' + dm(t)) + ' ' + hhmm(t);
}

/** Pro každý tým: poslední odehraný zápas s výsledkem a nejbližší další. */
export function prehled() {
  const d = data();
  if (!d) return [];
  const ted = Date.now();
  return (d.tymy || []).map((t) => {
    const zapasy = d.zapasy.filter((z) => z.tym === t.klic).sort((a, b) => cas(a) - cas(b));
    const posledni = zapasy.filter((z) => z.vysledek && cas(z) < ted).pop() || null;
    const dalsi = zapasy.find((z) => cas(z) + 2 * 36e5 > ted && !z.vysledek) || null;
    return { tym: t, posledni, dalsi };
  });
}

/** Nejbližší zápas klubu (kterýkoli tým) do n dní: { zacatek, nazev } – pro „Další zápas“, když v kalendáři není. */
export function dalsiZapasKlubu(dni) {
  const d = data();
  if (!d) return null;
  const ted = Date.now();
  const z = d.zapasy.filter((x) => !x.vysledek && cas(x) + 2 * 36e5 > ted && cas(x) < ted + (dni || 14) * 864e5).sort((a, b) => cas(a) - cas(b))[0];
  if (!z) return null;
  const t = (d.tymy || []).find((x) => x.klic === z.tym);
  const nas = klub(d.klub || '');
  return { zacatek: cas(z), nazev: (z.doma ? nas + ' – ' + souper(z) : souper(z) + ' – ' + nas) + (t ? ' (' + t.nazev + ')' : '') };
}

/** Výsledky zápasů odehraných od posledního otevření (pro „Co je nového“): [{ text, vrp }] */
export function noveVysledky(od) {
  const d = data();
  if (!d) return [];
  const nas = klub(d.klub || '');
  return d.zapasy.filter((z) => z.vysledek && cas(z) + 2 * 36e5 > od && cas(z) < Date.now()).map((z) => {
    const t = (d.tymy || []).find((x) => x.klic === z.tym);
    return { text: (t ? t.nazev + ': ' : '') + (z.doma ? nas + ' – ' + souper(z) : souper(z) + ' – ' + nas) + ' ' + z.vysledek, vrp: vrp(z) };
  });
}

/** Karta Fotbal na Dnes: řádek na tým – poslední výsledek (V/R/P) a další zápas. */
export function kartaDnesHtml() {
  const p = prehled();
  if (!p.length) return '';
  const d = data();
  return hlavickaKarty(IKONY.zapas, 'Fotbal · ' + esc(klub(d.klub || '')), '<span class="muted small">' + esc(kdyKratce(Date.parse(d.aktualizovano) || 0)) + '</span>') +
    '<ul class="fotbal-tymy">' + p.map((x) => {
      const v = x.posledni ? vrp(x.posledni) : '';
      return '<li><b class="fotbal-tym" style="--b:' + esc(x.tym.barva || 'var(--accent)') + '">' + esc(x.tym.nazev) + '</b>' +
        (x.posledni ? '<span class="fotbal-vysledek fotbal-vysledek--' + v + '" title="' + esc(x.posledni.domaci + ' – ' + x.posledni.hoste) + '">' +
          '<i>' + v + '</i>' + esc(x.posledni.vysledek) + ' ' + esc(souper(x.posledni)) + '</span>' : '<span class="fotbal-vysledek">–</span>') +
        (x.dalsi ? '<span class="fotbal-dalsi">' + esc(kdy(cas(x.dalsi))) + ' · ' + esc(souper(x.dalsi)) + ' <small>' + (x.dalsi.doma ? 'doma' : 'venku') + '</small></span>'
          : '<span class="fotbal-dalsi muted">podzim dohrán</span>') + '</li>';
    }).join('') + '</ul>';
}

/** Týmy do kalendáře (pravý panel Kalendáře a Nastavení): pilulky – zapnutý tým má zápasy v kalendáři „⚽ tým“. */
export function tymyHtml() {
  if (!umiMotor('fotbal')) return '';
  const d = data();
  if (!d) {
    return '<p class="karta-text">Zápasy z fotbal.cz zatím ve schránce nejsou – stáhne je úloha „Fotbal z fotbal.cz“ (Michalův Chrome).</p>';
  }
  const zapnute = (stav.fotbal && stav.fotbal.vKalendari) || [];
  return '<p class="karta-text">Zápasy našich týmů z fotbal.cz. Zapnutý tým má zápasy v kalendáři „⚽ tým“ – přeložení a výsledky se doplní samy.</p>' +
    '<div class="fotbal-volby">' + (d.tymy || []).map((t) => '<button type="button" class="chip" data-fotbal-tym="' + esc(t.klic) + '" aria-pressed="' +
      (zapnute.indexOf(t.klic) >= 0) + '" title="' + esc(t.soutez || '') + '">' + IKONY.zapas + esc(t.nazev) + '</button>').join('') + '</div>' +
    '<p class="napoveda">Aktualizováno ' + esc(kdyKratce(Date.parse(d.aktualizovano) || 0)) + ' · ' + d.zapasy.length + ' zápasů</p>';
}

export function klikFotbal(el) {
  if (!el.dataset.fotbalTym) return false;
  const klic = el.dataset.fotbalTym;
  const zapnute = ((stav.fotbal && stav.fotbal.vKalendari) || []).slice();
  const i = zapnute.indexOf(klic);
  if (i >= 0) zapnute.splice(i, 1); else zapnute.push(klic);
  el.disabled = true;
  volej('fotbalKalendar', { tymy: zapnute })
    .then((v) => {
      if (stav.fotbal) stav.fotbal.vKalendari = zapnute;
      if (stav.info && v.kalendareSeznam) { stav.info.kalendare = v.kalendareSeznam; uloziste.pis('asistent.info', stav.info); }
      toast(i >= 0 ? 'Tým už se do kalendáře nepřidává (zapsané zápasy zůstaly)' : 'V kalendáři: ' + v.pridano + ' nových zápasů' + (v.upraveno ? ', ' + v.upraveno + ' upraveno' : ''));
      if (hooky.obnovKalendar) hooky.obnovKalendar();
    })
    .catch((e) => toast(e.message, true))
    .then(() => { el.disabled = false; zmeneno(); });
  return true;
}
