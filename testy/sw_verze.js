// Verze service workeru podle obsahu souborů aplikace (sw.js SOUBORY).
//   node testy/sw_verze.js            kontrola (test_aplikace.js ji volá taky)
//   node testy/sw_verze.js --zapsat   přepíše VERZE v sw.js
// Service worker posílá aplikaci z jedné uložené verze – bez nové VERZE by se změna k nikomu nedostala.
// Konce řádků se sjednotí (git na Windows dává CRLF), takže otisk je stejný na obou PC i na GitHubu.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KOREN = path.join(__dirname, '..');
const SW = path.join(KOREN, 'sw.js');

function soubory(sw) {
  const m = /const SOUBORY = \[([\s\S]*?)\];/.exec(sw);
  if (!m) throw new Error('V sw.js chybí seznam SOUBORY.');
  return (m[1].match(/'([^']+)'/g) || []).map((x) => x.slice(1, -1));
}

function otisk() {
  const sw = fs.readFileSync(SW, 'utf8');
  const h = crypto.createHash('sha1');
  soubory(sw).filter((f) => f !== './').forEach((f) => {
    let obsah = fs.readFileSync(path.join(KOREN, f));
    if (!/\.(png|jpe?g|webp|ico)$/i.test(f)) obsah = Buffer.from(obsah.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    h.update(f + '\0').update(obsah).update('\0');
  });
  return 'asistent-' + h.digest('hex').slice(0, 12);
}

function zkontroluj() {
  const sw = fs.readFileSync(SW, 'utf8');
  const ma = (/const VERZE = '([^']+)';/.exec(sw) || [])[1];
  const mel = otisk();
  return { ok: ma === mel, ma, mel };
}

function zapis() {
  const sw = fs.readFileSync(SW, 'utf8');
  const nova = otisk();
  fs.writeFileSync(SW, sw.replace(/const VERZE = '[^']+';/, "const VERZE = '" + nova + "';"));
  return nova;
}

module.exports = { otisk, zkontroluj, zapis };

if (require.main === module) {
  if (process.argv.includes('--zapsat')) {
    console.log('VERZE v sw.js: ' + zapis());
  } else {
    const v = zkontroluj();
    console.log(v.ok ? 'sw.js VERZE sedí (' + v.ma + ')' : 'sw.js VERZE nesedí s obsahem: je ' + v.ma + ', má být ' + v.mel + ' → node testy/sw_verze.js --zapsat');
    if (!v.ok) process.exitCode = 1;
  }
}
