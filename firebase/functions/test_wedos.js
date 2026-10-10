// Test pracovní pošty WEDOS bez sítě: čisté funkce (wedos.js) a práce se schránkou (wedos_schranka.js) s napodobeným
// IMAP serverem (rozhraní jako imapflow) a SMTP. Vše vymyšlené (firma.test, klient.test). Spouští ho test.js.
// Když jsou nainstalované knihovny (npm install – při nasazení), přidají se testy se skutečným mailparserem
// a skladačem zpráv nodemaileru; když leží vedle motor (repo), porovnají se stavy s apps-script/Kod.gs.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const W = require('./wedos');
const S = require('./wedos_schranka');

const JA = 'michal@firma.test';
const N = W.platneNastaveni({ adresa: JA, imap: 'wes1-imap.wedos.net', smtp: 'wes1-smtp.wedos.net', jmeno: 'Michal K.' });
const TED = Date.parse('2026-10-09T10:00:00+02:00');
const HOD = 36e5, DEN = 864e5;

function volitelne(nazev) { try { return require(nazev); } catch (e) { return null; } }
const mailparser = volitelne('mailparser');
const SkladacNodemailer = volitelne('nodemailer/lib/mail-composer');

// ---------------------------------------------------------------- vymyšlené e-maily a jednoduchý MIME

/** Surový e-mail z polí (hlavičky + text, volitelně HTML a přílohy). */
function email(o) {
  const h = [];
  h.push('From: ' + o.od);
  if (o.komu) h.push('To: ' + o.komu);
  if (o.kopie) h.push('Cc: ' + o.kopie);
  if (o.odpovedNa) h.push('Reply-To: ' + o.odpovedNa);
  h.push('Subject: ' + (o.predmet || ''));
  h.push('Date: ' + new Date(o.kdy).toUTCString());
  if (o.mid !== null) h.push('Message-ID: ' + (o.mid || '<' + Math.random().toString(36).slice(2) + '@test>'));
  if (o.irt) h.push('In-Reply-To: ' + o.irt);
  if (o.refs) h.push('References: ' + o.refs);
  (o.hlavicky || []).forEach((x) => h.push(x));
  h.push('MIME-Version: 1.0');
  if (!o.html && !o.prilohy) {
    h.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit');
    return h.join('\r\n') + '\r\n\r\n' + (o.text || '').replace(/\n/g, '\r\n') + '\r\n';
  }
  const hranice = 'hranice' + Math.random().toString(36).slice(2, 8);
  const casti = [];
  const prosty = 'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n' + String(o.text || '').replace(/\n/g, '\r\n');
  const html = 'Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n' + o.html;
  if (o.text != null && o.html) {
    // jako skutečné e-maily: text a HTML jako alternativy, přílohy vedle
    const h2 = 'alt' + hranice;
    casti.push('Content-Type: multipart/alternative; boundary="' + h2 + '"\r\n\r\n--' + h2 + '\r\n' + prosty + '\r\n--' + h2 + '\r\n' + html + '\r\n--' + h2 + '--');
  } else if (o.text != null) casti.push(prosty);
  else if (o.html) casti.push(html);
  (o.prilohy || []).forEach((p) => casti.push('Content-Type: ' + (p.typ || 'application/pdf') + '; name="' + p.nazev + '"\r\nContent-Disposition: attachment; filename="' +
    p.nazev + '"\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from(p.obsah).toString('base64')));
  h.push('Content-Type: multipart/mixed; boundary="' + hranice + '"');
  return h.join('\r\n') + '\r\n\r\n' + casti.map((c) => '--' + hranice + '\r\n' + c + '\r\n').join('') + '--' + hranice + '--\r\n';
}

function hlavickyZ(surova) {
  const konec = surova.search(/\r?\n\r?\n/);
  const hl = (konec >= 0 ? surova.slice(0, konec) : surova).replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
  const v = [];
  hl.forEach((r) => { const i = r.indexOf(':'); if (i > 0) v.push([r.slice(0, i).trim(), r.slice(i + 1).trim()]); });
  return { seznam: v, telo: konec >= 0 ? surova.slice(konec).replace(/^\r?\n\r?\n/, '') : '' };
}
const hlavicka = (seznam, k) => { const x = seznam.find((p) => p[0].toLowerCase() === k); return x ? x[1] : undefined; };
function adresyZ(s) {
  if (!s) return undefined;
  return s.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^(.*)<([^>]+)>$/.exec(x);
    return m ? { name: m[1].trim().replace(/^"|"$/g, ''), address: m[2].trim() } : { name: '', address: x };
  });
}

/** Napodobený mailparser: text, HTML a přílohy z jednoduchého MIME (UTF-8, base64 / 8bit / quoted-printable). */
function rozeberJednoduse(zdroj) {
  const surova = Buffer.isBuffer(zdroj) ? zdroj.toString('utf8') : String(zdroj);
  const vysledek = { text: '', html: false, attachments: [] };
  const cast = (s) => {
    const { seznam, telo } = hlavickyZ(s);
    const typ = String(hlavicka(seznam, 'content-type') || 'text/plain');
    const kod = String(hlavicka(seznam, 'content-transfer-encoding') || '').toLowerCase();
    const hr = /boundary="?([^";]+)"?/i.exec(typ);
    if (/^multipart\//i.test(typ) && hr) {
      telo.split('--' + hr[1]).slice(1).forEach((x) => { if (!/^--/.test(x)) cast(x.replace(/^\r?\n/, '')); });
      return;
    }
    let obsah = kod === 'base64' ? Buffer.from(telo.replace(/\s+/g, ''), 'base64') : Buffer.from(kod === 'quoted-printable'
      ? telo.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (z, x) => String.fromCharCode(parseInt(x, 16))) : telo, kod === 'quoted-printable' ? 'latin1' : 'utf8');
    const dispozice = String(hlavicka(seznam, 'content-disposition') || '');
    const jmeno = (/filename="?([^";]+)"?/i.exec(dispozice) || /name="?([^";]+)"?/i.exec(typ) || [])[1];
    if (/attachment/i.test(dispozice) || jmeno) vysledek.attachments.push({ filename: jmeno, contentType: typ.split(';')[0], content: obsah, related: false });
    else if (/^text\/html/i.test(typ)) vysledek.html = obsah.toString('utf8').replace(/\r\n/g, '\n').trim();
    else vysledek.text += obsah.toString('utf8').replace(/\r\n/g, '\n');
  };
  cast(surova);
  vysledek.text = vysledek.text.replace(/\n+$/, '\n');
  return Promise.resolve(vysledek);
}

function stavbaZ(surova) {
  const { seznam, telo } = hlavickyZ(surova);
  const typ = String(hlavicka(seznam, 'content-type') || 'text/plain; charset=utf-8');
  const hr = /boundary="?([^";]+)"?/i.exec(typ);
  if (/^multipart\//i.test(typ) && hr) {
    return { type: typ.split(';')[0].toLowerCase(), childNodes: telo.split('--' + hr[1]).slice(1).filter((x) => !/^--/.test(x)).map((x) => stavbaZ(x.replace(/^\r?\n/, ''))) };
  }
  const dispozice = String(hlavicka(seznam, 'content-disposition') || '');
  const uzel = { type: typ.split(';')[0].toLowerCase(), encoding: String(hlavicka(seznam, 'content-transfer-encoding') || '7bit').toLowerCase(), size: Buffer.byteLength(telo) };
  if (dispozice) {
    uzel.disposition = dispozice.split(';')[0].toLowerCase();
    const f = /filename="?([^";]+)"?/i.exec(dispozice);
    if (f) uzel.dispositionParameters = { filename: f[1] };
  }
  const nazev = /name="?([^";]+)"?/i.exec(typ);
  if (nazev) uzel.parameters = { name: nazev[1] };
  return uzel;
}

// ---------------------------------------------------------------- napodobený IMAP server (rozhraní jako imapflow)

class NapodobenyImap {
  constructor(slozky) {
    this.slozky = {};
    this.modseq = 1;
    this.log = [];
    this.zdroju = 0; // kolik zpráv se četlo i s textem (source)
    Object.keys(slozky).forEach((p) => this.pridejSlozku(p, slozky[p].specialUse, slozky[p].zpravy || []));
    this.mailbox = false;
  }
  pridejSlozku(cesta, specialUse, zpravy) {
    const s = { cesta, specialUse, uidValidity: BigInt(100 + Object.keys(this.slozky).length), uidNext: 1, zpravy: [] };
    this.slozky[cesta] = s;
    zpravy.forEach((z) => this.vloz(s, z.surova, z.flags || [], z.kdy));
    return s;
  }
  vloz(s, surova, flags, kdy) {
    const uid = s.uidNext++;
    s.zpravy.push({ uid, surova: String(surova), flags: new Set(flags), internalDate: new Date(kdy || TED), modseq: ++this.modseq });
    return uid;
  }
  async connect() { if (this.spatneHeslo) throw Object.assign(new Error('Authentication failed.'), { authenticationFailed: true, serverResponseCode: 'AUTHENTICATIONFAILED' }); this.log.push('LOGIN'); }
  async logout() { this.log.push('LOGOUT'); }
  close() {}
  async list() {
    return Object.keys(this.slozky).map((p) => ({ path: p, name: p.split('/').pop(), delimiter: '/', flags: new Set(), specialUse: this.slozky[p].specialUse, listed: true, subscribed: true }));
  }
  async status(cesta) {
    const s = this.slozky[cesta];
    if (!s) throw Object.assign(new Error('Mailbox doesn\'t exist: ' + cesta), { code: 'NotFound' });
    this.log.push('STATUS ' + cesta);
    return { path: cesta, messages: s.zpravy.length, uidNext: s.uidNext, uidValidity: s.uidValidity, unseen: s.zpravy.filter((z) => !z.flags.has('\\Seen')).length,
      highestModseq: BigInt(Math.max(0, ...s.zpravy.map((z) => z.modseq), s.modseqSlozky || 0)) };
  }
  async getMailboxLock(cesta, volby) {
    const s = this.slozky[cesta];
    if (!s) throw Object.assign(new Error('Mailbox doesn\'t exist'), { mailboxMissing: true });
    this.mailbox = { path: cesta, uidValidity: s.uidValidity, readOnly: !!(volby && volby.readOnly) };
    this.log.push((this.mailbox.readOnly ? 'EXAMINE ' : 'SELECT ') + cesta);
    return { path: cesta, release: () => { this.log.push('RELEASE ' + cesta); } };
  }
  aktualni() { if (!this.mailbox) throw new Error('není vybraná složka'); return this.slozky[this.mailbox.path]; }
  zapis() { if (this.mailbox.readOnly) throw new Error('složka je otevřená jen pro čtení (EXAMINE)'); }
  uidyZ(rozsah) {
    const vse = new Set();
    String(rozsah).split(',').forEach((c) => {
      const m = /^(\d+)(?::(\d+))?$/.exec(c.trim());
      if (!m) throw new Error('špatný rozsah ' + rozsah);
      for (let u = Number(m[1]); u <= Number(m[2] || m[1]); u++) vse.add(u);
    });
    return vse;
  }
  async search(dotaz, volby) {
    assert.ok(volby && volby.uid, 'hledat podle UID');
    const s = this.aktualni();
    let z = s.zpravy;
    if (dotaz.since) { const od = new Date(dotaz.since); od.setUTCHours(0, 0, 0, 0); z = z.filter((x) => x.internalDate >= od); }
    return z.map((x) => x.uid);
  }
  async *fetch(rozsah, dotaz, volby) {
    assert.ok(volby && volby.uid, 'FETCH podle UID');
    const s = this.aktualni();
    const uidy = this.uidyZ(rozsah);
    this.log.push('FETCH ' + s.cesta + ' ' + rozsah + (dotaz.source ? ' +zdroj' : ''));
    for (const x of s.zpravy.filter((m) => uidy.has(m.uid))) {
      const { seznam } = hlavickyZ(x.surova);
      const r = { seq: s.zpravy.indexOf(x) + 1, uid: x.uid };
      if (dotaz.flags) r.flags = new Set(x.flags);
      if (dotaz.internalDate) r.internalDate = x.internalDate;
      if (dotaz.size) r.size = Buffer.byteLength(x.surova);
      if (dotaz.envelope) {
        const od = adresyZ(hlavicka(seznam, 'from'));
        r.envelope = { date: new Date(hlavicka(seznam, 'date')), subject: hlavicka(seznam, 'subject'), messageId: hlavicka(seznam, 'message-id'),
          inReplyTo: hlavicka(seznam, 'in-reply-to'), from: od, sender: od, replyTo: adresyZ(hlavicka(seznam, 'reply-to')) || od,
          to: adresyZ(hlavicka(seznam, 'to')), cc: adresyZ(hlavicka(seznam, 'cc')), bcc: adresyZ(hlavicka(seznam, 'bcc')) };
      }
      if (dotaz.headers) {
        const chci = dotaz.headers.map((k) => k.toLowerCase());
        r.headers = Buffer.from(seznam.filter((p) => chci.indexOf(p[0].toLowerCase()) >= 0).map((p) => p[0] + ': ' + p[1]).join('\r\n') + '\r\n\r\n');
      }
      if (dotaz.bodyStructure) r.bodyStructure = stavbaZ(x.surova);
      if (dotaz.source) {
        this.zdroju++;
        const b = Buffer.from(x.surova);
        r.source = dotaz.source.maxLength ? b.subarray(0, dotaz.source.maxLength) : b;
      }
      yield r;
    }
  }
  async messageFlagsAdd(rozsah, flags, volby) { return this.priznaky(rozsah, flags, volby, true); }
  async messageFlagsRemove(rozsah, flags, volby) { return this.priznaky(rozsah, flags, volby, false); }
  priznaky(rozsah, flags, volby, pridat) {
    assert.ok(volby && volby.uid, 'STORE podle UID');
    this.zapis();
    const s = this.aktualni();
    const uidy = this.uidyZ(rozsah);
    s.zpravy.filter((m) => uidy.has(m.uid)).forEach((m) => { flags.forEach((f) => (pridat ? m.flags.add(f) : m.flags.delete(f))); m.modseq = ++this.modseq; });
    this.log.push('STORE ' + s.cesta + ' ' + rozsah + (pridat ? ' +' : ' -') + flags.join(' '));
    return true;
  }
  async messageMove(rozsah, cil, volby) {
    assert.ok(volby && volby.uid, 'MOVE podle UID');
    this.zapis();
    const s = this.aktualni();
    const d = this.slozky[cil];
    if (!d) throw new Error('cílová složka neexistuje: ' + cil);
    const uidy = this.uidyZ(rozsah);
    const uidMap = new Map();
    s.zpravy.filter((m) => uidy.has(m.uid)).forEach((m) => {
      uidMap.set(m.uid, this.vloz(d, m.surova, Array.from(m.flags), m.internalDate.getTime()));
    });
    s.zpravy = s.zpravy.filter((m) => !uidy.has(m.uid));
    s.modseqSlozky = ++this.modseq;
    this.log.push('MOVE ' + s.cesta + ' ' + rozsah + ' → ' + cil);
    return { path: s.cesta, destination: cil, uidValidity: d.uidValidity, uidMap };
  }
  async mailboxCreate(cesta) {
    if (!this.slozky[cesta]) this.pridejSlozku(cesta, undefined, []);
    this.log.push('CREATE ' + cesta);
    return { path: cesta, created: true };
  }
  async append(cesta, obsah, flags, idate) {
    const s = this.slozky[cesta];
    if (!s) throw new Error('složka neexistuje: ' + cesta);
    const uid = this.vloz(s, Buffer.isBuffer(obsah) ? obsah.toString('utf8') : obsah, flags || [], idate ? new Date(idate).getTime() : TED);
    this.log.push('APPEND ' + cesta);
    return { destination: cesta, uid, uidValidity: s.uidValidity };
  }
  zpravy(cesta) { return this.slozky[cesta].zpravy; }
}

/** Jednoduchý skladač zprávy (náhrada nodemailer MailComposer, když knihovny nejsou nainstalované). */
class SkladacTest {
  constructor(m) { this.m = m; }
  compile() {
    const m = this.m;
    const ad = (x) => [].concat(x || []).map((a) => (typeof a === 'string' ? a : (a.name ? a.name + ' <' + a.address + '>' : a.address)));
    const holy = (x) => [].concat(x || []).map((a) => (typeof a === 'string' ? a : a.address));
    return {
      getEnvelope: () => ({ from: holy(m.from)[0], to: holy(m.to).concat(holy(m.cc), holy(m.bcc)) }),
      build: (cb) => cb(null, Buffer.from(['From: ' + ad(m.from)[0], 'To: ' + ad(m.to).join(', '), m.cc ? 'Cc: ' + ad(m.cc).join(', ') : '', 'Subject: ' + m.subject,
        'Message-ID: ' + m.messageId, m.inReplyTo ? 'In-Reply-To: ' + m.inReplyTo : '', m.references ? 'References: ' + [].concat(m.references).join(' ') : '',
        'Date: ' + m.date.toUTCString(), 'Content-Type: text/plain; charset=utf-8'].filter(Boolean).join('\r\n') + '\r\n\r\n' + m.text))
    };
  }
}

function prenos(zaznam, chyba) {
  return { sendMail: async (z) => { if (chyba) throw chyba; zaznam.push({ obalka: z.envelope, surova: String(z.raw) }); return { messageId: 'x' }; } };
}

// ---------------------------------------------------------------- schránka pro testy

const KLIENT = 'Petr Klient <petr@klient.test>';
function schranka() {
  const d = [], o = [];
  // 1) klient prosí o nabídku (nepřečtené) – čeká na tebe
  d.push({ surova: email({ od: KLIENT, komu: JA, predmet: 'Nabídka na pasport', kdy: TED - 30 * HOD, mid: '<a1@klient.test>',
    text: 'Dobrý den,\npošlete nám prosím nabídku na pasport budovy B.\n\nDěkuji\nPetr' }), kdy: TED - 30 * HOD });
  // 2) konverzace: kolega se ptá, já odpověděl (Odeslané), kolega děkuje „díky“ → řeší se? poslední je jeho otázka
  d.push({ surova: email({ od: 'Jana Kolegová <jana@firma.test>', komu: JA, predmet: 'Výkresy 2NP', kdy: TED - 50 * HOD, mid: '<b1@firma.test>',
    text: 'Ahoj, máš už výkresy 2NP?' }), kdy: TED - 50 * HOD, flags: ['\\Seen'] });
  o.push({ surova: email({ od: 'Michal K. <' + JA + '>', komu: 'Jana Kolegová <jana@firma.test>', predmet: 'Re: Výkresy 2NP', kdy: TED - 49 * HOD,
    mid: '<b2@firma.test>', irt: '<b1@firma.test>', refs: '<b1@firma.test>', text: 'Ahoj, pošlu je zítra.\n\n> Ahoj, máš už výkresy 2NP?' }), kdy: TED - 49 * HOD, flags: ['\\Seen'] });
  // 3) moje odpověď je poslední → čekáš na ně (klient z domény, kam jsem psal)
  d.push({ surova: email({ od: 'Eva Nová <eva@klient.test>', komu: JA, predmet: 'Termín schůzky', kdy: TED - 80 * HOD, mid: '<c1@klient.test>',
    text: 'Kdy se můžeme sejít?' }), kdy: TED - 80 * HOD, flags: ['\\Seen'] });
  o.push({ surova: email({ od: JA, komu: 'Eva Nová <eva@klient.test>', predmet: 'Re: Termín schůzky', kdy: TED - 70 * HOD, mid: '<c2@firma.test>',
    irt: '<c1@klient.test>', refs: '<c1@klient.test>', text: 'Navrhuji čtvrtek v 10:00, vyhovuje vám to?' }), kdy: TED - 70 * HOD, flags: ['\\Seen'] });
  // 4) newsletter → informace (rozesílka), záložka Aktualizace
  d.push({ surova: email({ od: 'Novinky <info@obchod.test>', komu: JA, predmet: 'Akce týdne', kdy: TED - 5 * HOD, mid: '<n1@obchod.test>',
    hlavicky: ['List-Unsubscribe: <mailto:odhlasit@obchod.test>'], text: 'Prosím, podívejte se na naše slevy!' }), kdy: TED - 5 * HOD });
  // 5) odpověď bez hlaviček (jen „Re:“) k zprávě 1 → stejná konverzace
  d.push({ surova: email({ od: KLIENT, komu: JA, predmet: 'RE: Nabídka na pasport', kdy: TED - 2 * HOD, mid: '<a2@klient.test>',
    text: 'Doplňuji: potřebujeme to do pátku.' }), kdy: TED - 2 * HOD });
  // 6) neznámý odesílatel bez prosby → informace
  d.push({ surova: email({ od: 'Cizí <nekdo@neznamy.test>', komu: JA, predmet: 'Představení firmy', kdy: TED - 3 * HOD, mid: '<x1@neznamy.test>',
    text: 'Dobrý den, jsme firma, která dělá weby.' }), kdy: TED - 3 * HOD });
  // 7) stará zpráva (40 dní) – mimo okno 30 dní
  d.push({ surova: email({ od: KLIENT, komu: JA, predmet: 'Stará věc', kdy: TED - 40 * DEN, mid: '<s1@klient.test>', text: 'Starý e-mail.' }), kdy: TED - 40 * DEN });
  // 8) jen v Odeslaných (nikdo neodpověděl) – do seznamu nepatří (jako „in:inbox“ v Gmailu)
  o.push({ surova: email({ od: JA, komu: 'Petr Klient <petr@klient.test>', predmet: 'Faktura 10/2026', kdy: TED - 20 * HOD, mid: '<f1@firma.test>',
    text: 'Dobrý den, posílám fakturu.' }), kdy: TED - 20 * HOD, flags: ['\\Seen'] });
  // 9) s přílohou a HTML
  d.push({ surova: email({ od: 'Jana Kolegová <jana@firma.test>', komu: JA, kopie: 'Petr Klient <petr@klient.test>', predmet: 'Podklady', kdy: TED - 1 * HOD,
    mid: '<p1@firma.test>', text: 'Posílám podklady.', html: '<p>Posílám <b>podklady</b>.</p>', prilohy: [{ nazev: 'plan.pdf', obsah: 'PDF-obsah'.repeat(40) }] }), kdy: TED - 1 * HOD });
  return new NapodobenyImap({
    INBOX: { specialUse: '\\Inbox', zpravy: d },
    Sent: { specialUse: '\\Sent', zpravy: o },
    Trash: { specialUse: '\\Trash', zpravy: [] }
  });
}

const rozeber = mailparser ? (z) => mailparser.simpleParser(z, { keepCidLinks: true, skipTextToHtml: true, skipImageLinks: true, skipTextLinks: true }) : rozeberJednoduse;
const Skladac = SkladacNodemailer || SkladacTest;
const najdi = (v, predmet) => v.data.pracovni.find((m) => m.predmet === predmet);

// ---------------------------------------------------------------- testy

module.exports = async function testyWedos(test) {
  console.log('\nWEDOS – pracovní pošta přímo (IMAP/SMTP)' + (mailparser ? '' : ' – bez npm install: napodobený rozbor e-mailů'));

  await test('nastavení: jen servery *.wedos.net (heslo nesmí jít jinam), adresa = přihlašovací jméno', () => {
    assert.deepStrictEqual(W.platneNastaveni({ adresa: ' Michal@Firma.TEST ' }), { adresa: JA, imap: 'wes1-imap.wedos.net', smtp: 'wes1-smtp.wedos.net', jmeno: '' });
    assert.strictEqual(W.platneNastaveni({ adresa: JA, imap: 'imap.zly.test' }), null);
    assert.strictEqual(W.platneNastaveni({ adresa: JA, imap: 'wes1-imap.wedos.net.zly.test' }), null);
    assert.strictEqual(W.platneNastaveni({ adresa: JA, smtp: 'wedos.net' }), null);
    assert.strictEqual(W.platneNastaveni({ adresa: 'neni-adresa' }), null);
    assert.strictEqual(W.platneNastaveni(null), null);
    assert.strictEqual(W.platneNastaveni({ adresa: JA, jmeno: 'Jan "X" <a@b>\r\nBcc: c@d' }).jmeno, 'Jan X a@b Bcc: c@d');
  });

  await test('hlavičky a adresy: References přes víc řádků, Message-ID, jména v uvozovkách', () => {
    const h = W.rozeberHlavicky(Buffer.from('References: <a@x>\r\n <b@x>\r\n\t<c@x>\r\nList-Id: Seznam <l.x>\r\n\r\n'));
    assert.deepStrictEqual(W.idZeSeznamu(h.references), ['<a@x>', '<b@x>', '<c@x>']);
    assert.strictEqual(h['list-id'], 'Seznam <l.x>');
    assert.strictEqual(W.cisteId(' <abc@d> '), '<abc@d>');
    assert.strictEqual(W.cisteId('abc@d'), '<abc@d>');
    assert.strictEqual(W.cisteId('nic'), '');
    assert.strictEqual(W.formatAdresa({ jmeno: 'Novák, Jan', adresa: 'jan@x.cz' }), '"Novák, Jan" <jan@x.cz>');
    assert.deepStrictEqual(W.adresyZeVstupu('"Novák, Jan" <jan@x.cz>; Eva <eva@y.cz>, z@z.cz').map((a) => a.adresa), ['jan@x.cz', 'eva@y.cz', 'z@z.cz']);
    assert.throws(() => W.adresyZeVstupu('jan@'), /Neplatná adresa/);
    assert.throws(() => W.adresyZeVstupu(''), /Chybí adresát/);
  });

  await test('synchronizace: konverzace jako v motoru (stav, důvod, náhled, nepřečtené), jen s Doručenou, okno 30 dní', async () => {
    const k = schranka();
    const v = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: null, ted: TED });
    const p = v.data.pracovni;
    assert.deepStrictEqual(p.map((m) => m.predmet), ['Podklady', 'Nabídka na pasport', 'Představení firmy', 'Akce týdne', 'Výkresy 2NP', 'Termín schůzky']);
    // stejná pole jako souhrn z motoru (seznamVlaken_) – aplikace je ukáže beze změny
    ['id', 'ucet', 'stav', 'duvod', 'od', 'odAdresa', 'predmet', 'ukazka', 'kdy', 'neprectena', 'hvezdicka', 'stitky', 'pocet', 'odkaz', 'termin', 'terminVeta',
      'poTerminu', 'cekasOd'].forEach((pole) => assert.ok(pole in p[0], 'chybí pole ' + pole));
    assert.ok(p.every((m) => m.ucet === 'pracovni' && m.zdroj === 'wedos' && W.JE_ID.test(m.id)));
    const nabidka = najdi(v, 'Nabídka na pasport');
    assert.strictEqual(nabidka.pocet, 2, 'odpověď bez hlaviček („RE:“) patří ke konverzaci');
    assert.strictEqual(nabidka.stav, 'hori', 'termín „do pátku“ do 48 h: ' + nabidka.duvod);
    assert.ok(nabidka.neprectena && nabidka.od === 'Petr Klient' && nabidka.odAdresa === 'petr@klient.test');
    assert.strictEqual(nabidka.ukazka, 'Doplňuji: potřebujeme to do pátku.');
    const sch = najdi(v, 'Termín schůzky');
    assert.strictEqual(sch.stav, 'cekas', sch.duvod);
    assert.strictEqual(sch.od, 'Čekáš na: Eva Nová');
    assert.strictEqual(sch.ukazka, 'Navrhuji čtvrtek v 10:00, vyhovuje vám to?');
    assert.strictEqual(sch.cekasOd, TED - 70 * HOD);
    const vyk = najdi(v, 'Výkresy 2NP');
    assert.strictEqual(vyk.stav, 'cekas', 'moje odpověď je poslední: ' + vyk.duvod);
    assert.strictEqual(vyk.pocet, 2);
    const akce = najdi(v, 'Akce týdne');
    assert.strictEqual(akce.stav, 'info');
    assert.ok(akce.aktualizace && /rozesílka/.test(akce.duvod), 'rozesílka jako Aktualizace v Gmailu');
    assert.strictEqual(najdi(v, 'Představení firmy').stav, 'info', 'neznámý odesílatel bez prosby');
    assert.strictEqual(najdi(v, 'Představení firmy').duvod, 'neznámý odesílatel');
    assert.ok(!najdi(v, 'Faktura 10/2026'), 'jen Odeslané (bez Doručené) do seznamu nepatří');
    assert.ok(!najdi(v, 'Stará věc'), 'starší než 30 dní');
    assert.strictEqual(najdi(v, 'Podklady').stav, 'ceka', 'kolega (pracovní doména) = známý: ' + najdi(v, 'Podklady').duvod);
    assert.deepStrictEqual(v.data.pocty, { neprectene: 4, konverzaci: 6, celkem: 6 });
    assert.strictEqual(v.data.pracovniAdresa, JA);
    assert.deepStrictEqual(v.data.slozky, { dorucene: 'INBOX', odeslane: 'Sent', archiv: '', kos: 'Trash' });
    // jen čtení: všechno přes EXAMINE, nic se neoznačilo jako přečtené
    assert.ok(!k.log.some((x) => /^SELECT|^STORE|^MOVE/.test(x)), k.log.join(' | '));
    assert.strictEqual(k.zpravy('INBOX').filter((z) => !z.flags.has('\\Seen')).length, 6, 'nic se nemá označit jako přečtené');
    // stav serveru: mapa konverzací pro akce, texty posledních zpráv, známí jen jako otisky
    assert.strictEqual(Object.keys(v.stav.konverzace).length, 6);
    assert.ok(v.stav.konverzace[nabidka.id].every((x) => S.rozeberPolozku(x)));
    assert.ok(!JSON.stringify(v.stav.znami).includes('@'), 'známí bez adres');
    assert.ok(Buffer.byteLength(JSON.stringify(v.stav)) < 200000 && Buffer.byteLength(JSON.stringify(v.data)) < 100000);
    // detaily nejnovějších konverzací předem
    assert.strictEqual(Object.keys(v.detaily).length, 6);
    const det = v.detaily[najdi(v, 'Podklady').id];
    assert.deepStrictEqual(det.zpravy[0].prilohy.map((x) => x.nazev), ['plan.pdf']);
    assert.ok(/podklady/.test(det.zpravy[0].html) && det.zpravy[0].text.trim() === 'Posílám podklady.');
    assert.strictEqual(det.zpravy[0].kopie, 'Petr Klient <petr@klient.test>');
  });

  await test('synchronizace: beze změny ve složkách jen STATUS; nová zpráva = text jen nové, stejné id konverzace', async () => {
    const k = schranka();
    const prvni = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: null, ted: TED });
    k.log.length = 0;
    const druhy = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: prvni.stav, ted: TED + 10 * 60e3 });
    assert.ok(druhy.bezeZmeny && !druhy.data, 'beze změny');
    assert.ok(!k.log.some((x) => /^FETCH|^EXAMINE/.test(x)), 'jen STATUS: ' + k.log.join(' | '));
    // po hodině se seznam složí znovu (termíny „dnes / zítra“), texty z paměti serveru
    k.zdroju = 0;
    const hodina = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: prvni.stav, ted: TED + 61 * 60e3 });
    assert.ok(hodina.data && k.zdroju === 0, 'texty se nečtou znovu: ' + k.zdroju);
    // nová odpověď klienta → jen její text; konverzace má pořád stejné id
    const id = najdi(prvni, 'Nabídka na pasport').id;
    k.vloz(k.slozky.INBOX, email({ od: KLIENT, komu: JA, predmet: 'Re: Nabídka na pasport', kdy: TED + 2 * HOD, mid: '<a3@klient.test>', irt: '<a2@klient.test>',
      refs: '<a1@klient.test> <a2@klient.test>', text: 'Ještě jedna otázka: platí to i pro budovu C?' }), [], TED + 2 * HOD);
    k.zdroju = 0;
    const treti = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: hodina.stav, ted: TED + 3 * HOD });
    const nab = najdi(treti, 'Nabídka na pasport');
    assert.strictEqual(nab.id, id);
    assert.strictEqual(nab.pocet, 3);
    assert.strictEqual(nab.stav, 'otazka', nab.duvod);
    assert.strictEqual(k.zdroju, 4, 'text nové zprávy + detail jen té konverzace (3 zprávy) – ne všechno: ' + k.zdroju);
    assert.ok(treti.detaily[id] && treti.detaily[id].zpravy.length === 3, 'detail změněné konverzace znovu');
    assert.strictEqual(Object.keys(treti.detaily).length, 1);
  });

  await test('akce: přečteno / nepřečteno, archiv (založí „Archiv“), koš, vrátit; kopie se upraví hned', async () => {
    const k = schranka();
    const v = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: null, ted: TED });
    const slozky = await S.najdiSlozky(k);
    const id = najdi(v, 'Nabídka na pasport').id;
    const polozky = S.polozkyKonverzace(v.stav, id);
    assert.strictEqual(await S.oznacPrecteno(k, slozky, polozky, true), 2);
    assert.ok(k.zpravy('INBOX').filter((z) => /pasport/.test(z.surova)).every((z) => z.flags.has('\\Seen')));
    await S.oznacPrecteno(k, slozky, polozky, false);
    assert.ok(k.zpravy('INBOX').filter((z) => /pasport/.test(z.surova)).every((z) => !z.flags.has('\\Seen')));
    const kopie = S.upravKopii(v.data, id, 'precteno');
    assert.strictEqual(kopie.pracovni.find((m) => m.id === id).neprectena, false);
    assert.strictEqual(kopie.pocty.neprectene, 3);
    assert.strictEqual(v.data.pracovni.find((m) => m.id === id).neprectena, true, 'původní kopie se nemění');
    // archiv: složka chybí → založí se „Archiv“
    const p = await S.presunKonverzaci(k, slozky, polozky, 'archiv');
    assert.deepStrictEqual([p.presunuto, p.cil, p.uidy.length], [2, 'Archiv', 2]);
    assert.ok(k.log.indexOf('CREATE Archiv') >= 0);
    assert.strictEqual(k.zpravy('Archiv').length, 2);
    assert.ok(!k.zpravy('INBOX').some((z) => /pasport/.test(z.surova)));
    assert.strictEqual(S.upravKopii(v.data, id, 'pryc').pracovni.length, 5);
    // vrátit podle nových UID
    await S.vratitPresun(k, slozky, { cil: p.cil, uidy: p.uidy });
    assert.strictEqual(k.zpravy('Archiv').length, 0);
    assert.strictEqual(k.zpravy('INBOX').filter((z) => /pasport/.test(z.surova)).length, 2);
    await assert.rejects(S.vratitPresun(k, slozky, { cil: 'Archiv', uidy: [] }), /Vrátit teď nejde/);
    // archiv se SPECIAL-USE \Archive se použije, i když se jmenuje jinak
    const k2 = schranka();
    k2.pridejSlozku('Uloženo', '\\Archive', []);
    const v2 = await S.synchronizuj({ klient: k2, rozeber, nastaveni: N, predchozi: null, ted: TED });
    const sl2 = await S.najdiSlozky(k2);
    const p2 = await S.presunKonverzaci(k2, sl2, S.polozkyKonverzace(v2.stav, najdi(v2, 'Akce týdne').id), 'archiv');
    assert.strictEqual(p2.cil, 'Uloženo');
    // koš (\Trash)
    const p3 = await S.presunKonverzaci(k2, sl2, S.polozkyKonverzace(v2.stav, najdi(v2, 'Představení firmy').id), 'kos');
    assert.deepStrictEqual([p3.cil, k2.zpravy('Trash').length], ['Trash', 1]);
    // moje odpověď v Odeslaných zůstává (Hotovo jen schová konverzaci z Doručené)
    const p4 = await S.presunKonverzaci(k2, sl2, S.polozkyKonverzace(v2.stav, najdi(v2, 'Termín schůzky').id), 'archiv');
    assert.strictEqual(p4.presunuto, 1);
    assert.ok(k2.zpravy('Sent').some((z) => /Termín schůzky/.test(z.surova)));
    const po = await S.synchronizuj({ klient: k2, rozeber, nastaveni: N, predchozi: v2.stav, ted: TED + 60e3 });
    assert.ok(!najdi(po, 'Termín schůzky') && !najdi(po, 'Akce týdne') && !najdi(po, 'Představení firmy'), 'po archivu a koši pryč ze seznamu');
  });

  await test('odeslání: odpověď (In-Reply-To, References, citace, \\Answered), kopie do Odeslaných, odpověď všem, přeposlání s přílohou, nový e-mail', async () => {
    const k = schranka();
    const v = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: null, ted: TED });
    const slozky = await S.najdiSlozky(k);
    const det = (await S.nactiDetail(k, rozeber, slozky, najdi(v, 'Nabídka na pasport').id, S.polozkyKonverzace(v.stav, najdi(v, 'Nabídka na pasport').id), JA));
    const cil = det.zpravy[det.zpravy.length - 1];
    assert.ok(!cil.odeMe && cil.odAdresa === 'petr@klient.test');
    const odeslano = [];
    const r = await S.odesli({ klient: k, rozeber, transport: prenos(odeslano), Skladac, nastaveni: N, slozky, stav: v.stav, ted: TED,
      pozadavek: W.pozadavekOdeslani({ rezim: 'odpoved', id: cil.id, text: 'Dobrý den,\nnabídku pošlu dnes.', idOdeslani: 'abc12345-x' }) });
    assert.ok(r.odeslano && r.kopie);
    assert.strictEqual(odeslano.length, 1);
    const raw = odeslano[0].surova;
    assert.deepStrictEqual(odeslano[0].obalka, { from: JA, to: ['petr@klient.test'] });
    assert.ok(/^In-Reply-To: <a2@klient\.test>/m.test(raw), raw);
    assert.ok(/^References: <a2@klient\.test>/m.test(raw), 'References = původní References + její Message-ID');
    assert.ok(/^Message-ID: <[0-9a-f]+\.asistent@firma\.test>/m.test(raw), 'Message-ID v pracovní doméně');
    if (mailparser) {
      const r0 = await mailparser.simpleParser(Buffer.from(raw));
      assert.strictEqual(r0.subject, 'Re: Nabídka na pasport');
      assert.strictEqual(r0.from.value[0].name, 'Michal K.');
    } else assert.ok(/^Subject: Re: Nabídka na pasport/m.test(raw), 'předmět Re:');
    const text = mailparser ? (await mailparser.simpleParser(Buffer.from(raw))).text : raw;
    assert.ok(/nabídku pošlu dnes/.test(text) && /napsal\(a\):/.test(text) && /> Doplňuji: potřebujeme to do pátku\./.test(text), 'citace původní zprávy: ' + text);
    assert.strictEqual(k.zpravy('Sent').filter((z) => z.flags.has('\\Seen')).length, 4, 'kopie v Odeslaných (přečtená)');
    assert.ok(k.zpravy('INBOX').some((z) => /<a2@klient\.test>/.test(z.surova) && z.flags.has('\\Answered')), 'původní zpráva má \\Answered');
    // po synchronizaci: moje odpověď je poslední → čekáš na ně
    const po = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: v.stav, ted: TED + 60e3 });
    assert.strictEqual(najdi(po, 'Nabídka na pasport').stav, 'cekas');
    assert.strictEqual(najdi(po, 'Nabídka na pasport').pocet, 3);
    // odpověď všem: odesílatel + ostatní adresáti (bez mě), kopie zůstává v kopii
    const pod = najdi(v, 'Podklady');
    const dPod = await S.nactiDetail(k, rozeber, slozky, pod.id, S.polozkyKonverzace(v.stav, pod.id), JA);
    await S.odesli({ klient: k, rozeber, transport: prenos(odeslano), Skladac, nastaveni: N, slozky, stav: v.stav, ted: TED,
      pozadavek: W.pozadavekOdeslani({ rezim: 'vsem', id: dPod.zpravy[0].id, text: 'Díky, mám.' }) });
    assert.deepStrictEqual(odeslano[1].obalka.to.sort(), ['jana@firma.test', 'petr@klient.test']);
    // přeposlání s přílohou
    await S.odesli({ klient: k, rozeber, transport: prenos(odeslano), Skladac, nastaveni: N, slozky, stav: v.stav, ted: TED,
      pozadavek: W.pozadavekOdeslani({ rezim: 'preposlat', id: dPod.zpravy[0].id, komu: 'Šéf <sef@firma.test>', text: 'Pro info.' }) });
    assert.deepStrictEqual(odeslano[2].obalka.to, ['sef@firma.test']);
    if (SkladacNodemailer) {
      const preposlana = await mailparser.simpleParser(Buffer.from(odeslano[2].surova));
      assert.strictEqual(preposlana.subject, 'Fwd: Podklady');
      assert.deepStrictEqual(preposlana.attachments.map((a) => a.filename), ['plan.pdf']);
      assert.ok(/Přeposlaná zpráva/.test(preposlana.text) && /Posílám podklady/.test(preposlana.text));
    }
    // nový e-mail
    await S.odesli({ klient: k, rozeber, transport: prenos(odeslano), Skladac, nastaveni: N, slozky, stav: v.stav, ted: TED,
      pozadavek: W.pozadavekOdeslani({ rezim: 'novy', komu: 'eva@klient.test', predmet: 'Nový', text: 'Text' }) });
    assert.deepStrictEqual(odeslano[3].obalka, { from: JA, to: ['eva@klient.test'] });
    // chybná SMTP: nic do Odeslaných
    const predtim = k.zpravy('Sent').length;
    await assert.rejects(S.odesli({ klient: k, rozeber, transport: prenos([], Object.assign(new Error('Invalid login'), { code: 'EAUTH' })), Skladac, nastaveni: N,
      slozky, stav: v.stav, ted: TED, pozadavek: W.pozadavekOdeslani({ rezim: 'novy', komu: 'eva@klient.test', text: 'x' }) }), /Invalid login/);
    assert.strictEqual(k.zpravy('Sent').length, predtim);
    // zpráva, která už ve schránce není
    await assert.rejects(S.odesli({ klient: k, rozeber, transport: prenos([]), Skladac, nastaveni: N, slozky, stav: v.stav, ted: TED,
      pozadavek: W.pozadavekOdeslani({ rezim: 'odpoved', id: 'w000000000000000', text: 'x' }) }), /už ve schránce není/);
  });

  await test('odeslání: kontrola požadavku a adresátů odpovědi (vlastní zpráva → původním adresátům)', () => {
    assert.throws(() => W.pozadavekOdeslani({ rezim: 'odpoved', id: 'w123', text: 'x' }), /Neplatné id/);
    assert.throws(() => W.pozadavekOdeslani({ rezim: 'novy', komu: 'a@b.cz', text: '   ' }), /Prázdná/);
    assert.throws(() => W.pozadavekOdeslani({ rezim: 'smazat', text: 'x' }), /Neznámý způsob/);
    assert.throws(() => W.pozadavekOdeslani({ rezim: 'novy', komu: 'a@b.cz', text: 'x', idOdeslani: 'krátké' }), /id odeslání/);
    assert.strictEqual(W.pozadavekOdeslani({ rezim: 'novy', komu: 'a@b.cz', text: 'x\r\n' }).predmet, '(bez předmětu)');
    const z = { od: { jmeno: '', adresa: JA }, odpovedet: [{ jmeno: '', adresa: JA }], komu: [{ jmeno: 'Eva', adresa: 'eva@k.test' }], kopie: [{ jmeno: '', adresa: JA }, { jmeno: '', adresa: 'x@k.test' }] };
    assert.deepStrictEqual(W.adresatiOdpovedi(z, 'odpoved', JA), { komu: [{ jmeno: 'Eva', adresa: 'eva@k.test' }], kopie: [{ jmeno: '', adresa: 'x@k.test' }] });
    const z2 = { od: { jmeno: 'Petr', adresa: 'petr@k.test' }, odpovedet: [{ jmeno: 'Podpora', adresa: 'podpora@k.test' }], komu: [{ adresa: JA }], kopie: [] };
    assert.deepStrictEqual(W.adresatiOdpovedi(z2, 'odpoved', JA).komu.map((a) => a.adresa), ['podpora@k.test'], 'Reply-To má přednost');
    assert.deepStrictEqual(W.odkazyOdpovedi({ odkazy: ['<r@x>', '<a@x>'], mid: '<b@x>' }), ['<r@x>', '<a@x>', '<b@x>']);
  });

  await test('chyby: špatné heslo = pauza 15 min, 30 min, 1 h…; ruční pokus po 2 min; nové nasazení nebo nastavení hned; heslo z textu pryč', async () => {
    const k = schranka();
    k.spatneHeslo = true;
    let e;
    try { await k.connect(); } catch (x) { e = x; }
    const ch = W.chybaProUzivatele(e, N);
    assert.strictEqual(ch.druh, 'heslo');
    assert.ok(/zkontroluj adresu a heslo/.test(ch.text) && ch.text.indexOf('Authentication') < 0);
    let stav = { prihlaseni: W.prihlaseniPoPokusu(null, N, TED, ch, 'rev1') };
    assert.deepStrictEqual([stav.prihlaseni.neuspechu, stav.prihlaseni.pauzaDo - TED], [1, 15 * 60e3]);
    assert.strictEqual(W.smiPrihlasit(stav, N, TED + 10 * 60e3, { revize: 'rev1' }).smi, false, 'plánovaná obnova čeká');
    assert.ok(/Čekám s dalším pokusem/.test(W.smiPrihlasit(stav, N, TED + 10 * 60e3, { revize: 'rev1' }).text));
    assert.strictEqual(W.smiPrihlasit(stav, N, TED + 16 * 60e3, { revize: 'rev1' }).smi, true);
    assert.strictEqual(W.smiPrihlasit(stav, N, TED + 60e3, { rucne: true, revize: 'rev1' }).smi, false, 'ruční pokus nejdřív za 2 min');
    assert.strictEqual(W.smiPrihlasit(stav, N, TED + 3 * 60e3, { rucne: true, revize: 'rev1' }).smi, true);
    assert.strictEqual(W.smiPrihlasit(stav, N, TED + 60e3, { revize: 'rev2' }).smi, true, 'nové nasazení (nové heslo) → hned');
    assert.strictEqual(W.smiPrihlasit(stav, W.platneNastaveni({ adresa: 'jiny@firma.test' }), TED + 60e3, { revize: 'rev1' }).smi, true, 'jiná adresa → hned');
    stav = { prihlaseni: W.prihlaseniPoPokusu(stav, N, TED + 16 * 60e3, ch, 'rev1') };
    assert.deepStrictEqual([stav.prihlaseni.neuspechu, stav.prihlaseni.pauzaDo - (TED + 16 * 60e3)], [2, 30 * 60e3]);
    assert.strictEqual(W.pauzaPoChybe(3), 60 * 60e3);
    assert.strictEqual(W.pauzaPoChybe(20), 8 * 3600e3);
    // jiná chyba pauzu nemění, úspěch ji zruší
    const server = W.chybaProUzivatele(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }), N);
    assert.strictEqual(server.druh, 'server');
    assert.strictEqual(W.prihlaseniPoPokusu(stav, N, TED, server, 'rev1').neuspechu, 2);
    assert.strictEqual(W.prihlaseniPoPokusu(stav, N, TED, null).neuspechu, 0);
    assert.strictEqual(W.chybaProUzivatele(Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }), N).druh, 'server');
    const jina = W.chybaProUzivatele(new Error('Command failed tajne-heslo-123 něco'), N, 'tajne-heslo-123');
    assert.ok(jina.text.indexOf('tajne-heslo-123') < 0 && /•••/.test(jina.text), jina.text);
    assert.strictEqual(W.chybaProUzivatele(Object.assign(new Error('Invalid login: 535'), { code: 'EAUTH' }), N).druh, 'heslo', 'SMTP');
  });

  await test('detail: přílohy bez vložených obrázků, HTML zkrácené, dokument se vejde do Firestore (< 1 MB)', () => {
    const stavba = { type: 'multipart/mixed', childNodes: [
      { type: 'multipart/related', childNodes: [{ type: 'text/html', encoding: 'quoted-printable', size: 100 }, { type: 'image/png', id: '<obr1>', disposition: 'inline', encoding: 'base64', size: 1000 }] },
      { type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'smlouva.pdf' }, encoding: 'base64', size: 10000 },
      { type: 'message/rfc822', size: 500 }] };
    assert.deepStrictEqual(W.seznamPriloh(stavba), [{ nazev: 'smlouva.pdf', velikost: 7300 }, { nazev: 'přeposlaná zpráva.eml', velikost: 500 }]);
    const z = (i) => ({ z: { klic: 'd:' + i, slozka: 'd', uid: i, uv: '1', mid: '<m' + i + '@x>', od: { jmeno: 'A', adresa: 'a@x.cz' }, komu: [], kopie: [], odpovedet: [], predmet: 'P', kdy: TED + i },
      rozebrana: { text: 'x'.repeat(150000), html: ('<p>' + 'y'.repeat(100) + '</p>').repeat(3000) }, stavba: null });
    const d = W.detailKonverzace({ id: 'w0123456789abcde' }, [1, 2, 3, 4, 5].map(z), JA, 20);
    assert.ok(Buffer.byteLength(JSON.stringify(d)) <= W.MAX_DETAIL, 'velikost ' + Buffer.byteLength(JSON.stringify(d)));
    assert.ok(d.zkraceno && d.zpravy.length >= 1 && d.skryto >= 15);
    assert.ok(d.zpravy[d.zpravy.length - 1].html.length > 0, 'nejnovější zpráva si HTML nechá');
    assert.strictEqual(W.htmlNaText('<style>p{}</style><p>Ahoj&nbsp;<b>Jano</b></p><p>2 &lt; 3 &#8211; ok</p>'), 'Ahoj Jano\n2 < 3 – ok');
    assert.strictEqual(W.vlastniText('Ano, platí.\n\nDne 1. 10. 2026 Petr napsal(a):\n> Platí to?'), 'Ano, platí.');
  });

  await test('náhled bez hlaviček přeposlání a citací (odpověď, Outlook, přeposlaná zpráva, „Odesláno z iPhonu“)', () => {
    assert.strictEqual(W.nahled('Ano, platí.\n\nDne 1. 10. 2026 v 10:00 Petr Klient <petr@klient.test> napsal(a):\n> Platí to?'), 'Ano, platí.');
    assert.strictEqual(W.nahled('Díky, mám to.\r\n\r\nOd: Petr <p@k.test>\r\nOdesláno: pondělí 5. října 2026 9:12\r\nKomu: já\r\nPředmět: X\r\n\r\nStarý text'), 'Díky, mám to.');
    assert.strictEqual(W.nahled('---------- Přeposlaná zpráva ---------\nOd: Účetní <u@firma.test>\nDatum: 1. 10. 2026\nPředmět: Faktura\nKomu: ja@firma.test\n\n' +
      'Dobrý den, posílám fakturu https://x.test/f.pdf za září.'), 'Dobrý den, posílám fakturu za září.');
    assert.strictEqual(W.nahled('> citace nahoře\n> další\n\nOdpověď pod citací'), 'citace nahoře další Odpověď pod citací');
    assert.strictEqual(W.nahled('Přijdu v 10.\n\nOdesláno z iPhonu'), 'Přijdu v 10.');
    assert.strictEqual(W.nahled('S pozdravem\n-- \nJan Novák\ntel. 123'), 'S pozdravem');
    assert.strictEqual(W.textyZpravy('Ano.\n\n> Platí?').u, 'Ano.');
  });

  await test('id konverzací z aplikace: jedno id i víc najednou (přečíst vše), jen platná, nejvýš 100', () => {
    assert.deepStrictEqual(W.idyKonverzaci({ id: 'w0123456789abcde' }), ['w0123456789abcde']);
    assert.deepStrictEqual(W.idyKonverzaci({ ids: ['w0123456789abcde', 'w0123456789abcde', '../x', 'wfffffffffffffff'] }), ['w0123456789abcde', 'wfffffffffffffff']);
    assert.deepStrictEqual(W.idyKonverzaci({ id: 'spatne' }), []);
    assert.deepStrictEqual(W.idyKonverzaci(null), []);
    assert.strictEqual(W.idyKonverzaci({ ids: Array.from({ length: 150 }, (x, i) => 'w' + String(i).padStart(15, '0')) }).length, 100);
  });

  await test('Beru na vědomí: informace v kopii hned i po synchronizaci (dokud nepřijde nová zpráva), přečteno, zrušit, záznamy', async () => {
    const k = schranka();
    const v = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: null, ted: TED });
    assert.deepStrictEqual(v.data.umi, ['vedomi', 'hromadne'], 'aplikace pozná nový server');
    const nab = najdi(v, 'Nabídka na pasport');
    assert.strictEqual(nab.stav, 'hori', nab.duvod);
    // požadavek z aplikace: jen platná id, čas poslední zprávy ze souhrnu
    const p = W.pozadavekVedomi({ ids: [nab.id, 'wffffffffffffff0', '../x'], kdy: { [nab.id]: nab.kdy, wffffffffffffff0: 'nic' } });
    assert.deepStrictEqual([p.ids, p.kdy, p.zrusit, p.precist], [[nab.id, 'wffffffffffffff0'], { [nab.id]: nab.kdy }, false, true]);
    const a = S.vedomiPoAkci(v.stav, p, TED);
    assert.deepStrictEqual([a.ids, a.precist, a.vedomi], [[nab.id], [nab.id], { [nab.id]: nab.kdy }], 'bez času se konverzace přeskočí');
    // server přečte konverzaci (jeden STORE) a kopii upraví hned
    const slozky = await S.najdiSlozky(k);
    k.log.length = 0;
    await S.oznacPrecteno(k, slozky, S.polozkyKonverzaci(v.stav, a.precist), true);
    assert.strictEqual(k.log.filter((x) => /^STORE/.test(x)).length, 1, k.log.join(' | '));
    const kopie = S.upravKopii(v.data, nab.id, 'vedomi', a.vedomi[nab.id]);
    const m = kopie.pracovni.find((x) => x.id === nab.id);
    assert.deepStrictEqual([m.stav, m.duvod, m.vedomi, m.puvodniStav, m.neprectena, m.termin], ['info', 'bereš na vědomí', true, 'hori', false, null]);
    assert.strictEqual(kopie.pocty.neprectene, v.data.pocty.neprectene - 1);
    assert.deepStrictEqual(kopie.umi, W.UMI, 'kopie po akci nese, co server umí');
    assert.ok(!S.upravKopii(v.data, nab.id, 'vedomi', nab.kdy - 1).pracovni.find((x) => x.id === nab.id).vedomi, 'jiný čas poslední zprávy = beze změny');
    // seznam složený znovu (po hodině): pořád informace; záznam zůstává ve stavu serveru
    const po = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: Object.assign({}, v.stav, { vedomi: a.vedomi }), ted: TED + 61 * 60e3 });
    const nab2 = najdi(po, 'Nabídka na pasport');
    assert.deepStrictEqual([nab2.stav, nab2.vedomi, nab2.neprectena, Object.keys(po.stav.vedomi)], ['info', true, false, [nab.id]]);
    // nová zpráva v konverzaci → zase normální stav, záznam pryč
    k.vloz(k.slozky.INBOX, email({ od: KLIENT, komu: JA, predmet: 'Re: Nabídka na pasport', kdy: TED + 2 * HOD, mid: '<a9@klient.test>', irt: '<a2@klient.test>',
      refs: '<a1@klient.test> <a2@klient.test>', text: 'Ještě prosím pošlete ceník do zítra.' }), [], TED + 2 * HOD);
    const nova = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: po.stav, ted: TED + 3 * HOD });
    const nab3 = najdi(nova, 'Nabídka na pasport');
    assert.ok(nab3.stav !== 'info' && !nab3.vedomi && !(nab.id in nova.stav.vedomi), nab3.stav + ' / ' + JSON.stringify(nova.stav.vedomi));
    // zrušit (Vrátit): záznam pryč, předtím nepřečtené zase nepřečtené, v kopii původní stav
    const z = S.vedomiPoAkci(po.stav, W.pozadavekVedomi({ id: nab.id, zrusit: true, neprectene: [nab.id, 'wffffffffffffff9'] }), TED);
    assert.deepStrictEqual([z.vedomi, z.ids, z.precist, z.neprecist], [{}, [nab.id], [], [nab.id]]);
    assert.deepStrictEqual(S.upravKopii(kopie, nab.id, 'vedomiZrusit').pracovni.find((x) => x.id === nab.id).stav, 'hori');
    // záznamy: jen platná id, ne starší než 100 dní, nejvýš 500 nejnovějších
    const mnoho = { spatne: TED, ['w' + 'f'.repeat(15)]: TED - 120 * DEN };
    for (let i = 0; i < 600; i++) mnoho['w' + String(i).padStart(15, '0')] = TED - i * 60e3;
    const o = W.omezVedomi(mnoho, TED);
    assert.strictEqual(Object.keys(o).length, 500);
    assert.ok(!('spatne' in o) && !(('w' + 'f'.repeat(15)) in o) && ('w000000000000000' in o) && !('w000000000000599' in o));
  });

  await test('hromadně: archiv a koš víc konverzací jedním přesunem IMAP, Vrátit celý výběr, přečteno víc najednou', async () => {
    const k = schranka();
    const v = await S.synchronizuj({ klient: k, rozeber, nastaveni: N, predchozi: null, ted: TED });
    const ids = [najdi(v, 'Podklady').id, najdi(v, 'Představení firmy').id];
    assert.deepStrictEqual(W.idyKonverzaci({ ids }), ids);
    const slozky = await S.najdiSlozky(k);
    const polozky = S.polozkyKonverzaci(v.stav, ids);
    assert.strictEqual(polozky.length, 2);
    k.log.length = 0;
    await S.oznacPrecteno(k, slozky, polozky, true);
    const p = await S.presunKonverzaci(k, slozky, polozky, 'archiv');
    assert.deepStrictEqual([k.log.filter((x) => /^STORE/.test(x)).length, k.log.filter((x) => /^MOVE/.test(x)).length], [1, 1], 'jeden příkaz na výběr: ' + k.log.join(' | '));
    assert.deepStrictEqual([p.presunuto, p.uidy.length, k.zpravy('Archiv').length], [2, 2, 2]);
    const kopie = ids.reduce((x, id) => S.upravKopii(x, id, 'pryc'), v.data);
    assert.deepStrictEqual([kopie.pracovni.length, kopie.pocty.konverzaci], [4, 4]);
    // Vrátit: celý výběr zpět do Doručené
    await S.vratitPresun(k, slozky, { cil: p.cil, uidy: p.uidy });
    assert.deepStrictEqual([k.zpravy('Archiv').length, k.zpravy('INBOX').filter((z) => /Podklady|Představení firmy/.test(z.surova)).length], [0, 2]);
  });

  await test('id konverzace drží kořen: když nejstarší zpráva vypadne z okna, id se nezmění', () => {
    const z = (uid, mid, irt, refs, kdy) => ({ klic: 'd:' + uid, slozka: 'd', uid, uv: '1', mid, odpovedNa: irt || '', odkazy: refs || [], od: { jmeno: '', adresa: 'p@k.test' },
      komu: [], kopie: [], skryta: [], odpovedet: [], predmet: 'X', kdy, precteno: true, oznaceno: false, hromadna: false, automat: false });
    const a = W.sestavKonverzace([z(1, '<r@k>', '', [], 1), z(2, '<s@k>', '<r@k>', ['<r@k>'], 2), z(3, '<t@k>', '<s@k>', ['<r@k>', '<s@k>'], 3)]);
    const b = W.sestavKonverzace([z(2, '<s@k>', '<r@k>', ['<r@k>'], 2), z(3, '<t@k>', '<s@k>', ['<r@k>', '<s@k>'], 3)]);
    const c = W.sestavKonverzace([z(1, '<r@k>', '', [], 1)]);
    assert.strictEqual(a.length, 1);
    assert.strictEqual(a[0].id, b[0].id);
    assert.strictEqual(a[0].id, c[0].id);
  });

  // ---------- stejná pravidla jako motor (apps-script/Kod.gs) – jen když motor leží vedle (repo)
  const motor = path.join(__dirname, '..', '..', 'apps-script', 'Kod.gs');
  if (fs.existsSync(motor)) {
    await test('stavy jako motor: stejný stav, důvod i termín pro stejné zprávy (Kod.gs stavADuvod_)', () => {
      const ctx = vm.createContext({ console });
      vm.runInContext(fs.readFileSync(motor, 'utf8'), ctx);
      const znamiAdresy = ['eva@k.test'];
      const znamiMotor = { 'eva@k.test': true, '@firma.test': true };
      const znamiServer = new Set(znamiAdresy.concat(['@firma.test']).map(W.otiskAdresy));
      const pripady = [
        { od: 'Eva <eva@k.test>', predmet: 'Podklady', text: 'Pošlete prosím podklady.' },
        { od: 'Eva <eva@k.test>', predmet: 'Dotaz', text: 'Jak to vypadá?' },
        { od: 'Eva <eva@k.test>', predmet: 'Urgentní', text: 'Nefunguje nám server.' },
        { od: 'Cizí <x@cizi.test>', predmet: 'Urgentní', text: 'Nefunguje nám server.' },
        { od: 'Cizí <x@cizi.test>', predmet: 'Nabídka', text: 'Dobrý den, nabízíme služby.' },
        { od: 'Eva <eva@k.test>', predmet: 'Termín', text: 'Potřebuju to do zítra.' },
        { od: 'Eva <eva@k.test>', predmet: 'Termín', text: 'Hotové to bude do 20. 10.' },
        { od: 'Eva <eva@k.test>', predmet: 'Automatická odpověď: Re: X', text: 'Jsem mimo kancelář.' },
        { od: 'noreply@sluzba.test', predmet: 'Faktura', text: 'Vaše faktura je připravena.' },
        { od: 'Kolega <jan@firma.test>', predmet: 'Oběd', text: 'Jdeme na oběd ve 12?' },
        { od: JA, komu: 'Eva <eva@k.test>', predmet: 'Re: X', text: 'Díky, to stačí.', odeMe: true },
        { od: JA, komu: 'Eva <eva@k.test>', predmet: 'Re: X', text: 'Pošlu to v pátek, dobře?', odeMe: true },
        { od: JA, komu: 'noreply@sluzba.test', predmet: 'Re: X', text: 'Reklamace.', odeMe: true },
        { od: JA, komu: 'a@a.cz, b@b.cz, c@c.cz, d@d.cz, e@e.cz, f@f.cz', predmet: 'Pozvánka', text: 'Zvu vás.', odeMe: true },
        { od: 'Eva <eva@k.test>', predmet: 'Re: X', text: 'Ano.', jsemPsal: true }
      ];
      pripady.forEach((p, i) => {
        const kdy = TED - 3 * HOD;
        const zprava = { getSubject: () => p.predmet, getPlainBody: () => p.text, getDate: () => new Date(kdy), getFrom: () => p.od, getTo: () => p.komu || JA, getCc: () => '' };
        const m = ctx.stavADuvod_(zprava, !!p.odeMe, null, false, TED, !!p.jsemPsal || !!p.odeMe, znamiMotor);
        const s = W.stavADuvod({ predmet: p.predmet, vlastni: W.vlastniText(p.text), od: W.adresaObj(p.od), komu: W.adresyZeVstupu(p.komu || JA), kopie: [], kdy },
          !!p.odeMe, TED, !!p.jsemPsal || !!p.odeMe, znamiServer);
        assert.deepStrictEqual([s.stav, s.duvod, JSON.stringify(s.termin)], [m.stav, m.duvod, JSON.stringify(m.termin)], 'případ ' + (i + 1) + ': ' + p.text);
      });
    });
  }

  // ---------- se skutečnými knihovnami (po npm install – při nasazení), jinak přeskočeno
  if (mailparser) {
    await test('mailparser: windows-1250 v quoted-printable, jen HTML, useknutý začátek zprávy', async () => {
      const cp1250 = 'From: A <a@x.cz>\r\nSubject: =?windows-1250?Q?P=F8=EDle=9Ainost?=\r\nContent-Type: text/plain; charset=windows-1250\r\n' +
        'Content-Transfer-Encoding: quoted-printable\r\n\r\nP=F8=EDli=9A =9Elu=9Dou=E8k=FD k=F9=F2 \r\n';
      const r1 = await rozeber(Buffer.from(cp1250, 'latin1'));
      assert.strictEqual(W.textZpravy(r1).trim(), 'Příliš žluťoučký kůň');
      const r2 = await rozeber(Buffer.from('From: a@x.cz\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Dobrý den,</p><p>prosím o <b>schůzku</b>.</p>'));
      assert.ok(/prosím o schůzku/i.test(W.textZpravy(r2).replace(/\s+/g, ' ')), W.textZpravy(r2));
      const velka = email({ od: 'a@x.cz', komu: JA, predmet: 'Velká', kdy: TED, text: 'Začátek textu.', prilohy: [{ nazev: 'velka.bin', obsah: 'z'.repeat(200000) }] });
      const r3 = await rozeber(Buffer.from(velka).subarray(0, 65536));
      assert.strictEqual(W.textZpravy(r3).trim(), 'Začátek textu.');
    });
  }
};

if (require.main === module) {
  let ok = 0;
  module.exports(async (nazev, fn) => {
    try { await fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
  }).then(() => console.log('\n' + ok + ' testů prošlo' + (process.exitCode ? ', některé SELHALY' : '')));
}
