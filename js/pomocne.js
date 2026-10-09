// Pomocné funkce: data a časy po česku, texty, úložiště v zařízení.

export const DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
export const DNY_KR = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
export const MESICE = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
export const MESICE_1 = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
export const DEN_MS = 864e5;

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
}

// ---------------------------------------------------------------- data a časy (místní čas zařízení)

export function pulnoc(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
/** Posun o n kalendářních dní (bezpečné přes přechod letního času). */
export function pridejDny(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
export function rozdilDni(t, vuci) { return Math.round((pulnoc(t) - pulnoc(vuci == null ? Date.now() : vuci)) / DEN_MS); }
export function zacatekTydne(t) { const d = new Date(pulnoc(t)); return pridejDny(d.getTime(), -((d.getDay() + 6) % 7)); }
export function hhmm(t) { const d = new Date(t); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }
export function dm(t) { const d = new Date(t); return d.getDate() + '. ' + (d.getMonth() + 1) + '.'; }

/** Krátce pro seznamy: dnes „14:05“, včera, den v týdnu, jinak „2. 10.“ */
export function kdyKratce(t) {
  const r = rozdilDni(t);
  if (r === 0) return hhmm(t);
  if (r === -1) return 'včera';
  if (r > -7 && r < 0) return DNY_KR[new Date(t).getDay()];
  return dm(t) + (new Date(t).getFullYear() !== new Date().getFullYear() ? ' ' + new Date(t).getFullYear() : '');
}

/** „pátek 2. října“ (+ rok, když není letošní) */
export function datumDlouhe(t) {
  const d = new Date(t);
  return DNY[d.getDay()] + ' ' + d.getDate() + '. ' + MESICE[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
}

/** „Dnes · pátek 2. října“, „Zítra · …“, jinak „pondělí 5. října“ */
export function denNadpis(t) {
  const r = rozdilDni(t);
  return (r === 0 ? 'Dnes · ' : r === 1 ? 'Zítra · ' : r === -1 ? 'Včera · ' : '') + datumDlouhe(t);
}

/** Čas zprávy v detailu: „dnes 14:05“, „včera 9:12“, „čt 1. 10. 18:40“ */
export function kdyDlouze(t) {
  const r = rozdilDni(t);
  if (r === 0) return 'dnes ' + hhmm(t);
  if (r === -1) return 'včera ' + hhmm(t);
  return DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + ' ' + hhmm(t);
}

export function terminDatum(s) { // "2026-10-06" → ms místní půlnoci
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null;
}

/** ms → "2026-10-06" (místní datum) */
export function isoDatum(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function trvani(ms) {
  const min = Math.round(ms / 6e4);
  if (min < 60) return min + ' min';
  const h = Math.floor(min / 60), m = min % 60;
  return h + ' h' + (m ? ' ' + m + ' min' : '');
}

// ---------------------------------------------------------------- texty

export function prvniRadek(s, max) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

export function tvar(n, jedna, dve, pet) { return n === 1 ? jedna : n >= 2 && n <= 4 ? dve : pet; }

/** Název klubu bez právní formy a zkratek: „FK Hodonín "B"“ → „Hodonín B“, „TJ Sokol Těšany, z. s.“ → „Těšany“ (fotbal, plakát). */
export function klub(n) { return String(n || '').replace(/["„“”]/g, '').replace(/,?\s*z\.\s*s\.?$/i, '').replace(/^((FK|TJ|SK|FC|SFK|MFK|AFC|SC|Sokol|Agro)\s+)+/i, '').trim() || n; }
export function velkePrvni(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export function iniciala(jmeno) {
  const slova = String(jmeno || '?').replace(/[„“"'(<].*$/, '').trim().split(/\s+/).filter(Boolean);
  if (!slova.length) return '?';
  const pismena = (slova.length > 1 ? slova[0][0] + slova[slova.length - 1][0] : slova[0].slice(0, 2));
  return pismena.toUpperCase();
}

/** Stálý odstín (0–359) podle jména – avatar má pastelové pozadí v tomhle odstínu (CSS --h). */
export function odstin(s) {
  let h = 0;
  for (const z of String(s || '')) h = (h * 31 + z.codePointAt(0)) >>> 0;
  return h % 360;
}

/** Escapuje text a adresy z něj udělá odkazy (otevírají se mimo aplikaci). */
export function sOdkazy(text) {
  return esc(text).replace(/\bhttps?:\/\/[^\s<>"']+/g, (u) => {
    const konec = (/[.,;:!?)]+$/.exec(u) || [''])[0];
    const adresa = konec ? u.slice(0, -konec.length) : u;
    return '<a href="' + adresa + '" target="_blank" rel="noopener noreferrer">' + adresa + '</a>' + konec;
  });
}

export function velikost(b) {
  if (b == null) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return Math.round(b / 1024) + ' kB';
  return (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
}

/** Jména z hlavičky „Jan Novák <jan@x.cz>, eva@y.cz“ → „Jan Novák, eva@y.cz“ */
/** Seznam adres rozdělený podle čárek a středníků mimo uvozovky a <…> – jméno „Novák, Jan“ se nerozdělí. */
export function rozdelAdresy(text) {
  const vysledek = [];
  let aktualni = '', zavira = '';
  const pary = { '"': '"', '„': '“', '“': '”', '<': '>', '(': ')' };
  for (const z of String(text || '')) {
    if (zavira) { aktualni += z; if (z === zavira) zavira = ''; continue; }
    if (pary[z]) { zavira = pary[z]; aktualni += z; continue; }
    if (z === ',' || z === ';') { if (aktualni.trim()) vysledek.push(aktualni.trim()); aktualni = ''; continue; }
    aktualni += z;
  }
  if (aktualni.trim()) vysledek.push(aktualni.trim());
  return vysledek;
}

export function jmenaAdres(s) {
  return rozdelAdresy(s).map((a) => {
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(a);
    return m ? (m[1].trim() || m[2].trim()) : a.trim();
  }).filter(Boolean).join(', ');
}

// ---------------------------------------------------------------- úložiště v zařízení (jen pohodlí – může být prázdné)

export const uloziste = {
  cti(k) {
    try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; }
  },
  pis(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  },
  smaz(k) {
    try { localStorage.removeItem(k); } catch (e) { /* nic */ }
  },
  klice(predpona) {
    try { return Object.keys(localStorage).filter((k) => k.indexOf(predpona) === 0); } catch (e) { return []; }
  }
};
