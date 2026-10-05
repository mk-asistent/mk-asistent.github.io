// Test obnovy bez sítě a Firebase: napodobený motor (fetch).  Spuštění: node test.js
'use strict';
const assert = require('assert');
const { obnov, mrizkaMesice, pulnocPraha, volejMotor, otisk, platnePripojeni } = require('./obnova');

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
    assert.deepStrictEqual(zaznam.sort(), ['davka:info,schranka,fotbal,reely', 'davka:kalendar,kalendar', 'posta']);
    assert.deepStrictEqual(Object.keys(v.data).sort(), ['fotbal', 'info', 'kalendar_2026-10', 'kalendar_2026-11', 'schranka']);
    assert.ok(!v.data.zdravi && !v.data.pocasi, 'zdraví a počasí na server nepatří');
    assert.deepStrictEqual(v.data['kalendar_2026-10'].parametry, { od: Date.parse('2026-09-28T00:00:00+02:00'), do: Date.parse('2026-11-09T00:00:00+01:00') });
    assert.ok(v.chyby.some((c) => /^reely:/.test(c)) && v.chyby.some((c) => /^posta: Service invoked/.test(c)), v.chyby.join(' | '));
    assert.strictEqual(v.kdy, Date.parse('2026-10-05T10:00:00+02:00'));
  });

  await test('motor: špatný klíč a odpověď, která není JSON, dají srozumitelnou chybu', async () => {
    await assert.rejects(volejMotor(P, 'info', {}, motor(() => ({ ok: false, chyba: 'klic' }), [])), /Klíč motoru nesedí/);
    await assert.rejects(volejMotor(P, 'info', {}, motor(() => '<html>přihlášení</html>', [])), /neodpověděl daty/);
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
