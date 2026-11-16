// Okno dílu v Plánu Reelů (Michal 16. 11. večer: „když kliknu na nějaký reel, tak chci vidět, co u něj bude napsané … mít tam 2 možnosti
// a návrhy … ať ti tam můžu napsat poznámku“). Široké okno uprostřed (.panel-reel), na telefonu celá obrazovka.
// Vlevo: náhled hotového reelu (stejná část jako v záložce Reely), galerie snímků karuselu (REELY/karusely/<díl>/NN.jpg – akce dilObrazky),
// klipy dílu se stavem drah, nebo jen popis. Vpravo: popisek na Instagram (pole se ukládá samo), Návrh 1 / 2 od Clauda (js/ig_navrhy.js),
// poznámka pro Clauda + Požádat o nové návrhy (dilPopisekNavrhy), Michalova poznámka k dílu. Dole tlačítka podle stavu jako na kartě.
// Kde se popisek drží: díl s reelem v reely.json → reelPopisekUlozit (stejný text jako detail reelu), jinak plan_moje.json → dily.<id>.popisek.
// Modul načte js/reely_plan_stranka.js až po klepnutí na díl; data a tlačítka dílu dostane od ní (api), aby nevznikl kruhový import.

import { volej, jeDemo } from './api.js';
import { esc, prepisSPolem } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast } from './ui.js';
import { otevriPanel, jeOtevreny, elementPanelu } from './panely.js';
import { navrhyHtml } from './ig_navrhy.js';
import { nahledReeluHtml, reelPodleId, prijmiPopisekReelu } from './reely.js';
import * as RP from './reely_plan.js';

const OKNO = 'dil-okno';
const ULOZIT_PO = 700; // ms po posledním písmenu (jako popisek reelu)

let api = null;   // { dil(id), tlacitka(d), stitek(stav), vlnaNazev(id), naPlan(plan), obnovPlan() }
let id = '';
const pole = {};  // id dílu → { popisek, poznamka, proClauda } – rozepsané texty (přežijí překreslení i zavření)
const uklada = {}; // druh pole → 'uklada' | 'ulozeno' | 'chyba'
const casovace = {};
const volbaNavrhu = {};
const snimky = {};  // id dílu → { obrazky: [dataUrl], i, nacita, chyba, velke }
const klipy = {};   // id dílu → { klipy, nacita, chyba }

const dil = () => (api && id ? api.dil(id) : null);
const rozepsane = (d) => (pole[d.id] = pole[d.id] || {});

/** Otevře okno dílu. a = api stránky plánu. */
export function otevri(idDilu, a) {
  api = a;
  id = idDilu;
  if (!dil()) return;
  otevriPanel({
    id: OKNO, trida: 'panel-okno panel-formular panel-reel dil-okno', titul: () => (dil() ? dil().nazev : 'Díl'),
    vykresli: () => '<div class="do-telo" data-do-telo>' + teloHtml() + '</div>',
    paticka: () => '<div class="akce akce--reel do-pata" data-do-pata>' + pataHtml() + '</div>',
    zavritMimo: true,
    poOtevreni: (el) => { dotahni(); el.focus({ preventScroll: true }); },
    priZavreni: () => { Object.keys(casovace).forEach((k) => { if (casovace[k]) { clearTimeout(casovace[k]); casovace[k] = 0; ulozPole(k); } }); }
  });
}

/** Překreslení po změně dat (volá stránka plánu při každém vykreslení) – pole, do kterého se píše, zůstane (prepisSPolem). */
export function obnovOkno() {
  if (!jeOtevreny(OKNO) || !dil()) return;
  const p = elementPanelu(OKNO);
  const telo = p.querySelector('[data-do-telo]'), pata = p.querySelector('[data-do-pata]');
  if (telo) { const h = teloHtml(); if (telo.__html !== h) { telo.__html = h; prepisSPolem(telo, h); } }
  if (pata) { const h = pataHtml(); if (pata.__html !== h) { pata.__html = h; pata.innerHTML = h; } }
}
export function jeOtevrene() { return jeOtevreny(OKNO); }

// ---------------------------------------------------------------- data vlevo (snímky karuselu, klipy)

function dotahni() {
  const d = dil();
  if (!d) return;
  const r = d.reel && reelPodleId(d.reel);
  if (!r && d.snimku && !snimky[d.id]) {
    snimky[d.id] = { obrazky: [], i: 0, nacita: true };
    volej('dilObrazky', { dil: d.id }).then((x) => {
      snimky[d.id] = { obrazky: ((x && x.obrazky) || []).map((o) => 'data:' + (o.typ || 'image/jpeg') + ';base64,' + o.data), i: 0 };
    }, (e) => { snimky[d.id] = { obrazky: [], i: 0, chyba: (e && e.message) || 'chyba' }; }).then(obnovOkno);
  }
  if (!r && !d.snimku && d.webKlipu && !klipy[d.id]) {
    klipy[d.id] = { klipy: [], nacita: true };
    volej('reelKlipy', { dil: d.skupina || d.reel || '' }).then((x) => { klipy[d.id] = { klipy: (x && x.klipy) || [] }; },
      (e) => { klipy[d.id] = { klipy: [], chyba: (e && e.message) || 'chyba' }; }).then(obnovOkno);
  }
}

function mediaHtml(d) {
  const r = d.reel && reelPodleId(d.reel);
  if (r) {
    return '<div class="do-media do-media--reel">' + nahledReeluHtml(r) +
      '<button type="button" class="btn btn--ghost btn--sm" data-rp-reel="' + esc(r.id) + '">' + IKONY.prehrat + '<span>Otevřít reel</span></button></div>';
  }
  if (d.snimku) {
    const g = snimky[d.id];
    if (!g || g.nacita) return '<div class="do-media do-galerie do-galerie--nacita"><span>Načítám snímky…</span></div>';
    if (!g.obrazky.length) return '<div class="do-media do-galerie do-galerie--nacita"><span>Snímky se nenačetly' + (g.chyba ? ': ' + esc(g.chyba) : '') + '</span></div>';
    const i = Math.min(g.i, g.obrazky.length - 1);
    return '<div class="do-media do-galerie' + (g.velke ? ' do-galerie--velke' : '') + '" data-do-galerie>' +
      '<button type="button" class="do-galerie__obr" data-do-snimek-velky aria-label="' + (g.velke ? 'Zmenšit' : 'Zvětšit přes celé okno') + '">' +
        '<img src="' + g.obrazky[i] + '" alt="Snímek ' + (i + 1) + ' z ' + g.obrazky.length + '"></button>' +
      '<div class="do-galerie__ovl"><button type="button" class="btn btn--ikona" data-do-snimek="-1" aria-label="Předchozí snímek"' + (i ? '' : ' disabled') + '>‹</button>' +
        '<span class="do-galerie__tecky">' + g.obrazky.map((_, j) => '<button type="button" class="do-tecka' + (j === i ? ' do-tecka--ano' : '') + '" data-do-snimek-na="' + j +
          '" aria-label="Snímek ' + (j + 1) + '"' + (j === i ? ' aria-current="true"' : '') + '></button>').join('') + '</span>' +
        '<button type="button" class="btn btn--ikona" data-do-snimek="1" aria-label="Další snímek"' + (i < g.obrazky.length - 1 ? '' : ' disabled') + '>›</button></div>' +
      '<small class="do-galerie__pocet cisla">' + (i + 1) + ' / ' + g.obrazky.length + '</small></div>';
  }
  if (d.webKlipu) {
    const k = klipy[d.id];
    const radky = !k || k.nacita ? '<li class="napoveda">Načítám klipy…</li>' : k.chyba ? '<li class="napoveda">Klipy se nenačetly: ' + esc(k.chyba) + '</li>'
      : k.klipy.map((x) => {
        const st = x.drahaZWebu ? ['uloženo', 'ok'] : x.rucne ? ['ruční', 'ok'] : ['automatická', 'seda'];
        return '<li class="do-klip"><b>' + esc(x.strelec || x.id) + '</b><small>' + esc([x.minuta, x.souper].filter(Boolean).join(' · ')) + '</small>' +
          '<span class="tag tag--' + st[1] + '">' + st[0] + '</span></li>';
      }).join('');
    return '<div class="do-media do-klipy"><div class="label">Klipy dílu · dráhy</div><ul>' + radky + '</ul>' +
      (RP.akce(d, false, true).indexOf('upravitDrahy') >= 0 ? '<button type="button" class="btn btn--plan btn--sm" data-rp-drahy-web="' + esc(d.id) + '">' +
        IKONY.psat + '<span>Upravit dráhy</span></button>' : '') + '</div>';
  }
  const drahy = RP.drahyText(d);
  const text = d.format !== 'reel' ? 'Snímky zatím nejsou' : d.vyroba && d.vyroba.klipu ? 'Klipy jsou nachystané na domácím PC · ' + drahy
    : 'Klipy zatím nejsou nachystané';
  return '<div class="do-media do-media--prazdne"><i class="kruh">' + IKONY.reely + '</i><span>' + esc(text) + '</span></div>';
}

// ---------------------------------------------------------------- vpravo

const pocetZnaku = (t) => String(t || '').length.toLocaleString('cs-CZ') + ' / 2 200';
const textUlozeni = (k, vychozi) => (uklada[k] === 'uklada' ? 'ukládám…' : uklada[k] === 'ulozeno' ? 'uloženo ✓' : uklada[k] === 'chyba' ? 'neuloženo – zkusím znovu' : vychozi);
const kdyNavrhu = (s) => { const t = Date.parse(s); return t ? new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };

function teloHtml() {
  const d = dil();
  if (!d) return '';
  const r = rozepsane(d);
  const popisek = r.popisek != null ? r.popisek : d.popisek || '';
  const v = api.vlnaNazev(d.vlna);
  const navrhy = d.navrhy || [];
  return '<div class="reel-detail do">' +
    '<div class="reel-detail__media">' + mediaHtml(d) + '</div>' +
    '<div class="reel-detail__obsah">' +
      '<div class="do-hlava"><span class="do-hlava__kdy cisla">' + esc(RP.denADatum(d.termin)) + (d.termin && d.cas ? ' · ' + esc(d.cas) : '') + '</span>' +
        api.stitek(d.stav) + (d.tym ? '<span class="tag tag--seda rp-tym" data-tym="' + esc(d.tym) + '">' + esc(RP.NAZVY_TYMU[d.tym] || d.tym) + '</span>' : '') +
        '<span class="tag tag--seda">' + esc(RP.NAZVY_FORMATU[d.format] || '') + '</span>' + (v ? '<span class="do-hlava__vlna">' + esc(v) + '</span>' : '') + '</div>' +
      (d.popis ? '<p class="do-popis">' + esc(d.popis) + '</p>' : '') +
      '<section class="reel-detail__cast do-popisek" data-do-box="popisek"><div class="reel__popisek-hlava"><span class="label">Popisek na Instagram</span>' +
        (d.popisekReel ? '<span class="tag tag--seda" title="Stejný text jako v detailu reelu">reel</span>' : '') +
        '<span class="reel__znaky cisla' + (popisek.length > RP.POPISEK_MAX ? ' reel__znaky--moc' : '') + '" data-do-znaky>' + pocetZnaku(popisek) + '</span></div>' +
        (navrhy.length ? navrhyHtml({ varianty: navrhy, volba: volbaNavrhu[d.id] || 0, atribut: 'data-do-navrh', id: d.id, ceka: false, lzeZadat: false }) +
          (d.navrhyKdy ? '<small class="napoveda do-navrhy-kdy">Návrhy od Clauda ' + esc(kdyNavrhu(d.navrhyKdy)) + '</small>' : '')
          : '<p class="napoveda do-bez-navrhu">Návrhy ještě nejsou – požádej Clauda níž.</p>') +
        '<textarea class="odpoved reel__pole" data-do-pole="popisek" data-pole="do-popisek" rows="8" aria-label="Popisek na Instagram" ' +
          'placeholder="Text, který půjde na Instagram – napiš ho, nebo použij návrh od Clauda.">' + esc(/^\r?\n/.test(popisek) ? '\n' + popisek : popisek) + '</textarea>' +
        '<small class="reel__ulozeni" data-do-ulozeni="popisek">' + esc(textUlozeni('popisek', 'Ukládá se samo při psaní')) + '</small></section>' +
      '<section class="reel-detail__cast do-claude"><span class="label">Poznámka pro Clauda</span>' +
        '<textarea class="odpoved" data-do-pole="proClauda" data-pole="do-pro-clauda" rows="3" aria-label="Poznámka pro Clauda k návrhům" ' +
          'placeholder="Např. zmiň, že to byl první gól v áčku.">' + esc(r.proClauda != null ? r.proClauda : d.proClauda || '') + '</textarea>' +
        '<div class="do-claude__akce">' + (d.cekaNaNavrhy ? '<span class="tag tag--plan do-ceka">' + IKONY.claude + 'Claude chystá návrhy…</span>' : '') +
          '<button type="button" class="btn btn--ghost btn--sm" data-do-navrhy>' + IKONY.claude + '<span>' + (d.cekaNaNavrhy ? 'Požádat znovu' : 'Požádat o nové návrhy') + '</span></button></div></section>' +
      '<section class="reel-detail__cast do-poznamka"><span class="label">Moje poznámka k dílu</span>' +
        '<textarea class="odpoved" data-do-pole="poznamka" data-pole="do-poznamka" rows="2" aria-label="Moje poznámka k dílu" placeholder="Jen pro tebe – vidíš ji i na kartě.">' +
          esc(r.poznamka != null ? r.poznamka : d.poznamkaMoje || '') + '</textarea>' +
        '<small class="reel__ulozeni" data-do-ulozeni="poznamka">' + esc(textUlozeni('poznamka', '')) + '</small></section>' +
    '</div></div>';
}

function pataHtml() {
  const d = dil();
  return d ? api.tlacitka(d) : '';
}

// ---------------------------------------------------------------- ukládání (samo při psaní, jako popisek reelu)

function ukazUlozeni(k) {
  const p = elementPanelu(OKNO);
  const u = p && p.querySelector('[data-do-ulozeni="' + k + '"]');
  if (u) u.textContent = textUlozeni(k, k === 'popisek' ? 'Ukládá se samo při psaní' : '');
}

function ulozPole(k) {
  const d = dil();
  if (!d) return;
  const r = rozepsane(d);
  const text = r[k];
  if (text == null) return;
  if (k === 'popisek' && text.length > RP.POPISEK_MAX) { uklada[k] = 'chyba'; ukazUlozeni(k); return; }
  uklada[k] = 'uklada';
  ukazUlozeni(k);
  const hotovo = (plan) => {
    if (r[k] === text) delete r[k]; // mezitím se nepsalo dál
    uklada[k] = 'ulozeno';
    if (plan && plan.dily) api.naPlan(plan); else api.obnovPlan();
    setTimeout(() => { if (uklada[k] === 'ulozeno') { delete uklada[k]; ukazUlozeni(k); } }, 2500);
  };
  const chyba = (e) => { uklada[k] = 'chyba'; ukazUlozeni(k); toast('Neuložilo se: ' + ((e && e.message) || 'chyba'), true); };
  if (k === 'popisek' && d.popisekReel) {
    volej('reelPopisekUlozit', { id: d.reel, text }).then((v) => { prijmiPopisekReelu(v); hotovo(null); }, chyba);
  } else {
    volej('reelyPlanUlozit', { dil: { id: d.id, zmeny: { [k === 'popisek' ? 'popisek' : 'poznamka']: text.trim() ? text : null } } }).then(hotovo, chyba);
  }
}

function pise(t) {
  const d = dil();
  if (!d) return;
  const k = t.dataset.doPole;
  rozepsane(d)[k] = t.value;
  if (k === 'proClauda') return; // posílá se až s žádostí o návrhy
  if (k === 'popisek') {
    const z = elementPanelu(OKNO).querySelector('[data-do-znaky]');
    if (z) { z.textContent = pocetZnaku(t.value); z.classList.toggle('reel__znaky--moc', t.value.length > RP.POPISEK_MAX); }
  }
  clearTimeout(casovace[k]);
  casovace[k] = setTimeout(() => { casovace[k] = 0; ulozPole(k); }, ULOZIT_PO);
}

function pouzijNavrh() {
  const d = dil();
  const text = d && (d.navrhy || [])[volbaNavrhu[d.id] || 0];
  if (!text) return;
  rozepsane(d).popisek = text;
  const t = elementPanelu(OKNO).querySelector('[data-do-pole="popisek"]');
  if (t) t.value = text;
  clearTimeout(casovace.popisek);
  casovace.popisek = 0;
  ulozPole('popisek');
  obnovOkno();
  toast('Návrh ' + ((volbaNavrhu[d.id] || 0) + 1) + ' je v popisku – jde dál upravit');
}

function pozadejNavrhy() {
  const d = dil();
  if (!d) return;
  const r = rozepsane(d);
  const poznamka = r.proClauda != null ? r.proClauda : d.proClauda || '';
  volej('dilPopisekNavrhy', { dil: d.id, poznamka }).then((plan) => {
    delete r.proClauda;
    api.naPlan(plan);
    toast(jeDemo() ? 'V ukázce Claude nepíše – ve skutečnosti do půl hodiny' : 'Claude napíše 2 návrhy (do půl hodiny, když běží PC)');
  }, (e) => toast('Nepovedlo se: ' + ((e && e.message) || 'chyba'), true));
}

// ---------------------------------------------------------------- ovládání

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t && t.matches && t.matches('[data-panel="' + OKNO + '"] [data-do-pole]')) pise(t);
});

document.addEventListener('click', (e) => {
  const p = elementPanelu(OKNO);
  if (!p || !p.contains(e.target)) return;
  const b = e.target.closest('button');
  if (!b) return;
  const d = dil();
  if (!d) return;
  const ds = b.dataset;
  if (ds.doNavrhVolba != null && b.hasAttribute('data-do-navrh-volba')) { volbaNavrhu[d.id] = Number(ds.doNavrhVolba) || 0; obnovOkno(); return; }
  if (b.hasAttribute('data-do-navrh-pouzit')) { pouzijNavrh(); return; }
  if (b.hasAttribute('data-do-navrhy')) { pozadejNavrhy(); return; }
  const g = snimky[d.id];
  if (g && ds.doSnimek) { g.i = Math.max(0, Math.min(g.obrazky.length - 1, g.i + Number(ds.doSnimek))); obnovOkno(); return; }
  if (g && ds.doSnimekNa != null && b.hasAttribute('data-do-snimek-na')) { g.i = Number(ds.doSnimekNa) || 0; obnovOkno(); return; }
  if (g && b.hasAttribute('data-do-snimek-velky')) { g.velke = !g.velke; obnovOkno(); }
});

// šipky v galerii (když se nepíše)
document.addEventListener('keydown', (e) => {
  if (!jeOtevreny(OKNO) || (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
  const d = dil();
  const g = d && snimky[d.id];
  if (!g || !g.obrazky.length || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  g.i = Math.max(0, Math.min(g.obrazky.length - 1, g.i + (e.key === 'ArrowLeft' ? -1 : 1)));
  obnovOkno();
  e.preventDefault();
});
