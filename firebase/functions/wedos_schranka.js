// Práce s pracovní schránkou WEDOS přes VSTŘIKOVANÉ klienty: IMAP (imapflow), rozbor e-mailu (mailparser), SMTP
// (nodemailer) a skládání zprávy (nodemailer MailComposer). Bez Firebase a bez hesla – index.js předá přihlášeného
// klienta a předchozí stav serveru a výsledek uloží. Test s napodobeným IMAP/SMTP: test_wedos.js (bez sítě).
//
// Šetrně ke schránce: každých 10 minut jen STATUS Doručené a Odeslané; seznam se skládá znovu, jen když se ve složkách
// něco změnilo (nebo jednou za hodinu kvůli termínům „dnes / zítra“). Texty a detaily se čtou jen u nových zpráv.

'use strict';
const W = require('./wedos');

const VERZE_STAVU = 1;
const ZDROJ_SEZNAM = 65536;              // bajtů zprávy na náhled a stav (začátek stačí – text bývá první)
const ZDROJ_DETAIL = 600000;             // bajtů zprávy na detail (velké přílohy se nestahují)
const ZDROJ_ODPOVED = 262144;            // bajtů původní zprávy na citaci v odpovědi
const MAX_PREPOSLANI = 20 * 1024 * 1024; // přeposlání s přílohami (jako motor)
const ZNAMI_DNI = 365;                   // známí = komu jsi za rok psal (z Odeslaných)
const ZNAMI_MAX_ZPRAV = 1500;
const ZNAMI_MAX = 3000;
const ZNAMI_ZNOVU = 7 * 864e5;           // celé Odeslané se procházejí nejvýš jednou týdně
const SESTAVIT_ZNOVU = 60 * 60e3;        // beze změny ve složkách se seznam sestaví znovu po hodině (termíny se posouvají)
const MAX_NOVYCH_DETAILU = 6;            // detailů předem za jeden běh (další příště)

/** UID → rozsah pro IMAP („1:5,7,9:12“). */
function rozsah(uidy) {
  const s = Array.from(new Set(uidy)).filter((u) => Number.isInteger(u) && u > 0).sort((a, b) => a - b);
  const casti = [];
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    casti.push(i === j ? String(s[i]) : s[i] + ':' + s[j]);
    i = j + 1;
  }
  return casti.join(',');
}

/** Položka mapy konverzace „d:123:w…“ → [složka, uid, id zprávy]. */
function rozeberPolozku(p) {
  const m = /^([do]):(\d+):(w[0-9a-f]{15})$/.exec(String(p || ''));
  return m ? [m[1], Number(m[2]), m[3]] : null;
}
function polozkyKonverzace(stav, id) {
  const seznam = stav && stav.konverzace && stav.konverzace[id];
  return Array.isArray(seznam) ? seznam.map(rozeberPolozku).filter(Boolean) : [];
}

/** Chyba akce (ne spojení) – aplikace ji ukáže, stav schránky se kvůli ní nemění. */
function chybaAkce(text, druh) { return Object.assign(new Error(text), { wedosDruh: druh || 'akce' }); }

// ---------------------------------------------------------------- složky

/** Složky schránky: Doručené, Odeslané, Koš, Archiv (SPECIAL-USE, jinak podle názvu – imapflow zná i české názvy). */
async function najdiSlozky(klient) {
  const seznam = (await klient.list()) || [];
  const podle = (flag, re) => seznam.find((s) => s.specialUse === flag) || seznam.find((s) => re.test(String(s.name || s.path || '')));
  const d = seznam.find((s) => s.specialUse === '\\Inbox' || String(s.path || '').toUpperCase() === 'INBOX');
  const o = podle('\\Sent', /^(sent|sent items|sent messages|sent mail|odeslan[áé]( pošta)?)$/i);
  const kos = podle('\\Trash', /^(trash|deleted items|deleted messages|koš)$/i);
  const archiv = podle('\\Archive', /^(archiv|archive|archives)$/i);
  return { d: d ? d.path : 'INBOX', o: o ? o.path : '', kos: kos ? kos.path : '', archiv: archiv ? archiv.path : '' };
}

/** Složka pro přesun (archiv, koš, odeslané) – když chybí, založí se (Archiv / Trash / Sent). */
async function zajistiSlozku(klient, slozky, kam) {
  if (slozky[kam]) return slozky[kam];
  const nazev = { archiv: 'Archiv', kos: 'Trash', o: 'Sent' }[kam];
  const r = await klient.mailboxCreate(nazev);
  slozky[kam] = (r && r.path) || nazev;
  return slozky[kam];
}

/** Otisk stavu Doručené a Odeslané (STATUS) – beze změny se seznam neskládá znovu. */
async function otiskSlozek(klient, slozky) {
  const casti = [];
  for (const k of ['d', 'o']) {
    if (!slozky[k]) continue;
    const s = await klient.status(slozky[k], { messages: true, uidNext: true, uidValidity: true, unseen: true, highestModseq: true });
    if (!s) return ''; // server STATUS odmítl – seznam se složí celý
    casti.push([k, String(s.uidValidity), s.uidNext, s.messages, s.unseen, s.highestModseq != null ? String(s.highestModseq) : ''].join(':'));
  }
  return casti.join('|');
}

/** Pracuje se složkou pod zámkem imapflow (jen čtení = EXAMINE, nic se neoznačí jako přečtené). */
async function veSlozce(klient, cesta, jenCteni, prace) {
  const zamek = await klient.getMailboxLock(cesta, jenCteni ? { readOnly: true } : {});
  try {
    const uv = klient.mailbox && klient.mailbox.uidValidity != null ? String(klient.mailbox.uidValidity) : '';
    return await prace(uv);
  } finally {
    zamek.release();
  }
}

async function nacti(klient, uidy, dotaz) {
  const vysledek = [];
  if (!uidy.length) return vysledek;
  // během FETCH se nesmí volat další příkaz IMAP – nejdřív vše načíst, zpracovat až potom
  for await (const m of klient.fetch(rozsah(uidy), dotaz, { uid: true })) vysledek.push(m);
  return vysledek;
}

async function hledej(klient, dotaz) {
  const r = await klient.search(dotaz, { uid: true });
  return Array.isArray(r) ? r.slice().sort((a, b) => a - b) : [];
}

// ---------------------------------------------------------------- synchronizace

/** Zprávy složky za posledních 30 dní (nejnovějších MAX_ZPRAV) – obálka, příznaky a pár hlaviček, bez těl. */
async function zpravySlozky(klient, cesta, k, ted) {
  return veSlozce(klient, cesta, true, async (uv) => {
    const uidy = (await hledej(klient, { since: new Date(ted - W.DNI * 864e5) })).slice(-W.MAX_ZPRAV[k]);
    const zpravy = (await nacti(klient, uidy, { uid: true, flags: true, envelope: true, internalDate: true, size: true, headers: W.HLAVICKY }))
      .filter((m) => !(m.flags && (m.flags.has('\\Deleted') || m.flags.has('\\Draft')))) // smazané (před EXPUNGE) a koncepty ne
      .map((m) => W.normalizuj(m, k, uv));
    return { uv, zpravy };
  });
}

/** Známí lidé = adresáti tvých zpráv za rok (otisky adres, ne adresy). */
async function znamiZOdeslanych(klient, cesta, ted) {
  const znami = new Set();
  await veSlozce(klient, cesta, true, async () => {
    const uidy = (await hledej(klient, { since: new Date(ted - ZNAMI_DNI * 864e5) })).slice(-ZNAMI_MAX_ZPRAV);
    (await nacti(klient, uidy, { uid: true, envelope: true })).forEach((m) => {
      const e = m.envelope || {};
      [].concat(e.to || [], e.cc || [], e.bcc || []).forEach((a) => { const x = W.adresaObj(a).adresa; if (x) znami.add(W.otiskAdresy(x)); });
    });
  });
  return znami;
}

/** Texty posledních zpráv konverzací (začátek zprávy → mailparser → vlastní text a náhled). */
async function nactiTexty(klient, rozeber, slozky, zpravy, texty) {
  for (const k of ['d', 'o']) {
    const tu = zpravy.filter((z) => z.slozka === k);
    if (!tu.length || !slozky[k]) continue;
    const podleUid = new Map(tu.map((z) => [z.uid, z]));
    const zdroje = await veSlozce(klient, slozky[k], true, () => nacti(klient, tu.map((z) => z.uid), { uid: true, source: { maxLength: ZDROJ_SEZNAM } }));
    for (const m of zdroje) {
      const z = podleUid.get(m.uid);
      if (!z) continue;
      let text = '';
      try { text = W.textZpravy(await rozeber(m.source || Buffer.alloc(0))); } catch (e) { text = ''; }
      texty[W.klicTextu(z)] = W.textyZpravy(text);
    }
  }
}

/**
 * Jedna synchronizace: složky, STATUS (beze změny → hotovo), zprávy za 30 dní, konverzace, texty posledních zpráv,
 * stav případů, detaily nejnovějších konverzací. Vrací { data (kopie pro aplikaci), stav (pro server), detaily, smazatDetaily }
 * nebo { bezeZmeny: true, stav }.
 * o = { klient, rozeber, nastaveni, predchozi, ted, vynutit }
 */
async function synchronizuj(o) {
  const klient = o.klient, n = o.nastaveni, ted = o.ted;
  const pred = o.predchozi && o.predchozi.verze === VERZE_STAVU ? o.predchozi : {};
  const ja = n.adresa;
  const slozky = await najdiSlozky(klient);
  const otiskSl = await otiskSlozek(klient, slozky);
  const prihlaseni = { neuspechu: 0 };
  if (!o.vynutit && otiskSl && pred.otiskSlozek === otiskSl && pred.nastaveni === W.otiskNastaveni(n) && ted - (pred.sestaveno || 0) < SESTAVIT_ZNOVU) {
    return { bezeZmeny: true, stav: Object.assign({}, pred, { overeno: ted, chyba: null, prihlaseni }) };
  }
  const zpravy = [];
  const uv = {};
  for (const k of ['d', 'o']) {
    if (!slozky[k]) continue;
    const z = await zpravySlozky(klient, slozky[k], k, ted);
    uv[k] = z.uv;
    z.zpravy.forEach((x) => zpravy.push(x));
  }
  // známí lidé: celé Odeslané jednou týdně, mezitím adresáti nových odeslaných zpráv; kolegové z pracovní domény
  let znami = new Set(pred.znami || []);
  let znamiKdy = pred.znamiKdy || 0;
  if (slozky.o && (ted - znamiKdy > ZNAMI_ZNOVU || !znami.size)) {
    znami = await znamiZOdeslanych(klient, slozky.o, ted);
    znamiKdy = ted;
  }
  zpravy.filter((z) => z.slozka === 'o').forEach((z) => z.komu.concat(z.kopie, z.skryta).forEach((a) => znami.add(W.otiskAdresy(a.adresa))));
  znami.add(W.otiskAdresy('@' + ja.split('@')[1]));

  const vse = W.sestavKonverzace(zpravy);
  const konverzace = vse.slice(0, W.MAX_KONVERZACI);
  const texty = {};
  const chybi = [];
  konverzace.forEach((k) => {
    const posl = k.zpravy[k.zpravy.length - 1];
    const kl = W.klicTextu(posl);
    if (pred.texty && pred.texty[kl]) texty[kl] = pred.texty[kl];
    else chybi.push(posl);
  });
  await nactiTexty(klient, o.rozeber, slozky, chybi, texty);
  const puvodni = konverzace.map((k) => W.souhrnKonverzace(k, ja, texty, znami, ted));
  // Beru na vědomí: platí, dokud nepřijde nová zpráva (záznamy konverzací s novou zprávou pryč)
  const vedomi = W.vedomiPoSynchronizaci(pred.vedomi, puvodni, ted);
  const souhrny = puvodni.map((s) => W.pouzijVedomi(s, vedomi));

  const mapa = {};
  konverzace.forEach((k) => { mapa[k.id] = W.mapaKonverzace(k); });

  // detaily nejnovějších konverzací předem (jen nové nebo změněné, nejvýš MAX_NOVYCH_DETAILU za běh)
  const predDetaily = pred.detaily || {};
  const detaily = {};
  const otiskyDetailu = {};
  const vSeznamu = new Set(konverzace.map((k) => k.id));
  Object.keys(predDetaily).forEach((id) => { if (vSeznamu.has(id)) otiskyDetailu[id] = predDetaily[id]; });
  let novych = 0;
  for (const k of konverzace.slice(0, W.MAX_DETAILU)) {
    const ot = W.otiskDetailu(mapa[k.id], uv);
    if (predDetaily[k.id] === ot) continue;
    if (novych >= MAX_NOVYCH_DETAILU) break;
    novych++;
    try {
      detaily[k.id] = await nactiDetail(klient, o.rozeber, slozky, k.id, mapa[k.id].map(rozeberPolozku), ja);
      otiskyDetailu[k.id] = ot;
    } catch (e) {
      delete otiskyDetailu[k.id]; // příště znovu; seznam se kvůli detailu nezastaví
    }
  }
  const smazatDetaily = Object.keys(predDetaily).filter((id) => !vSeznamu.has(id));
  const data = {
    ted,
    pracovniAdresa: ja,
    pracovni: souhrny,
    pocty: { neprectene: souhrny.filter((s) => s.neprectena).length, konverzaci: souhrny.length, celkem: vse.length },
    slozky: { dorucene: slozky.d, odeslane: slozky.o, archiv: slozky.archiv, kos: slozky.kos },
    umi: W.UMI, // aplikace podle toho ukáže Beru na vědomí a hromadné akce (starší server je neuměl)
    chyba: null
  };
  const stav = {
    verze: VERZE_STAVU,
    nastaveni: W.otiskNastaveni(n),
    otiskSlozek: otiskSl,
    sestaveno: ted,
    overeno: ted,
    slozky,
    uv,
    konverzace: mapa,
    texty,
    znami: Array.from(znami).slice(-ZNAMI_MAX),
    znamiKdy,
    detaily: otiskyDetailu,
    vedomi,
    posledniPresun: pred.posledniPresun || null,
    prihlaseni,
    chyba: null
  };
  return { data, stav, detaily, smazatDetaily };
}

// ---------------------------------------------------------------- detail

/**
 * Detail konverzace (posledních MAX_ZPRAV_VE_VLAKNE zpráv): obálka, stavba (přílohy), začátek zprávy (text, HTML).
 * polozky = [[složka, uid, id zprávy], …] z mapy konverzace.
 */
async function nactiDetail(klient, rozeber, slozky, id, polozky, ja) {
  const posledni = polozky.slice(-W.MAX_ZPRAV_VE_VLAKNE);
  const vysledek = [];
  for (const k of ['d', 'o']) {
    const uidy = posledni.filter((p) => p[0] === k).map((p) => p[1]);
    if (!uidy.length || !slozky[k]) continue;
    await veSlozce(klient, slozky[k], true, async (uv) => {
      const nactene = await nacti(klient, uidy, { uid: true, flags: true, envelope: true, internalDate: true, size: true, headers: W.HLAVICKY,
        bodyStructure: true, source: { maxLength: ZDROJ_DETAIL } });
      for (const m of nactene) {
        let r;
        try { r = await rozeber(m.source || Buffer.alloc(0)); } catch (e) { r = { text: '(Text zprávy se nepodařilo přečíst.)' }; }
        vysledek.push({ z: W.normalizuj(m, k, uv), rozebrana: r, stavba: m.bodyStructure });
      }
    });
  }
  if (!vysledek.length) throw chybaAkce('Konverzace už ve schránce není – obnov poštu.', 'nenalezeno');
  return W.detailKonverzace({ id }, vysledek, ja, polozky.length);
}

// ---------------------------------------------------------------- akce: přečteno, archiv, koš, vrátit

/** Přečteno / nepřečteno (\Seen) u zpráv konverzace v Doručené. Vrací počet zpráv. */
async function oznacPrecteno(klient, slozky, polozky, precteno) {
  const uidy = polozky.filter((p) => p[0] === 'd').map((p) => p[1]);
  if (!uidy.length) return 0;
  await veSlozce(klient, slozky.d, false, async () => {
    const ok = precteno ? await klient.messageFlagsAdd(rozsah(uidy), ['\\Seen'], { uid: true })
      : await klient.messageFlagsRemove(rozsah(uidy), ['\\Seen'], { uid: true });
    if (ok === false) throw chybaAkce('Server příznak přečtení nezměnil.');
  });
  return uidy.length;
}

/**
 * Konverzaci z Doručené do archivu (kam 'archiv': SPECIAL-USE \Archive, jinak „Archiv“/„Archive“, jinak založí „Archiv“)
 * nebo do koše (kam 'kos': \Trash). Tvoje odpovědi zůstávají v Odeslaných. Vrací { presunuto, cil, uidy (nová UID v cíli) }.
 */
async function presunKonverzaci(klient, slozky, polozky, kam) {
  const cil = await zajistiSlozku(klient, slozky, kam);
  const uidy = polozky.filter((p) => p[0] === 'd').map((p) => p[1]);
  if (!uidy.length) return { presunuto: 0, cil, uidy: [] };
  const v = await veSlozce(klient, slozky.d, false, () => klient.messageMove(rozsah(uidy), cil, { uid: true }));
  if (v === false) throw chybaAkce('Přesun do složky ' + cil + ' se nepovedl.');
  const nove = v && v.uidMap ? uidy.map((u) => v.uidMap.get(u)).filter((u) => Number.isInteger(u)) : [];
  return { presunuto: uidy.length, cil, uidy: nove };
}

/** „Vrátit“ po Hotovo / Smazat: zprávy z archivu nebo koše zpět do Doručené (podle UID z posledního přesunu). */
async function vratitPresun(klient, slozky, presun) {
  if (!presun || !presun.cil || !Array.isArray(presun.uidy) || !presun.uidy.length) {
    throw chybaAkce('Vrátit teď nejde – konverzaci najdeš ve složce archivu nebo koše.');
  }
  const v = await veSlozce(klient, presun.cil, false, () => klient.messageMove(rozsah(presun.uidy), slozky.d, { uid: true }));
  if (v === false) throw chybaAkce('Vrácení do Doručené se nepovedlo.');
  return presun.uidy.length;
}

// ---------------------------------------------------------------- odeslání

/** Zpráva podle id z mapy konverzací: obálka, hlavičky a (začátek nebo celé) tělo rozebrané mailparserem. */
async function najdiZpravu(klient, rozeber, slozky, stav, idZpravy, cela) {
  let polozka = null;
  Object.keys((stav && stav.konverzace) || {}).some((id) => {
    polozka = polozkyKonverzace(stav, id).find((p) => p[2] === idZpravy) || null;
    return !!polozka;
  });
  if (!polozka || !slozky[polozka[0]]) throw chybaAkce('Zpráva už ve schránce není – obnov poštu a zkus to znovu.', 'nenalezeno');
  return veSlozce(klient, slozky[polozka[0]], true, async (uv) => {
    const hlava = (await nacti(klient, [polozka[1]], { uid: true, flags: true, envelope: true, internalDate: true, size: true, headers: W.HLAVICKY }))[0];
    if (!hlava) throw chybaAkce('Zpráva už ve schránce není – obnov poštu a zkus to znovu.', 'nenalezeno');
    if (cela && (hlava.size || 0) > MAX_PREPOSLANI) throw chybaAkce('Zpráva je na přeposlání z aplikace moc velká – přepošli ji z pošty WEDOS.');
    const telo = (await nacti(klient, [polozka[1]], { uid: true, source: cela ? true : { maxLength: ZDROJ_ODPOVED } }))[0];
    let rozebrana = {};
    try { rozebrana = await rozeber((telo && telo.source) || Buffer.alloc(0)); } catch (e) { rozebrana = {}; }
    return { z: W.normalizuj(hlava, polozka[0], uv), rozebrana, slozka: polozka[0], uid: polozka[1] };
  });
}

const prevod = (a) => (a.jmeno ? { name: a.jmeno, address: a.adresa } : a.adresa);

/**
 * Odeslání z pracovní adresy přes SMTP WEDOS: odpověď (In-Reply-To, References, citace), odpověď všem, přeposlání
 * (s přílohami), nový e-mail. Pak kopie do Odeslaných (IMAP APPEND) a u odpovědi příznak \Answered.
 * o = { klient, rozeber, transport, Skladac, nastaveni, slozky, stav, pozadavek (W.pozadavekOdeslani), ted }
 * Vrací { odeslano: true, kopie (uloženo do Odeslaných), messageId }.
 */
async function odesli(o) {
  const n = o.nastaveni, p = o.pozadavek;
  const zprava = { from: n.jmeno ? { name: n.jmeno, address: n.adresa } : n.adresa, date: new Date(o.ted), messageId: W.noveMessageId(n.adresa) };
  let cil = null;
  if (p.rezim !== 'novy') cil = await najdiZpravu(o.klient, o.rozeber, o.slozky, o.stav, p.id, p.rezim === 'preposlat');
  if (p.rezim === 'odpoved' || p.rezim === 'vsem') {
    const a = W.adresatiOdpovedi(cil.z, p.rezim, n.adresa);
    zprava.to = a.komu.map(prevod);
    if (a.kopie.length) zprava.cc = a.kopie.map(prevod);
    zprava.subject = 'Re: ' + W.bezPredpony(cil.z.predmet);
    if (cil.z.mid) {
      zprava.inReplyTo = cil.z.mid;
      zprava.references = W.odkazyOdpovedi(cil.z);
    }
    zprava.text = p.text + '\n\n' + W.citace(cil.z, W.textZpravy(cil.rozebrana));
  } else if (p.rezim === 'preposlat') {
    const puvodni = W.textZpravy(cil.rozebrana);
    const hlavicka = W.hlavickaPreposlani(cil.z);
    zprava.to = p.komu.map(prevod);
    zprava.subject = 'Fwd: ' + W.bezPredpony(cil.z.predmet);
    zprava.text = p.text + '\n\n' + hlavicka + '\n\n' + puvodni.slice(0, 60000);
    const html = typeof cil.rozebrana.html === 'string' ? cil.rozebrana.html : '';
    zprava.html = W.textNaHtml(p.text) + '<br><br>' + W.textNaHtml(hlavicka) + '<br>' + (html && html.length <= 180000 ? html : W.textNaHtml(puvodni.slice(0, 60000)));
    const prilohy = (cil.rozebrana.attachments || []).filter((a) => a && a.content);
    if (prilohy.reduce((s, a) => s + a.content.length, 0) > MAX_PREPOSLANI) throw chybaAkce('Přílohy jsou na přeposlání z aplikace moc velké – přepošli to z pošty WEDOS.');
    zprava.attachments = prilohy.map((a) => {
      const x = { filename: a.filename || 'priloha', content: a.content, contentType: a.contentType || 'application/octet-stream' };
      if (a.related && a.cid) { x.cid = a.cid; x.contentDisposition = 'inline'; } // obrázek v HTML přeposílané zprávy
      return x;
    });
  } else {
    zprava.to = p.komu.map(prevod);
    zprava.subject = p.predmet;
    zprava.text = p.text;
  }
  const slozeni = new o.Skladac(zprava).compile();
  const obalka = slozeni.getEnvelope();
  const surova = await new Promise((hotovo, chyba) => slozeni.build((e, r) => (e ? chyba(e) : hotovo(r))));
  await o.transport.sendMail({ envelope: obalka, raw: surova });
  // odesláno – chyby dál už odeslání nezruší (jen se nahlásí)
  let kopie = true;
  try {
    const kam = await zajistiSlozku(o.klient, o.slozky, 'o');
    const r = await o.klient.append(kam, surova, ['\\Seen'], new Date(o.ted));
    if (r === false) kopie = false;
  } catch (e) {
    kopie = false;
  }
  if (cil && cil.slozka === 'd' && (p.rezim === 'odpoved' || p.rezim === 'vsem')) {
    try { await veSlozce(o.klient, o.slozky.d, false, () => o.klient.messageFlagsAdd(String(cil.uid), ['\\Answered'], { uid: true })); } catch (e) { /* jen příznak */ }
  }
  return { odeslano: true, kopie, messageId: zprava.messageId };
}

// ---------------------------------------------------------------- úprava kopie bez nové synchronizace (rychlá odezva po akci)

/**
 * Kopie pro aplikaci po akci: přečteno / nepřečteno, pryč ze seznamu (archiv, koš), vedomi (Beru na vědomí – kdy = čas
 * poslední zprávy, s jiným se nic nemění; přečtená) a vedomiZrusit (původní stav do nového složení); počty se přepočítají.
 */
function upravKopii(data, id, jak, kdy) {
  const d = Object.assign({}, data);
  let seznam = (d.pracovni || []).slice();
  if (jak === 'pryc') seznam = seznam.filter((m) => m.id !== id);
  else if (jak === 'vedomi') seznam = seznam.map((m) => (m.id === id && (kdy == null || m.kdy === kdy) ? Object.assign(W.naVedomi(m), { neprectena: false }) : m));
  else if (jak === 'vedomiZrusit') seznam = seznam.map((m) => (m.id === id ? W.zrusVedomi(m) : m));
  else seznam = seznam.map((m) => (m.id === id ? Object.assign({}, m, { neprectena: jak === 'neprectene' }) : m));
  d.pracovni = seznam;
  d.pocty = Object.assign({}, d.pocty, { neprectene: seznam.filter((m) => m.neprectena).length, konverzaci: seznam.length });
  return d;
}

/**
 * „Beru na vědomí“ z aplikace (p = W.pozadavekVedomi) → nový záznam ve stavu serveru a které konverzace přečíst (Beru
 * na vědomí) nebo zase označit nepřečtené (Vrátit – byly nepřečtené). Konverzace bez času poslední zprávy se přeskočí.
 */
function vedomiPoAkci(predchozi, p, ted) {
  const v = Object.assign({}, predchozi && predchozi.vedomi);
  const precist = [];
  let neprecist = [];
  if (p.zrusit) {
    p.ids.forEach((id) => { delete v[id]; });
    neprecist = p.neprectene.slice();
  } else {
    p.ids.forEach((id) => { if (p.kdy[id]) { v[id] = p.kdy[id]; if (p.precist) precist.push(id); } });
  }
  return { vedomi: W.omezVedomi(v, ted), ids: p.zrusit ? p.ids.slice() : p.ids.filter((id) => p.kdy[id]), precist, neprecist };
}

/** Položky víc konverzací (hromadné akce) dohromady – jeden příkaz IMAP na celý výběr. */
function polozkyKonverzaci(stav, ids) {
  return [].concat(...(ids || []).map((id) => polozkyKonverzace(stav, id)));
}

module.exports = {
  VERZE_STAVU, rozsah, rozeberPolozku, polozkyKonverzace, polozkyKonverzaci, chybaAkce,
  najdiSlozky, zajistiSlozku, otiskSlozek, synchronizuj, nactiDetail, oznacPrecteno, presunKonverzaci, vratitPresun, najdiZpravu, odesli, upravKopii,
  vedomiPoAkci
};
