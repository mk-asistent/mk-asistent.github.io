// Pracovní schránka přímo z WEDOS (IMAP + SMTP, bez přeposílání do Gmailu) – ČISTÉ FUNKCE bez sítě a bez Firebase.
// Z IMAP zpráv dělá konverzace ve stejném tvaru, jaký aplikace (js/posta.js) zná z motoru (apps-script/Kod.gs
// seznamVlaken_ a nactiVlakno_): seznam pro Poštu, detail konverzace, stav „případu“ s důvodem.
// Práci se schránkou (imapflow, nodemailer) dělá wedos_schranka.js, Firebase (secret, Firestore) index.js.
// Test: node test.js (spustí i test_wedos.js) – bez sítě, s vymyšlenými daty.
//
// Pravidla stavů (hoří, čeká na tebe, otázka, čekáš na ně, řeší se, informace) jsou PŘEVZATÁ z motoru (stavADuvod_,
// terminZTextu_, vlastniText_) – test_wedos.js porovná výsledky s motorem, když leží vedle (repo); při změně pravidel
// v Kod.gs upravit i tady. Místo kategorie Gmailu „Aktualizace“ se pozná rozesílka a automat podle hlaviček
// (List-Id, List-Unsubscribe, Precedence, Auto-Submitted).

'use strict';
const crypto = require('crypto');

// ---------------------------------------------------------------- nastavení a meze

const VYCHOZI_SERVERY = { imap: 'wes1-imap.wedos.net', smtp: 'wes1-smtp.wedos.net' }; // ověřeno 9. 10. 2026 (DNS + TLS *.wedos.net)
const PORT_IMAP = 993;   // IMAP přes TLS
const PORT_SMTP = 465;   // SMTP přes TLS (587 se STARTTLS umí WEDOS taky)
// heslo jde jen na servery WEDOS – adresu serveru zapisuje aplikace, nikdy nesmí poslat heslo jinam
const SERVER_WEDOS = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?\.wedos\.net$/;
const PROSTA_ADRESA = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

const DNI = 30;                          // Doručené a Odeslané za 30 dní (jako motor)
const MAX_ZPRAV = { d: 300, o: 200 };    // nejnovějších zpráv ze složky do konverzací
const MAX_KONVERZACI = 60;               // do aplikace (motor: 50 + 25 starších)
const MAX_DETAILU = 10;                  // detaily nejnovějších konverzací předem (wedosDetaily)
const MAX_ZPRAV_VE_VLAKNE = 12;          // jako motor
const MAX_TEXTU = 100000;                // znaků textu jedné zprávy v detailu
const MAX_HTML = 200000;                 // znaků HTML jedné zprávy v detailu (~200 kB)
const MAX_DETAIL = 900000;               // bajtů JSON detailu (Firestore unese 1 MiB na dokument)
const MAX_VLASTNI = 1500;                // vlastní text zprávy pro stav (jako motor)

/**
 * Nastavení z účtu (uzivatele/{uid}.wedos, zapisuje aplikace) → { adresa, imap, smtp, jmeno } nebo null.
 * Servery jen *.wedos.net (jinak by šlo heslo poslat cizímu serveru), adresa = přihlašovací jméno.
 */
function platneNastaveni(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return null;
  const adresa = String(w.adresa || '').trim().toLowerCase();
  const imap = String(w.imap || VYCHOZI_SERVERY.imap).trim().toLowerCase();
  const smtp = String(w.smtp || VYCHOZI_SERVERY.smtp).trim().toLowerCase();
  if (adresa.length > 120 || !PROSTA_ADRESA.test(adresa)) return null;
  if (!SERVER_WEDOS.test(imap) || !SERVER_WEDOS.test(smtp)) return null;
  const jmeno = String(w.jmeno || '').replace(/[\u0000-\u001f"<>\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return { adresa, imap, smtp, jmeno };
}

/** Otisk nastavení – po změně adresy nebo serveru se ruší pauza po neúspěšném přihlášení. */
function otiskNastaveni(n) { return n ? hash(n.adresa + '|' + n.imap + '|' + n.smtp).slice(0, 12) : ''; }

function hash(s) { return crypto.createHash('sha1').update(String(s)).digest('hex'); }

/** Otisk obsahu bez času vytvoření (ted) – jako obnova.js: beze změny se dokument nepřepisuje. */
function otisk(data) {
  const bezCasu = data && typeof data === 'object' && !Array.isArray(data) && 'ted' in data ? Object.assign({}, data, { ted: 0 }) : data;
  return hash(JSON.stringify(bezCasu) || '');
}

// ---------------------------------------------------------------- adresy a hlavičky

/** Adresa z imapflow ({ name, address }) nebo z textu „Jméno <a@b>“ → { jmeno, adresa } (adresa malými). */
function adresaObj(a) {
  if (!a) return { jmeno: '', adresa: '' };
  if (typeof a === 'string') return adresaZTextu(a);
  const adresa = String(a.address || '').trim().toLowerCase();
  const j = String(a.name || '').replace(/\s+/g, ' ').trim();
  return { jmeno: j && j.toLowerCase() !== adresa ? j : '', adresa };
}

/** „Jméno <adresa>“ (jméno v uvozovkách, když obsahuje čárku apod.) – jako hlavička To v Gmailu. */
function formatAdresa(o) {
  if (!o || !o.adresa) return '';
  if (!o.jmeno) return o.adresa;
  const j = /[,;<>()@"\\:[\]]/.test(o.jmeno) ? '"' + o.jmeno.replace(/["\\]/g, '\\$&') + '"' : o.jmeno;
  return j + ' <' + o.adresa + '>';
}
const formatAdresy = (seznam) => (seznam || []).map(formatAdresa).filter(Boolean).join(', ');
const jmenoNeboAdresa = (o) => (o && (o.jmeno || o.adresa)) || '';

/**
 * Seznam adres z textu: '"Novák, Jan" <jan@x.cz>, „Dr. X“ <x@y.cz>; b@c.cz' → 3 kusy (převzato z motoru rozdelAdresy_).
 * Čárka a středník dělí jen mimo uvozovky, <…> a (…); při nespárovaných se dělí obyčejně.
 */
function rozdelAdresy(text) {
  const s = String(text || '');
  const vysledek = [];
  let kus = '', uvozovky = '', zavorky = 0;
  for (let i = 0; i < s.length; i++) {
    const z = s.charAt(i);
    if (uvozovky) {
      if (z === '\\' && uvozovky === '"') { kus += z + s.charAt(++i); continue; }
      if (uvozovky.indexOf(z) >= 0) uvozovky = '';
    } else if (z === '"') uvozovky = '"';
    else if (z === '„' || z === '“') uvozovky = '“”';
    else if (z === '<' || z === '(') zavorky++;
    else if ((z === '>' || z === ')') && zavorky) zavorky--;
    else if ((z === ',' || z === ';') && !zavorky) {
      if (kus.trim()) vysledek.push(kus.trim());
      kus = '';
      continue;
    }
    kus += z;
  }
  if (uvozovky || zavorky) return s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
  if (kus.trim()) vysledek.push(kus.trim());
  return vysledek;
}

function adresaZ(od) {
  const m = String(od || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(od || '')).trim().toLowerCase();
}

function jmeno(od) {
  const prvni = rozdelAdresy(od)[0] || '';
  const m = prvni.match(/^([^<]*)<([^>]+)>/);
  if (!m) return prvni;
  const j = m[1].trim().replace(/^["„“”]+|["„“”]+$/g, '').replace(/\\(.)/g, '$1').trim();
  return j || m[2].trim();
}

/** „Jméno <a@b>“ → { jmeno, adresa }; samotná adresa → jméno prázdné. */
function adresaZTextu(a) {
  const adresa = adresaZ(a);
  const j = jmeno(a).replace(/\s+/g, ' ').trim();
  return { jmeno: j && j.toLowerCase() !== adresa ? j.slice(0, 80) : '', adresa };
}

const PLATNA_ADRESA = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

/** Adresáti zadaní v aplikaci → [{ jmeno, adresa }]; neplatná adresa = chyba (česky). */
function adresyZeVstupu(text) {
  const seznam = rozdelAdresy(String(text || '').replace(/[\r\n]+/g, ' '));
  if (!seznam.length) throw chybaVstupu('Chybí adresát.');
  if (seznam.length > 50) throw chybaVstupu('Adresátů je moc (nejvýš 50).');
  return seznam.map((a) => {
    const o = adresaZTextu(a);
    if (!PLATNA_ADRESA.test(o.adresa)) throw chybaVstupu('Neplatná adresa: ' + a.slice(0, 80));
    return o;
  });
}

function chybaVstupu(text) { return Object.assign(new Error(text), { wedosDruh: 'vstup' }); }

/** Hlavičky z FETCH (Buffer „Klíč: hodnota“, i přes víc řádků) → { klíč malými: hodnota } (první výskyt). */
function rozeberHlavicky(buf) {
  const vysledek = {};
  String(buf || '').replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n').forEach((radek) => {
    const i = radek.indexOf(':');
    if (i <= 0) return;
    const klic = radek.slice(0, i).trim().toLowerCase();
    if (!(klic in vysledek)) vysledek[klic] = radek.slice(i + 1).trim();
  });
  return vysledek;
}

/** První <message-id> z hlavičky (bez <> ho doplní); nic → ''. */
function cisteId(s) {
  const t = String(s || '').trim();
  const m = t.match(/<[^<>\s]+>/);
  if (m) return m[0];
  return /^[^<>\s@]+@[^<>\s]+$/.test(t) ? '<' + t + '>' : '';
}

/** References → [<id>, …] bez opakování; dlouhý řetěz: kořen + posledních 10. */
function idZeSeznamu(s) {
  const vse = String(s || '').match(/<[^<>\s]+>/g) || [];
  const jedinecne = vse.filter((x, i) => vse.indexOf(x) === i);
  return jedinecne.length > 11 ? [jedinecne[0]].concat(jedinecne.slice(-10)) : jedinecne;
}

function casZ(d) {
  if (d == null || d === '') return 0;
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return isFinite(t) ? t : 0;
}

/**
 * Zpráva z imapflow FETCH ({ uid, flags, envelope, internalDate, size, headers }) → jednotný tvar pro konverzace.
 * slozka: 'd' Doručené | 'o' Odeslané; uv = UIDVALIDITY složky (text).
 */
function normalizuj(m, slozka, uv) {
  const e = m.envelope || {};
  const hl = rozeberHlavicky(m.headers);
  const flags = m.flags instanceof Set ? m.flags : new Set(m.flags || []);
  const prijato = casZ(m.internalDate);
  const datum = casZ(e.date);
  return {
    klic: slozka + ':' + m.uid,
    slozka,
    uid: m.uid,
    uv: String(uv == null ? '' : uv),
    mid: cisteId(e.messageId || hl['message-id']),
    odpovedNa: cisteId(e.inReplyTo || hl['in-reply-to']),
    odkazy: idZeSeznamu(hl.references),
    od: adresaObj((e.from || [])[0]),
    komu: (e.to || []).map(adresaObj).filter((a) => a.adresa),
    kopie: (e.cc || []).map(adresaObj).filter((a) => a.adresa),
    skryta: (e.bcc || []).map(adresaObj).filter((a) => a.adresa),
    odpovedet: (e.replyTo || []).map(adresaObj).filter((a) => a.adresa),
    predmet: String(e.subject || '').replace(/\s+/g, ' ').trim(),
    // čas doručení (server ho nenechá podvrhnout) – bez něj datum z hlavičky
    kdy: prijato || datum,
    precteno: slozka === 'o' || flags.has('\\Seen'),
    oznaceno: flags.has('\\Flagged'),
    hromadna: !!(hl['list-id'] || hl['list-unsubscribe'] || /^(bulk|list|junk)$/i.test(hl.precedence || '')),
    automat: /^auto-/i.test(hl['auto-submitted'] || '') || !!hl['x-autoreply'] || !!hl['x-autorespond'],
    velikost: m.size || 0
  };
}

/** Hlavičky, které se ke každé zprávě v seznamu čtou navíc k ENVELOPE (References v něm nejsou). */
const HLAVICKY = ['message-id', 'in-reply-to', 'references', 'list-id', 'list-unsubscribe', 'precedence', 'auto-submitted', 'x-autoreply', 'x-autorespond'];

// ---------------------------------------------------------------- konverzace (vlákna)

const PREDPONY = /^\s*((re|fw|fwd|odp|vs|tr|aw|sv|wg)\s*(\[\d+\])?\s*:\s*)+/i;
const JE_ODPOVED = /^\s*(re|odp|aw|sv)\s*(\[\d+\])?\s*:/i;
function bezPredpony(s) { return String(s || '').replace(PREDPONY, ''); }
function klicPredmetu(s) { return bezPredpony(s).replace(/\s+/g, ' ').trim().toLowerCase(); }

/** Id konverzace / zprávy pro aplikaci a Firestore: „w“ + 15 hex (motor má id Gmailu – nepletou se). */
function idZ(s) { return 'w' + hash(s).slice(0, 15); }
const JE_ID = /^w[0-9a-f]{15}$/;

/** Id konverzací z požadavku aplikace: id, nebo ids (nejvýš 100, jen platná, bez opakování). */
function idyKonverzaci(d) {
  const x = d && Array.isArray(d.ids) ? d.ids : d && d.id != null ? [d.id] : [];
  return x.map(String).filter((id, i, a) => JE_ID.test(id) && a.indexOf(id) === i).slice(0, 100);
}

/** Id zprávy (pro detail a odpověď): podle Message-ID, bez něj podle složky a UID. */
function idZpravy(z) { return idZ(z.mid || ('#' + z.uv + ':' + z.klic)); }

/**
 * Zprávy → konverzace podle Message-ID / In-Reply-To / References; odpověď bez hlaviček (Re: …) se přidá ke konverzaci
 * se stejným předmětem. Jen konverzace, které mají zprávu v Doručené (jako „in:inbox“ v Gmailu – Hotovo = archiv ji
 * schová, i když v Odeslaných zůstane tvoje odpověď). Nejnovější nahoře; uvnitř zprávy od nejstarší.
 * Id konverzace se drží kořene (první v References / In-Reply-To), aby se neměnilo, když starší zprávy vypadnou z okna.
 */
function sestavKonverzace(zpravy) {
  // zpráva sobě je v Doručené i Odeslané – stačí jednou (kopie z Doručené nese přečtení)
  const serazene = zpravy.slice().sort((a, b) => (a.slozka === b.slozka ? a.kdy - b.kdy : a.slozka === 'd' ? -1 : 1));
  const podleMid = new Map();
  const jedinecne = [];
  serazene.forEach((z) => {
    if (z.mid && podleMid.has(z.mid)) return;
    if (z.mid) podleMid.set(z.mid, z);
    jedinecne.push(z);
  });
  const rodic = new Map();
  const pridej = (x) => { if (!rodic.has(x)) rodic.set(x, x); };
  const najdi = (x) => {
    let r = x;
    while (rodic.get(r) !== r) r = rodic.get(r);
    while (rodic.get(x) !== r) { const dalsi = rodic.get(x); rodic.set(x, r); x = dalsi; }
    return r;
  };
  const spoj = (a, b) => { pridej(a); pridej(b); const ra = najdi(a), rb = najdi(b); if (ra !== rb) rodic.set(rb, ra); };
  const uzel = (z) => z.mid || '#' + z.klic;
  jedinecne.forEach((z) => {
    pridej(uzel(z));
    if (z.odpovedNa) spoj(uzel(z), z.odpovedNa);
    z.odkazy.forEach((r) => spoj(uzel(z), r));
  });
  // záloha: „Re: …“ bez hlaviček odpovědi → k poslední dřívější zprávě se stejným předmětem
  jedinecne.filter((z) => !z.odpovedNa && !z.odkazy.length && JE_ODPOVED.test(z.predmet)).forEach((z) => {
    const k = klicPredmetu(z.predmet);
    if (k.length < 3) return;
    let nej = null;
    jedinecne.forEach((x) => { if (x !== z && x.kdy <= z.kdy && klicPredmetu(x.predmet) === k && (!nej || x.kdy > nej.kdy)) nej = x; });
    if (nej) spoj(uzel(z), uzel(nej));
  });
  const skupiny = new Map();
  jedinecne.forEach((z) => {
    const r = najdi(uzel(z));
    if (!skupiny.has(r)) skupiny.set(r, []);
    skupiny.get(r).push(z);
  });
  const konverzace = [];
  skupiny.forEach((zz) => {
    if (!zz.some((z) => z.slozka === 'd')) return;
    zz.sort((a, b) => a.kdy - b.kdy || a.uid - b.uid);
    konverzace.push({ id: idZ(korenKonverzace(zz)), zpravy: zz });
  });
  return konverzace.sort((a, b) => posledni(b).kdy - posledni(a).kdy);
}

/** Kořen konverzace: nejčastější první odkaz (References[0] / In-Reply-To), jinak Message-ID nejstarší zprávy. */
function korenKonverzace(zz) {
  const pocet = new Map();
  zz.forEach((z) => {
    const k = z.odkazy[0] || z.odpovedNa;
    if (k) pocet.set(k, (pocet.get(k) || 0) + 1);
  });
  let nej = null;
  pocet.forEach((n, k) => { if (!nej || n > pocet.get(nej)) nej = k; });
  return nej || zz[0].mid || '#' + zz[0].uv + ':' + zz[0].klic;
}

const posledni = (k) => k.zpravy[k.zpravy.length - 1];

/** Klíč textu zprávy v mezipaměti serveru (UIDVALIDITY + složka + UID – zpráva se pod ním nemění). */
function klicTextu(z) { return z.uv + ':' + z.klic; }

/** Otisk obsahu konverzace pro detail (nová zpráva = nový detail) – z mapy konverzace a UIDVALIDITY složek. */
function otiskDetailu(mapa, uv) {
  return hash((mapa || []).map((p) => ((uv || {})[String(p).charAt(0)] || '') + ':' + p).join(',')).slice(0, 12);
}

/**
 * Mapa konverzace pro akce serveru (archiv, přečteno, odpověď): ['d:123:w…', …] = složka, UID, id zprávy – posledních 60.
 * Text, ne pole polí (Firestore vnořená pole neumí).
 */
function mapaKonverzace(k) {
  return k.zpravy.slice(-60).map((z) => z.slozka + ':' + z.uid + ':' + idZpravy(z));
}

// ---------------------------------------------------------------- texty (převzato z motoru)

// Neviditelné znaky, kterými reklamní e-maily vycpávají náhled, a zbytky obrázků a odkazů z textové verze.
const NEVIDITELNE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\u3164\ufeff\uffa0]/g;

/** Text pro náhled: bez neviditelných znaků, „[image: …]“ a osamělých „<“ po odkazech, mezery sloučené. */
function cistyText(s) {
  return String(s || '').replace(NEVIDITELNE, '').replace(/\[image:[^\]]*\]/gi, ' ').replace(/(^|\s)<(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Vlastní text zprávy: bez citace předchozích, bez podpisu za „-- “ a bez adres (otazník v odkazu není otázka). */
function vlastniText(text) {
  return String(text || '').replace(/\r\n?/g, '\n')
    .split(/\n\s*(?:>|Dne .{0,80}napsal|On .{0,80}wrote:|-----|Od:\s.*\n\s*(?:Odesláno|Datum|Komu):|From:\s.*\n\s*(?:Sent|Date|To):)|\n-- ?\n/)[0]
    .replace(/https?:\/\/\S+/g, '').trim().slice(0, MAX_VLASTNI);
}

/** První řádek textu pro náhled; samotné oslovení („Dobrý den,“) se přeskočí. */
function prvniRadek(text) {
  const radky = String(text || '').split('\n').map((r) => r.trim()).filter(Boolean);
  const osloveni = radky.length > 1 && radky[0].length <= 40 && /,$/.test(radky[0]);
  return (radky[osloveni ? 1 : 0] || '').replace(/\s+/g, ' ').slice(0, 180);
}

/** HTML → prostý text (náhled a stav, když zpráva textovou část nemá). */
function htmlNaText(html) {
  const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(html || '')
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (cela, k) => {
      if (k[0] === '#') {
        const n = k[1].toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return ENTITY[k.toLowerCase()] != null ? ENTITY[k.toLowerCase()] : cela;
    })
    .replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Text zprávy z rozebraného e-mailu (mailparser): textová část, jinak převedené HTML. */
function textZpravy(rozebrana) {
  const t = rozebrana && typeof rozebrana.text === 'string' ? rozebrana.text : '';
  if (t.trim()) return t.replace(/\r\n?/g, '\n');
  return rozebrana && typeof rozebrana.html === 'string' ? htmlNaText(rozebrana.html) : '';
}

// Náhled bez hlaviček přeposlání a citací (Michal: „kdo poslal, předmět a rovnou text“).
const ODDELOVAC_RADEK = /^\s*(?:-{2,}\s*(?:původní (?:e-mail|zpráva)|přeposlan[áý] (?:zpráva|e-mail)|forwarded message|original message)\s*-{2,}|begin forwarded message:|začátek přeposlané zprávy:|_{6,})\s*$/i;
const HLAVICKA_RADEK = /^\s*\*?(?:od|from|komu|to|kopie|cc|bcc|datum|date|odesláno|sent|předmět|subject|odpovědět na|reply-to)\s*:/i;
const UVOD_CITACE_RADEK = /^\s*(?:dne|on)\s.{0,160}(?:napsal\(a\)|napsala|napsal|wrote)\s?:\s*$/i;
const PODPIS_MOBIL = /^\s*(?:(?:odesláno|posláno) z (?:mého )?(?:iphonu|ipadu|androidu|telefonu|mobilu)|sent from my )/i;
const KONEC_VLASTNIHO = /\n\s*(?:>|Dne .{0,80}napsal|On .{0,80}wrote:|-{2,}\s*(?:původní|přeposlan|forwarded|original)|Begin forwarded message:|Začátek přeposlané zprávy:|_{6,}|Od:\s.*\n\s*(?:Odesláno|Datum|Komu):|From:\s.*\n\s*(?:Sent|Date|To):)|\n-- ?\n/i;

/** Náhled zprávy (180 znaků): vlastní text bez citace a podpisu; jen přeposlaná zpráva → její text bez hlaviček. */
function nahled(text) {
  const t = String(text || '').replace(/\r\n?/g, '\n').replace(NEVIDITELNE, '');
  const bezMobilu = (s) => s.split('\n').filter((r) => !PODPIS_MOBIL.test(r)).join('\n');
  const vlastni = cistyText(bezMobilu(('\n' + t).split(KONEC_VLASTNIHO)[0]).replace(/https?:\/\/\S+/g, ' '));
  if (vlastni) return vlastni.slice(0, 180);
  const zbytek = t.split('\n').filter((r) => !ODDELOVAC_RADEK.test(r) && !HLAVICKA_RADEK.test(r) && !PODPIS_MOBIL.test(r) && !UVOD_CITACE_RADEK.test(r))
    .map((r) => r.replace(/^\s*>+\s?/, '')).join('\n').replace(/https?:\/\/\S+/g, ' ');
  return cistyText(zbytek).slice(0, 180);
}

/** Co si server pamatuje o poslední zprávě konverzace: vlastní text (stav) a náhled. */
function textyZpravy(text) {
  return { v: vlastniText(text), u: nahled(text) };
}

function zkrat(text, max) {
  text = String(text || '');
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** HTML nejvýš max znaků, řez za posledním celým tagem; končí „…“ (jako motor zkratHtml_). */
function zkratHtml(html, max) {
  html = String(html || '');
  if (html.length <= max) return html;
  const konecTagu = html.lastIndexOf('>', max - 1);
  return html.slice(0, konecTagu > 0 ? konecTagu + 1 : max) + '…';
}

// ---------------------------------------------------------------- čas v Praze (termíny v textu)

const PASMO = 'Europe/Prague';
const PAMET_POSUNU = new Map();
/** Posun Prahy proti UTC v okamžiku ms (+2 h v létě); během hodiny se nemění → pamatuje se. */
function posunPrahy(ms) {
  const klic = Math.floor(ms / 36e5);
  if (!PAMET_POSUNU.has(klic)) {
    const casti = {};
    new Intl.DateTimeFormat('en-US', { timeZone: PASMO, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms)).forEach((p) => { casti[p.type] = p.value; });
    const mistni = Date.UTC(+casti.year, +casti.month - 1, +casti.day, +casti.hour % 24, +casti.minute, +casti.second);
    PAMET_POSUNU.set(klic, mistni - Math.floor(ms / 1000) * 1000);
  }
  return PAMET_POSUNU.get(klic);
}
function msVPraze(y, mo, d, h, mi, s) {
  const jakoUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const prvni = jakoUtc - posunPrahy(jakoUtc);
  return jakoUtc - posunPrahy(prvni);
}
function cisloDne(y, mo, d) { return Math.floor(Date.UTC(y, mo - 1, d) / 864e5); }
function zCislaDne(n) { const t = new Date(n * 864e5); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }
function denTydne(n) { return (((n % 7) + 7) + 4) % 7; } // 0 = neděle; den 0 byl čtvrtek
function dniMesice(y, mo) { return new Date(Date.UTC(y, mo, 0)).getUTCDate(); }
function cisloDneZMs(ms) { return Math.floor((ms + posunPrahy(ms)) / 864e5); }

// ---------------------------------------------------------------- stav konverzace (převzato z motoru stavADuvod_)
// hori   – termín do 48 hodin; naléhavost nebo nahlášený problém jen od známých
// ceka   – prosba, úkol, nebo osobní zpráva od známého
// otazka – ptá se, ale nic nežádá
// cekas  – poslední jsi psal ty a čekáš na odpověď
// resi   – živá konverzace, ve které se od tebe teď nic nečeká
// info   – rozesílka, automat, neznámý odesílatel bez prosby a otázky, konverzace uzavřená tvým „díky“

const PISMENO_PRED = '(?<![\\p{L}])';
const PISMENO_ZA = '(?![\\p{L}])';
const slova_ = function (seznam) { return new RegExp(PISMENO_PRED + '(?:' + seznam.join('|') + ')' + PISMENO_ZA, 'iu'); };
const SLOVA_HORI = slova_(['urgent\\p{L}*', 'asap', 'naléhav\\p{L}*', 'spěchá', 'rychle', 'ihned', 'okamžitě', 'neprodleně',
  'co nejdřív(?:e)?', 'deadline', 'nefunguj\\p{L}*', 'výpadek', 'výpadku', 'nedostupn\\p{L}*', 'havári\\p{L}*', 'porucha', 'poruchu']);
const SLOVA_PROSBA = slova_(['prosím', 'prosíme', 'prosil\\p{L}* bych', 'potřebuj\\p{L}*', 'potřeboval\\p{L}* bych', 'je potřeba', 'je nutné',
  'pošli', 'pošlete', 'pošleš', 'zašli', 'zašlete', 'dej(?:te)?(?: mi)? vědět', 'ozvi se', 'ozvěte se', 'potvrď(?:te)?', 'potvrdíš',
  'zkontroluj(?:te)?', 'připrav(?:te)?', 'zaplať(?:te)?', 'uhraď(?:te)?', 'vyplň(?:te)?', 'schval(?:te)?', 'podepiš(?:te)?',
  'doplň(?:te)?', 'oprav(?:te)?', 'rozhodni', 'rozhodněte', 'odpověz(?:te)?', 'můžeš', 'můžete', 'mohl\\p{L}* (?:bys|byste|bychom)',
  'k připomínkám', 'k vyjádření', 'ke schválení', 'k podpisu', 'k odsouhlasení', 'k objednání']);
const AUTOMAT = /(no-?reply|do-?not-?reply|notification|notifikace|newsletter|mailer-daemon|postmaster|bounce)/i;
const AUTOODPOVED = new RegExp('^\\s*(?:automatick[áa] odpov[ěe]ď|automatic reply|auto(?:matic)?[- ]?(?:reply|response)|out of (?:the )?office|' +
  'mimo kancel[áa][řr]|nep[řr][íi]tomnost|abwesenheitsnotiz)' + PISMENO_ZA, 'iu');
const DIKY = new RegExp('^(díky|dík|děkuj\\p{L}*|ok|okay|super|platí|dobře|jasně|v pořádku|výborně|thanks|thank you)' + PISMENO_ZA + '[^?]{0,40}$', 'iu');
const DNY_TERMINU = { 'pondělí': 1, 'úterý': 2, 'středy': 3, 'středu': 3, 'čtvrtka': 4, 'čtvrtek': 4, 'pátku': 5, 'pátek': 5,
  'soboty': 6, 'sobotu': 6, 'neděle': 0, 'neděli': 0 };
const TERMIN = new RegExp(PISMENO_PRED + '(?:do|nejpozději(?: do)?|termín(?:em)?|deadline|potřebuj\\p{L}* (?:to )?(?:do|na))\\s+' +
  '(dnes|dneska|dneška|zítra|zítřka|pozítří|večera|konce dne|' + Object.keys(DNY_TERMINU).join('|') +
  '|(\\d{1,2})\\.\\s?(\\d{1,2})\\.(?:\\s?(\\d{4}))?)' + PISMENO_ZA, 'iu');
const ZKRATKY_DNU = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

/** Termín v textu (23:59 toho dne v Praze) – stejné jako motor terminZTextu_: { ms, fraze, den, veta } nebo null. */
function terminZTextu(text, kdy, ted) {
  const denZpravy = cisloDneZMs(kdy);
  const hledani = new RegExp(TERMIN.source, 'giu');
  let nejlepsi = null;
  let m;
  while ((m = hledani.exec(text))) {
    const den = denTerminu(m, denZpravy);
    if (den === null) continue;
    const ymd = zCislaDne(den);
    const ms = msVPraze(ymd[0], ymd[1], ymd[2], 23, 59, 0);
    const plati = ms >= ted - 864e5;
    if (!nejlepsi || (plati ? !nejlepsi.plati || ms < nejlepsi.ms : !nejlepsi.plati && ms > nejlepsi.ms)) {
      nejlepsi = { ms, plati, den, zacatek: m.index, konec: m.index + m[0].length, fraze: m[0] };
    }
  }
  if (!nejlepsi) return null;
  const ymd = zCislaDne(nejlepsi.den);
  const letos = zCislaDne(cisloDneZMs(ted))[0];
  return {
    ms: nejlepsi.ms,
    fraze: nejlepsi.fraze.replace(/\s+/g, ' ').toLowerCase(),
    den: ZKRATKY_DNU[denTydne(nejlepsi.den)] + ' ' + ymd[2] + '. ' + ymd[1] + '.' + (ymd[0] !== letos ? ' ' + ymd[0] : ''),
    veta: vetaKolem(text, nejlepsi.zacatek, nejlepsi.konec)
  };
}

function denTerminu(m, denZpravy) {
  if (m[2]) {
    const den = Number(m[2]);
    const mesic = Number(m[3]);
    let rok = m[4] ? Number(m[4]) : zCislaDne(denZpravy)[0];
    if (!m[4] && cisloDne(rok, mesic, den) < denZpravy - 180) rok++;
    if (mesic < 1 || mesic > 12 || den < 1 || den > dniMesice(rok, mesic)) return null;
    return cisloDne(rok, mesic, den);
  }
  const slovo = m[1].toLowerCase();
  if (DNY_TERMINU[slovo] !== undefined) return denZpravy + (DNY_TERMINU[slovo] - denTydne(denZpravy) + 7) % 7;
  if (slovo === 'zítra' || slovo === 'zítřka') return denZpravy + 1;
  if (slovo === 'pozítří') return denZpravy + 2;
  return denZpravy;
}

function vetaKolem(text, zacatek, konec) {
  const konecVety = /\n|[!?…](?=\s|$)|\.(?=\s+\p{Lu}|\s*$)/gu;
  let od = 0;
  let po = text.length;
  let m;
  while ((m = konecVety.exec(text))) {
    if (m.index < zacatek) od = m.index + 1;
    else if (m.index >= konec - 1) { po = m.index + 1; break; }
  }
  const veta = text.slice(od, po).replace(/\s+/g, ' ').trim();
  if (veta.length <= 140) return veta;
  const z = Math.max(od, zacatek - 40);
  const k = Math.min(po, z + 136);
  return (z > od ? '…' : '') + text.slice(z, k).replace(/\s+/g, ' ').trim() + (k < po ? '…' : '');
}

/** Známí = komu jsem psal (otisky adres z Odeslaných) a kolegové z pracovní domény; bez seznamu každý známý. */
function otiskAdresy(a) { return hash(String(a || '').trim().toLowerCase()).slice(0, 12); }
function jeZnamy(adresa, znami) {
  if (!znami) return true;
  const a = String(adresa || '').toLowerCase();
  return znami.has(otiskAdresy(a)) || znami.has(otiskAdresy('@' + a.slice(a.indexOf('@') + 1)));
}

/**
 * Stav konverzace podle poslední zprávy: { stav, duvod, termin } – pravidla motoru (stavADuvod_).
 * z = { predmet, vlastni (vlastní text), od: { jmeno, adresa }, komu, kopie, kdy, oznameni (důvod rozesílky / automatu) }.
 */
function stavADuvod(z, odeMe, ted, jsemPsal, znami) {
  const text = String(z.vlastni || '');
  const vse = String(z.predmet || '') + '\n' + text;
  const termin = terminZTextu(vse, z.kdy, ted);
  const vysledek = (stav, duvod) => ({ stav, duvod, termin });
  if (odeMe) {
    const komu = (z.komu || []).concat(z.kopie || []).map(formatAdresa);
    const diky = DIKY.exec(text);
    if (komu.length > 5) return vysledek('info', 'hromadná zpráva (' + komu.length + ' adresátů)');
    if (komu.length && komu.every((a) => AUTOMAT.test(a))) return vysledek('info', 'psal jsi automatické adrese');
    if (diky && !SLOVA_PROSBA.test(text)) return vysledek('info', 'tvoje „' + diky[1].toLowerCase() + '“ na konci');
    return vysledek('cekas', 'odpověděl jsi poslední');
  }
  if (z.oznameni) return vysledek('info', z.oznameni);
  if (AUTOMAT.test(formatAdresa(z.od))) return vysledek('info', 'automatická adresa');
  if (AUTOODPOVED.test(String(z.predmet || ''))) return vysledek('info', 'automatická odpověď (mimo kancelář)');
  if (termin && termin.ms >= ted - 864e5 && termin.ms <= ted + 48 * 36e5) {
    return vysledek('hori', 'termín „' + termin.fraze + '“ – ' + termin.den);
  }
  const znamy = jsemPsal || jeZnamy(z.od && z.od.adresa, znami);
  const slovo = SLOVA_HORI.exec(vse);
  if (slovo && znamy) return vysledek('hori', 'slovo „' + slovo[0].toLowerCase() + '“');
  const prosba = SLOVA_PROSBA.exec(vse);
  if (prosba) return vysledek('ceka', 'prosba „' + prosba[0].toLowerCase() + '“');
  if (/\?/.test(text)) return vysledek('otazka', 'otazník v textu');
  if (jsemPsal) return vysledek('resi', 'píšete si, nic po tobě nechce');
  if (!znamy) return vysledek('info', 'neznámý odesílatel');
  return vysledek('ceka', 'osobní zpráva');
}

/** Důvod „informace“ z hlaviček (náhrada kategorie Aktualizace v Gmailu), nebo ''. */
function oznameniZpravy(z) {
  if (z.automat) return 'automatická zpráva (Auto-Submitted)';
  if (z.hromadna) return 'rozesílka (List-Id / odhlášení)';
  return '';
}

/**
 * Souhrn konverzace pro seznam v aplikaci – stejná pole jako motor (seznamVlaken_), navíc zdroj: 'wedos'.
 * texty = { klicTextu: { v: vlastní text, u: náhled } } (server je čte jen u posledních zpráv).
 */
function souhrnKonverzace(k, ja, texty, znami, ted) {
  const zz = k.zpravy;
  const posl = zz[zz.length - 1];
  const odeMne = (z) => z.od.adresa === ja;
  let odesilatel = null;
  for (let j = zz.length - 1; j >= 0 && !odesilatel; j--) if (!odeMne(zz[j])) odesilatel = zz[j];
  const odeMe = odeMne(posl);
  const t = texty[klicTextu(posl)] || { v: '', u: '' };
  const oznameni = odeMe ? '' : oznameniZpravy(posl);
  const s = stavADuvod({ predmet: posl.predmet, vlastni: t.v, od: posl.od, komu: posl.komu, kopie: posl.kopie, kdy: posl.kdy, oznameni },
    odeMe, ted, zz.some(odeMne), znami);
  const cekas = s.stav === 'cekas';
  const adresati = (posl.komu.length ? posl.komu : posl.kopie).slice(0, 3).map(jmenoNeboAdresa).join(', ');
  const polozka = {
    id: k.id,
    ucet: 'pracovni',
    zdroj: 'wedos',
    stav: s.stav,
    duvod: s.duvod,
    od: cekas ? 'Čekáš na: ' + adresati : odesilatel ? jmenoNeboAdresa(odesilatel.od) : 'Já → ' + jmenoNeboAdresa(posl.komu[0]),
    odAdresa: odesilatel ? odesilatel.od.adresa : '',
    predmet: zz[0].predmet || '(bez předmětu)',
    ukazka: (cekas && prvniRadek(t.v)) || t.u,
    kdy: posl.kdy,
    neprectena: zz.some((z) => !z.precteno),
    hvezdicka: zz.some((z) => z.oznaceno),
    stitky: [],
    pocet: zz.length,
    odkaz: null,
    termin: s.termin ? s.termin.ms : null,
    terminVeta: s.termin ? s.termin.veta : '',
    poTerminu: !!s.termin && s.termin.ms < ted,
    cekasOd: cekas ? posl.kdy : null
  };
  if (oznameni) polozka.aktualizace = true; // jako kategorie Aktualizace – v aplikaci vlastní záložka
  return polozka;
}

// ---------------------------------------------------------------- detail konverzace

/** Přílohy ze stavby zprávy (BODYSTRUCTURE) bez obsahu: [{ nazev, velikost }]; vložené obrázky ne (jako motor). */
function seznamPriloh(stavba) {
  const vysledek = [];
  const projdi = (uzel, vRelated) => {
    if (!uzel) return;
    const typ = String(uzel.type || '').toLowerCase();
    if (uzel.childNodes && uzel.childNodes.length) {
      uzel.childNodes.forEach((d) => projdi(d, vRelated || typ === 'multipart/related'));
      return;
    }
    const dispozice = String(uzel.disposition || '').toLowerCase();
    const nazev = (uzel.dispositionParameters && uzel.dispositionParameters.filename) || (uzel.parameters && uzel.parameters.name) || '';
    const telo = /^text\/(plain|html)$/.test(typ) && dispozice !== 'attachment' && !nazev;
    if (telo) return;
    if (dispozice !== 'attachment') {
      if (!nazev && typ !== 'message/rfc822') return;          // bez jména a dispozice = část těla
      if (vRelated && /^image\//.test(typ)) return;            // obrázek vložený do HTML
      if (dispozice === 'inline' && uzel.id && /^image\//.test(typ)) return;
    }
    const kodovani = String(uzel.encoding || '').toLowerCase();
    const velikost = Math.round((uzel.size || 0) * (kodovani === 'base64' ? 0.73 : 1));
    vysledek.push({ nazev: String(nazev || (typ === 'message/rfc822' ? 'přeposlaná zpráva.eml' : 'příloha')).slice(0, 200), velikost });
  };
  projdi(stavba, false);
  return vysledek;
}

/**
 * Detail konverzace ve tvaru motoru (nactiVlakno_): zprávy od nejstarší, nejvýš MAX_ZPRAV_VE_VLAKNE posledních.
 * zpravy = [{ z (normalizovaná), rozebrana ({ text, html } z mailparseru), stavba (BODYSTRUCTURE) }].
 */
function detailKonverzace(k, zpravy, ja, celkem) {
  const serazene = zpravy.slice().sort((a, b) => a.z.kdy - b.z.kdy || a.z.uid - b.z.uid);
  const d = {
    id: k.id,
    predmet: (serazene[0] && serazene[0].z.predmet) || '(bez předmětu)',
    odkaz: null,
    vDorucenych: true,
    skryto: Math.max(0, (celkem || serazene.length) - serazene.length),
    ucet: 'pracovni',
    zdroj: 'wedos',
    zpravy: serazene.map(({ z, rozebrana, stavba }) => {
      const r = rozebrana || {};
      const zprava = {
        id: idZpravy(z),
        od: jmenoNeboAdresa(z.od),
        odAdresa: z.od.adresa,
        odeMe: !!ja && z.od.adresa === ja,
        komu: formatAdresy(z.komu),
        kopie: formatAdresy(z.kopie),
        kdy: z.kdy,
        predmet: z.predmet,
        text: zkrat(textZpravy(r), MAX_TEXTU),
        html: typeof r.html === 'string' && r.html ? zkratHtml(r.html, MAX_HTML) : '',
        prilohy: seznamPriloh(stavba)
      };
      // odpověď půjde jinam než na odesílatele (Reply-To) – aplikace to ukáže
      if (z.odpovedet.length && z.odpovedet.some((a) => a.adresa !== z.od.adresa)) zprava.odpovedNa = formatAdresy(z.odpovedet);
      return zprava;
    })
  };
  return vejdeSe(d, MAX_DETAIL);
}

/** Detail se musí vejít do dokumentu Firestore: nejdřív pryč HTML starších zpráv, pak se zkracují texty. */
function vejdeSe(d, max) {
  const velikost = () => Buffer.byteLength(JSON.stringify(d), 'utf8');
  if (velikost() <= max) return d;
  d.zkraceno = true;
  const zz = d.zpravy;
  for (let i = 0; i < zz.length - 1 && velikost() > max; i++) zz[i].html = '';
  for (let i = 0; i < zz.length - 1 && velikost() > max; i++) zz[i].text = zkrat(zz[i].text, 5000);
  const posl = zz[zz.length - 1];
  if (posl && velikost() > max) posl.html = zkratHtml(posl.html, 60000);
  if (posl && velikost() > max) posl.html = '';
  if (posl && velikost() > max) posl.text = zkrat(posl.text, 50000);
  while (zz.length > 1 && velikost() > max) { zz.shift(); d.skryto++; }
  return d;
}

// ---------------------------------------------------------------- chyby a pauza po špatném přihlášení

/**
 * Chyba spojení → { druh: 'heslo' | 'server' | 'nastaveni' | 'vstup' | 'jina', text } – česky, bez tajných údajů.
 * heslo (nepovinné) se z textu chyby pro jistotu vymaže.
 */
function chybaProUzivatele(e, n, heslo) {
  const kod = String((e && e.code) || '');
  const zprava = String((e && e.message) || e || '');
  const server = n ? n.imap : 'serveru';
  if (e && e.wedosDruh) return { druh: e.wedosDruh, text: zprava };
  if ((e && e.authenticationFailed) || kod === 'EAUTH' || /AUTHENTICATIONFAILED|authentication failed|invalid credentials/i.test(zprava)) {
    return { druh: 'heslo', text: 'Přihlášení ' + (n ? n.adresa : '') + ' k poště WEDOS se nepovedlo – zkontroluj adresu a heslo uložené na serveru (návod v Nastavení → Pošta).' };
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(kod)) return { druh: 'server', text: 'Server ' + server + ' se nenašel – zkontroluj jeho název v Nastavení → Pošta.' };
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|ETIMEOUT|CONNECT_TIMEOUT|ESOCKET|ECONNECTION|EPIPE|NoConnection|GreetingTimeout|EHOSTUNREACH/i.test(kod) ||
      (e && e.tlsFailed) || /timed? ?out|socket hang up|connection (closed|lost)/i.test(zprava)) {
    return { druh: 'server', text: 'Server pracovní pošty teď neodpovídá – zkusím to znovu při další synchronizaci.' };
  }
  let text = zprava.replace(/\s+/g, ' ').trim();
  if (heslo) text = text.split(heslo).join('•••');
  return { druh: 'jina', text: 'Chyba pracovní pošty: ' + text.slice(0, 160) };
}

const PAUZA_RUCNE = 2 * 60e3; // ruční „Zkusit znovu“ po špatném hesle nejdřív za 2 minuty

/** Pauza po n-tém neúspěšném přihlášení za sebou: 15 min, 30 min, 1 h, 2 h … nejvýš 8 h (server se nebombarduje). */
function pauzaPoChybe(n) { return Math.min(15 * 60e3 * Math.pow(2, Math.max(0, n - 1)), 8 * 3600e3); }

/**
 * Smí server teď zkusit přihlášení? Po špatném hesle čeká (pauzaPoChybe); znovu hned po změně nastavení nebo po novém
 * nasazení funkcí (nové heslo se k funkcím dostane jen nasazením – revize). Ruční pokus nejdřív za 2 minuty.
 */
function smiPrihlasit(stav, n, ted, volby) {
  const o = volby || {};
  const p = stav && stav.prihlaseni;
  if (!p || !p.neuspechu) return { smi: true };
  if (p.nastaveni !== otiskNastaveni(n) || (o.revize && p.revize && p.revize !== o.revize)) return { smi: true, znovu: true };
  if (o.rucne) {
    if (ted - (p.kdy || 0) >= PAUZA_RUCNE) return { smi: true };
    return { smi: false, text: 'Přihlášení se před chvílí nepovedlo – zkus to znovu za 2 minuty (nebo oprav heslo na serveru).' };
  }
  if (ted < (p.pauzaDo || 0)) return { smi: false, text: 'Čekám s dalším pokusem o přihlášení do ' + hodinyMinuty(p.pauzaDo) + ' (minule špatné heslo).' };
  return { smi: true };
}

/** Záznam o přihlášení po pokusu: úspěch = vynulovat, špatné heslo = počet a pauza; jiná chyba pauzu nemění. */
function prihlaseniPoPokusu(stav, n, ted, chyba, revize) {
  if (!chyba) return { neuspechu: 0 };
  const p = (stav && stav.prihlaseni) || {};
  if (chyba.druh !== 'heslo') return Object.assign({ neuspechu: 0 }, p.neuspechu ? p : {});
  const stejne = p.nastaveni === otiskNastaveni(n) && (!revize || !p.revize || p.revize === revize);
  const neuspechu = (stejne ? p.neuspechu || 0 : 0) + 1;
  return { neuspechu, kdy: ted, pauzaDo: ted + pauzaPoChybe(neuspechu), nastaveni: otiskNastaveni(n), revize: revize || '' };
}

function hodinyMinuty(ms) {
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: PASMO, hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}

// ---------------------------------------------------------------- odeslání

const JE_ID_ODESLANI = /^[A-Za-z0-9_-]{8,64}$/;

/** Kontrola požadavku na odeslání z aplikace (rezim, id, komu, předmět, text) → očištěný požadavek; chyba česky. */
function pozadavekOdeslani(d) {
  const rezim = String(d && d.rezim || '');
  if (['odpoved', 'vsem', 'preposlat', 'novy'].indexOf(rezim) < 0) throw chybaVstupu('Neznámý způsob odeslání.');
  const text = String(d.text || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  if (!text.trim()) throw chybaVstupu('Prázdná zpráva.');
  if (text.length > 50000) throw chybaVstupu('Zpráva je příliš dlouhá.');
  const v = { rezim, text };
  if (rezim !== 'novy') {
    if (!JE_ID.test(String(d.id || ''))) throw chybaVstupu('Neplatné id zprávy.');
    v.id = d.id;
  }
  if (rezim === 'preposlat' || rezim === 'novy') v.komu = adresyZeVstupu(d.komu);
  if (rezim === 'novy') v.predmet = String(d.predmet || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 500) || '(bez předmětu)';
  if (d.idOdeslani != null && d.idOdeslani !== '') {
    if (!JE_ID_ODESLANI.test(String(d.idOdeslani))) throw chybaVstupu('Neplatné id odeslání.');
    v.idOdeslani = String(d.idOdeslani);
  }
  return v;
}

/** Komu jde odpověď: odpoved = Reply-To / odesílatel; vsem a odpověď na vlastní zprávu = i ostatní (bez mě). */
function adresatiOdpovedi(z, rezim, ja) {
  const bezMe = (seznam) => seznam.filter((a) => a.adresa && a.adresa !== ja);
  const odesilatel = z.odpovedet.length ? z.odpovedet : [z.od];
  const odeMe = z.od.adresa === ja;
  let komu, kopie = [];
  if (odeMe) { komu = bezMe(z.komu); kopie = bezMe(z.kopie); }
  else if (rezim === 'vsem') { komu = bezMe(odesilatel.concat(z.komu)); kopie = bezMe(z.kopie); }
  else komu = bezMe(odesilatel);
  const videno = new Set();
  const jednou = (a) => (videno.has(a.adresa) ? false : (videno.add(a.adresa), true));
  komu = komu.filter(jednou);
  kopie = kopie.filter(jednou);
  if (!komu.length && kopie.length) komu = kopie.splice(0, kopie.length);
  if (!komu.length) throw chybaVstupu('Odpověď nemá komu jít (zpráva je jen pro tebe).');
  return { komu, kopie };
}

/** References pro odpověď: References původní zprávy + její Message-ID (nejvýš kořen a posledních 10). */
function odkazyOdpovedi(z) {
  const r = z.odkazy.concat(z.mid ? [z.mid] : []).filter((x, i, a) => a.indexOf(x) === i);
  return r.length > 11 ? [r[0]].concat(r.slice(-10)) : r;
}

/** Citace původní zprávy pod odpověď („Dne … napsal(a):“ a řádky s „> “), nejvýš ~20 000 znaků. */
function citace(z, text) {
  const kdy = new Intl.DateTimeFormat('cs-CZ', { timeZone: PASMO, day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    .format(new Date(z.kdy || Date.now()));
  const radky = zkrat(String(text || '').replace(/\r\n?/g, '\n').trim(), 20000).split('\n').map((r) => '> ' + r);
  return 'Dne ' + kdy + ' ' + formatAdresa(z.od) + ' napsal(a):\n' + radky.join('\n');
}

/** Hlavička přeposlané zprávy (text) – jako motor hlavickaPreposlani_. */
function hlavickaPreposlani(z) {
  const kdy = new Intl.DateTimeFormat('cs-CZ', { timeZone: PASMO, day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    .format(new Date(z.kdy || Date.now()));
  return '---------- Přeposlaná zpráva ----------\nOd: ' + formatAdresa(z.od) + '\nDatum: ' + kdy + '\nPředmět: ' + z.predmet +
    '\nKomu: ' + formatAdresy(z.komu) + (z.kopie.length ? '\nKopie: ' + formatAdresy(z.kopie) : '');
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
}
function textNaHtml(text) { return '<div>' + escHtml(text).replace(/\n/g, '<br>') + '</div>'; }

/** Message-ID nové zprávy v doméně pracovní adresy (ne podle počítače serveru). */
function noveMessageId(adresa, nahodne) {
  const domena = String(adresa || '').split('@')[1] || 'asistent.invalid';
  return '<' + (nahodne || crypto.randomBytes(12).toString('hex')) + '.asistent@' + domena + '>';
}

module.exports = {
  VYCHOZI_SERVERY, PORT_IMAP, PORT_SMTP, DNI, MAX_ZPRAV, MAX_KONVERZACI, MAX_DETAILU, MAX_ZPRAV_VE_VLAKNE, MAX_DETAIL, HLAVICKY, JE_ID,
  platneNastaveni, otiskNastaveni, otisk, hash,
  adresaObj, formatAdresa, formatAdresy, rozdelAdresy, adresaZ, jmeno, adresyZeVstupu, rozeberHlavicky, cisteId, idZeSeznamu, normalizuj,
  sestavKonverzace, korenKonverzace, idZ, idZpravy, idyKonverzaci, klicTextu, otiskDetailu, mapaKonverzace, bezPredpony,
  cistyText, vlastniText, prvniRadek, htmlNaText, textZpravy, textyZpravy, nahled, zkrat, zkratHtml,
  terminZTextu, stavADuvod, oznameniZpravy, souhrnKonverzace, otiskAdresy, jeZnamy,
  seznamPriloh, detailKonverzace, vejdeSe,
  chybaProUzivatele, chybaVstupu, pauzaPoChybe, smiPrihlasit, prihlaseniPoPokusu, PAUZA_RUCNE,
  pozadavekOdeslani, adresatiOdpovedi, odkazyOdpovedi, citace, hlavickaPreposlani, textNaHtml, escHtml, noveMessageId
};
