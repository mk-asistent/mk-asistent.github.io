// Test obnovy bez sítě a Firebase: napodobený motor (fetch).  Spuštění: node test.js
'use strict';
const assert = require('assert');
const { obnov, mrizkaMesice, pulnocPraha, volejMotor, otisk, platnePripojeni, coPreskocit, platneOblasti, OBLASTI } = require('./obnova');

let ok = 0;
async function test(nazev, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}

const P = { url: 'https://script.google.com/macros/s/TEST/exec', klic: 'k'.repeat(64) };
function motor(odpovedi, zaznam) {
  return async (url, o) => {
    const d = JSON.parse(o.body);
    zaznam.push(d.akce === 'davka' ? 'davka:' + d.polozky.map((p) => p.akce).join(',') : d.akce);
    assert.strictEqual(d.klic, P.klic);
    assert.strictEqual(o.method, 'POST');
    const r = odpovedi(d);
    return { status: 200, text: async () => (typeof r === 'string' ? r : JSON.stringify(r)) };
  };
}

(async () => {
  console.log('Firebase – obnova dat');

  await test('půlnoc v Praze (zimní i letní čas) a mřížka měsíce jako v aplikaci', () => {
    assert.strictEqual(new Date(pulnocPraha(2026, 9, 1)).toISOString(), '2026-09-30T22:00:00.000Z'); // 1. 10. letní čas
    assert.strictEqual(new Date(pulnocPraha(2026, 11, 1)).toISOString(), '2026-11-30T23:00:00.000Z'); // 1. 12. zimní čas
    const ted = Date.parse('2026-10-05T10:00:00+02:00');
    const r = mrizkaMesice(ted, 0);
    assert.strictEqual(r.klic, '2026-10');
    assert.strictEqual(new Date(r.od).toISOString(), '2026-09-27T22:00:00.000Z'); // po 28. 9.
    assert.strictEqual(new Date(r.do).toISOString(), '2026-11-08T23:00:00.000Z'); // po 9. 11. (přes změnu času)
    assert.strictEqual(mrizkaMesice(ted, 1).klic, '2026-11');
    assert.strictEqual(mrizkaMesice(ted, -1).klic, '2026-09');
    assert.strictEqual(mrizkaMesice(Date.parse('2026-12-20T12:00:00+01:00'), 1).klic, '2027-01');
    // v aplikaci (prohlížeč v Praze) stejná mřížka: new Date(rok, mesic, 1 - posun) a +42 dní
    const r2 = mrizkaMesice(Date.parse('2027-03-15T12:00:00+01:00'), 0); // březen 2027: změna času uvnitř mřížky
    assert.strictEqual(new Date(r2.od).toISOString(), '2027-02-28T23:00:00.000Z'); // po 1. 3. 2027
    assert.strictEqual(new Date(r2.do).toISOString(), '2027-04-11T22:00:00.000Z'); // po 12. 4. 2027 (letní čas)
  });

  await test('obnova: tři dotazy souběžně, vše uložené, chyba jedné části nezastaví ostatní', async () => {
    const zaznam = [];
    const fetchFn = motor((d) => {
      if (d.akce === 'davka') {
        return { ok: true, data: d.polozky.map((p) => (p.akce === 'reely' ? { ok: false, chyba: 'Neznámá akce.' }
          : { ok: true, data: p.akce === 'kalendar' ? { udalosti: [], od: p.od, do: p.do } : { co: p.akce } })) };
      }
      if (d.akce === 'posta') return { ok: false, chyba: 'Service invoked too many times' };
      return { ok: false, chyba: 'Neznámá akce.' };
    }, zaznam);
    const v = await obnov(P, { fetch: fetchFn, ted: Date.parse('2026-10-05T10:00:00+02:00') });
    assert.deepStrictEqual(zaznam.sort(), ['davka:info,schranka,fotbal,reely,zmeny', 'davka:kalendar,kalendar', 'posta']);
    assert.deepStrictEqual(Object.keys(v.data).sort(), ['fotbal', 'info', 'kalendar_2026-10', 'kalendar_2026-11', 'schranka', 'zmeny']);
    assert.ok(!v.data.zdravi && !v.data.pocasi, 'zdraví a počasí na server nepatří');
    assert.deepStrictEqual(v.data['kalendar_2026-10'].parametry, { od: Date.parse('2026-09-28T00:00:00+02:00'), do: Date.parse('2026-11-09T00:00:00+01:00') });
    assert.ok(v.chyby.some((c) => /^reely:/.test(c)) && v.chyby.some((c) => /^posta: Service invoked/.test(c)), v.chyby.join(' | '));
    assert.strictEqual(v.kdy, Date.parse('2026-10-05T10:00:00+02:00'));
  });

  await test('pomalé věci (fotbal, nastavení, reely) jen po svém intervalu, po změně z aplikace všechno', async () => {
    const ted = Date.parse('2026-10-05T21:00:00+02:00');
    const min = 60e3;
    // fotbal před 50 min (hodinový interval) a info před 20 min čekají; reely před 31 min (půlhodinový) jdou znovu
    const potvrzeno = { info: ted - 20 * min, fotbal: ted - 50 * min, reely: ted - 31 * min, schranka: ted - 10 * min };
    assert.deepStrictEqual(coPreskocit(potvrzeno, ted, false), ['info', 'fotbal']);
    assert.deepStrictEqual(coPreskocit(potvrzeno, ted, true), [], 'vse');
    assert.deepStrictEqual(coPreskocit(null, ted, false), [], 'první obnova');
    const zaznam = [];
    const fetchFn = motor((d) => (d.akce === 'davka' ? { ok: true, data: d.polozky.map((p) => ({ ok: true, data: { co: p.akce } })) } : { ok: true, data: {} }), zaznam);
    const v = await obnov(P, { fetch: fetchFn, ted, preskocit: coPreskocit(potvrzeno, ted, false) });
    assert.ok(zaznam.indexOf('davka:schranka,reely,zmeny') >= 0, zaznam.join(' | '));
    assert.ok(!v.data.info && !v.data.fotbal && v.data.reely && v.data.zmeny, 'přeskočené nejsou v datech (kopie zůstanou)');
  });

  await test('po změně z aplikace jen dotčené oblasti: poznámka → jen schránka (bez pošty a kalendáře), událost → kalendář', async () => {
    assert.deepStrictEqual(platneOblasti(['schranka', 'schranka', 'zdravi', 'x']), ['schranka'], 'zdraví server nekopíruje');
    assert.strictEqual(platneOblasti([]), null);
    assert.strictEqual(platneOblasti('posta'), null);
    const ted = Date.parse('2026-10-09T16:00:00+02:00');
    const fetchFn = (zaznam) => motor((d) => (d.akce === 'davka' ? { ok: true, data: d.polozky.map((p) => ({ ok: true, data: { co: p.akce } })) } : { ok: true, data: { posta: 1 } }), zaznam);
    let zaznam = [];
    let v = await obnov(P, { fetch: fetchFn(zaznam), ted, jen: ['schranka'] });
    assert.deepStrictEqual(zaznam, ['davka:schranka']);
    assert.deepStrictEqual(Object.keys(v.data), ['schranka']);
    zaznam = [];
    v = await obnov(P, { fetch: fetchFn(zaznam), ted, jen: ['kalendar', 'info'] });
    assert.deepStrictEqual(zaznam.sort(), ['davka:info', 'davka:kalendar,kalendar']);
    assert.deepStrictEqual(Object.keys(v.data).sort(), ['info', 'kalendar_2026-10', 'kalendar_2026-11']);
    zaznam = [];
    v = await obnov(P, { fetch: fetchFn(zaznam), ted, jen: ['posta'] });
    assert.deepStrictEqual(zaznam, ['posta']);
    assert.deepStrictEqual(OBLASTI.slice().sort(), ['fotbal', 'info', 'kalendar', 'posta', 'reely', 'schranka', 'zmeny']);
  });

  await test('motor: špatný klíč a odpověď, která není JSON, dají srozumitelnou chybu', async () => {
    await assert.rejects(volejMotor(P, 'info', {}, motor(() => ({ ok: false, chyba: 'klic' }), [])), /Klíč motoru nesedí/);
    await assert.rejects(volejMotor(P, 'info', {}, motor(() => '<html>přihlášení</html>', []), [0, 0]), /neodpověděl daty/);
    // Google odpověď ztratil (úvod motoru místo dat) → znovu; podruhé už data
    const zaznam = [];
    let kolikrat = 0;
    const d = await volejMotor(P, 'info', {}, motor(() => (kolikrat++ ? { ok: true, data: { verze: 'x' } } : 'Asistent – motor běží.'), zaznam), [0, 0]);
    assert.deepStrictEqual([d, zaznam.length], [{ verze: 'x' }, 2]);
    // pořád ztracená → po 3 pokusech chyba
    const z2 = [];
    await assert.rejects(volejMotor(P, 'info', {}, motor(() => 'Asistent – motor běží.', z2), [0, 0]), /neodpověděl daty/);
    assert.strictEqual(z2.length, 3);
  });

  await test('otisk nezávisí na čase vytvoření; server volá jen motor v Apps Scriptu', () => {
    assert.strictEqual(otisk({ a: 1, ted: 5 }), otisk({ a: 1, ted: 9 }));
    assert.notStrictEqual(otisk({ a: 1, ted: 5 }), otisk({ a: 2, ted: 5 }));
    assert.strictEqual(otisk([1, 2]), otisk([1, 2]));
    assert.ok(platnePripojeni(P));
    assert.ok(platnePripojeni({ url: 'https://script.google.com/macros/u/1/s/AKfy-cb_x/exec', klic: 'x'.repeat(64) }));
    assert.ok(!platnePripojeni({ url: 'https://example.com/macros/s/X/exec', klic: 'x'.repeat(64) }));
    assert.ok(!platnePripojeni({ url: 'https://script.google.com/macros/s/X/exec?x=http://169.254.169.254', klic: 'x'.repeat(64) }));
    assert.ok(!platnePripojeni({ url: P.url, klic: 'kratky' }));
    assert.ok(!platnePripojeni(null));
  });

  console.log('\n' + ok + ' testů prošlo' + (process.exitCode ? ', některé SELHALY' : ''));
})();
