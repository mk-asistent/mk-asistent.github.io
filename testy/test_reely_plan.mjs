// Test čistých funkcí Plánu reelů (js/reely_plan.js) – vymyšlená data („Soupeř A“, „Hráč 1“).  node testy/test_reely_plan.mjs
import assert from 'node:assert/strict';
import * as RP from '../js/reely_plan.js';

let n = 0;
const test = (nazev, fn) => { fn(); n++; console.log('ok', nazev); };

const PLAN = {
  verze: 1, nazev: 'Zimní plán', editor: { pc: 'http://127.0.0.1:9/editor.html', mobil: 'http://pc.local:9/editor.html' },
  vlny: [{ id: 'v1', nazev: 'Vlna 1' }, { id: 'v2', nazev: 'Vlna 2' }],
  dily: [
    { id: 'a', nazev: 'Áčko – Soupeř A 3:0', popis: 'Hráč 1, Hráč 2', vlna: 'v1', termin: '2030-11-20', cas: '17:00', format: 'reel', tym: 'A', zapasy: ['z1'], klipu: 3, reel: 'reel_a-tym_soupera' },
    { id: 'b', nazev: 'Dorost – Soupeř B', vlna: 'v1', termin: '2030-11-24', format: 'reel', tym: 'dorost', zapasy: ['z2'], reel: 'reel_dorost_souperb', skupina: 'Vlna 1 dorost' },
    { id: 'c', nazev: 'Čísla', vlna: 'v2', termin: '2030-12-31', format: 'karusel' },
    { id: 'd', nazev: 'Jaro', vlna: 'v2', termin: null },
    { id: 'e', nazev: 'Už venku', vlna: 'v1', termin: '2030-11-10', reel: 'reel_venku', zapasy: ['z3'] },
    { id: 'BAD ID', nazev: 'x' }, { id: 'a', nazev: 'duplicita' }, { id: 'f', nazev: 'Neznámá vlna', vlna: 'zz', termin: '2030-02-30' }
  ],
  napady: [{ id: 'n1', nazev: 'Hattricky', popis: 'Hráč 3' }, { id: 'n2', nazev: 'Maskot' }]
};
const FOTBAL = {
  zapasy: [
    { id: 'z1', tym: 'A', zacatek: '2030-11-07T14:00:00+01:00', domaci: 'FK Agro Domov', hoste: 'TJ Sokol Soupeř A', doma: true, vysledek: '3:0' },
    { id: 'z2', tym: 'dorost', zacatek: '2030-11-01T10:00:00+01:00', domaci: 'FK Agro Domov', hoste: 'SK Soupeř B', doma: true, vysledek: '7:0' },
    { id: 'z3', tym: 'B', zacatek: '2030-10-01T10:00:00+02:00', domaci: 'FC Soupeř C', hoste: 'Domov B', doma: false, vysledek: '1:2' },
    { id: 'z4', tym: 'A', zacatek: '2030-09-01T10:00:00+02:00', domaci: 'FK Agro Domov', hoste: 'Soupeř D', doma: true, vysledek: '0:0' }
  ],
  detaily: { z1: { goly: [{ min: 27, hrac: 'Hráč Jedna', strana: 'domaci' }, { min: 31, hrac: 'Hráč Jedna', strana: 'domaci' }, { min: 85, hrac: 'Druhý Hráč', strana: 'domaci' }, { min: 50, hrac: 'Cizí Hráč', strana: 'hoste' }] },
    z3: { goly: [{ min: 10, hrac: 'Náš Hráč', strana: 'hoste' }, { min: 20, hrac: 'Cizí', strana: 'domaci' }] } }
};
const AUDIT = { zapasy: { z1: { veo: 'slug1', ig: null, stav: 'chybi' }, z2: { ig: null, stav: 'chybi' }, z3: { ig: '2030-10-02', stav: 'na_ig' }, z4: { stav: 'bez_zaznamu' } },
  mimo: [{ id: 'mimo_zaci', tym: 'zaci', tymNazev: 'Žáci', datum: '2030-11-08', domaci: 'Domov', hoste: 'Soupeř E', stav: 'chybi' }] };

const p = RP.plan(PLAN);

test('plan: neplatné a duplicitní díly pryč, neplatný termín a vlna vyčištěné', () => {
  assert.deepEqual(p.dily.map((d) => d.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  const f = p.dily.find((d) => d.id === 'f');
  assert.equal(f.vlna, '');
  assert.equal(f.termin, null);
  assert.equal(p.dily.find((d) => d.id === 'b').cas, '17:00');
  assert.equal(p.editor.pc, 'http://127.0.0.1:9/editor.html');
  assert.equal(RP.plan({ editor: { pc: 'javascript:alert(1)' } }).editor.pc, '');
});

test('stavDilu: plán → nachystáno → dráhy → reel → naplánováno → vyvěšeno', () => {
  const d = p.dily[0];
  const ctx = { datumy: { z1: '2030-11-07' } };
  assert.equal(RP.stavDilu(d, ctx).stav, 'plan');
  ctx.vyroba = { 'reel_a-tym_soupera': { datum: '2030-11-07', klipu: 3, drahRucne: 1, deska: true, popisek: true, reel: false } };
  const s = RP.stavDilu(d, ctx);
  assert.equal(s.stav, 'nachystano');
  assert.deepEqual(s.vyroba, { klipu: 3, drahRucne: 1, deska: true, popisek: true, reel: false });
  assert.equal(RP.stavDilu(Object.assign({}, d, { drahyHotove: true }), ctx).stav, 'drahy');
  ctx.vyroba['reel_a-tym_soupera'].drahRucne = 3;
  assert.equal(RP.stavDilu(d, ctx).stav, 'drahy');
  ctx.reely = { 'reel_a-tym_soupera': { video: '' } };
  assert.equal(RP.stavDilu(d, ctx).stav, 'drahy', 'reel bez videa (jen popisek) ještě není hotový');
  ctx.reely['reel_a-tym_soupera'].video = 'reel_a-tym_soupera.mp4';
  assert.equal(RP.stavDilu(d, ctx).stav, 'reel');
  ctx.planIg = { 'reel_a-tym_soupera': { stav: 'ceka', kdy: 5 } };
  assert.deepEqual([RP.stavDilu(d, ctx).stav, RP.stavDilu(d, ctx).planKdy], ['naplanovano', 5]);
  ctx.planIg['reel_a-tym_soupera'].jenPribeh = true;
  assert.equal(RP.stavDilu(d, ctx).stav, 'reel', 'jen příběh není naplánovaný reel');
  ctx.planIg['reel_a-tym_soupera'] = { stav: 'hotovo' };
  assert.equal(RP.stavDilu(d, ctx).stav, 'vyveseno');
  delete ctx.planIg['reel_a-tym_soupera'];
  ctx.zverejneno = { 'reel_a-tym_soupera': '2030-11-21' };
  assert.deepEqual([RP.stavDilu(d, ctx).stav, RP.stavDilu(d, ctx).naIg], ['vyveseno', '2030-11-21']);
});

test('stavDilu: výroba jiného data se nebere, skupina má přednost, audit a ruční hotovo', () => {
  const a = p.dily[0];
  assert.equal(RP.stavDilu(a, { datumy: { z1: '2030-11-07' }, vyroba: { 'reel_a-tym_soupera': { datum: '2029-06-01', klipu: 1 } } }).stav, 'plan');
  const b = p.dily[1];
  const v = RP.stavDilu(b, { vyroba: { 'Vlna 1 dorost': { klipu: 7, drahRucne: 7 }, reel_dorost_souperb: { klipu: 1, deska: true } } });
  assert.deepEqual([v.stav, v.vyroba.klipu, v.vyroba.deska], ['drahy', 7, true]);
  assert.equal(RP.stavDilu(p.dily[4], { audit: { z3: { ig: '2030-10-02' } } }).stav, 'vyveseno');
  assert.equal(RP.stavDilu(Object.assign({}, p.dily[2], { hotovo: true }), {}).stav, 'vyveseno');
  assert.equal(RP.vyrobaDilu(b, { 'Vlna 1 dorost': { klipu: 2, drahRucne: 5 } }).drahRucne, 2, 'víc drah než klipů se nepočítá');
});

test('zmen + spoj: termín, poznámka, vrácení podle plánu', () => {
  let m = RP.moje(null, p);
  m = RP.moje(RP.zmen(p, m, { dil: { id: 'a', zmeny: { termin: '2030-11-25', poznamka: '  hudba  ' } } }, 1), p);
  let s = RP.spoj(p, m).dily.find((d) => d.id === 'a');
  assert.deepEqual([s.termin, s.terminPlan, s.poznamkaMoje, s.poznamka], ['2030-11-25', '2030-11-20', 'hudba', undefined]);
  m = RP.moje(RP.zmen(p, m, { dil: { id: 'a', zmeny: { termin: '2030-11-20', poznamka: null } } }, 2), p);
  assert.deepEqual(m.dily, {}, 'shoda s plánem = žádná úprava');
  assert.throws(() => RP.zmen(p, m, { dil: { id: 'a', zmeny: { nazev: 'jiný' } } }, 3), /měnit nedá/);
  assert.throws(() => RP.zmen(p, m, { dil: { id: 'x', zmeny: { termin: null } } }, 3), /není/);
  assert.throws(() => RP.zmen(p, m, { dil: { id: 'a', zmeny: { termin: '2030-13-01' } } }, 3), /Termín/);
  assert.throws(() => RP.zmen(p, m, {}, 3), /Není co/);
  m = RP.moje(RP.zmen(p, m, { dil: { id: 'c', zmeny: { zruseno: true } } }, 4), p);
  assert.equal(RP.spoj(p, m).dily.find((d) => d.id === 'c').zruseno, true);
});

test('zmen: vlastní díl z nápadu, nápad zmizí; vlastní nápad a smazání', () => {
  let m = RP.moje(null, p);
  m = RP.moje(RP.zmen(p, m, { novy: { nazev: 'Hattricky', termin: '2031-01-05', vlna: 'v2', napad: 'n1' } }, 1000), p);
  const s = RP.spoj(p, m);
  const v = s.dily.find((d) => d.vlastni);
  assert.deepEqual([v.id, v.termin, v.vlna, v.popis, v.napad], ['m-rs', '2031-01-05', 'v2', 'Hráč 3', 'n1']);
  assert.deepEqual(s.napady.map((x) => x.id), ['n2']);
  m = RP.moje(RP.zmen(p, m, { dil: { id: 'm-rs', zmeny: { nazev: 'Hattricky podzimu', termin: null, poznamka: 'pozn' } } }, 1001), p);
  const v2 = RP.spoj(p, m).dily.find((d) => d.vlastni);
  assert.deepEqual([v2.nazev, v2.termin, v2.poznamkaMoje], ['Hattricky podzimu', null, 'pozn']);
  m = RP.moje(RP.zmen(p, m, { dil: { id: 'm-rs', zmeny: { zruseno: true } } }, 1002), p);
  assert.ok(RP.spoj(p, m).napady.some((x) => x.id === 'n1'), 'zrušený díl vrátí nápad do zásobníku');
  m = RP.moje(RP.zmen(p, m, { napad: { nazev: 'Vlastní nápad', popis: 'text' } }, 2000), p);
  assert.equal(m.napady[0].id, 'n-1jk');
  assert.ok(RP.spoj(p, m).napady.find((x) => x.id === 'n-1jk').vlastni);
  assert.throws(() => RP.zmen(p, m, { napad: { id: 'n1', smazat: true } }, 1), /jen vlastní/);
  m = RP.moje(RP.zmen(p, m, { napad: { id: 'n-1jk', smazat: true } }, 1), p);
  assert.equal(m.napady.length, 0);
  assert.throws(() => RP.zmen(p, m, { novy: { nazev: 'x', napad: 'neni' } }, 1), /Nápad/);
  assert.throws(() => RP.zmen(p, m, { novy: { nazev: ' ' } }, 1), /název/);
});

test('zmen: posun vlny a vybraných dílů (naplánované, vyvěšené, zrušené a bez termínu zůstanou)', () => {
  let m = RP.moje(null, p);
  m = RP.moje(RP.zmen(p, m, { posun: { vlna: 'v1', dni: 7 } }, 1, { a: 'nachystano', b: 'plan', e: 'vyveseno' }), p);
  const s = RP.spoj(p, m).dily;
  assert.deepEqual(['a', 'b', 'e'].map((id) => s.find((d) => d.id === id).termin), ['2030-11-27', '2030-12-01', '2030-11-10']);
  m = RP.moje(RP.zmen(p, m, { posun: { ids: ['a', 'd'], dni: -7 } }, 1, {}), p);
  assert.equal(m.dily.a, undefined, 'zpět na termín plánu = bez úpravy');
  assert.throws(() => RP.zmen(p, m, { posun: { ids: ['d'], dni: 3 } }, 1, {}), /Žádný díl/);
  assert.throws(() => RP.zmen(p, m, { posun: { vlna: 'v1', dni: 1.5 } }, 1, {}), /celý počet/);
  assert.equal(RP.pridejDny('2030-12-30', 7), '2031-01-06');
});

test('zmen: požádáno o reel', () => {
  const m = RP.moje(RP.zmen(p, RP.moje(null, p), { pozadano: 'a' }, 12345), p);
  assert.equal(RP.spoj(p, m).dily[0].pozadano, 12345);
});

test('vystup: zápasy se střelci, auditem, díly a reely; bilance; mimo', () => {
  const v = RP.vystup({ plan: p, moje: RP.moje(null, p), audit: AUDIT, fotbal: FOTBAL,
    reely: [{ id: 'reel_venku', video: true, zapasy: [{ datum: '2030-10-01', tym: 'B' }] }], zverejneno: {}, planIg: {},
    vyroba: { dily: { 'reel_a-tym_soupera': { datum: '2030-11-07', klipu: 3, drahRucne: 0, deska: true, popisek: true } } } });
  const z1 = v.zapasy.find((z) => z.id === 'z1');
  assert.deepEqual([z1.domaci, z1.hoste, z1.stavIg, z1.veo, z1.dily], ['Domov', 'Soupeř A', 'chybi', 'slug1', ['a']]);
  assert.equal(RP.strelciText(z1.strelci), 'Hráč 2×, Druhý');
  assert.equal(RP.strelciText(v.zapasy.find((z) => z.id === 'z3').strelci), 'Náš');
  assert.equal(v.zapasy.find((z) => z.id === 'z3').reel, 'reel_venku');
  assert.deepEqual(v.bilance, { zapasu: 4, natoceno: 3, naIg: 1, chybi: 2, bezZaznamu: 1, nedavat: 0 });
  assert.equal(v.mimo[0].id, 'mimo_zaci');
  assert.equal(v.dily.find((d) => d.id === 'a').stav, 'nachystano');
  assert.equal(v.dily.find((d) => d.id === 'e').stav, 'vyveseno');
  assert.equal(RP.stitekZapasu(v.zapasy.find((z) => z.id === 'z3')), 'Na IG 2. 10.');
  const sl = RP.zapasySloupce(v.zapasy, v.mimo);
  assert.deepEqual(sl.map((x) => [x.tym, x.zapasy.length]), [['A', 2], ['dorost', 1], ['B', 1], ['mimo', 1]]);
  assert.deepEqual(sl[0].zapasy.map((z) => z.id), ['z4', 'z1']);
});

test('aplikace: řazení, sloupce, filtr, akce, datum, editor', () => {
  const dily = [{ id: 'x', termin: null, stav: 'plan' }, { id: 'y', termin: '2030-11-24', stav: 'drahy', format: 'reel', reel: 'reel_y' },
    { id: 'z', termin: '2030-11-20', stav: 'plan' }, { id: 'w', termin: '2030-11-21', stav: 'plan', zruseno: true }];
  assert.deepEqual(RP.serad(dily).map((d) => d.id), ['z', 'w', 'y', 'x']);
  const sl = RP.sloupce(dily);
  assert.deepEqual(sl.map((s) => s.dily.length), [2, 0, 1, 0, 0, 0]);
  assert.deepEqual(sl[0].dily.map((d) => d.id), ['z', 'x']);
  assert.equal(RP.filtruj(dily, { stav: 'drahy' }).length, 1);
  assert.equal(RP.filtruj(dily, { zrusene: true }).length, 4);
  assert.deepEqual(RP.akce(dily[1], true), ['udelatReel', 'editor', 'posun', 'poznamka']);
  assert.deepEqual(RP.akce(Object.assign({}, dily[1], { pozadano: 1 }), false), ['cekaNaReel', 'posun', 'poznamka']);
  assert.deepEqual(RP.akce({ stav: 'reel', format: 'reel', reel: 'reel_y' }, true), ['naplanovat', 'otevritReel', 'posun', 'poznamka']);
  assert.deepEqual(RP.akce({ stav: 'plan', format: 'karusel' }, true), ['hotovo', 'posun', 'poznamka']);
  assert.equal(RP.denADatum('2030-11-24', Date.UTC(2030, 0, 1)), 'Ne 24. 11.');
  assert.equal(RP.denADatum('2031-01-01', Date.UTC(2030, 0, 1)), 'St 1. 1.');
  assert.equal(RP.denADatum('2033-01-01', Date.UTC(2030, 0, 1)), 'So 1. 1. 2033');
  assert.equal(RP.denADatum(null), 'bez termínu');
  assert.equal(RP.drahyText({ vyroba: { klipu: 3, drahRucne: 2 } }), 'dráhy 2/3');
  assert.equal(RP.drahyText({ klipu: 9 }), '9 klipů');
  assert.equal(RP.editorOdkaz(PLAN.editor, false), 'http://pc.local:9/editor.html');
  assert.equal(RP.editorOdkaz(PLAN.editor, true, { skupina: 'Vlna 2 dorost' }), 'http://127.0.0.1:9/editor.html?skupina=Vlna%202%20dorost');
  assert.equal(RP.editorOdkaz(PLAN.editor, false, {}, '2030-11-07'), 'http://pc.local:9/editor.html?tyden=2030-11-07');
  assert.equal(RP.kratkyKlub('TJ Sokol Soupeř'), 'Soupeř');
  const vl = RP.vlnySloupce([{ id: 'a', vlna: 'v2', termin: '2030-12-01', stav: 'plan' }, { id: 'b', vlna: 'v1', termin: '2030-11-20', stav: 'vyveseno' },
    { id: 'c', vlna: 'v1', termin: '2030-11-27', stav: 'drahy' }, { id: 'd', vlna: '', termin: null, stav: 'plan', vlastni: true }, { id: 'e', vlna: 'v1', termin: '2030-11-21', stav: 'plan', zruseno: true }],
  [{ id: 'v1', nazev: 'Vlna 1' }, { id: 'v2', nazev: 'Vlna 2' }, { id: 'v3', nazev: 'Prázdná' }]);
  assert.deepEqual(vl.map((s) => [s.id, s.dily.map((x) => x.id).join(''), s.venku, s.celkem, RP.rozsah(s.od, s.do)]),
    [['v1', 'bc', 1, 2, '20. 11. – 27. 11.'], ['v2', 'a', 0, 1, '1. 12.'], ['', 'd', 0, 1, 'bez termínu']]);
  assert.equal(vl[2].nazev, 'Ostatní');
  assert.equal(RP.naRade([{ id: 'x', termin: null, stav: 'plan' }, { id: 'y', termin: '2030-11-20', stav: 'vyveseno' }, { id: 'z', termin: '2030-11-25', stav: 'drahy' }]).id, 'z');
  assert.equal(RP.naRade([]), null);
});

console.log(`\n${n} testů prošlo`);
