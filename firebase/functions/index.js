// Firebase Functions pro Asistenta (projekt asistent-michal, Frankfurt).
//   obnovAsistenta – každých 10 minut (6:00–23:00) připraví data z motoru do Firestore: uzivatele/{uid}/data/{id}
//   obnovHned      – totéž na požádání z aplikace (při otevření se starými daty a po změně), jen pro přihlášeného
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
const { obnov, otisk, platnePripojeni, mrizkaMesice } = require('./obnova');

initializeApp();
const db = getFirestore();
const NASTAVENI = { region: 'europe-west3', memory: '256MiB', timeoutSeconds: 120, maxInstances: 2 };
const MAX_DOKUMENT = 1000000;      // bajtů – Firestore unese 1 MiB na dokument
const NEJDRIV_ZNOVU = 45e3;        // obnovHned častěji nepouští (aplikace ho volá při otevření a po změnách)

async function obnovUzivatele(uid, pripojeni) {
  const v = await obnov(pripojeni);
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
  // minulý měsíc kalendáře už se neobnovuje – pryč, ať v aplikaci nezůstane stará kopie
  const minuly = 'kalendar_' + mrizkaMesice(v.kdy, -1).klic;
  zapis.delete(ref(minuly));
  potvrzeno[minuly] = FieldValue.delete();
  zapis.set(ref('_stav'), { kdy: v.kdy, potvrzeno, chyby: v.chyby.slice(0, 10) }, { merge: true });
  await zapis.commit();
  if (v.chyby.length) logger.warn('obnova s chybami', { chyby: v.chyby.slice(0, 10) });
  return { kdy: v.kdy, zmeneno, chyby: v.chyby };
}

exports.obnovAsistenta = onSchedule(Object.assign({ schedule: '*/10 6-22 * * *', timeZone: 'Europe/Prague' }, NASTAVENI), async () => {
  const uzivatele = await db.collection('uzivatele').get();
  await Promise.all(uzivatele.docs.filter((d) => platnePripojeni(d.get('pripojeni')))
    .map((d) => obnovUzivatele(d.id, d.get('pripojeni')).catch((e) => logger.error('obnova selhala', { chyba: String(e && e.message || e) }))));
});

exports.obnovHned = onCall(NASTAVENI, async (pozadavek) => {
  if (!pozadavek.auth) throw new HttpsError('unauthenticated', 'Nejdřív se přihlas.');
  const uid = pozadavek.auth.uid;
  const [ucet, stav] = await db.getAll(db.doc('uzivatele/' + uid), db.doc('uzivatele/' + uid + '/data/_stav'));
  const pripojeni = ucet.exists ? ucet.get('pripojeni') : null;
  if (!platnePripojeni(pripojeni)) throw new HttpsError('failed-precondition', 'V účtu ještě není uložené připojení k motoru.');
  if (stav.exists && Date.now() - (stav.get('kdy') || 0) < NEJDRIV_ZNOVU) return { kdy: stav.get('kdy'), preskoceno: true };
  const v = await obnovUzivatele(uid, pripojeni);
  return { kdy: v.kdy, zmeneno: v.zmeneno, chyby: v.chyby };
});
