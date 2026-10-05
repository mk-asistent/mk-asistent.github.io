// Přihlášení heslem (Michal 5. 10.: „abych nemusel zadávat ten skript“). Adresa motoru a klíč jsou v souboru
// prihlaseni.json vedle aplikace – zašifrované heslem přímo v prohlížeči (PBKDF2-SHA256 600 000× → AES-GCM 256).
// Soubor je na webu veřejně, ale bez hesla je k ničemu; heslo se nikam neposílá ani neukládá. Proto aspoň 12 znaků.

const ITERACE = 600000;      // doporučení OWASP pro PBKDF2-SHA256
export const MIN_DELKA = 12;
const SOUBOR = 'prihlaseni.json';

const naB64 = (b) => { let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); };
const zB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

async function klicZHesla(heslo, sul, iterace) {
  const zaklad = await crypto.subtle.importKey('raw', new TextEncoder().encode(heslo), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sul, iterations: iterace, hash: 'SHA-256' }, zaklad,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Proč heslo nestačí ('' = v pořádku). */
export function slabeHeslo(heslo) {
  const h = String(heslo || '');
  if (h.length < MIN_DELKA) return 'Heslo musí mít aspoň ' + MIN_DELKA + ' znaků – třeba tři čtyři slova za sebou.';
  if (new Set(h.toLowerCase()).size < 6) return 'Heslo je moc jednoduché – použij víc různých znaků nebo slov.';
  if (/^(.+)\1+$/.test(h) || /^(0123|1234|abcd|qwer|heslo|asistent|michal)/i.test(h)) return 'Heslo je moc snadné na uhodnutí.';
  return '';
}

/** Zašifruje { url, klic } heslem → obsah souboru prihlaseni.json. */
export async function vytvorPrihlaseni(heslo, pripojeni) {
  const sul = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const klic = await klicZHesla(heslo, sul, ITERACE);
  const data = new TextEncoder().encode(JSON.stringify({ url: pripojeni.url, klic: pripojeni.klic }));
  const sifra = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, klic, data));
  const d = new Date();
  return { verze: 1, kdf: 'PBKDF2-SHA256', iterace: ITERACE, sul: naB64(sul), iv: naB64(iv), data: naB64(sifra),
    vytvoreno: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
}

/** Rozšifruje soubor heslem → { url, klic }; špatné heslo → null. */
export async function otevriPrihlaseni(heslo, soubor) {
  try {
    const klic = await klicZHesla(heslo, zB64(soubor.sul), Number(soubor.iterace) || ITERACE);
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: zB64(soubor.iv) }, klic, zB64(soubor.data));
    const p = JSON.parse(new TextDecoder().decode(data));
    return p && p.url && p.klic ? { url: p.url, klic: p.klic } : null;
  } catch (e) {
    return null; // AES-GCM nesouhlasí = špatné heslo (nebo poškozený soubor)
  }
}

/** Soubor s přihlášením z webu aplikace, nebo null (ještě nezapnuté). */
export async function nactiPrihlaseni() {
  try {
    const r = await fetch(SOUBOR, { cache: 'no-store' });
    if (!r.ok) return null;
    const s = await r.json();
    return s && s.verze === 1 && s.sul && s.iv && s.data ? s : null;
  } catch (e) {
    return null;
  }
}

/** Stáhne soubor do zařízení (PC: složka Stažené soubory) – zveřejní ho Claude. */
export function stahniPrihlaseni(obsah) {
  const odkaz = document.createElement('a');
  odkaz.href = URL.createObjectURL(new Blob([JSON.stringify(obsah, null, 1) + '\n'], { type: 'application/json' }));
  odkaz.download = SOUBOR;
  document.body.appendChild(odkaz);
  odkaz.click();
  setTimeout(() => { URL.revokeObjectURL(odkaz.href); odkaz.remove(); }, 1000);
}
