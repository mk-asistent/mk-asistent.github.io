// Plánek cviku (16. 11.) – schéma fotbalového cvičení: výřez hřiště, hráči, míč, kužely, figuríny, tyče, branky,
// zóny, texty a čáry (běh, přihrávka, vedení míče, střela) s čísly kroků. Základ z taktické tabule webu dorostu
// (web_dorost/assets/js/taktika.js: pitchSvg, arrowSvg, itemSvg) – bez globálního stavu, bez DOM, běží i v Node.
//
// Souřadnice v metrech na hřišti 105 × 68: x po délce (0 = levá brankové čára), y přes šířku (0 = horní postranní).
// Velikost značek se řídí výřezem (menší strana / 36), aby byl čitelný plánek 15 × 10 m i celé hřiště.
// Branka: x, y = střed brankové čáry, w = šířka v metrech, rot ve stupních po směru hodinových ručiček:
//   0 = branka otevřená doprava (síť vlevo, jako levá branka hřiště), 90 = otevřená dolů, 180 = otevřená doleva
//   (pravá branka hřiště na x = 105), 270 = otevřená nahoru.

export const DELKA = 105;
export const SIRKA = 68;
export const MAX_PRVKU = 80;

/** Pojmenované výřezy pro výběr v editoru. */
export const VYREZY = {
  cele: { nazev: 'Celé hřiště', vyrez: [-2, -2, 109, 72], hriste: 'cary' },
  polovina: { nazev: 'Polovina', vyrez: [50.5, -2, 57.5, 72], hriste: 'cary' },
  vapno: { nazev: 'Vápno s brankou', vyrez: [74, 8, 33, 52], hriste: 'cary' },
  tretina: { nazev: 'Útočná třetina', vyrez: [68, -2, 39, 72], hriste: 'cary' },
  stred: { nazev: 'Střed hřiště', vyrez: [32.5, 14, 40, 40], hriste: 'cary' },
  ctverec: { nazev: 'Čtverec 20 × 20', vyrez: [0, 0, 20, 20], hriste: 'trava' },
  obdelnik: { nazev: 'Obdélník 30 × 20', vyrez: [0, 0, 30, 20], hriste: 'trava' }
};

export const CARY = ['pass', 'run', 'dribble', 'shot'];

export function novyPlanek(vyrez) {
  const v = typeof vyrez === 'string' ? VYREZY[vyrez] : null;
  if (v) return { vyrez: v.vyrez.slice(), hriste: v.hriste, prvky: [] };
  if (Array.isArray(vyrez) && vyrez.length === 4) return cistyPlanek({ vyrez: vyrez, prvky: [] }, true);
  return { vyrez: VYREZY.obdelnik.vyrez.slice(), hriste: 'trava', prvky: [] };
}

/**
 * Očistí plánek: známé typy, čísla oříznutá na hřiště, nejvýš 80 prvků, texty ≤ 40 znaků, id doplněná a jedinečná,
 * neznámé klíče zahozené. Vrací nový objekt, nebo null (není objekt / žádný platný prvek; s prazdnyOk jen když není objekt).
 * Psáno jednoduše (ES2019, bez závislostí), aby šlo celé zkopírovat do Kod.gs.
 */
export function cistyPlanek(x, prazdnyOk) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const L = 105, W = 68, OKRAJ = 3;
  function cislo(v, min, max, vychozi) {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (!isFinite(n)) return vychozi;
    return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
  }
  function text(v, max) {
    if (v == null) return '';
    return String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  }
  // výřez: smí přesahovat hřiště o 3 m (síť branky za čarou), nejmenší 4 × 4 m
  let vyrez = [-2, -2, 109, 72];
  if (Array.isArray(x.vyrez) && x.vyrez.length === 4) {
    const vx = cislo(x.vyrez[0], -OKRAJ, L + OKRAJ - 4, NaN), vy = cislo(x.vyrez[1], -OKRAJ, W + OKRAJ - 4, NaN);
    if (isFinite(vx) && isFinite(vy)) {
      const vw = cislo(x.vyrez[2], 4, L + OKRAJ - vx, NaN), vh = cislo(x.vyrez[3], 4, W + OKRAJ - vy, NaN);
      if (isFinite(vw) && isFinite(vh)) vyrez = [vx, vy, vw, vh];
    }
  }
  const hriste = x.hriste === 'trava' ? 'trava' : 'cary';
  const ZNAKY = { p: 'h', ball: 'm', cone: 'k', mannequin: 'f', pole: 't', goal: 'b', pass: 'c', run: 'c', dribble: 'c', shot: 'c', zone: 'z', text: 'x' };
  const pouzita = {};
  const prvky = [];
  const vstup = Array.isArray(x.prvky) ? x.prvky : [];
  for (let i = 0; i < vstup.length && prvky.length < 80; i++) {
    const a = vstup[i];
    if (!a || typeof a !== 'object' || !ZNAKY[a.t]) continue;
    const o = { t: a.t, id: '' };
    if (a.t === 'pass' || a.t === 'run' || a.t === 'dribble' || a.t === 'shot') {
      o.x1 = cislo(a.x1, 0, L, NaN); o.y1 = cislo(a.y1, 0, W, NaN);
      o.x2 = cislo(a.x2, 0, L, NaN); o.y2 = cislo(a.y2, 0, W, NaN);
      if (!isFinite(o.x1) || !isFinite(o.y1) || !isFinite(o.x2) || !isFinite(o.y2)) continue;
      if (Math.abs(o.x2 - o.x1) + Math.abs(o.y2 - o.y1) < 0.2) continue;
      const bx = cislo(a.bx, -60, 60, 0), by = cislo(a.by, -60, 60, 0);
      if (bx || by) { o.bx = bx; o.by = by; }
      const krok = cislo(a.krok, -1e9, 1e9, 0);
      if (krok >= 1 && krok <= 20 && Math.round(krok) === krok) o.krok = krok;
    } else {
      o.x = cislo(a.x, 0, L, NaN); o.y = cislo(a.y, 0, W, NaN);
      if (!isFinite(o.x) || !isFinite(o.y)) continue;
      if (a.t === 'p') {
        o.side = a.side === 'away' || a.side === 'neutral' ? a.side : 'home';
        const num = text(a.num, 3);
        if (num) o.num = num;
        if (a.gk === true) o.gk = true;
      } else if (a.t === 'cone') {
        if (typeof a.color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(a.color)) o.color = a.color.toLowerCase();
      } else if (a.t === 'goal') {
        o.w = cislo(a.w, 1, 8, 7.32);
        const rot = Math.round(cislo(a.rot, -3600, 3600, 0));
        o.rot = ((rot % 360) + 360) % 360;
      } else if (a.t === 'zone') {
        o.w = cislo(a.w, 0.5, L - o.x, NaN); o.h = cislo(a.h, 0.5, W - o.y, NaN);
        if (!isFinite(o.w) || !isFinite(o.h)) continue;
      } else if (a.t === 'text') {
        o.text = text(a.text, 40);
        if (!o.text) continue;
      }
    }
    const id = typeof a.id === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(a.id) && !pouzita[a.id] ? a.id : '';
    o.id = id;
    pouzita[id] = !!id;
    prvky.push(o);
  }
  // doplnění chybějících id (až po projití všech, aby nové nekolidovalo s pozdějším zadaným)
  for (let i = 0; i < prvky.length; i++) {
    if (prvky[i].id) continue;
    let n = 1;
    while (pouzita[ZNAKY[prvky[i].t] + n]) n++;
    prvky[i].id = ZNAKY[prvky[i].t] + n;
    pouzita[prvky[i].id] = true;
  }
  if (!prvky.length && !prazdnyOk) return null;
  return { vyrez: vyrez, hriste: hriste, prvky: prvky };
}

// ---------------------------------------------------------------- kreslení

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
}
const f = (n) => String(Math.round(n * 100) / 100);

/** Velikost značek: úměrná menší straně výřezu (celé hřiště = 2, čtverec 20 m ≈ 0,56; hráč má poloměr 1,9 × S). */
export function meritko(vyrez) { return Math.min(vyrez[2], vyrez[3]) / 36; }

/** Řídicí bod kvadratické křivky čáry a bod na ní (t 0–1). */
export function ridiciBod(a) { return [(a.x1 + a.x2) / 2 + (a.bx || 0), (a.y1 + a.y2) / 2 + (a.by || 0)]; }
export function bodNaCare(a, t) {
  const c = ridiciBod(a), u = 1 - t;
  return [u * u * a.x1 + 2 * u * t * c[0] + t * t * a.x2, u * u * a.y1 + 2 * u * t * c[1] + t * t * a.y2];
}

function hristeSvg(p, S) {
  const [vx, vy, vw, vh] = p.vyrez;
  let pasy = '';
  // pruhy trávy: na hřišti po 10,5 m jako skutečné sekání, na volné ploše šest pruhů přes výřez
  const krok = p.hriste === 'cary' ? 10.5 : vw / 6;
  const od = p.hriste === 'cary' ? Math.floor(vx / krok) : 0;
  for (let i = od; ; i++) {
    const x0 = p.hriste === 'cary' ? i * krok : vx + i * krok;
    if (x0 >= vx + vw) break;
    if (i % 2) pasy += `<rect class="pl-trava2" x="${f(x0)}" y="${f(vy)}" width="${f(krok)}" height="${f(vh)}"/>`;
  }
  let s = `<rect class="pl-trava" x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}"/>${pasy}`;
  if (p.hriste !== 'cary') return s;
  const sw = f(Math.max(0.12, 0.16 * S));
  s += `<g class="pl-hriste" fill="none" stroke-width="${sw}">
<rect x="0" y="0" width="105" height="68"/><line x1="52.5" y1="0" x2="52.5" y2="68"/><circle cx="52.5" cy="34" r="9.15"/>
<rect x="0" y="13.84" width="16.5" height="40.32"/><rect x="88.5" y="13.84" width="16.5" height="40.32"/>
<rect x="0" y="24.84" width="5.5" height="18.32"/><rect x="99.5" y="24.84" width="5.5" height="18.32"/>
<path d="M16.5 26.69A9.15 9.15 0 0 1 16.5 41.31"/><path d="M88.5 26.69A9.15 9.15 0 0 0 88.5 41.31"/>
<path d="M1 0A1 1 0 0 1 0 1"/><path d="M104 0A1 1 0 0 0 105 1"/><path d="M0 67A1 1 0 0 1 1 68"/><path d="M104 68A1 1 0 0 1 105 67"/></g>
<g class="pl-hriste-body"><circle cx="52.5" cy="34" r="${f(Math.max(0.25, 0.3 * S))}"/><circle cx="11" cy="34" r="${f(Math.max(0.25, 0.3 * S))}"/><circle cx="94" cy="34" r="${f(Math.max(0.25, 0.3 * S))}"/></g>`;
  return s;
}

/** Body podél čáry (posunuté o `posun` kolmo, volitelně vlnka) – pro vedení míče a dvojitou čáru střely. */
function bodyCary(a, konec, posun, amp, vlna) {
  const delka = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) + Math.hypot(a.bx || 0, a.by || 0) * 0.5;
  const n = Math.max(16, Math.min(240, Math.round(delka / Math.max(0.05, vlna / 6 || 0.4))));
  const body = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * konec;
    const p = bodNaCare(a, t), q = bodNaCare(a, Math.min(1, t + 0.01));
    let nx = -(q[1] - p[1]), ny = q[0] - p[0];
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    let odchylka = posun;
    if (amp) {
      const tlum = Math.min(1, (t / konec) * 8, (1 - t / konec) * 6);
      odchylka += amp * tlum * Math.sin(((t * delka) / vlna) * Math.PI * 2);
    }
    body.push(f(p[0] + nx * odchylka) + ',' + f(p[1] + ny * odchylka));
  }
  return 'M' + body.join(' L');
}

function caraSvg(a, S, vybrana) {
  const c = ridiciBod(a);
  let tx = a.x2 - c[0], ty = a.y2 - c[1];
  if (Math.hypot(tx, ty) < 0.01) { tx = a.x2 - a.x1; ty = a.y2 - a.y1; }
  const tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
  const hrot = 1.5 * S, hw = 0.85 * S;
  const zx = a.x2 - ux * hrot, zy = a.y2 - uy * hrot;
  const hrotBody = `${f(a.x2)},${f(a.y2)} ${f(zx - uy * hw)},${f(zy + ux * hw)} ${f(zx + uy * hw)},${f(zy - ux * hw)}`;
  // čára končí pod hrotem: parametr t, kde je od konce zhruba 0,8 délky hrotu
  const delka = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1;
  const konec = Math.max(0.5, 1 - (hrot * 0.8) / delka);
  const e = bodNaCare(a, konec);
  const sw = 0.3 * S;
  let cesty;
  if (a.t === 'dribble') {
    cesty = [bodyCary(a, konec, 0, 0.42 * S, 1.6 * S)];
  } else if (a.t === 'shot') {
    cesty = [bodyCary(a, konec, 0.32 * S, 0, 0), bodyCary(a, konec, -0.32 * S, 0, 0)];
  } else {
    cesty = [`M${f(a.x1)} ${f(a.y1)}Q${f(c[0])} ${f(c[1])} ${f(e[0])} ${f(e[1])}`];
  }
  const carka = a.t === 'pass' ? ` stroke-dasharray="${f(1.1 * S)} ${f(0.8 * S)}"` : '';
  const halo = cesty.map((d) => `<path class="pl-halo" d="${d}" stroke-width="${f(sw * 2.2)}"/>`).join('');
  const tahy = cesty.map((d) => `<path class="pl-cara" d="${d}" stroke-width="${f(vybrana ? sw * 1.4 : sw)}"${carka}/>`).join('');
  const zasah = `<path class="pl-zasah" d="M${f(a.x1)} ${f(a.y1)}Q${f(c[0])} ${f(c[1])} ${f(a.x2)} ${f(a.y2)}" stroke-width="${f(2.4 * S)}"/>`;
  const zvyr = vybrana ? `<path class="pl-zvyrazneni" d="M${f(a.x1)} ${f(a.y1)}Q${f(c[0])} ${f(c[1])} ${f(a.x2)} ${f(a.y2)}" stroke-width="${f(1.3 * S)}"/>` : '';
  return `<g class="pl-prvek pl-${a.t}${vybrana ? ' pl-vybrany' : ''}" data-id="${esc(a.id)}">${zvyr}${halo}${tahy}<polygon class="pl-hrot" points="${hrotBody}"/>${zasah}</g>`;
}

function krokSvg(a, S) {
  const m = bodNaCare(a, 0.5), r = 1.05 * S;
  return `<g class="pl-krok" data-id="${esc(a.id)}" transform="translate(${f(m[0])} ${f(m[1])})"><circle r="${f(r)}" stroke-width="${f(0.18 * S)}"/>` +
    `<text y="${f(0.45 * S)}" font-size="${f(1.3 * S)}" text-anchor="middle">${esc(a.krok)}</text></g>`;
}

function prvekSvg(it, S, vybrany) {
  const krouzek = (r) => vybrany ? `<circle class="pl-krouzek" r="${f(r)}" stroke-width="${f(0.3 * S)}"/>` : '';
  const g = (trida, obsah, transform) =>
    `<g class="pl-prvek ${trida}${vybrany ? ' pl-vybrany' : ''}" data-id="${esc(it.id)}"${transform === '' ? '' : ` transform="${transform || `translate(${f(it.x)} ${f(it.y)})`}"`}>${obsah}</g>`;
  if (it.t === 'p') {
    const r = 1.9 * S, num = it.num || '';
    const fs = (num.length > 2 ? 1.35 : 1.85) * S;
    const trida = 'pl-hrac pl-hrac--' + it.side + (it.gk ? ' pl-hrac--gk' : '');
    return g(trida, krouzek(r + 0.6 * S) + `<circle class="pl-hrac__telo" r="${f(r)}" stroke-width="${f(0.26 * S)}"/>` +
      (num ? `<text class="pl-hrac__num" y="${f(fs * 0.36)}" font-size="${f(fs)}" text-anchor="middle">${esc(num)}</text>` : ''));
  }
  if (it.t === 'ball') {
    const r = 0.85 * S, k = r * 0.4;
    return g('pl-mic', krouzek(r + 0.5 * S) + `<circle class="pl-mic__telo" r="${f(r)}" stroke-width="${f(0.16 * S)}"/>` +
      `<polygon class="pl-mic__skvrna" points="0,${f(-k)} ${f(k * 0.95)},${f(-k * 0.31)} ${f(k * 0.59)},${f(k * 0.81)} ${f(-k * 0.59)},${f(k * 0.81)} ${f(-k * 0.95)},${f(-k * 0.31)}"/>`);
  }
  if (it.t === 'cone') {
    const h = 1.3 * S;
    const barva = it.color ? ` style="fill:${esc(it.color)}"` : '';
    return g('pl-kuzel', krouzek(1.4 * S) + `<polygon class="pl-kuzel__telo"${barva} points="0,${f(-h * 0.62)} ${f(h * 0.55)},${f(h * 0.45)} ${f(-h * 0.55)},${f(h * 0.45)}" stroke-width="${f(0.12 * S)}"/>`);
  }
  if (it.t === 'mannequin') {
    // figurína shora: hlava + ramena (lichoběžník) + stojan
    return g('pl-figurina', krouzek(1.7 * S) +
      `<path class="pl-figurina__telo" d="M${f(-1.2 * S)} ${f(0.9 * S)}L${f(-0.75 * S)} ${f(-0.55 * S)}L${f(0.75 * S)} ${f(-0.55 * S)}L${f(1.2 * S)} ${f(0.9 * S)}Z" stroke-width="${f(0.14 * S)}"/>` +
      `<circle class="pl-figurina__telo" cy="${f(-1.05 * S)}" r="${f(0.5 * S)}" stroke-width="${f(0.14 * S)}"/>`);
  }
  if (it.t === 'pole') {
    return g('pl-tyc', krouzek(1 * S) + `<circle class="pl-tyc__pata" r="${f(0.55 * S)}" stroke-width="${f(0.12 * S)}"/>` +
      `<line class="pl-tyc__telo" x1="0" y1="0" x2="0" y2="${f(-1.9 * S)}" stroke-width="${f(0.3 * S)}"/>`);
  }
  if (it.t === 'goal') {
    // skutečné rozměry v metrech: šířka w, hloubka sítě podle šířky; čáry podle měřítka
    const w = it.w || 7.32, h = w / 2, d = Math.min(2, Math.max(0.6, w * 0.28));
    return g('pl-branka',
      (vybrany ? `<rect class="pl-krouzek" x="${f(-d - 0.6 * S)}" y="${f(-h - 0.6 * S)}" width="${f(d + 1.2 * S)}" height="${f(w + 1.2 * S)}" stroke-width="${f(0.3 * S)}"/>` : '') +
      `<rect class="pl-branka__sit" x="${f(-d)}" y="${f(-h)}" width="${f(d)}" height="${f(w)}" stroke-width="${f(0.1 * S)}"/>` +
      `<path class="pl-branka__ram" d="M0 ${f(-h)}L${f(-d)} ${f(-h)}M0 ${f(h)}L${f(-d)} ${f(h)}M0 ${f(-h)}L0 ${f(h)}" stroke-width="${f(Math.max(0.12, 0.28 * S))}"/>`,
      `translate(${f(it.x)} ${f(it.y)}) rotate(${it.rot || 0})`);
  }
  if (it.t === 'zone') {
    return g('pl-zona', `<rect class="pl-zona__telo" x="${f(it.x)}" y="${f(it.y)}" width="${f(it.w)}" height="${f(it.h)}" rx="${f(0.5 * S)}"` +
      ` stroke-width="${f((vybrany ? 0.32 : 0.22) * S)}" stroke-dasharray="${f(0.9 * S)} ${f(0.6 * S)}"/>`, '');
  }
  if (it.t === 'text') {
    return g('pl-text', `<text class="pl-text__telo" font-size="${f(2 * S)}" stroke-width="${f(0.45 * S)}" text-anchor="middle" dominant-baseline="middle">${esc(it.text)}</text>` +
      (vybrany ? `<line class="pl-krouzek" x1="${f(-2 * S)}" x2="${f(2 * S)}" y1="${f(1.4 * S)}" y2="${f(1.4 * S)}" stroke-width="${f(0.3 * S)}"/>` : ''));
  }
  return '';
}

function uchytySvg(it, S) {
  const u = (x, y, k) => `<g class="pl-uchyt" data-uchyt="${k}" transform="translate(${f(x)} ${f(y)})"><circle class="pl-uchyt__zasah" r="${f(2 * S)}"/><circle r="${f(0.8 * S)}" stroke-width="${f(0.28 * S)}"/></g>`;
  if (CARY.indexOf(it.t) >= 0) {
    const m = bodNaCare(it, 0.5);
    return u(it.x1, it.y1, 'p1') + u(it.x2, it.y2, 'p2') + u(m[0], m[1], 'mid');
  }
  if (it.t === 'zone') return u(it.x + it.w, it.y + it.h, 'roh');
  return '';
}

/**
 * Celé SVG plánku jako text. volby: { vybrane: [id], uchyty: bool (úchyty u jediného vybraného), tisk: bool (světlá
 * varianta), legenda: bool (vrátí <figure> se SVG a legendou pod ním), obdelnik: {x,y,w,h} (výběr tažením v editoru) }.
 */
export function planekSvg(planek, volby) {
  const v = volby || {};
  const p = cistyPlanek(planek, true) || novyPlanek();
  const [vx, vy, vw, vh] = p.vyrez;
  const S = meritko(p.vyrez);
  const vybrane = {};
  (v.vybrane || []).forEach((id) => { vybrane[id] = true; });
  const cary = p.prvky.filter((i) => CARY.indexOf(i.t) >= 0);
  const kresli = (i) => CARY.indexOf(i.t) >= 0 ? caraSvg(i, S, !!vybrane[i.id]) : prvekSvg(i, S, !!vybrane[i.id]);
  const vrstvy = [
    p.prvky.filter((i) => i.t === 'zone').map(kresli).join(''),
    p.prvky.filter((i) => i.t === 'goal').map(kresli).join(''),
    cary.map(kresli).join(''),
    p.prvky.filter((i) => i.t !== 'zone' && i.t !== 'goal' && CARY.indexOf(i.t) < 0 && i.t !== 'text').map(kresli).join(''),
    p.prvky.filter((i) => i.t === 'text').map(kresli).join(''),
    cary.filter((i) => i.krok).map((i) => krokSvg(i, S)).join('')
  ].join('');
  const ids = Object.keys(vybrane);
  let uchyty = '';
  if (v.uchyty && ids.length === 1) {
    const it = p.prvky.find((i) => i.id === ids[0]);
    if (it) uchyty = uchytySvg(it, S);
  }
  const o = v.obdelnik;
  const ramecek = o ? `<rect class="pl-ramecek" x="${f(o.x)}" y="${f(o.y)}" width="${f(o.w)}" height="${f(o.h)}" stroke-width="${f(0.2 * S)}" stroke-dasharray="${f(0.8 * S)} ${f(0.5 * S)}"/>` : '';
  const vb = `${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}`;
  // vnořené <svg> ořízne čáry hřiště přesně výřezem (i když je kořen roztažený víc než poměr stran)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="planek${v.tisk ? ' planek--tisk' : ''}" viewBox="${vb}" role="img" aria-label="Plánek cviku" ` +
    `style="aspect-ratio:${f(vw)} / ${f(vh)}"><svg x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" viewBox="${vb}" overflow="hidden">` +
    hristeSvg(p, S) + vrstvy + uchyty + ramecek + '</svg></svg>';
  if (!v.legenda) return svg;
  return `<figure class="planek-obal">${svg}${legendaHtml(p)}</figure>`;
}

// ---------------------------------------------------------------- legenda

const POPISY = [
  ['run', 'běh bez míče'], ['pass', 'přihrávka'], ['dribble', 'vedení míče'], ['shot', 'střela'],
  ['home', 'naši / útočící'], ['away', 'soupeř / bránící'], ['neutral', 'žolík / nahrávač'], ['gk', 'brankář'],
  ['ball', 'míč'], ['cone', 'kužel'], ['mannequin', 'figurína'], ['pole', 'tyč'], ['goal', 'branka'], ['zone', 'zóna'], ['krok', 'pořadí kroku']
];

/** Krátká legenda (HTML) jen z druhů, které v plánku jsou; prázdný řetězec, když není co vysvětlovat. */
export function legendaHtml(planek) {
  const p = cistyPlanek(planek, true);
  if (!p) return '';
  const je = {};
  p.prvky.forEach((i) => {
    if (i.t === 'p') je[i.gk ? 'gk' : i.side] = true;
    else je[i.t] = true;
    if (i.krok) je.krok = true;
  });
  const S = 2.4;
  const polozky = POPISY.filter((x) => je[x[0]]).map((x) => {
    const k = x[0];
    let obr;
    if (CARY.indexOf(k) >= 0) {
      obr = `<svg class="planek-vzor planek-vzor--cara" viewBox="0 -3 30 6">${caraSvg({ t: k, id: 'v', x1: 0.5, y1: 0, x2: 29.5, y2: 0 }, 1.6, false)}</svg>`;
    } else {
      let it;
      if (k === 'home' || k === 'away' || k === 'neutral') it = { t: 'p', id: 'v', side: k, x: 0, y: 0 };
      else if (k === 'gk') it = { t: 'p', id: 'v', side: 'home', gk: true, x: 0, y: 0 };
      else if (k === 'goal') it = { t: 'goal', id: 'v', x: 1.5, y: 0, w: 8, rot: 0 };
      else if (k === 'zone') it = { t: 'zone', id: 'v', x: -4.5, y: -3.5, w: 9, h: 7 };
      else if (k === 'krok') it = null;
      else it = { t: k, id: 'v', x: 0, y: k === 'pole' ? 0.8 : 0 };
      const obsah = it ? prvekSvg(it, S, false) : krokSvg({ x1: -1, y1: 0, x2: 1, y2: 0, krok: 1, id: 'v' }, S);
      obr = `<svg class="planek-vzor" viewBox="-6 -6 12 12">${obsah}</svg>`;
    }
    return `<li>${obr}<span>${esc(x[1])}</span></li>`;
  });
  return polozky.length ? `<ul class="planek-legenda">${polozky.join('')}</ul>` : '';
}
