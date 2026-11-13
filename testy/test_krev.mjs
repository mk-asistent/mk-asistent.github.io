// Test krevních testů (js/krev.js): obálka ze šifrovacího nástroje (PBKDF2-SHA256 + AES-256-GCM, stejný formát jako
// NASTROJE\asistent\zdravi_sifra\sifra.mjs) se v prohlížeči rozšifruje heslem, špatné heslo neprojde, karta ukáže
// mimo normu – node testy/test_krev.mjs (hodnoty i heslo vymyšlené)
import assert from 'node:assert';
import crypto from 'node:crypto';
const k = await import('../js/krev.js');

let ok = 0;
async function test(nazev, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}

function zasifruj(obsah, heslo, iter = 100000) {
  const sul = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const klic = crypto.pbkdf2Sync(Buffer.from(heslo.normalize('NFC'), 'utf8'), sul, iter, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', klic, iv);
  const data = Buffer.concat([c.update(Buffer.from(JSON.stringify(obsah), 'utf8')), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter, sul: sul.toString('base64'), iv: iv.toString('base64'), data: data.toString('base64'), kdy: '' };
}

const OBSAH = { odbery: [
  { datum: '2026-11-02', duvod: 'Prohlídka', laborator: 'Ukázková', shrnuti: '**Vše dobré** kromě <moči>.', ukoly: ['Zopakovat moč'],
    skupiny: [
      { nazev: 'Krev', polozky: [
        { n: 'LDL <b>', h: 3.09, j: 'mmol/l', min: 1.2, max: 3 },
        { n: 'eGFR', h: 1.3, min: 1.5, max: 3 },
        { n: 'HDL', h: 1.67, min: 1, max: 2.1, dobre: true },
        { n: 'Glukóza', h: 5.31, min: 3.9, max: 5.6 }] },
      { nazev: 'Moč', polozky: [{ n: 'Bílkovina', t: '1+', mimo: true }, { n: 'Barva', t: 'žlutá' }, { n: 'Glukóza', h: 0, min: 0, max: 0 }] }] },
  { datum: '2025-10-01', skupiny: [{ nazev: 'Krev', polozky: [{ n: 'LDL <b>', h: 2.9, min: 1.2, max: 3 }] }] }] };
const HESLO = 'ukázkové-heslo 42';
const o = zasifruj(OBSAH, HESLO);
const text = (t) => '<p>' + t.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
console.log('Krevní testy');

await test('obálka ze šifrovacího nástroje se heslem rozšifruje (i s diakritikou), špatné heslo ne', async () => {
  assert.ok(k.platnaObalka(o));
  assert.deepStrictEqual(await k.rozsifruj(o, await k.klicZHesla(HESLO, o)), OBSAH);
  await assert.rejects(async () => k.rozsifruj(o, await k.klicZHesla('jiné heslo', o)));
  // rozložená (NFD) diakritika z jiné klávesnice dá stejný klíč
  assert.deepStrictEqual(await k.rozsifruj(o, await k.klicZHesla(HESLO.normalize('NFD'), o)), OBSAH);
});

await test('poškozená nebo cizí obálka neplatí', () => {
  for (const x of [null, 'text', { ...o, v: 2 }, { ...o, iter: 1000 }, { ...o, data: 5 }, { ...o, sul: undefined }]) assert.ok(!k.platnaObalka(x));
});

await test('směr: ↑ / ↓ podle normy, ! jen u textu označeného mimo, nula v normě 0–0', () => {
  assert.deepStrictEqual([{ h: 3.09, min: 1.2, max: 3 }, { h: 1.3, min: 1.5, max: 3 }, { h: 2, min: 1, max: 3 }, { t: '1+', mimo: true }, { t: 'žlutá' }, { h: 0, min: 0, max: 0 }, { h: 2 }]
    .map(k.smer), ['↑', '↓', '', '!', '', '', '']);
});

await test('zamčená karta: jen tlačítko Odemknout, žádné hodnoty', () => {
  const h = k.kartaKrveHtml(o, text);
  assert.ok(/data-krev="odemknout"/.test(h) && /zamčeno/.test(h));
  assert.ok(!/3,09|LDL/.test(h));
  assert.strictEqual(k.kartaKrveHtml({ v: 2 }, text), '');
});

await test('odemčená karta: počet hodnot a mimo normu, co udělat, dobré zprávy, minule, česká čárka, vše escapované', () => {
  const h = k.vysledkyHtml(OBSAH, text);
  assert.ok(/7 hodnot, 3 mimo normu/.test(h), 'počty');
  assert.ok(/data-krev="zamknout"/.test(h) && /Krevní testy · 2\. 11\. 2026/.test(h));
  assert.ok(/<ol class="krev-ukoly"><li>Zopakovat moč<\/li><\/ol>/.test(h));
  const mimo = h.split('Mimo normu')[1].split('Dobré zprávy')[0];
  assert.deepStrictEqual((mimo.match(/krev-r--mimo/g) || []).length, 3);
  assert.ok(/LDL &lt;b&gt;/.test(h) && !/LDL <b>/.test(h), 'název escapovaný');
  assert.ok(/3,09 <small>mmol\/l<\/small> <b class="krev-sipka">↑<\/b>/.test(h));
  assert.ok(/norma 1,2–3 · minule 2,9/.test(h), 'minulý odběr');
  assert.ok(/Dobré zprávy<\/h3><ul class="krev-seznam"><li class="krev-r krev-r--dobre"><div class="krev-r__hlava"><span>HDL/.test(h));
  assert.ok(/Předchozí odběry: 1\. 10\. 2025/.test(h));
  assert.ok(/<p>\*\*Vše dobré\*\* kromě &lt;moči&gt;\.<\/p>/.test(h), 'shrnutí jde přes formátování textu');
  assert.strictEqual(k.vysledkyHtml({ odbery: [] }, text), '');
});

await test('pruh normy: tečka i mimo rozsah zůstane na pruhu (2–98 %)', () => {
  const h = k.vysledkyHtml({ odbery: [{ datum: '2026-01-01', skupiny: [{ nazev: 'X', polozky: [{ n: 'A', h: 123, min: 0, max: 10 }, { n: 'B', h: -50, min: 0, max: 10 }] }] }] }, text);
  const tecky = [...h.matchAll(/<b style="left:([\d.]+)%"><\/b>/g)].map((m) => Number(m[1]));
  assert.ok(tecky.length >= 2 && tecky.every((x) => x >= 2 && x <= 98), tecky.join());
});

console.log(ok + ' testů prošlo');
