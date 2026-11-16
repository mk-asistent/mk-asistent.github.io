// Editor plánku cviku (16. 11.) – lišta nástrojů + SVG z js/planek.js, úpravy tažením (myš i dotyk).
// Ovládání převzaté z taktické tabule webu dorostu (taktika.js: onDown/onMove/onUp, úchyty, výběr obdélníkem, Zpět),
// ale bez globálního stavu: všechno žije v uzávěru vytvorEditor, posluchače jen na prvcích uvnitř `el`.
import { cistyPlanek, planekSvg, novyPlanek, VYREZY, CARY, bodNaCare, DELKA, SIRKA } from './planek.js';

const NASTROJE = [
  ['vyber', 'Výběr'],
  ['|'],
  ['home', 'Náš'], ['away', 'Soupeř'], ['neutral', 'Žolík'], ['gk', 'Brankář'],
  ['|'],
  ['ball', 'Míč'], ['cone', 'Kužel'], ['mannequin', 'Figurína'], ['pole', 'Tyč'], ['goal', 'Branka'], ['goal-mala', 'Malá branka'],
  ['|'],
  ['pass', 'Přihrávka'], ['run', 'Běh'], ['dribble', 'Vedení'], ['shot', 'Střela'],
  ['|'],
  ['zone', 'Zóna'], ['text', 'Text']
];
const BARVY_KUZELU = [['#f59e0b', 'oranžová'], ['#facc15', 'žlutá'], ['#ef4444', 'červená'], ['#3b82f6', 'modrá'], ['#ffffff', 'bílá']];
const MAX_ZPET = 60;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
const zaokrouhli = (v) => Math.round(v * 10) / 10;
const kopie = (o) => JSON.parse(JSON.stringify(o));

/**
 * Editor v prvku `el`. Vrací { planek(), nastav(p), zpet(), znic() }.
 * onZmena(planek) se volá po každé dokončené změně s očištěným plánkem (cistyPlanek(…, true) – i prázdný má výřez).
 */
export function vytvorEditor(el, planek, volby) {
  const onZmena = (volby && volby.onZmena) || (() => {});
  let stav = cistyPlanek(planek, true) || novyPlanek();
  let nastroj = 'vyber';
  let vyber = [];                 // id vybraných prvků
  let zasobnik = [];              // Zpět: JSON stavů
  let tah = null;                 // probíhající tažení
  let obdelnik = null;            // výběr obdélníkem
  let posledniKlik = { id: null, t: 0 };
  let textNovy = 'Text';          // obsah pro nástroj Text
  let poleZmeneno = false;        // u psaní do pole jen jeden krok Zpět

  el.innerHTML = `<div class="planek-editor">
  <div class="planek-lista planek-lista--nastroje" role="toolbar" aria-label="Nástroje plánku">${listaNastroju()}</div>
  <div class="planek-lista planek-lista--vybrane" aria-label="Úpravy"></div>
  <div class="planek-platno" tabindex="0" aria-label="Plátno plánku"></div>
</div>`;
  const listaN = el.querySelector('.planek-lista--nastroje');
  const listaV = el.querySelector('.planek-lista--vybrane');
  const platno = el.querySelector('.planek-platno');

  function listaNastroju() {
    let s = '<span class="planek-lista__skupina">';
    NASTROJE.forEach(([k, n]) => {
      if (k === '|') { s += '</span><span class="planek-lista__skupina">'; return; }
      s += `<button type="button" class="planek-nastroj" data-nastroj="${k}" aria-pressed="${k === nastroj}">${esc(n)}</button>`;
    });
    return s + '</span>';
  }

  // ---------------------------------------------------------------- kreslení
  function vybrany() { return vyber.length === 1 ? stav.prvky.find((i) => i.id === vyber[0]) || null : null; }

  function kresli() {
    platno.innerHTML = planekSvg(stav, { vybrane: vyber, uchyty: true, obdelnik: obdelnik });
    platno.dataset.nastroj = nastroj;
  }

  function kresliListy() {
    listaN.querySelectorAll('[data-nastroj]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.nastroj === nastroj)));
    const it = vybrany();
    const klicVyrezu = Object.keys(VYREZY).find((k) => VYREZY[k].vyrez.join() === stav.vyrez.join() && VYREZY[k].hriste === stav.hriste) || '';
    let s = `<span class="planek-lista__skupina">
<button type="button" class="planek-nastroj" data-akce="zpet" ${zasobnik.length ? '' : 'disabled'} title="Zpět (Ctrl+Z)">↶ Zpět</button>
<select class="planek-vyber" data-akce="vyrez" aria-label="Výřez hřiště">
${klicVyrezu ? '' : '<option value="" selected>Vlastní výřez</option>'}
${Object.keys(VYREZY).map((k) => `<option value="${k}"${k === klicVyrezu ? ' selected' : ''}>${esc(VYREZY[k].nazev)}</option>`).join('')}
</select>
<button type="button" class="planek-nastroj" data-akce="prizpusobit" ${stav.prvky.length ? '' : 'disabled'}>Přizpůsobit prvkům</button></span>`;
    if (vyber.length) {
      s += `<span class="planek-lista__skupina"><button type="button" class="planek-nastroj" data-akce="smazat" title="Smazat (Delete)">Smazat${vyber.length > 1 ? ' ' + vyber.length : ''}</button>`;
      if (it && (it.t === 'p' || it.t === 'text')) {
        const hodnota = it.t === 'p' ? it.num || '' : it.text;
        s += `<label class="planek-popis">${it.t === 'p' ? 'Popisek' : 'Text'} <input class="planek-pole" data-akce="popisek" maxlength="${it.t === 'p' ? 3 : 40}" value="${esc(hodnota)}"></label>`;
      }
      if (it && CARY.indexOf(it.t) >= 0) {
        s += `<span class="planek-popis">Krok</span><button type="button" class="planek-nastroj" data-akce="krok-" aria-label="Krok o jedna méně">−</button>
<span class="planek-nastroj__cislo">${it.krok || '–'}</span><button type="button" class="planek-nastroj" data-akce="krok+" aria-label="Krok o jedna víc">+</button>
<button type="button" class="planek-nastroj" data-akce="krok0" ${it.krok ? '' : 'disabled'}>Žádný</button>`;
      }
      if (it && it.t === 'goal') s += '<button type="button" class="planek-nastroj" data-akce="otocit">↻ Otočit o 45°</button>';
      if (it && it.t === 'cone') {
        s += BARVY_KUZELU.map(([b, n]) => `<button type="button" class="planek-nastroj planek-barva" data-akce="barva" data-barva="${b}" style="background:${b}"
 aria-pressed="${(it.color || '#f59e0b') === b}" aria-label="Barva ${n}" title="${n}"></button>`).join('');
      }
      s += '</span>';
    } else if (nastroj === 'text') {
      s += `<label class="planek-popis">Nový text <input class="planek-pole" data-akce="text-novy" maxlength="40" value="${esc(textNovy)}"></label>`;
    } else {
      s += `<span class="planek-popis">${napoveda()}</span>`;
    }
    listaV.innerHTML = s;
  }

  function napoveda() {
    if (nastroj === 'vyber') return 'Táhni prvky, konce a prohnutí čar; tažením po trávě vybereš víc.';
    if (CARY.indexOf(nastroj) >= 0 || nastroj === 'zone') return 'Táhni od začátku ke konci.';
    return 'Klepni do plánku.';
  }

  // ---------------------------------------------------------------- změny a Zpět
  function ulozZpet() {
    zasobnik.push(JSON.stringify(stav));
    if (zasobnik.length > MAX_ZPET) zasobnik.shift();
  }
  function zmena() {
    kresli();
    kresliListy();
    onZmena(cistyPlanek(kopie(stav), true));
  }
  function zpet() {
    if (!zasobnik.length) return;
    stav = JSON.parse(zasobnik.pop());
    vyber = vyber.filter((id) => stav.prvky.some((i) => i.id === id));
    zmena();
  }
  function smazVybrane() {
    if (!vyber.length) return;
    ulozZpet();
    stav.prvky = stav.prvky.filter((i) => vyber.indexOf(i.id) < 0);
    vyber = [];
    zmena();
  }
  function vyberJen(ids) { vyber = ids.slice(); kresli(); kresliListy(); }

  function noveId(t) {
    const z = { p: 'h', ball: 'm', cone: 'k', mannequin: 'f', pole: 't', goal: 'b', zone: 'z', text: 'x' }[t] || 'c';
    let n = 1;
    while (stav.prvky.some((i) => i.id === z + n)) n++;
    return z + n;
  }

  // ---------------------------------------------------------------- souřadnice
  function svetBod(e) {
    const svg = platno.querySelector('svg.planek');
    const m = svg && svg.getScreenCTM();
    if (!m) return [0, 0];
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    return [Math.max(0, Math.min(DELKA, p.x)), Math.max(0, Math.min(SIRKA, p.y))];
  }

  // ---------------------------------------------------------------- myš a dotyk
  function priStisku(e) {
    if (e.button > 0) return;
    platno.focus({ preventScroll: true });
    const [x, y] = svetBod(e);
    const uchyt = e.target.closest('[data-uchyt]');
    const prvekEl = e.target.closest('[data-id]');
    const it0 = vybrany();

    if (uchyt && it0) {
      ulozZpet();
      tah = { druh: 'uchyt', klic: uchyt.dataset.uchyt, id: it0.id, pohnuto: false };
    } else if (nastroj === 'vyber' || (prvekEl && CARY.indexOf(nastroj) < 0 && nastroj !== 'zone')) {
      const vic = e.ctrlKey || e.metaKey || e.shiftKey;
      if (!prvekEl) {
        if (!vic) vyber = [];
        tah = { druh: 'obdelnik', start: [x, y], pridat: vic };
        obdelnik = { x: x, y: y, w: 0, h: 0 };
      } else {
        const id = prvekEl.dataset.id;
        if (vic) {
          vyber = vyber.indexOf(id) >= 0 ? vyber.filter((v) => v !== id) : vyber.concat(id);
          kresli(); kresliListy();
          return;
        }
        const ted = Date.now();
        if (posledniKlik.id === id && ted - posledniKlik.t < 380) {   // dvojklik na hráče / text = psát popisek
          posledniKlik = { id: null, t: 0 };
          vyberJen([id]);
          const pole = listaV.querySelector('[data-akce="popisek"]');
          if (pole) { pole.focus(); pole.select(); }
          return;
        }
        posledniKlik = { id: id, t: ted };
        if (vyber.indexOf(id) < 0) vyber = [id];
        ulozZpet();
        const puvodni = {};
        vyber.forEach((sid) => { const o = stav.prvky.find((i) => i.id === sid); if (o) puvodni[sid] = kopie(o); });
        tah = { druh: 'posun', id: id, start: [x, y], puvodni: puvodni, pohnuto: false };
        kresliListy();
      }
    } else if (CARY.indexOf(nastroj) >= 0 || nastroj === 'zone') {
      ulozZpet();
      let it;
      if (nastroj === 'zone') it = { t: 'zone', id: noveId('zone'), x: zaokrouhli(x), y: zaokrouhli(y), w: 0, h: 0 };
      else {
        const krok = stav.prvky.reduce((m, i) => Math.max(m, i.krok || 0), 0) + 1;   // čísla kroků jdou samy po sobě
        it = { t: nastroj, id: noveId(nastroj), x1: zaokrouhli(x), y1: zaokrouhli(y), x2: zaokrouhli(x), y2: zaokrouhli(y) };
        if (krok <= 20) it.krok = krok;
      }
      stav.prvky.push(it);
      vyber = [it.id];
      tah = { druh: 'novy', id: it.id };
    } else {
      // přidání klepnutím
      if (stav.prvky.length >= 80) return;
      ulozZpet();
      const X = zaokrouhli(x), Y = zaokrouhli(y);
      let it;
      if (nastroj === 'home' || nastroj === 'away' || nastroj === 'neutral') {
        it = { t: 'p', id: noveId('p'), side: nastroj, x: X, y: Y };
        const n = stav.prvky.filter((i) => i.t === 'p' && i.side === nastroj && !i.gk).length + 1;
        it.num = nastroj === 'neutral' ? 'N' : String(n);
      } else if (nastroj === 'gk') it = { t: 'p', id: noveId('p'), side: 'away', gk: true, x: X, y: Y, num: 'B' };
      else if (nastroj === 'goal' || nastroj === 'goal-mala') {
        it = { t: 'goal', id: noveId('goal'), x: X, y: Y, w: nastroj === 'goal' ? 7.32 : 3, rot: X > DELKA / 2 ? 180 : 0 };
      } else if (nastroj === 'text') it = { t: 'text', id: noveId('text'), x: X, y: Y, text: (textNovy || 'Text').slice(0, 40) };
      else it = { t: nastroj, id: noveId(nastroj), x: X, y: Y };
      stav.prvky.push(it);
      vyber = [it.id];
      zmena();
      return;
    }
    platno.setPointerCapture(e.pointerId);
    e.preventDefault();
    kresli();
  }

  function priPohybu(e) {
    const d = tah;
    if (!d) return;
    const [x, y] = svetBod(e);
    if (d.druh === 'obdelnik') {
      obdelnik = { x: Math.min(d.start[0], x), y: Math.min(d.start[1], y), w: Math.abs(x - d.start[0]), h: Math.abs(y - d.start[1]) };
      kresli();
      return;
    }
    const it = stav.prvky.find((i) => i.id === d.id);
    if (!it) return;
    if (d.druh === 'posun') {
      const dx = x - d.start[0], dy = y - d.start[1];
      if (Math.hypot(dx, dy) > 0.15) d.pohnuto = true;
      Object.keys(d.puvodni).forEach((sid) => {
        const o = d.puvodni[sid], t = stav.prvky.find((i) => i.id === sid);
        if (!t) return;
        const dr = (v, m) => zaokrouhli(Math.max(0, Math.min(m, v)));
        if ('x1' in o) { t.x1 = dr(o.x1 + dx, DELKA); t.y1 = dr(o.y1 + dy, SIRKA); t.x2 = dr(o.x2 + dx, DELKA); t.y2 = dr(o.y2 + dy, SIRKA); }
        else { t.x = dr(o.x + dx, DELKA); t.y = dr(o.y + dy, SIRKA); }
      });
    } else if (d.druh === 'novy') {
      if (it.t === 'zone') { it.w = zaokrouhli(x - it.x); it.h = zaokrouhli(y - it.y); }
      else { it.x2 = zaokrouhli(x); it.y2 = zaokrouhli(y); }
    } else if (d.druh === 'uchyt') {
      d.pohnuto = true;
      if (d.klic === 'p1') { it.x1 = zaokrouhli(x); it.y1 = zaokrouhli(y); }
      else if (d.klic === 'p2') { it.x2 = zaokrouhli(x); it.y2 = zaokrouhli(y); }
      else if (d.klic === 'mid') {
        // prostřední úchyt leží na křivce: řídicí bod = 2·M − střed tětivy
        const mx = (it.x1 + it.x2) / 2, my = (it.y1 + it.y2) / 2;
        it.bx = zaokrouhli(2 * (x - mx)); it.by = zaokrouhli(2 * (y - my));
      } else if (d.klic === 'roh') { it.w = zaokrouhli(Math.max(0.5, x - it.x)); it.h = zaokrouhli(Math.max(0.5, y - it.y)); }
    }
    kresli();
  }

  function priPusteni(e) {
    if (!tah) return;
    if (e && e.type === 'pointerup') priPohybu(e);   // poslední poloha (pohyb před puštěním nemusel přijít)
    const d = tah;
    tah = null;
    if (d.druh === 'obdelnik') {
      const m = obdelnik;
      obdelnik = null;
      if (m && (m.w > 0.5 || m.h > 0.5)) {
        const uvnitr = (x, y) => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h;
        const zasah = stav.prvky.filter((i) => {
          if (CARY.indexOf(i.t) >= 0) { const s = bodNaCare(i, 0.5); return uvnitr(s[0], s[1]); }
          if (i.t === 'zone') return uvnitr(i.x + i.w / 2, i.y + i.h / 2);
          return uvnitr(i.x, i.y);
        }).map((i) => i.id);
        vyber = d.pridat ? vyber.concat(zasah.filter((id) => vyber.indexOf(id) < 0)) : zasah;
      }
      kresli(); kresliListy();
      return;
    }
    const it = stav.prvky.find((i) => i.id === d.id);
    if ((d.druh === 'posun' || d.druh === 'uchyt') && !d.pohnuto) {
      zasobnik.pop();
      if (d.druh === 'posun') vyber = [d.id];
      kresli(); kresliListy();
      return;
    }
    if (d.druh === 'novy' && it) {
      const male = it.t === 'zone' ? Math.abs(it.w) < 1 || Math.abs(it.h) < 1 : Math.hypot(it.x2 - it.x1, it.y2 - it.y1) < 1;
      if (male) {   // jen klepnutí – nic nekreslit
        stav.prvky = stav.prvky.filter((i) => i.id !== it.id);
        zasobnik.pop();
        vyber = [];
        kresli(); kresliListy();
        return;
      }
      if (it.t === 'zone') {
        if (it.w < 0) { it.x = zaokrouhli(it.x + it.w); it.w = -it.w; }
        if (it.h < 0) { it.y = zaokrouhli(it.y + it.h); it.h = -it.h; }
      }
    }
    zmena();
  }

  // ---------------------------------------------------------------- lišty
  function priKliku(e) {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.nastroj) {
      nastroj = b.dataset.nastroj;
      if (nastroj !== 'vyber') vyber = [];
      kresli(); kresliListy();
      return;
    }
    const a = b.dataset.akce, it = vybrany();
    if (a === 'zpet') zpet();
    else if (a === 'smazat') smazVybrane();
    else if (a === 'prizpusobit') prizpusob();
    else if (it && (a === 'krok-' || a === 'krok+' || a === 'krok0')) {
      ulozZpet();
      const k = a === 'krok0' ? 0 : Math.max(0, Math.min(20, (it.krok || 0) + (a === 'krok+' ? 1 : -1)));
      if (k) it.krok = k; else delete it.krok;
      zmena();
    } else if (it && a === 'otocit') {
      ulozZpet();
      it.rot = ((it.rot || 0) + 45) % 360;
      zmena();
    } else if (it && a === 'barva') {
      ulozZpet();
      if (b.dataset.barva === '#f59e0b') delete it.color; else it.color = b.dataset.barva;
      zmena();
    }
  }

  function priZmeneVyberu(e) {
    if (e.target.dataset.akce !== 'vyrez' || !VYREZY[e.target.value]) return;
    ulozZpet();
    stav.vyrez = VYREZY[e.target.value].vyrez.slice();
    stav.hriste = VYREZY[e.target.value].hriste;
    zmena();
  }

  function priPsani(e) {
    const a = e.target.dataset.akce;
    if (a === 'text-novy') { textNovy = e.target.value; return; }
    if (a !== 'popisek') return;
    const it = vybrany();
    if (!it) return;
    if (!poleZmeneno) { ulozZpet(); poleZmeneno = true; }
    if (it.t === 'p') { const v = e.target.value.trim().slice(0, 3); if (v) it.num = v; else delete it.num; }
    else it.text = e.target.value.slice(0, 40);
    kresli();
    onZmena(cistyPlanek(kopie(stav), true));
  }
  function poOpusteniPole(e) {
    if (e.target.dataset.akce !== 'popisek') return;
    poleZmeneno = false;
    const it = vybrany();
    if (it && it.t === 'text' && !it.text.trim()) { it.text = 'Text'; kresli(); }
    // lištu tu nepřekreslovat – klik na tlačítko v ní by se ztratil (focusout přijde dřív než click)
    const zp = listaV.querySelector('[data-akce="zpet"]');
    if (zp) zp.disabled = !zasobnik.length;
  }

  /** Výřez kolem všech prvků s okrajem (nejmenší 12 × 8 m). */
  function prizpusob() {
    if (!stav.prvky.length) return;
    const xs = [], ys = [];
    stav.prvky.forEach((i) => {
      if ('x1' in i) { const s = bodNaCare(i, 0.5); xs.push(i.x1, i.x2, s[0]); ys.push(i.y1, i.y2, s[1]); }
      else if (i.t === 'zone') { xs.push(i.x, i.x + i.w); ys.push(i.y, i.y + i.h); }
      else if (i.t === 'goal') { const h = (i.w || 7.32) / 2 + 2; xs.push(i.x - h, i.x + h); ys.push(i.y - h, i.y + h); }
      else { xs.push(i.x); ys.push(i.y); }
    });
    let x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    const okraj = Math.max(2.5, 0.12 * Math.max(x1 - x0, y1 - y0));
    x0 -= okraj; x1 += okraj; y0 -= okraj; y1 += okraj;
    if (x1 - x0 < 12) { const c = (x0 + x1) / 2; x0 = c - 6; x1 = c + 6; }
    if (y1 - y0 < 8) { const c = (y0 + y1) / 2; y0 = c - 4; y1 = c + 4; }
    x0 = Math.max(-3, x0); y0 = Math.max(-3, y0); x1 = Math.min(DELKA + 3, x1); y1 = Math.min(SIRKA + 3, y1);
    ulozZpet();
    stav.vyrez = [zaokrouhli(x0), zaokrouhli(y0), zaokrouhli(x1 - x0), zaokrouhli(y1 - y0)];
    zmena();
  }

  function priKlavese(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); zpet(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (vyber.length) { e.preventDefault(); smazVybrane(); } }
    else if (e.key === 'Escape') { vyber = []; nastroj = 'vyber'; kresli(); kresliListy(); }
  }

  platno.addEventListener('pointerdown', priStisku);
  platno.addEventListener('pointermove', priPohybu);
  platno.addEventListener('pointerup', priPusteni);
  platno.addEventListener('pointercancel', priPusteni);
  el.addEventListener('click', priKliku);
  el.addEventListener('change', priZmeneVyberu);
  el.addEventListener('input', priPsani);
  el.addEventListener('focusout', poOpusteniPole);
  el.addEventListener('keydown', priKlavese);

  kresli();
  kresliListy();

  return {
    planek: () => cistyPlanek(kopie(stav), true),
    nastav(p) {
      stav = cistyPlanek(p, true) || novyPlanek();
      vyber = []; zasobnik = []; tah = null; obdelnik = null;
      kresli(); kresliListy();
    },
    zpet: zpet,
    znic() {
      platno.removeEventListener('pointerdown', priStisku);
      platno.removeEventListener('pointermove', priPohybu);
      platno.removeEventListener('pointerup', priPusteni);
      platno.removeEventListener('pointercancel', priPusteni);
      el.removeEventListener('click', priKliku);
      el.removeEventListener('change', priZmeneVyberu);
      el.removeEventListener('input', priPsani);
      el.removeEventListener('focusout', poOpusteniPole);
      el.removeEventListener('keydown', priKlavese);
      el.innerHTML = '';
    }
  };
}
