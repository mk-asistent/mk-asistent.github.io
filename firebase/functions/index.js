// Firebase Functions pro Asistenta (projekt asistent-michal; funkce v Belgii europe-west1, databáze eur3 – Evropa).
//   obnovAsistenta – každých 10 minut (6:00–23:50) připraví data z motoru do Firestore: uzivatele/{uid}/data/{id};
//                    co se mění málo (fotbal, nastavení, reely), jen po svém intervalu (obnova.js INTERVALY_MIN)
//   obnovHned      – totéž na požádání z aplikace (při otevření se starými daty; Obnovit s vse = všechno); po změně
//                    z aplikace s jen = jen dotčené oblasti (poznámka → schránka za pár vteřin, bez čekání na poštu)
// Adresu motoru a klíč čte z Firestore (uzivatele/{uid}.pripojeni) – uloží je tam aplikace po přihlášení účtem.
// V kódu žádná adresa ani klíč nejsou (repo je veřejné).
//
// Dokumenty: data/{id} = { json: text JSON, otisk, kdy, parametry } – přepisují se, jen když se obsah změnil;
// data/_stav = { kdy, potvrzeno: { id: ms }, chyby } – kdy server naposledy ověřil, že kopie odpovídá motoru.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { obnov, otisk, platnePripojeni, mrizkaMesice, coPreskocit, platneOblasti } = require('./obnova');

initializeApp();
const db = getFirestore();
const NASTAVENI = { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 120, maxInstances: 2 };
const MAX_DOKUMENT = 1000000;      // bajtů – Firestore unese 1 MiB na dokument
const NEJDRIV_ZNOVU = 45e3;        // obnovHned častěji nepouští (aplikace ho volá při otevření a po změnách)

async function obnovUzivatele(uid, pripojeni, vse, stavDoc, jen) {
  const ted = Date.now();
  const st = stavDoc || await db.doc('uzivatele/' + uid + '/data/_stav').get();
  const v = await obnov(pripojeni, { ted, jen, preskocit: jen ? [] : coPreskocit(st.exists ? st.get('potvrzeno') : null, ted, vse) });
  const ref = (id) => db.doc('uzivatele/' + uid + '/data/' + id);
  const idy = Object.keys(v.data);
  const stare = idy.length ? await db.getAll(...idy.map(ref)) : [];
  const zapis = db.batch();
  const potvrzeno = {}, zmeneno = [];
  idy.forEach((id, i) => {
    const json = JSON.stringify(v.data[id].data);
    const velikost = Buffer.byteLength(json, 'utf8');
    if (velikost > MAX_DOKUMENT) { v.chyby.push(id + ': ' + Math.round(velikost / 1024) + ' kB, na databázi moc'); return; }
    potvrzeno[id] = v.kdy;
    const o = otisk(v.data[id].data);
    if (stare[i].exists && stare[i].get('otisk') === o) return;
    zapis.set(ref(id), { json, otisk: o, kdy: v.kdy, parametry: v.data[id].parametry || null });
    zmeneno.push(id);
  });
  if (jen) {
    // částečná obnova: jen potvrzení obnovených kopií – čas celé obnovy (kdy) zůstává, podle něj se řídí otevření aplikace
    zapis.set(ref('_stav'), { potvrzeno, castecne: { kdy: v.kdy, jen, chyby: v.chyby.slice(0, 5) } }, { merge: true });
  } else {
    // minulý měsíc kalendáře už se neobnovuje – pryč, ať v aplikaci nezůstane stará kopie
    const minuly = 'kalendar_' + mrizkaMesice(v.kdy, -1).klic;
    zapis.delete(ref(minuly));
    potvrzeno[minuly] = FieldValue.delete();
    zapis.set(ref('_stav'), { kdy: v.kdy, potvrzeno, chyby: v.chyby.slice(0, 10) }, { merge: true });
  }
  await zapis.commit();
  if (v.chyby.length) logger.warn('obnova s chybami', { jen: jen || 'vse', chyby: v.chyby.slice(0, 10) });
  return { kdy: v.kdy, zmeneno, chyby: v.chyby };
}

exports.obnovAsistenta = onSchedule(Object.assign({ schedule: '*/10 6-23 * * *', timeZone: 'Europe/Prague' }, NASTAVENI), async () => {
  const uzivatele = await db.collection('uzivatele').get();
  await Promise.all(uzivatele.docs.filter((d) => platnePripojeni(d.get('pripojeni')))
    .map((d) => obnovUzivatele(d.id, d.get('pripojeni'), false).catch((e) => logger.error('obnova selhala', { chyba: String(e && e.message || e) }))));
});

exports.obnovHned = onCall(NASTAVENI, async (pozadavek) => {
  if (!pozadavek.auth) throw new HttpsError('unauthenticated', 'Nejdřív se přihlas.');
  const uid = pozadavek.auth.uid;
  const [ucet, stav] = await db.getAll(db.doc('uzivatele/' + uid), db.doc('uzivatele/' + uid + '/data/_stav'));
  const pripojeni = ucet.exists ? ucet.get('pripojeni') : null;
  if (!platnePripojeni(pripojeni)) throw new HttpsError('failed-precondition', 'V účtu ještě není uložené připojení k motoru.');
  const d = pozadavek.data || {};
  // po změně z aplikace jen dotčené oblasti – bez omezení 45 s (jinak by se změna ostatním zařízením ukázala až za 10 min)
  const jen = platneOblasti(d.jen);
  if (!jen && stav.exists && Date.now() - (stav.get('kdy') || 0) < NEJDRIV_ZNOVU) return { kdy: stav.get('kdy'), preskoceno: true };
  const v = await obnovUzivatele(uid, pripojeni, !!d.vse, stav, jen);
  return { kdy: v.kdy, zmeneno: v.zmeneno, chyby: v.chyby, jen: jen || undefined };
});

// ================================================================ WEDOS – pracovní schránka přímo (IMAP + SMTP)
// Server se k pracovní schránce (doména u WEDOS) přihlašuje sám – bez přeposílání do Gmailu: IMAP čte Doručené
// a Odeslané, SMTP odesílá z pracovní adresy. Heslo je JEN v Secret Manageru (WEDOS_HESLO – uloží ho Michal příkazem
// z firebase/NASAZENI.md), nikdy ve Firestore, v kódu ani v logu. Adresa a servery: uzivatele/{uid}.wedos =
// { adresa, imap, smtp, jmeno } (zapisuje aplikace, servery jen *.wedos.net). Pro aplikaci: kopie data/wedos (jako
// ostatní kopie, _stav.potvrzeno.wedos), detaily wedosDetaily/{id}; vnitřní stav serveru wedosInterni/stav (aplikace ho
// nečte), id odeslaných wedosOdeslano/{idOdeslani} (e-mail se po opakovaném pokusu nepošle dvakrát).
//   obnovWedos – každých 10 minut (6:00–23:50): STATUS složek, při změně nový seznam (wedos_schranka.synchronizuj)
//   wedos      – z aplikace: obnov | detail | precteno | archivovat | smazat | vratit | odeslat | vypnout
// Funkce s heslem jsou zvlášť: obnovAsistenta a obnovHned se nasazují i bez uloženého hesla.
//
// Heslo = tajemství WEDOS_HESLO v Secret Manageru; funkcím ho připojí volba `secrets` (Cloud Run ho při startu instance
// dá do proměnné prostředí, verze se zafixuje při nasazení). Záměrně jménem, ne defineSecret(): firebase-tools (ověřeno
// ve verzi 15.33, deploy/functions/params.js ensureSecret) s defineSecret při KAŽDÉM nasazení funkcí – i jen obnovHned –
// vyžaduje, aby tajemství už existovalo (neinteraktivně skončí chybou, interaktivně se ptá na heslo). Takhle jde
// nasadit `--only functions:obnovAsistenta,functions:obnovHned` i dřív, než Michal heslo uloží.

const W = require('./wedos');
const S = require('./wedos_schranka');

const WEDOS_HESLO = 'WEDOS_HESLO';
const hesloWedos = () => String(process.env[WEDOS_HESLO] || '');
const NASTAVENI_WEDOS = { region: 'europe-west1', memory: '512MiB', timeoutSeconds: 120, maxInstances: 3, secrets: [WEDOS_HESLO] };

// knihovny pošty se načtou až při použití (test.js běží i bez npm install)
function klientImap(n, heslo) {
  const { ImapFlow } = require('imapflow');
  const klient = new ImapFlow({ host: n.imap, port: W.PORT_IMAP, secure: true, auth: { user: n.adresa, pass: heslo }, logger: false,
    disableAutoIdle: true, connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 60000 });
  klient.on('error', () => { /* spojení spadlo – chyba přijde i jako výjimka příkazu; bez posluchače by proces spadl */ });
  return klient;
}
function prenosSmtp(n, heslo) {
  return require('nodemailer').createTransport({ host: n.smtp, port: W.PORT_SMTP, secure: true, auth: { user: n.adresa, pass: heslo },
    connectionTimeout: 20000, greetingTimeout: 15000, socketTimeout: 60000, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true });
}
function rozeber(zdroj) {
  return require('mailparser').simpleParser(zdroj, { keepCidLinks: true, skipTextToHtml: true, skipImageLinks: true, skipTextLinks: true });
}

const cestyWedos = (uid) => ({
  stav: db.doc('uzivatele/' + uid + '/wedosInterni/stav'),
  data: db.doc('uzivatele/' + uid + '/data/wedos'),
  potvrzeni: db.doc('uzivatele/' + uid + '/data/_stav'),
  detail: (id) => db.doc('uzivatele/' + uid + '/wedosDetaily/' + id),
  detaily: db.collection('uzivatele/' + uid + '/wedosDetaily'),
  odeslano: db.collection('uzivatele/' + uid + '/wedosOdeslano')
});

/**
 * Uloží výsledek práce se schránkou – jen když mezitím nezapsal novější běh (zacatek): stav serveru, kopii pro aplikaci
 * (jen při změně obsahu) a potvrzení kopie v data/_stav; detaily až potom (velké – mimo transakci).
 * v = { stav, data? (nová kopie) | uprava? (kopie → kopie), chyba?, detaily?, smazatDetaily? }
 */
async function ulozWedos(uid, zacatek, v) {
  const c = cestyWedos(uid);
  const kdy = Date.now();
  const r = await db.runTransaction(async (t) => {
    const [s, d] = await t.getAll(c.stav, c.data);
    if (s.exists && (s.get('zacatek') || 0) > zacatek) return { prehnano: true };
    let data = v.data;
    if (!data) {
      let pred = null;
      try { pred = d.exists ? JSON.parse(d.get('json')) : null; } catch (e) { pred = null; }
      data = pred || { ted: kdy, pracovniAdresa: '', pracovni: [], pocty: { neprectene: 0, konverzaci: 0, celkem: 0 }, slozky: {} };
      if (v.uprava) data = v.uprava(data);
      data = Object.assign({}, data, { chyba: v.chyba || null });
    }
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json, 'utf8') > MAX_DOKUMENT) throw new Error('wedos: kopie je na databázi moc velká');
    const o = otisk(data);
    const zmeneno = !d.exists || d.get('otisk') !== o;
    if (zmeneno) t.set(c.data, { json, otisk: o, kdy, parametry: null });
    t.set(c.stav, Object.assign({}, v.stav, { zacatek }));
    if (!v.chyba) t.set(c.potvrzeni, { potvrzeno: { wedos: kdy } }, { merge: true });
    return { zmeneno };
  });
  if (r.prehnano) return r;
  const detaily = v.detaily || {};
  await Promise.all(Object.keys(detaily).map((id) => c.detail(id).set({ json: JSON.stringify(detaily[id]), kdy }))
    .concat((v.smazatDetaily || []).map((id) => c.detail(id).delete())));
  return r;
}

/**
 * Práce se schránkou: pauza po špatném heslu, přihlášení, prace(klient, předchozí stav, začátek, heslo) → v, uložení.
 * Chyba přihlášení / serveru se zapíše do kopie (aplikace ji ukáže) a další běh to zkusí znovu (po špatném hesle
 * s rostoucí pauzou – server se nebombarduje). Chyba akce („zpráva už není“) jde jen aplikaci. rucne = z aplikace.
 */
async function sWedos(uid, n, volby, prace) {
  const o = volby || {};
  const c = cestyWedos(uid);
  const zacatek = Date.now();
  const s = await c.stav.get();
  const predchozi = s.exists ? s.data() : null;
  const revize = process.env.K_REVISION || '';
  const smi = W.smiPrihlasit(predchozi, n, zacatek, { rucne: o.rucne, revize });
  if (!smi.smi) {
    if (o.rucne) throw new HttpsError('failed-precondition', smi.text);
    return { preskoceno: smi.text };
  }
  const heslo = hesloWedos();
  let v = null, chyba = null;
  if (!heslo.trim()) {
    chyba = { druh: 'nastaveni', text: 'Heslo k pracovní schránce není na serveru uložené – návod je v Nastavení → Pošta.' };
  } else {
    const klient = klientImap(n, heslo);
    try {
      await klient.connect();
      v = await prace(klient, predchozi, zacatek, heslo);
    } catch (e) {
      if (e && ['akce', 'nenalezeno', 'vstup'].indexOf(e.wedosDruh) >= 0) {
        throw new HttpsError(e.wedosDruh === 'nenalezeno' ? 'not-found' : e.wedosDruh === 'vstup' ? 'invalid-argument' : 'aborted', e.message);
      }
      chyba = W.chybaProUzivatele(e, n, heslo);
    } finally {
      try { await klient.logout(); } catch (e) { try { klient.close(); } catch (x) { /* nic */ } }
    }
  }
  if (chyba) {
    chyba.kdy = zacatek;
    const stav = Object.assign({}, predchozi || {}, { prihlaseni: W.prihlaseniPoPokusu(predchozi, n, zacatek, chyba, revize), chyba });
    await ulozWedos(uid, zacatek, { stav, chyba });
    logger.warn('wedos: ' + chyba.druh); // bez textu chyby a adres
    if (o.rucne) throw new HttpsError(chyba.druh === 'heslo' ? 'permission-denied' : 'unavailable', chyba.text);
    return { chyba: chyba.text };
  }
  const ulozeno = await ulozWedos(uid, zacatek, v);
  return Object.assign({}, v, ulozeno);
}

function obnovWedosUzivatele(uid, n, volby) {
  const o = volby || {};
  return sWedos(uid, n, o, (klient, predchozi, zacatek) => S.synchronizuj({ klient, rozeber, nastaveni: n, predchozi, ted: zacatek, vynutit: !!o.vynutit }));
}

/** Akce IMAP: chyba serveru u akce (ne spojení) → srozumitelná chyba akce, kopie a stav se nemění. */
async function bezpecneAkce(n, fn) {
  try {
    return await fn();
  } catch (e) {
    const ch = W.chybaProUzivatele(e, n);
    if (e && e.wedosDruh) throw e;
    if (ch.druh === 'server' || ch.druh === 'heslo') throw e;
    throw S.chybaAkce(ch.text.replace(/^Chyba pracovní pošty: /, 'Akce se nepovedla: '));
  }
}

function polozkyNeboChyba(predchozi, id) {
  const polozky = S.polozkyKonverzace(predchozi, id);
  if (!polozky.length) throw S.chybaAkce('Konverzace už ve schránce není – obnov poštu.', 'nenalezeno');
  return polozky;
}

const slozkyZeStavu = async (klient, predchozi) => (predchozi && predchozi.slozky && predchozi.slozky.d ? Object.assign({}, predchozi.slozky) : S.najdiSlozky(klient));

/** Detail konverzace přímo ze schránky (a do wedosDetaily); precist = označit přečtenou. */
async function detailWedos(uid, n, id, precist) {
  let detail = null;
  await sWedos(uid, n, { rucne: true }, async (klient, predchozi) => {
    const polozky = polozkyNeboChyba(predchozi, id);
    const slozky = await slozkyZeStavu(klient, predchozi);
    detail = await bezpecneAkce(n, () => S.nactiDetail(klient, rozeber, slozky, id, polozky, n.adresa));
    if (precist && detail.zpravy.length) await bezpecneAkce(n, () => S.oznacPrecteno(klient, slozky, polozky, true));
    const otiskD = W.otiskDetailu(predchozi.konverzace[id], predchozi.uv);
    return { stav: Object.assign({}, predchozi, { detaily: Object.assign({}, predchozi.detaily, { [id]: otiskD }) }),
      uprava: precist ? (d) => S.upravKopii(d, id, 'precteno') : null, detaily: { [id]: detail } };
  });
  return detail;
}

/** Akce z aplikace nad konverzací nebo odeslání; po akci se kopie upraví hned (přečteno, pryč) nebo složí znovu. */
async function akceWedos(uid, n, akce, d) {
  let vysledek = { ok: true };
  await sWedos(uid, n, { rucne: true }, async (klient, predchozi, zacatek, heslo) => {
    if (akce === 'odeslat') {
      const pozadavek = W.pozadavekOdeslani(d);
      const c = cestyWedos(uid);
      if (pozadavek.idOdeslani) {
        try {
          await c.odeslano.doc(pozadavek.idOdeslani).create({ kdy: Date.now() });
        } catch (e) {
          if (e && (e.code === 6 || /already exists/i.test(String(e.message)))) { vysledek = { jizOdeslano: true }; return { stav: predchozi || {} }; }
          throw e;
        }
      }
      const slozky = await slozkyZeStavu(klient, predchozi);
      let r;
      try {
        r = await bezpecneAkce(n, () => S.odesli({ klient, rozeber, transport: prenosSmtp(n, heslo), Skladac: require('nodemailer/lib/mail-composer'),
          nastaveni: n, slozky, stav: predchozi, pozadavek, ted: Date.now() }));
      } catch (e) {
        if (pozadavek.idOdeslani) await c.odeslano.doc(pozadavek.idOdeslani).delete().catch(() => { /* příště se pošle */ });
        throw e;
      }
      vysledek = { odeslano: true, kopie: r.kopie };
      // seznam znovu (odpověď = „čekáš na ně“); když se nepovede, odeslání platí a srovná to další obnova
      try { return await S.synchronizuj({ klient, rozeber, nastaveni: n, predchozi, ted: Date.now(), vynutit: true }); } catch (e) { return { stav: predchozi || {} }; }
    }
    if (!predchozi || !predchozi.konverzace) throw S.chybaAkce('Pošta ještě není načtená – obnov ji.', 'nenalezeno');
    const slozky = await slozkyZeStavu(klient, predchozi);
    if (akce === 'precteno') {
      const polozky = polozkyNeboChyba(predchozi, d.id);
      const precteno = d.precteno !== false;
      await bezpecneAkce(n, () => S.oznacPrecteno(klient, slozky, polozky, precteno));
      return { stav: Object.assign({}, predchozi, { slozky }), uprava: (x) => S.upravKopii(x, d.id, precteno ? 'precteno' : 'neprectene') };
    }
    if (akce === 'archivovat' || akce === 'smazat') {
      const polozky = polozkyNeboChyba(predchozi, d.id);
      const p = await bezpecneAkce(n, () => S.presunKonverzaci(klient, slozky, polozky, akce === 'archivovat' ? 'archiv' : 'kos'));
      vysledek = { ok: true, slozka: p.cil, presunuto: p.presunuto, vratit: p.uidy.length > 0 };
      const konverzace = Object.assign({}, predchozi.konverzace);
      delete konverzace[d.id];
      return { stav: Object.assign({}, predchozi, { slozky, konverzace, posledniPresun: { id: d.id, cil: p.cil, uidy: p.uidy, kdy: zacatek } }),
        uprava: (x) => S.upravKopii(x, d.id, 'pryc'), smazatDetaily: [d.id] };
    }
    if (akce === 'vratit') {
      const presun = predchozi.posledniPresun;
      if (!presun || presun.id !== d.id) throw S.chybaAkce('Vrátit jde jen naposledy přesunutou konverzaci – najdeš ji ve složce archivu nebo koše.');
      await bezpecneAkce(n, () => S.vratitPresun(klient, slozky, presun));
      const v = await S.synchronizuj({ klient, rozeber, nastaveni: n, predchozi: Object.assign({}, predchozi, { posledniPresun: null }), ted: Date.now(), vynutit: true });
      v.stav.posledniPresun = null;
      return v;
    }
    throw S.chybaAkce('Neznámá akce.', 'vstup');
  });
  return vysledek;
}

/** Vypnutí: pryč kopie, detaily, vnitřní stav i značky odeslání (nastavení v účtu smaže aplikace). */
async function smazWedos(uid) {
  const c = cestyWedos(uid);
  const [detaily, odeslano] = await Promise.all([c.detaily.get(), c.odeslano.get()]);
  const zapis = db.batch();
  detaily.docs.concat(odeslano.docs).slice(0, 450).forEach((x) => zapis.delete(x.ref));
  zapis.delete(c.data);
  zapis.delete(c.stav);
  zapis.set(c.potvrzeni, { potvrzeno: { wedos: FieldValue.delete() } }, { merge: true });
  await zapis.commit();
}

/** Značky odeslání starší týdne pryč (opakovaný pokus přichází do minut). */
async function uklidOdeslanych(uid) {
  const stare = await cestyWedos(uid).odeslano.where('kdy', '<', Date.now() - 7 * 864e5).limit(100).get();
  if (!stare.empty) { const z = db.batch(); stare.docs.forEach((x) => z.delete(x.ref)); await z.commit(); }
}

exports.obnovWedos = onSchedule(Object.assign({ schedule: '*/10 6-23 * * *', timeZone: 'Europe/Prague' }, NASTAVENI_WEDOS, { timeoutSeconds: 300 }), async () => {
  const uzivatele = await db.collection('uzivatele').get();
  await Promise.all(uzivatele.docs.map((d) => ({ uid: d.id, n: W.platneNastaveni(d.get('wedos')) })).filter((x) => x.n)
    .map((x) => obnovWedosUzivatele(x.uid, x.n, {})
      .then(() => uklidOdeslanych(x.uid))
      .catch((e) => logger.error('wedos: obnova selhala', { druh: W.chybaProUzivatele(e).druh }))));
});

exports.wedos = onCall(NASTAVENI_WEDOS, async (pozadavek) => {
  if (!pozadavek.auth) throw new HttpsError('unauthenticated', 'Nejdřív se přihlas.');
  const uid = pozadavek.auth.uid;
  const d = pozadavek.data || {};
  const akce = String(d.akce || '');
  if (akce === 'vypnout') { await smazWedos(uid); return { vypnuto: true }; }
  const ucet = await db.doc('uzivatele/' + uid).get();
  const n = W.platneNastaveni(ucet.exists ? ucet.get('wedos') : null);
  if (!n) throw new HttpsError('failed-precondition', 'Pracovní schránka není nastavená (Nastavení → Pošta).');
  if (['detail', 'precteno', 'archivovat', 'smazat', 'vratit'].indexOf(akce) >= 0 && !W.JE_ID.test(String(d.id || ''))) {
    throw new HttpsError('invalid-argument', 'Neplatné id konverzace.');
  }
  if (akce === 'obnov') {
    const v = await obnovWedosUzivatele(uid, n, { vynutit: !!d.vynutit, rucne: true });
    const data = v.data || null;
    return { kdy: Date.now(), zmeneno: !!v.zmeneno, bezeZmeny: !!v.bezeZmeny, prehnano: !!v.prehnano,
      konverzaci: data ? data.pocty.konverzaci : undefined, neprectene: data ? data.pocty.neprectene : undefined };
  }
  if (akce === 'detail') return { detail: await detailWedos(uid, n, d.id, !!d.precist) };
  if (['precteno', 'archivovat', 'smazat', 'vratit', 'odeslat'].indexOf(akce) >= 0) return akceWedos(uid, n, akce, d);
  throw new HttpsError('invalid-argument', 'Neznámá akce.');
});
