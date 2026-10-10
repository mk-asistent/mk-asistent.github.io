// Kouřový test motoru (apps-script/Kod.gs) s napodobenými službami Googlu – node apps-script/test/motor.test.js
// Ověřuje vstup doPost (klíč, akce), poštu se dvěma účty, odesílání z pracovní adresy a kalendář (Google + .ics).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

const KLIC = 'testovaci-klic';
const PRAC = 'michal@firma.test';
const JA = 'osobni@gmail.test';

// ---------------------------------------------------------------- napodobené služby
function prostredi() {
  const vlastnosti = new Map([['API_KLIC', KLIC]]);
  const cache = new Map();
  const ttl = new Map(); // doba platnosti uložených hodnot (s)
  const log = { odeslano: [], precteno: [], stazeno: 0, archiv: [], doDorucenych: [], neprecteno: [] };

  const zprava = (o) => ({
    getId: () => o.id, getFrom: () => o.od, getTo: () => o.komu || JA, getCc: () => o.kopie || '', getBcc: () => o.skryta || '',
    getReplyTo: () => o.odpovedNa || o.od,
    getHeader: (h) => (h === 'Message-ID' ? '<' + o.id + '@mail.test>' : h === 'Delivered-To' ? (o.dorucenoNa || '') : ''),
    getPlainBody: () => o.text, getBody: () => (o.html != null ? o.html : '<p>' + o.text + '</p>'), getDate: () => new Date(o.kdy),
    getSubject: () => o.predmet, isInTrash: () => false, isDraft: () => false, isUnread: () => !!o.neprectena, isStarred: () => !!o.hvezdicka,
    getAttachments: () => (o.priloha ? [{ getName: () => 'nabidka.pdf', getSize: () => 12345 }] : []),
    reply: (t, m) => log.odeslano.push({ jak: 'reply', id: o.id, t, m }),
    replyAll: (t, m) => log.odeslano.push({ jak: 'replyAll', id: o.id, t, m }),
    forward: (komu, m) => log.odeslano.push({ jak: 'forward', id: o.id, komu, m })
  });
  const stitkyVlaken = {}; // id vlákna → jména štítků Gmailu
  const vlakno = (id, zpravy, neprectene) => {
    let vDorucenych = true;
    return {
      getLabels: () => { log.getLabels = (log.getLabels || 0) + 1; return (stitkyVlaken[id] || []).map((n) => ({ getName: () => n })); },
      getId: () => id, getMessageCount: () => zpravy.length, _neprectene: neprectene, // _neprectene: jen pro napodobené hledání is:unread
      // tyhle stojí každá jedno volání Gmailu – v seznamech se nesmí volat (počítá log.drahe)
      getFirstMessageSubject: () => { log.drahe = (log.drahe || 0) + 1; return zpravy[0].getSubject(); },
      getLastMessageDate: () => { log.drahe = (log.drahe || 0) + 1; return zpravy[zpravy.length - 1].getDate(); },
      isUnread: () => { log.drahe = (log.drahe || 0) + 1; return neprectene; },
      isImportant: () => { log.drahe = (log.drahe || 0) + 1; return false; },
      hasStarredMessages: () => { log.drahe = (log.drahe || 0) + 1; return false; },
      getMessages: () => zpravy, isInInbox: () => vDorucenych,
      markRead: () => log.precteno.push(id), markUnread: () => log.neprecteno.push(id),
      moveToArchive: () => { vDorucenych = false; log.archiv.push(id); },
      moveToInbox: () => { vDorucenych = true; log.doDorucenych.push(id); }
    };
  };
  const ted = Date.UTC(2026, 9, 2, 15);
  const m1 = zprava({ id: 'm1', od: 'Trenér <trener@klub.test>', predmet: 'Sraz v sobotu', text: 'Ahoj, sraz v 8:30.', kdy: ted - 36e5, neprectena: true });
  const m2 = zprava({ id: 'm2', od: 'Investor <info@stavba.test>', komu: PRAC, predmet: 'Předávací protokol', text: 'Posílám protokol.', kdy: ted - 2 * 36e5, priloha: true });
  const m3 = zprava({ id: 'm3', od: 'Já <' + PRAC + '>', komu: 'info@stavba.test', predmet: 'Re: Předávací protokol', text: 'Děkuji.', kdy: ted - 36e5 });
  // odeslaná pošta: trenérovi jsem psal → je to „známý“
  const m4 = zprava({ id: 'm4', od: 'Já <' + JA + '>', komu: 'Trenér <trener@klub.test>', predmet: 'Omluva', text: 'Dnes nepřijdu.', kdy: ted - 5 * 864e5 });
  const vlakna = { v1: vlakno('v1', [m1], true), v2: vlakno('v2', [m2, m3], false), v3: vlakno('v3', [m4], false) };
  let aliasy = [];
  let stitkyGmailu = {}; // název → { neprectenych, vlakna }

  const zpravy = { m1, m2, m3 };
  let aktualizace = []; // vlákna v kategorii Aktualizace (oznámení)
  let kategorieVlaken = {}; // promotions / social / forums → vlákna (záložky jako v Gmailu)
  let odeslana = [vlakna.v2, vlakna.v3]; // výsledek „in:sent …“ (známí lidé)
  let starsi = { osobni: [], pracovni: [] }; // výsledek druhého okna „older_than:30d newer_than:90d“
  const GmailApp = {
    search: (q, od, max) => {
      log.dotazy = (log.dotazy || []).concat(q);
      (log.maxima = log.maxima || {})[q] = max;
      // „rfc822msgid:<id> {to:… }“ = šla tahle zpráva na pracovní adresu?
      const m = /rfc822msgid:(\S+)@mail\.test/.exec(q);
      if (m) return zpravy[m[1]] && zpravy[m[1]].getTo() === PRAC && q.indexOf('{to:' + PRAC) >= 0 ? [vlakna.v2] : [];
      if (q.indexOf('category:updates') >= 0) return aktualizace;
      const kat = /(?:^|\s)category:(promotions|social|forums)\b/.exec(q);
      if (kat) { const v = kategorieVlaken[kat[1]] || []; return q.indexOf('is:unread') >= 0 ? v.filter((x) => x._neprectene) : v; }
      if (q.indexOf('in:sent') >= 0) return odeslana;
      if (q.indexOf('older_than:') >= 0) return q.indexOf('{to:') >= 0 ? starsi.pracovni : starsi.osobni;
      return q.indexOf('{to:') >= 0 ? [vlakna.v2] : [vlakna.v1];
    },
    moveThreadToSpam: (v) => { log.spam = v.getId(); },
    moveThreadToInbox: (v) => { log.zeSpamu = (log.zeSpamu || []).concat(v.getId()); v.moveToInbox(); },
    getMessagesForThreads: (v) => { log.nacteniZprav = (log.nacteniZprav || 0) + 1; return v.map((x) => x.getMessages()); },
    getThreadById: (id) => vlakna[id] || null,
    getMessageById: (id) => ({ m1, m2, m3 })[id] || null,
    getAliases: () => aliasy,
    getUserLabels: () => Object.keys(stitkyGmailu).map((n) => ({ getName: () => n, getUnreadCount: () => stitkyGmailu[n].neprectenych })),
    getUserLabelByName: (n) => (stitkyGmailu[n] ? { getName: () => n, getThreads: (od, max) => stitkyGmailu[n].vlakna.slice(od, od + max),
      addToThread: (v) => { stitkyVlaken[v.getId()] = (stitkyVlaken[v.getId()] || []).filter((x) => x !== n).concat(n); },
      removeFromThread: (v) => { stitkyVlaken[v.getId()] = (stitkyVlaken[v.getId()] || []).filter((x) => x !== n); } } : null),
    createLabel: (n) => { stitkyGmailu[n] = { neprectenych: 0, vlakna: [] }; log.zalozenyStitek = n; return GmailApp.getUserLabelByName(n); },
    markThreadsRead: (v) => v.forEach((x) => x.markRead()),
    getInboxUnreadCount: () => 1,
    sendEmail: (komu, predmet, text, m) => log.odeslano.push({ jak: 'send', komu, predmet, t: text, m })
  };

  const udalostG = (nazev, z, k, celodenni) => ({
    getId: () => 'g-' + nazev, getTitle: () => nazev, isAllDayEvent: () => !!celodenni, isRecurringEvent: () => false, getGuestList: () => [],
    getStartTime: () => new Date(z), getEndTime: () => new Date(k), getAllDayStartDate: () => new Date(z), getAllDayEndDate: () => new Date(k),
    getLocation: () => '', getDescription: () => 'Popis <b>tučně</b><br>řádek', getColor: () => ''
  });
  const kalendare = [
    { isHidden: () => false, isSelected: () => true, getColor: () => '#9fe1e7', getName: () => 'Osobní', getId: () => 'osobni@gmail.test', isOwnedByMe: () => true,
      getEvents: () => [udalostG('Zubař', Date.UTC(2026, 9, 6, 7), Date.UTC(2026, 9, 6, 8))] },
    { isHidden: () => false, isSelected: () => false, getColor: () => '#000', getName: () => 'Nevybraný', getId: () => 'x', isOwnedByMe: () => false,
      getEvents: () => { throw new Error('nemá se volat'); } }
  ];
  // vlastní kalendář Google se zápisem (vznikne přes createCalendar) – události v paměti
  const jeDatum = (x) => !!x && typeof x.getTime === 'function';
  const vytvorKalendar = (nazevKal) => {
    const udalosti = [];
    const nova = (nazev, z, k, celodenni, moznosti, rada) => {
      const u = { nazev, z: +z, k: +k, celodenni: !!celodenni, misto: (moznosti || {}).location || '', popis: (moznosti || {}).description || '',
        pripomenuti: null, barva: '', stitky: {}, rada: rada || null, smazano: false, id: 'ev-' + (udalosti.length + 1) + '@google.com',
        hoste: (moznosti && moznosti.guests ? moznosti.guests.split(',') : []), pozvanky: !!(moznosti && moznosti.sendInvites) };
      const o = {
        _: u, getId: () => u.id, getTitle: () => u.nazev, isAllDayEvent: () => u.celodenni, isRecurringEvent: () => !!u.rada,
        getStartTime: () => new Date(u.z), getEndTime: () => new Date(u.k), getAllDayStartDate: () => new Date(u.z), getAllDayEndDate: () => new Date(u.k),
        getLocation: () => u.misto, getDescription: () => u.popis, getColor: () => u.barva, getTag: (t) => (t in u.stitky ? u.stitky[t] : null),
        setTitle: (t) => { u.nazev = t; return o; }, setTime: (a, b) => { u.z = +a; u.k = +b; return o; },
        setAllDayDate: (a) => { u.z = +a; u.k = +a + 864e5; u.celodenni = true; return o; },
        setAllDayDates: (a, b) => { u.z = +a; u.k = +b; u.celodenni = true; return o; },
        setLocation: (t) => { u.misto = t; return o; }, setDescription: (t) => { u.popis = t; return o; },
        removeAllReminders: () => { u.pripomenuti = []; return o; }, addPopupReminder: (m) => { (u.pripomenuti = u.pripomenuti || []).push(m); return o; },
        setColor: (c) => { u.barva = c; return o; }, setTag: (t, v) => { u.stitky[t] = v; return o; },
        deleteEvent: () => { u.smazano = true; }, getEventSeries: () => ({ deleteEventSeries: () => { u.smazano = true; u.celaRada = true; } }),
        getGuestList: () => u.hoste.map((a) => ({ getEmail: () => a })), addGuest: (a) => { u.hoste.push(a); return o; },
        removeGuest: (a) => { u.hoste = u.hoste.filter((x) => x !== a); return o; }
      };
      udalosti.push(o);
      return o;
    };
    const kal = {
      udalosti, getName: () => nazevKal, getId: () => nazevKal.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@group.calendar.test',
      isHidden: () => false, isSelected: () => true, getColor: () => '#2e7a4d', isOwnedByMe: () => true,
      setColor() {}, setHidden() {}, setSelected() {},
      getEvents: (a, b) => udalosti.filter((o) => !o._.smazano && o._.z < +b && o._.k > +a),
      createEvent: (n, a, b, m) => nova(n, a, b, false, m),
      createAllDayEvent: (n, a, b, m) => (jeDatum(b) ? nova(n, a, b, true, m) : nova(n, a, +a + 864e5, true, b)),
      createEventSeries: (n, a, b, r, m) => nova(n, a, b, false, m, r),
      createAllDayEventSeries: (n, a, r, m) => nova(n, a, +a + 864e5, true, m, r)
    };
    return kal;
  };
  let rozpis = '';
  const ICS = ['BEGIN:VCALENDAR', 'X-WR-CALNAME:Rodina', 'BEGIN:VEVENT', 'UID:r1', 'SUMMARY:Trénink',
    'DTSTART;TZID=Europe/Prague:20261005T170000', 'DTEND;TZID=Europe/Prague:20261005T183000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

  const pad = (n, d = 2) => String(n).padStart(d, '0');
  const formatDate = (datum, tz, vzor) => {
    const c = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(datum).forEach((p) => { c[p.type] = p.value; });
    const posun = Math.round((Date.UTC(+c.year, c.month - 1, +c.day, c.hour % 24, +c.minute, +c.second) - Math.floor(datum.getTime() / 1000) * 1000) / 6e4);
    const zn = (posun < 0 ? '-' : '+') + pad(Math.floor(Math.abs(posun) / 60)) + pad(Math.abs(posun) % 60);
    if (vzor === 'Z') return zn;
    if (vzor === 'H') return String(c.hour % 24);
    if (vzor === 'u') return String(new Date(Date.UTC(+c.year, c.month - 1, +c.day)).getUTCDay() || 7); // 1 = pondělí … 7 = neděle
    return vzor.replace("'T'", 'T').replace('yyyy', c.year).replace('MM', pad(c.month)).replace('dd', pad(c.day))
      .replace('HH', pad(c.hour % 24)).replace('mm', pad(c.minute)).replace('ss', pad(c.second))
      .replace('XXX', zn.slice(0, 3) + ':' + zn.slice(3)).replace(/^d\. M\./, c.day + '. ' + c.month + '.').replace('H:', (c.hour % 24) + ':');
  };
  // Utilities.parseDate – jen tvar, který motor používá („RRRR-MM-DD HH:mm“ v daném pásmu)
  const parseDate = (text, tz, vzor) => {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/.exec(text);
    if (!m || vzor !== 'yyyy-MM-dd HH:mm') throw new Error('parseDate neumí: ' + text + ' / ' + vzor);
    const zaklad = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
    const posun = (t) => { const z = formatDate(new Date(t), tz, 'Z'); return (z[0] === '-' ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(3)) * 6e4; };
    return new Date(zaklad - posun(zaklad - posun(zaklad)));
  };

  // Disk: schránka CLAUDE_SCHRANKA s podsložkami, soubory v paměti
  const iterator = (pole) => { let i = 0; return { hasNext: () => i < pole.length, next: () => pole[i++] }; };
  const vsechnySoubory = {}; // id → soubor (DriveApp.getFileById)
  let citacZmen = 0;
  const slozka = (nazev, rodic) => {
    const s = { nazev, rodic, deti: {}, soubory: [] };
    s.getId = () => 'slozka-' + nazev; s.getName = () => nazev;
    s.getParents = () => iterator(rodic ? [rodic] : []);
    s.getFoldersByName = (n) => { const x = s.deti[n]; let hotovo = !x; return { hasNext: () => !hotovo, next: () => { hotovo = true; return x; } }; };
    s.getFolders = () => iterator(Object.values(s.deti));
    s.getFiles = () => iterator(s.soubory.filter((x) => !x.vKosi));
    s.getFilesByName = (n) => iterator(s.soubory.filter((x) => !x.vKosi && x.getName() === n));
    s.createFolder = (n) => (s.deti[n] = slozka(n, s));
    s.createFile = (n, obsah) => {
      if (n && typeof n === 'object') { obsah = n; n = n.getName(); } // createFile(blob) – fotka účtenky
      let rodicSouboru = s;
      let upraveno = Date.now() + (citacZmen++); // jako Disk: čas úpravy se mění se změnou obsahu (motor podle něj pamatuje poznámky)
      const f = { vKosi: false, getId: () => 'soubor-' + nazev + '-' + n, getName: () => n,
        getBlob: () => ({ getDataAsString: () => obsah, getBytes: () => (obsah && obsah.getBytes ? obsah.getBytes() : Buffer.from(String(obsah), 'utf8')),
          getContentType: () => (obsah && obsah.getContentType ? obsah.getContentType() : 'text/plain') }),
        getDescription: () => f.popis || null, setDescription: (t) => { f.popis = t; return f; },
        getUrl: () => 'https://drive.google.com/file/d/soubor-' + nazev + '-' + n + '/view',
        getDateCreated: () => new Date(), getLastUpdated: () => new Date(upraveno), getParents: () => iterator([rodicSouboru]),
        setContent: (t) => { obsah = t; upraveno = Date.now() + (citacZmen++); return f; },
        moveTo: (cil) => { rodicSouboru.soubory = rodicSouboru.soubory.filter((x) => x !== f); cil.soubory.push(f); rodicSouboru = cil; return f; },
        setTrashed: (k) => { f.vKosi = !!k; return f; }, isTrashed: () => f.vKosi,
        setSharing: (pristup, pravo) => { f.sdileni = (f.sdileni || []).concat(pristup + ':' + pravo); return f; } };
      s.soubory.push(f); log.soubory = (log.soubory || []).concat({ slozka: nazev, n, obsah });
      vsechnySoubory[f.getId()] = f;
      return f;
    };
    return s;
  };
  const schranka = slozka('CLAUDE_SCHRANKA', null);
  vlastnosti.set('SLOZKA_ID', 'slozka-CLAUDE_SCHRANKA');

  // Tabulky Google (auto): list = pole řádků, zápis po buňkách; vzorec „=D6/$F6“ se spočítá jako v Tabulkách
  const tabulky = {};
  const listTabulky = (nazev, radky) => {
    const b = radky.map((r) => r.slice());
    const formaty = {}, vzorce = {}, odkazy = {}, styly = {}, sirky = {};
    let validace = null;
    const sirka = () => Math.max(1, ...b.map((r) => r.length));
    const zajisti = (r, c) => { while (b.length < r) b.push([]); while (b[r - 1].length < c) b[r - 1].push(''); };
    const index = (pismena) => pismena.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const rozsah = (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const x = (b[r - 1 + i] || [])[c - 1 + j]; return x === undefined ? '' : x; })),
      setValue: (v) => { zajisti(r, c); b[r - 1][c - 1] = v; delete vzorce[r + ':' + c]; },
      setFormula: (f) => {
        zajisti(r, c);
        vzorce[r + ':' + c] = f;
        const m = /^=([A-Z]+)(\d+)\/\$([A-Z]+)(\d+)$/.exec(f);
        b[r - 1][c - 1] = m ? Math.round(b[+m[2] - 1][index(m[1])] / b[+m[4] - 1][index(m[3])] * 100) / 100 : '';
      },
      getNumberFormat: () => formaty[r + ':' + c] || '',
      setNumberFormat: (f) => { formaty[r + ':' + c] = f; },
      clearContent: () => { zajisti(r, c); b[r - 1][c - 1] = ''; delete vzorce[r + ':' + c]; delete odkazy[r + ':' + c]; },
      setRichTextValue: (t) => { zajisti(r, c); b[r - 1][c - 1] = t.text; odkazy[r + ':' + c] = t; },
      // jako Tabulky: getLinkUrl celé buňky jen když odkaz pokrývá celý text, jinak po kouscích (getRuns)
      getRichTextValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
        const o = odkazy[(r + i) + ':' + (c + j)];
        const x = (b[r - 1 + i] || [])[c - 1 + j];
        const text = x === undefined || x === null ? '' : String(x);
        return { getText: () => text, getLinkUrl: () => (o && o.od === 0 && o.do === text.length ? o.odkaz : null),
          getRuns: () => (o ? [{ getLinkUrl: () => null }, { getLinkUrl: () => o.odkaz }] : [{ getLinkUrl: () => null }]) };
      })),
      getDataValidation: () => validace,
      setValues: (v) => { v.forEach((radek, i) => radek.forEach((x, j) => { zajisti(r + i, c + j); b[r - 1 + i][c - 1 + j] = x; })); return rozsah(r, c, nr, nc); },
      setWrap: () => rozsah(r, c, nr, nc), setVerticalAlignment: () => rozsah(r, c, nr, nc),
      setFontWeight: (w) => { styly[r + ':' + nr] = Object.assign({}, styly[r + ':' + nr], { tucne: w === 'bold' }); return rozsah(r, c, nr, nc); },
      setFontSize: (s) => { styly[r + ':' + nr] = Object.assign({}, styly[r + ':' + nr], { velikost: s }); return rozsah(r, c, nr, nc); },
      setBackground: (b2) => { styly[r + ':' + nr] = Object.assign({}, styly[r + ':' + nr], { pozadi: b2 }); return rozsah(r, c, nr, nc); },
      getFontWeights: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, () => ((styly[(r + i) + ':1'] || {}).tucne ? 'bold' : 'normal')))
    });
    return { getName: () => nazev, getLastColumn: sirka, getRange: rozsah, getLastRow: () => b.filter((r) => r.some((x) => x !== '' && x != null)).length ? b.length : 0,
      clear: () => { b.length = 0; }, setColumnWidth: (s, w) => { sirky[s] = w; }, styly, sirky,
      getDataRange: () => ({ getValues: () => b.map((r) => { const x = r.slice(); while (x.length < sirka()) x.push(''); return x; }) }),
      bunky: b, formaty, vzorce, odkazy, nastavValidaci: (v) => { validace = v; } };
  };
  const zalozTabulku = (id, nazev, listy) => {
    const l = {};
    Object.keys(listy).forEach((n) => { l[n] = listTabulky(n, listy[n]); });
    const poradi = Object.keys(l);
    tabulky[id] = { getName: () => nazev, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit', getId: () => id,
      getSheetByName: (n) => l[n] || null, listy: l, poradi,
      getSheets: () => poradi.map((n) => l[n]),
      insertSheet: (n, kam) => { l[n] = listTabulky(n, []); poradi.splice(kam, 0, n); return l[n]; } };
    return tabulky[id];
  };
  let bezPovoleniTabulek = false, ocrText = '', ocrDokumentu = 0;
  // Instagram API (graph.instagram.com): účet, kontejner, stav zpracování, zveřejnění, odkaz, obnova klíče
  // kontejnery a příspěvky se číslují (reel + příběh, plakát + příběh); stav zpracování z fronty stavy (příběh: stavyPribehu)
  const ig = { volani: [], stavy: ['IN_PROGRESS', 'FINISHED'], stavyPribehu: ['FINISHED'], chybaKontejneru: '', chybaPribehu: '', kontejneru: 0, medii: 0, pribehy: {} };
  const odpovedInstagram = (url, moznosti) => {
    const telo = moznosti.payload ? Object.fromEntries(new URLSearchParams(moznosti.payload)) : {};
    const cesta = url.replace(/^https:\/\/graph\.instagram\.com\/(v[\d.]+\/)?/, '').split('?')[0];
    ig.volani.push({ cesta, metoda: moznosti.method || 'get', telo });
    const json = (o, kod) => ({ getResponseCode: () => kod || 200, getContentText: () => JSON.stringify(o) });
    const dalsi = (fronta) => (fronta.length > 1 ? fronta.shift() : fronta[0]);
    if (cesta === 'refresh_access_token') return json({ access_token: 'obnoveny-klic', token_type: 'bearer', expires_in: 5184000 });
    if (cesta === 'me') return json({ user_id: '17841400000', username: 'fkagrovnorovy' });
    if (cesta === '17841400000/media') {
      if (ig.chybaKontejneru) return json({ error: { message: ig.chybaKontejneru } }, 400);
      if (telo.media_type === 'STORIES' && ig.chybaPribehu) return json({ error: { message: ig.chybaPribehu } }, 400);
      const id = 'kontejner-' + (++ig.kontejneru);
      if (telo.media_type === 'STORIES') ig.pribehy[id] = true;
      return json({ id });
    }
    if (/^kontejner-\d+$/.test(cesta)) {
      const s = dalsi(ig.pribehy[cesta] ? ig.stavyPribehu : ig.stavy);
      return json({ status_code: s, status: s === 'ERROR' ? 'Error: video se nepodařilo stáhnout' : s });
    }
    if (cesta === '17841400000/media_publish') { ig.zverejneno = (ig.zverejneno || 0) + 1; return json({ id: 'media-' + (++ig.medii) }); }
    if (cesta === 'media-1') return json({ permalink: 'https://www.instagram.com/reel/TEST123/' });
    if (/^media-\d+$/.test(cesta)) return json({ permalink: 'https://www.instagram.com/p/TEST' + cesta.slice(6) + '/' });
    return json({ error: { message: 'neznámé volání ' + cesta } }, 400);
  };

  const sandbox = {
    DriveApp: { Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' }, Permission: { VIEW: 'VIEW', NONE: 'NONE' },
      getFolderById: (id) => { if (id !== 'slozka-CLAUDE_SCHRANKA') throw new Error('nenalezeno'); return schranka; },
      getFileById: (id) => { if (!vsechnySoubory[id]) throw new Error('Soubor nenalezen'); return vsechnySoubory[id]; } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (vlastnosti.has(k) ? vlastnosti.get(k) : null),
      setProperty: (k, v) => vlastnosti.set(k, String(v)), deleteProperty: (k) => vlastnosti.delete(k),
      getProperties: () => Object.fromEntries(vlastnosti)
    }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; } }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache.has(k) ? cache.get(k) : null),
      put: (k, v, s) => { cache.set(k, String(v)); ttl.set(k, s); },
      getAll: (ks) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])),
      putAll: (o, s) => Object.entries(o).forEach(([k, v]) => { assert.ok(v.length <= 100000); cache.set(k, v); ttl.set(k, s); }),
      remove: (k) => cache.delete(k)
    }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), formatDate, parseDate,
      newBlob: (s, typ, jmeno) => ({ getBytes: () => (Array.isArray(s) || Buffer.isBuffer(s) ? Buffer.from(s) : Buffer.from(String(s), 'utf8')),
        getName: () => jmeno || '', getContentType: () => typ || 'text/plain' }),
      base64Decode: (t) => Array.from(Buffer.from(t, 'base64')),
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      sleep: () => {},
      DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => Array.from(crypto.createHash(alg || 'md5').update(text, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b))
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => JA }) },
    SpreadsheetApp: {
      openById: (id) => {
        if (bezPovoleniTabulek) throw new Error('You do not have permission to call SpreadsheetApp.openById. Required permissions: https://www.googleapis.com/auth/spreadsheets');
        if (!tabulky[id]) throw new Error('Unexpected error while getting the method or property openById on object SpreadsheetApp.');
        return tabulky[id];
      },
      flush() {},
      newRichTextValue: () => {
        const o = { text: '', odkaz: '', od: 0, do: 0 };
        const t = { setText: (x) => { o.text = x; return t; }, setLinkUrl: (z, k, u) => { Object.assign(o, { od: z, do: k, odkaz: u }); return t; }, build: () => o };
        return t;
      }
    },
    // služba Drive API (OCR účtenek): převod obrázku na Dokument Google; text vrací export přes UrlFetchApp
    Drive: { Files: { create: (zdroj, blob, volby) => {
      const id = 'ocr-' + (++ocrDokumentu);
      log.ocr = (log.ocr || []).concat({ zdroj, volby });
      vsechnySoubory[id] = { vKosi: false, getId: () => id, setTrashed(k) { this.vKosi = !!k; return this; } };
      return { id };
    } } },
    ScriptApp: { getOAuthToken: () => 'token-test' },
    GmailApp,
    CalendarApp: {
      getAllCalendars: () => kalendare, getDefaultCalendar: () => kalendare[0],
      getCalendarById: (id) => kalendare.find((k) => k.getId() === id) || null,
      getCalendarsByName: (n) => kalendare.filter((k) => k.getName() === n),
      createCalendar: (n) => { const k = vytvorKalendar(n); kalendare.push(k); log.zalozeno = (log.zalozeno || []).concat(n); return k; },
      newRecurrence: () => ({ addWeeklyRule: () => { const p = { typ: 'tydne', do: null, until: (d) => { p.do = +d; return p; } }; return p; } })
    },
    UrlFetchApp: { fetch: (url, moznosti) => {
      log.stazeno++;
      if (url.indexOf('chmi.cz') >= 0) return odpovedChmu(url, moznosti);
      if (url.indexOf('ags.cuzk.cz') >= 0) { // RÚIAN: bod → ORP (vrstva 14) / obec (vrstva 12) – jen okolí Veselí n. M.
        log.cuzk = (log.cuzk || 0) + 1;
        // západně od 17° (Brno) jiné ORP než Veselí n. M. – domov se pozná i podle ORP
        const lon = Number((/geometry=([\d.]+),/.exec(url) || [])[1] || 17.3);
        const atributy = /MapServer\/14\//.test(url) ? (lon < 17 ? { kod: 1325, nazev: 'Brno' } : { kod: 1490, nazev: 'Veselí nad Moravou' })
          : (lon < 17 ? { kod: 582786, nazev: 'Brno' } : { kod: 586587, nazev: 'Strážnice' });
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ features: [{ attributes: atributy }] }) };
      }
      if (url.indexOf('api.prod.whoop.com') >= 0) return odpovedWhoop(url, moznosti || {});
      if (url.indexOf('graph.instagram.com') >= 0) return odpovedInstagram(url, moznosti || {});
      if (url.indexOf('googleapis.com/drive/v3/files/') >= 0) { log.export = (log.export || []).concat(url); return { getResponseCode: () => 200, getContentText: () => ocrText }; }
      if (url === 'https://ntfy.sh/') { log.ntfy = (log.ntfy || []).concat(JSON.parse(moznosti.payload)); return { getResponseCode: () => 200, getContentText: () => '{}' }; }
      return { getResponseCode: () => (url.indexOf('chyba') >= 0 ? 404 : 200), getContentText: () => (url.indexOf('rozpis') >= 0 ? rozpis : ICS) };
    } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log() {} },
    Intl
  };
  // WHOOP: token (výměna kódu, obnova s rotací refresh tokenu) a API v2 po stránkách
  const whoop = { platny: 'a1', refresh: 'r1', volani: [], data: null, chyba401: false };
  const odpovedWhoop = (url, moznosti) => {
    whoop.volani.push(url.replace('https://api.prod.whoop.com', ''));
    const json = (kod, telo) => ({ getResponseCode: () => kod, getContentText: () => JSON.stringify(telo), getAllHeaders: () => ({}) });
    if (url === 'https://api.prod.whoop.com/oauth/oauth2/token') {
      const f = moznosti.payload;
      assert.strictEqual(moznosti.method, 'post');
      assert.deepStrictEqual([f.client_id, f.client_secret], ['klient-id', 'klient-tajne']);
      if (f.grant_type === 'authorization_code') {
        assert.strictEqual(f.redirect_uri, 'https://script.google.com/macros/s/MOTOR/exec');
        return f.code === 'dobry-kod' ? json(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 }) : json(400, { error: 'invalid_grant' });
      }
      if (f.grant_type === 'refresh_token' && f.refresh_token === whoop.refresh) {
        whoop.platny = 'a2'; whoop.refresh = 'r2';
        return json(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 });
      }
      return json(400, { error: 'invalid_grant' });
    }
    if (moznosti && moznosti.method === 'delete') return json(204, {});
    if (whoop.chyba401 || (moznosti.headers || {}).Authorization !== 'Bearer ' + whoop.platny) return json(401, {});
    const m = /\/developer\/v2\/([a-z/]+)\?(.*)$/.exec(url);
    const druh = m[1].split('/').pop();
    const dotaz = Object.fromEntries(m[2].split('&').map((x) => x.split('=').map(decodeURIComponent)));
    const zaznamy = (whoop.data || {})[druh] || [];
    // dvě stránky: první záznam, pak zbytek
    if (!dotaz.nextToken && zaznamy.length > 1) return json(200, { records: zaznamy.slice(0, 1), next_token: 'str2' });
    return json(200, { records: dotaz.nextToken ? zaznamy.slice(1) : zaznamy });
  };

  // ČHMÚ: skutečné (zkrácené) soubory z apps-script/test/chmu, ETag → 304 jako na serveru ČHMÚ
  const chmu = { cap: 'cap_cerven.xml', chyby: {}, dotazy: [], neukazano: 0 };
  const souborChmu = (url) => {
    if (url === 'https://vystrahy-cr.chmi.cz/data2/XOCZ50_OKPR.xml') return chmu.cap;
    if (/\/alerts\/cap\/$/.test(url)) return { text: '<a href="alert_cap_50_021119.xml">alert_cap_50_021119.xml</a>   02-Oct-2026 11:19   1550502\n' +
      '<a href="alert_cap_50_011119.xml">alert_cap_50_011119.xml</a>   01-Oct-2026 11:19   1550502\n' };
    if (/\/alerts\/cap\/alert_cap_50_021119\.xml$/.test(url)) return 'cap_rijen.xml';
    if (/\/metadata\/meta1\.json$/.test(url)) return 'meta1.json';
    let m = /\/hydrology\/now\/data\/([^/]+)$/.exec(url);
    if (m) return decodeURIComponent(m[1]);
    if (/\/forecast\/now\/$/.test(url)) return 'predpovedi.html';
    m = /\/forecast\/now\/(web_[^/]+)$/.exec(url);
    return m ? m[1] : null;
  };
  const odpovedChmu = (url, moznosti) => {
    const hlavicky = (moznosti && moznosti.headers) || {};
    chmu.dotazy.push({ url, podminene: !!hlavicky['If-None-Match'] });
    const chyba = Object.keys(chmu.chyby).find((k) => url.indexOf(k) >= 0);
    const zdroj = chyba ? null : souborChmu(url);
    const cesta = typeof zdroj === 'string' ? path.join(__dirname, 'chmu', zdroj) : null;
    if (chyba || !zdroj || (cesta && !fs.existsSync(cesta))) {
      const kod = chyba ? chmu.chyby[chyba] : 404;
      return { getResponseCode: () => kod, getAllHeaders: () => ({}), getContentText: () => 'chyba' };
    }
    const text = cesta ? fs.readFileSync(cesta, 'utf8') : zdroj.text;
    const etag = '"' + crypto.createHash('md5').update(text).digest('hex').slice(0, 12) + '"';
    if (hlavicky['If-None-Match'] === etag) {
      chmu.neukazano++;
      return { getResponseCode: () => 304, getAllHeaders: () => ({ ETag: etag }), getContentText: () => '' };
    }
    return { getResponseCode: () => 200, getAllHeaders: () => ({ ETag: etag, 'Last-Modified': 'Fri, 02 Oct 2026 09:19:00 GMT' }),
      getContentText: (znaky) => { assert.strictEqual(znaky, 'UTF-8'); return text; } };
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Kod.gs'), 'utf8'), ctx);
  // „teď“ v motoru (Date.now) – ČHMÚ testy potřebují čas vzorku
  const nastavCas = (ms) => vm.runInContext('Date.now = function () { return ' + Number(ms) + '; };', ctx);
  const surovy = (contents) => JSON.parse(ctx.doPost({ postData: { contents } }).text);
  const volej = (akce, data = {}, klic = KLIC) => surovy(JSON.stringify({ klic, akce, ...data }));
  // záznamy z izolovaného prostředí převést na běžné objekty (jinak je deepStrictEqual odmítne)
  const posledniOdeslano = () => JSON.parse(JSON.stringify(log.odeslano.pop()));
  return { volej, surovy, vlastnosti, cache, ttl, log, posledniOdeslano, ctx, zprava, vlakno, vlakna, kalendare, chmu, nastavCas, schranka, vsechnySoubory, whoop,
    zalozTabulku, tabulky, nastavOcr: (t) => { ocrText = t; }, bezPovoleniTabulek: (b) => { bezPovoleniTabulek = b; }, ig,
    nastavAliasy: (a) => { aliasy = a; }, stitkyVlaken, nastavStitkyGmailu: (o) => { stitkyGmailu = o; }, nastavAktualizace: (a) => { aktualizace = a; }, nastavKategorie: (o) => { kategorieVlaken = o; }, nastavRozpis: (t) => { rozpis = t; },
    nastavOdeslana: (a) => { odeslana = a; }, nastavStarsi: (osobni, pracovni) => { starsi = { osobni, pracovni: pracovni || [] }; } };
}

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); }
  catch (e) { console.log('  ✗ ' + nazev + '\n    ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; }
}

console.log('Motor – kouřový test');

test('špatný klíč → chyba „klic“, chybějící klíč v motoru → návod', () => {
  const p = prostredi();
  assert.deepStrictEqual(p.volej('info', {}, 'spatny'), { ok: false, chyba: 'klic' });
  p.vlastnosti.delete('API_KLIC');
  p.cache.delete('API_KLIC'); // klíč se drží i v mezipaměti – novyKlic() maže obojí
  const o = p.volej('info');
  assert.strictEqual(o.ok, false);
  assert.ok(/nastavApi/.test(o.chyba));
});

test('otisk klíče aplikace pro schránku zkratky: jen SHA-256 (ne klíč) v CLAUDE_SCHRANKA, znovu jen při změně klíče', () => {
  const p = prostredi();
  const otisky = () => p.schranka.soubory.filter((f) => !f.vKosi && f.getName() === '.otisk_klice_aplikace');
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(otisky().length, 1);
  const obsah = otisky()[0].getBlob().getDataAsString();
  assert.strictEqual(obsah, crypto.createHash('sha256').update(KLIC, 'utf8').digest('hex'));
  assert.ok(obsah.indexOf(KLIC) < 0, 'klíč nesmí být v souboru');
  const zapisu = (p.log.soubory || []).length;
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(otisky().length, 1);
  assert.strictEqual((p.log.soubory || []).length, zapisu, 'podruhé se nic nezapisuje');
  // nový klíč → nový otisk ve stejném souboru
  p.vlastnosti.set('API_KLIC', 'jiny-klic'); p.cache.delete('API_KLIC');
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(otisky().length, 1);
  assert.strictEqual(otisky()[0].getBlob().getDataAsString(), crypto.createHash('sha256').update('jiny-klic', 'utf8').digest('hex'));
});

test('neznámá akce i nečitelný požadavek vrací ok:false, ne pád', () => {
  const p = prostredi();
  assert.strictEqual(p.volej('neexistuje').ok, false);
  assert.strictEqual(p.volej('constructor').ok, false); // zděděné vlastnosti objektu nejsou akce
  assert.strictEqual(p.volej('toString').ok, false);
  assert.deepStrictEqual(p.surovy('{nejson'), { ok: false, chyba: 'Nečitelný požadavek.' });
  assert.deepStrictEqual(p.surovy(''), { ok: false, chyba: 'klic' });
});

test('info: verze, pošta bez pracovní adresy, seznam kalendářů jen vybraných', () => {
  const p = prostredi();
  const o = p.volej('info');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.posta.pracovniAdresa, '');
  assert.strictEqual(o.data.kalendare.length, 1);
  assert.strictEqual(o.data.kalendare[0].zdroj, 'google');
});

test('pošta: bez pracovní adresy jen osobní; s adresou dva účty a „Já“ se nebere jako odesílatel', () => {
  const p = prostredi();
  let o = p.volej('posta');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.osobni.length, 1);
  assert.strictEqual(o.data.pracovni.length, 0);
  assert.strictEqual(p.volej('nastavPostu', { pracovniAdresa: 'neplatna' }).ok, false);
  o = p.volej('nastavPostu', { pracovniAdresa: PRAC.toUpperCase() });
  assert.strictEqual(o.data.pracovniAdresa, PRAC);
  assert.strictEqual(o.data.lzeOdesilatZPracovni, false);
  o = p.volej('posta');
  assert.strictEqual(o.data.pracovni.length, 1);
  assert.strictEqual(o.data.pracovni[0].ucet, 'pracovni');
  assert.strictEqual(o.data.pracovni[0].od, 'Investor'); // poslední zpráva je moje odpověď → ukázat investora
  assert.strictEqual(o.data.osobni[0].neprectena, true);
});

test('pošta se podruhé vezme z mezipaměti; odeslání ji smaže', () => {
  const p = prostredi();
  p.volej('posta');
  assert.ok(p.cache.has('posta'));
  p.nastavAliasy([]);
  p.volej('odeslat', { rezim: 'odpoved', id: 'm1', text: 'Díky' });
  assert.ok(!p.cache.has('posta'));
});

test('vlákno: celé zprávy, účet podle adresy, přílohy, otevřením přečteno', () => {
  const p = prostredi();
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  let o = p.volej('vlakno', { id: 'v2' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.ucet, 'pracovni');
  assert.strictEqual(o.data.zpravy.length, 2);
  assert.strictEqual(o.data.zpravy[1].odeMe, true);
  assert.deepStrictEqual(o.data.zpravy[0].prilohy, [{ nazev: 'nabidka.pdf', velikost: 12345 }]);
  o = p.volej('vlakno', { id: 'v1' });
  assert.strictEqual(o.data.ucet, 'osobni');
  assert.deepStrictEqual(p.log.precteno, ['v1']);
  assert.strictEqual(p.volej('vlakno', { id: 'neni' }).ok, false);
});

test('odpověď na pracovní poštu: bez „Odesílat jako“ odmítne, s ním jde z pracovní adresy', () => {
  const p = prostredi();
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  let o = p.volej('odeslat', { rezim: 'odpoved', id: 'm2', text: 'Děkuji, potvrzuji.' });
  assert.strictEqual(o.ok, false);
  assert.ok(/Odesílat poštu jako/.test(o.chyba));
  p.nastavAliasy([PRAC]);
  o = p.volej('odeslat', { rezim: 'vsem', id: 'm2', text: 'Děkuji, potvrzuji.' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(p.posledniOdeslano(), { jak: 'replyAll', id: 'm2', t: 'Děkuji, potvrzuji.', m: { from: PRAC } });
  o = p.volej('odeslat', { rezim: 'odpoved', id: 'm1', text: 'Ok' });
  assert.deepStrictEqual(p.posledniOdeslano().m, {}); // osobní pošta z osobní adresy
  o = p.volej('odeslat', { rezim: 'odpoved', id: 'm3', text: 'Doplňuji' }); // m3 jsem psal já
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(p.posledniOdeslano().jak, 'replyAll'); // odpověď na vlastní zprávu jde původním adresátům
});

test('přeposlání a nový e-mail: kontrola adres, předmět, účet', () => {
  const p = prostredi();
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  p.nastavAliasy([PRAC]);
  assert.strictEqual(p.volej('odeslat', { rezim: 'preposlat', id: 'm1', komu: 'nekdo', text: 'Viz níže' }).ok, false);
  let o = p.volej('odeslat', { rezim: 'preposlat', id: 'm2', komu: 'Kolega <kolega@firma.test>', text: 'Viz níže' });
  assert.strictEqual(o.ok, true, o.chyba);
  const f = p.log.odeslano.pop(); // přeposlání = nový e-mail s přílohami původní zprávy
  assert.strictEqual(f.jak, 'send');
  assert.strictEqual(f.predmet, 'Fwd: Předávací protokol');
  assert.strictEqual(f.m.from, PRAC);
  assert.strictEqual(f.m.attachments.length, 1);
  assert.ok(f.m.htmlBody.indexOf('Přeposlaná zpráva') > 0);
  o = p.volej('odeslat', { rezim: 'novy', ucet: 'pracovni', komu: 'a@b.test, c@d.test', predmet: '', text: 'Ahoj' });
  assert.strictEqual(o.ok, true, o.chyba);
  const n = p.log.odeslano.pop();
  assert.deepStrictEqual([n.komu, n.predmet, n.m.from], ['a@b.test, c@d.test', '(bez předmětu)', PRAC]);
  assert.strictEqual(p.volej('odeslat', { rezim: 'novy', komu: 'a@b.test', text: '   ' }).ok, false);
});

test('kalendář: Google + iCloud dohromady, seřazené, s barvou; mezipaměť; skrytí kalendáře', () => {
  const p = prostredi();
  let o = p.volej('kalendarPridat', { nazev: '', odkaz: 'webcal://p01-caldav.icloud.test/published/2/abc' });
  assert.strictEqual(o.ok, true, o.chyba);
  const ics = o.data.find((k) => k.zdroj === 'icloud');
  assert.strictEqual(ics.nazev, 'Rodina'); // název z X-WR-CALNAME
  assert.ok(!('odkaz' in ics)); // odkaz se do aplikace nevrací
  assert.strictEqual(p.volej('kalendarPridat', { odkaz: 'https://p01-caldav.icloud.test/published/2/abc' }).ok, false); // duplicita
  assert.strictEqual(p.volej('kalendarPridat', { odkaz: 'http://nesifrovane' }).ok, false);

  const od = Date.UTC(2026, 9, 4, 22), doDne = Date.UTC(2026, 9, 11, 22);
  o = p.volej('kalendar', { od, do: doDne });
  assert.strictEqual(o.ok, true, o.chyba);
  const u = o.data.udalosti;
  assert.deepStrictEqual(u.map((x) => x.nazev), ['Trénink', 'Zubař', 'Trénink']); // po 5. 10. trénink, út zubař, st trénink
  assert.strictEqual(u[1].popis, 'Popis tučně\nřádek');
  assert.strictEqual(u[0].barva, ics.barva);
  const stazeno = p.log.stazeno;
  p.volej('kalendar', { od, do: doDne });
  assert.strictEqual(p.log.stazeno, stazeno); // podruhé z mezipaměti

  o = p.volej('kalendarUpravit', { id: ics.id, skryty: true });
  assert.strictEqual(o.data.find((k) => k.id === ics.id).skryty, true);
  o = p.volej('kalendar', { od, do: doDne });
  assert.deepStrictEqual(o.data.udalosti.map((x) => x.nazev), ['Zubař']);
  assert.strictEqual(p.volej('kalendar', { od: doDne, do: od }).ok, false);
  assert.strictEqual(p.volej('kalendar', { od, do: od + 200 * 864e5 }).ok, false);
});

test('kalendář z nefunkčního odkazu: chyba u kalendáře, ostatní události dál', () => {
  const p = prostredi();
  p.vlastnosti.set('ICS_KALENDARE', JSON.stringify([{ id: 'ics-1', nazev: 'Rozbitý', odkaz: 'https://chyba.test/x.ics', barva: '#2f5bd3' }]));
  const o = p.volej('kalendar', { od: Date.UTC(2026, 9, 4, 22), do: Date.UTC(2026, 9, 11, 22) });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.udalosti.length, 1);
  assert.strictEqual(o.data.chyby[0].kalendar, 'Rozbitý');
  assert.ok(/404/.test(o.data.chyby[0].chyba));
});

test('stavy konverzací podle pravidel: hoří, čeká na tebe, otázka, čekáš na ně, řeší se, informace', () => {
  const p = prostredi();
  const ted = Date.UTC(2026, 9, 2, 13); // pátek 2. 10. 2026, 15:00 v Praze
  const stav = (o, odeMe, jeOznameni, jsemPsal) => {
    const m = p.zprava(Object.assign({ id: 'x', od: 'Někdo <nekdo@firma.test>', predmet: 'Věc', kdy: ted - 36e5 }, o));
    return p.ctx.stavPripadu_(m, !!odeMe, p.vlakno('vx', [m], true), !!jeOznameni, ted, !!jsemPsal);
  };
  // někdo něco chce / osobní zpráva bez jasného obsahu
  assert.strictEqual(stav({ text: 'Posílám podklady.' }), 'ceka');
  assert.strictEqual(stav({ text: 'Posíláme protokol k připomínkám.' }), 'ceka');
  assert.strictEqual(stav({ text: 'Můžeš to prosím zkontrolovat do středy?' }), 'ceka'); // prosba přebije otazník; středa je za 5 dní
  assert.strictEqual(stav({ text: 'Odkaz: https://x.test/a?b=1 posílám.' }), 'ceka'); // otazník v adrese není otázka
  assert.strictEqual(stav({ text: 'Ahoj\n-- \nJan Novák\nChceš vizitku?' }), 'ceka'); // otazník jen v podpisu
  assert.strictEqual(stav({ text: 'Velký úspěch, gratuluji!' }), 'ceka'); // „úspěch“ není „spěchá“
  assert.strictEqual(stav({ text: 'Jsem rychlejší, než jsem čekal.' }), 'ceka'); // „rychlejší“ není „rychle“
  // otázka bez prosby
  assert.strictEqual(stav({ text: 'Jak to vypadá s výkresy?' }), 'otazka');
  // hoří: naléhavost, problém, termín do 48 hodin od odeslání
  assert.strictEqual(stav({ predmet: 'URGENTNÍ: předání', text: 'Ozvi se.' }), 'hori');
  assert.strictEqual(stav({ text: 'Potřebuji to nejpozději dnes.' }), 'hori');
  assert.strictEqual(stav({ text: 'Můžeš to prosím zkontrolovat do pátku?' }), 'hori'); // napsáno v pátek
  assert.strictEqual(stav({ text: 'Pošlete to prosím do 3. 10.' }), 'hori');
  assert.strictEqual(stav({ text: 'Pošlete to prosím do 20. 10.' }), 'ceka');
  assert.strictEqual(stav({ text: 'Web nefunguje, podívej se na to.' }), 'hori');
  // živá konverzace bez požadavku
  assert.strictEqual(stav({ text: 'Díky.\n> Máš čas?' }, false, false, true), 'resi'); // otázka jen v citaci
  // informace
  assert.strictEqual(stav({ od: 'Banka <no-reply@banka.test>', text: 'Výpis?' }), 'info');
  assert.strictEqual(stav({ text: 'Účtenka' }, false, true), 'info');
  // čekáš na ně – ale ne po krátkém „díky“ a ne u hromadné zprávy
  assert.strictEqual(stav({ text: 'Odpověděl jsem?' }, true), 'cekas');
  assert.strictEqual(stav({ text: 'Díky, platí.' }, true), 'info');
  assert.strictEqual(stav({ text: 'Děkuji, pošlete prosím ještě soupis vad.' }, true), 'cekas');
  assert.strictEqual(stav({ text: 'Zítra nejdu.', komu: 'a@x.test, b@x.test, c@x.test, d@x.test, e@x.test, f@x.test' }, true), 'info');
});

test('pošta: stav v seznamu (moje poslední = čekáš na ně, oznámení podle kategorie)', () => {
  const p = prostredi();
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  let o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.data.pracovni[0].stav, 'info'); // poslední je moje „Děkuji.“ = uzavřené
  assert.strictEqual(o.data.osobni[0].stav, 'ceka');
  p.nastavAktualizace([p.vlakna.v1]);
  o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.data.osobni[0].stav, 'info');
});

test('hledání v celé poště, spam, připomenutí jako úkol ve schránce', () => {
  const p = prostredi();
  let o = p.volej('hledat', { dotaz: 'from:trener has:attachment' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.vlakna.length, 1);
  assert.strictEqual(o.data.vlakna[0].ucet, 'osobni');
  assert.ok(p.log.dotazy.some((q) => q === '(from:trener has:attachment) -in:trash -in:spam'));
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  o = p.volej('hledat', { dotaz: '{to:' + PRAC + '} protokol' }); // napodobený Gmail vrátí pracovní vlákno
  assert.strictEqual(o.data.vlakna[0].ucet, 'pracovni');
  assert.deepStrictEqual(p.volej('hledat', { dotaz: '   ' }).data.vlakna.length, 0);
  assert.strictEqual(p.volej('oznacit', { id: 'v1', jak: 'spam' }).ok, true);
  assert.strictEqual(p.log.spam, 'v1');
  assert.strictEqual(p.volej('pripomenout', { id: 'v1', termin: 'zitra' }).ok, false);
  o = p.volej('pripomenout', { id: 'v1', termin: '2026-10-05', poznamka: 'Zavolat trenérovi' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.slozka, 'CEKA');
  assert.strictEqual(o.data.typ, 'ukol-michal');
  assert.strictEqual(o.data.termin, '2026-10-05');
  assert.ok(/^Odpovědět: Sraz v sobotu/.test(o.data.shrnuti));
  const soubor = p.log.soubory.pop();
  assert.strictEqual(soubor.slozka, 'CEKA');
  assert.ok(soubor.obsah.indexOf('mail.google.com') > 0 && soubor.obsah.indexOf('Zavolat trenérovi') > 0);
});

test('kalendář – zápis: založit kalendář, nová / celodenní / týdně opakovaná, úprava, smazání, cizí kalendář', () => {
  const p = prostredi();
  const verze = () => p.vlastnosti.get('VERZE_KALENDARU') || '1';
  let o = p.volej('kalendarZalozit', { nazev: 'Zápasy', barva: '#2e7a4d' });
  assert.strictEqual(o.ok, true, o.chyba);
  const zid = o.data.id;
  assert.ok(o.data.kalendare.some((k) => k.id === zid && k.zapis === true));
  assert.ok(o.data.kalendare.some((k) => k.nazev === 'Osobní' && k.zapis === true));
  assert.strictEqual(p.volej('kalendarZalozit', { nazev: 'Zápasy' }).data.id, zid); // podruhé stejný, nový nevznikne
  assert.deepStrictEqual(p.log.zalozeno, ['Zápasy']);
  const kal = p.kalendare.find((k) => k.getId() === zid);

  // nová událost s připomenutím; verze kalendářů se zvýší (mezipaměť přestane platit)
  const z = Date.UTC(2026, 9, 7, 15), v0 = verze();
  o = p.volej('udalostUlozit', { kalendarId: zid, nazev: '  Trénink   dorostu ', zacatek: z, konec: z + 90 * 6e4, misto: 'hřiště', pripomenuti: [60] });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.notStrictEqual(verze(), v0);
  let u = kal.udalosti[0]._;
  assert.deepStrictEqual([u.nazev, u.z, u.k, u.misto, u.pripomenuti.join()], ['Trénink dorostu', z, z + 90 * 6e4, 'hřiště', '60']);

  // celodenní: jeden den a víc dní (konec = půlnoc po posledním dni)
  const pulnoc = Date.UTC(2026, 9, 9, 22); // 10. 10. 0:00 v Praze
  assert.strictEqual(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'Turnaj', celodenni: true, zacatek: pulnoc, konec: pulnoc + 864e5 }).ok, true);
  assert.deepStrictEqual([kal.udalosti[1]._.celodenni, kal.udalosti[1]._.k - kal.udalosti[1]._.z], [true, 864e5]);
  assert.strictEqual(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'Soustředění', celodenni: true, zacatek: pulnoc, konec: pulnoc + 3 * 864e5 }).ok, true);
  assert.strictEqual(kal.udalosti[2]._.k - kal.udalosti[2]._.z, 3 * 864e5);

  // každý týden do 20. 12. včetně
  assert.strictEqual(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'Trénink', zacatek: z, konec: z + 36e5, tydne: true, tydneDo: '2026-12-20' }).ok, true);
  assert.deepStrictEqual([kal.udalosti[3]._.rada.typ, kal.udalosti[3]._.rada.do], ['tydne', Date.UTC(2026, 11, 20, 22, 59)]);

  // úprava podle id z aplikace („iCalUID|začátek“) – i čas a název
  const prvni = kal.udalosti[0];
  o = p.volej('udalostUlozit', { kalendarId: zid, udalost: prvni.getId() + '|' + z, nazev: 'Trénink (přesunutý)', zacatek: z + 36e5, konec: z + 2 * 36e5 });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([prvni._.nazev, prvni._.z], ['Trénink (přesunutý)', z + 36e5]);
  assert.ok(/neexistuje/.test(p.volej('udalostUlozit', { kalendarId: zid, udalost: prvni.getId() + '|' + z, nazev: 'X', zacatek: z, konec: z + 1 }).chyba));

  // smazání: jeden výskyt / celá řada opakované
  assert.strictEqual(p.volej('udalostSmazat', { kalendarId: zid, udalost: prvni.getId() + '|' + (z + 36e5) }).ok, true);
  assert.strictEqual(prvni._.smazano, true);
  const rada = kal.udalosti[3];
  assert.strictEqual(p.volej('udalostSmazat', { kalendarId: zid, udalost: rada.getId() + '|' + z, cela: true }).ok, true);
  assert.strictEqual(rada._.celaRada, true);

  // kontroly
  assert.ok(/název/.test(p.volej('udalostUlozit', { kalendarId: zid, nazev: '   ', zacatek: z, konec: z + 1 }).chyba));
  assert.ok(/po začátku/.test(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'X', zacatek: z, konec: z }).chyba));
  assert.ok(/moc dlouhá/.test(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'X', zacatek: z, konec: z + 90 * 864e5 }).chyba));
  assert.ok(/zapisovat nejde/.test(p.volej('udalostUlozit', { kalendarId: 'x', nazev: 'X', zacatek: z, konec: z + 1 }).chyba));
  assert.ok(/nenalezen/.test(p.volej('udalostUlozit', { kalendarId: 'neni', nazev: 'X', zacatek: z, konec: z + 1 }).chyba));
});

test('kalendář – hosté: pozvánky u nové, změna hostů a e-mail o změně, skupiny hostů', () => {
  const p = prostredi();
  const zid = p.volej('kalendarZalozit', { nazev: 'Zápasy' }).data.id;
  const kal = p.kalendare.find((k) => k.getId() === zid);
  const z = Date.UTC(2026, 9, 10, 8);
  let o = p.volej('udalostUlozit', { kalendarId: zid, nazev: 'Zápas', zacatek: z, konec: z + 2 * 36e5, misto: 'hřiště',
    hoste: 'Trener@Klub.test; rodic@x.test, trener@klub.test', pozvat: true });
  assert.strictEqual(o.ok, true, o.chyba);
  const u = kal.udalosti[0];
  assert.deepStrictEqual([u._.hoste.join(), u._.pozvanky], ['trener@klub.test,rodic@x.test', true]); // malá písmena, bez duplicit
  assert.ok(/Neplatná adresa/.test(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'X', zacatek: z, konec: z + 1, hoste: 'nekdo@' }).chyba));
  // úprava: jeden host pryč, jeden nový, e-mail o změně všem současným
  const pred = p.log.odeslano.length;
  o = p.volej('udalostUlozit', { kalendarId: zid, udalost: u.getId() + '|' + z, nazev: 'Zápas', zacatek: z + 36e5, konec: z + 3 * 36e5,
    misto: 'hřiště', hoste: ['trener@klub.test', 'novy@y.test'], pozvat: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(u._.hoste, ['trener@klub.test', 'novy@y.test']);
  const mail = JSON.parse(JSON.stringify(p.log.odeslano[pred]));
  assert.deepStrictEqual([mail.jak, mail.komu, mail.predmet], ['send', 'trener@klub.test,novy@y.test', 'Změna: Zápas']);
  assert.ok(/Kdy: 10\. 10\. 2026 11:00 – 13:00/.test(mail.t) && /Kde: hřiště/.test(mail.t), mail.t);
  // bez „pozvat“ se nic neposílá, bez pole hosté se hosté nemění
  p.volej('udalostUlozit', { kalendarId: zid, udalost: u.getId() + '|' + (z + 36e5), nazev: 'Zápas!', zacatek: z + 36e5, konec: z + 3 * 36e5 });
  assert.strictEqual(p.log.odeslano.length, pred + 1);
  assert.strictEqual(u._.hoste.length, 2);
  // skupiny hostů: uložit, v info, kontrola adres
  o = p.volej('skupinyHostuUlozit', { skupiny: [{ nazev: ' Dorost – rodiče ', adresy: 'a@x.test, b@x.test' }, { nazev: 'Prázdná', adresy: '' }] });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(o.data)), [{ nazev: 'Dorost – rodiče', adresy: ['a@x.test', 'b@x.test'] }]);
  assert.strictEqual(p.volej('info').data.skupinyHostu[0].nazev, 'Dorost – rodiče');
  assert.strictEqual(p.volej('skupinyHostuUlozit', { skupiny: [{ nazev: 'X', adresy: 'spatne' }] }).ok, false);
});

test('zápasy z rozpisu webu: import do „Zápasy“, odehrané vynechá, opakovaný import nic nezdvojí, změnu termínu upraví', () => {
  const p = prostredi();
  const ROZPIS = (cas) => [
    'export const ROZPIS = [',
    '  { id: "podzim26-01", date: "2000-08-15", time: "10:00", venue: "venku", opponent: "Prušánky" },',
    '  { id: "podzim26-08", date: "2099-10-04", time: "' + cas + '", venue: "doma",  opponent: "Těšany" },',
    '  { id: "podzim26-09", date: "2099-10-11", time: "12:30", venue: "venku", opponent: "Dubňany/Mutěnice" }, // komentář',
    '];'].join('\n');
  p.nastavRozpis(ROZPIS('12:15'));
  const zadani = { odkaz: 'https://web.test/dorost/rozpis-dorost.js', tym: 'dorost', domaci: 'Vnorovy', soutez: '5. liga staršího dorostu' };
  let o = p.volej('zapasyImport', zadani);
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.pridano, o.data.upraveno, o.data.beze_zmeny, o.data.kalendar], [2, 0, 0, 'Zápasy']);
  const kal = p.kalendare.find((k) => k.getName() === 'Zápasy');
  const [doma, venku] = kal.udalosti.map((x) => x._);
  assert.strictEqual(doma.nazev, '⚽ Vnorovy – Těšany (dorost)');
  assert.strictEqual(venku.nazev, '⚽ Dubňany/Mutěnice – Vnorovy (dorost)');
  assert.strictEqual(doma.z, Date.UTC(2099, 9, 4, 10, 15)); // 12:15 letního času v Praze
  assert.strictEqual(doma.k - doma.z, 2 * 36e5);
  assert.deepStrictEqual([doma.misto, venku.misto], ['Vnorovy, hřiště', 'Dubňany/Mutěnice']);
  assert.deepStrictEqual(doma.pripomenuti, [1440, 120]);
  assert.strictEqual(doma.stitky.asistent, 'dorost:podzim26-08');
  assert.ok(/5\. liga/.test(doma.popis));

  o = p.volej('zapasyImport', zadani); // znovu – nic nového
  assert.deepStrictEqual([o.data.pridano, o.data.upraveno, o.data.beze_zmeny], [0, 0, 2]);
  p.nastavRozpis(ROZPIS('14:00')); // přeložený výkop
  o = p.volej('zapasyImport', zadani);
  assert.deepStrictEqual([o.data.pridano, o.data.upraveno, o.data.beze_zmeny], [0, 1, 1]);
  assert.strictEqual(doma.z, Date.UTC(2099, 9, 4, 12, 0));
  assert.strictEqual(p.volej('zapasyImport', Object.assign({}, zadani, { vcetneOdehranych: true })).data.pridano, 1);

  // i JSON a klíče v uvozovkách; nesmysly přeskočí
  const z = JSON.parse(JSON.stringify(p.ctx.rozpisZapasu_('[{"id":"a1","date":"2099-01-02","time":"9:30","venue":"away","opponent":"Kyjov"},{"id":"x","date":"spatne"}]')));
  assert.deepStrictEqual(z, [{ id: 'a1', datum: '2099-01-02', cas: '9:30', doma: false, souper: 'Kyjov' }]);

  assert.ok(/https/.test(p.volej('zapasyImport', Object.assign({}, zadani, { odkaz: 'http://web.test/rozpis.js' })).chyba));
  assert.ok(/HTTP 404/.test(p.volej('zapasyImport', Object.assign({}, zadani, { odkaz: 'https://web.test/chyba-rozpis.js' })).chyba));
  p.nastavRozpis('nic tu není');
  assert.ok(/žádné zápasy/.test(p.volej('zapasyImport', zadani).chyba));
});

// ---------------------------------------------------------------- pošta podle Maileru: termíny, známí, důvody, odložení

test('termín vůči dnešku: starý „do zítra“ nehoří, „do pátku“ ve čtvrtek hoří, z více termínů nejbližší', () => {
  const p = prostredi();
  const ctvrtek = Date.UTC(2026, 9, 1, 13); // čtvrtek 1. 10. 2026, 15:00 v Praze
  const patek = Date.UTC(2026, 9, 2, 13);
  const stav = (text, ted, kdy) => {
    const m = p.zprava({ id: 'x', od: 'Někdo <nekdo@firma.test>', predmet: 'Věc', text, kdy: kdy == null ? ted - 36e5 : kdy });
    return JSON.parse(JSON.stringify(p.ctx.stavADuvod_(m, false, p.vlakno('vx', [m], true), false, ted, false)));
  };
  // „do pátku“ napsané ve čtvrtek = pátek 23:59 → do 48 hodin
  let s = stav('Pošli mi to do pátku.', ctvrtek);
  assert.strictEqual(s.stav, 'hori');
  assert.strictEqual(s.duvod, 'termín „do pátku“ – pá 2. 10.');
  assert.strictEqual(s.termin.ms, Date.UTC(2026, 9, 2, 21, 59)); // 23:59 letního času
  // zpráva z 22. 9. s „do zítra“: termín 23. 9. dávno prošel → nehoří, zůstane prosba
  s = stav('Pošlete to prosím do zítra.', patek, patek - 10 * 864e5);
  assert.strictEqual(s.stav, 'ceka');
  assert.strictEqual(s.termin.ms, Date.UTC(2026, 8, 23, 21, 59));
  // prošlý před méně než dnem ještě hoří (včerejší „dnes“), před dvěma dny už ne
  assert.strictEqual(stav('Potřebuji to nejpozději dnes.', patek, patek - 864e5).stav, 'hori');
  assert.strictEqual(stav('Potřebuji to nejpozději dnes.', patek, patek - 2 * 864e5).stav, 'ceka');
  // pozítří = +2 dny 23:59 – v pátek odpoledne to ještě není do 48 hodin
  assert.strictEqual(stav('Pošli to do pozítří.', patek).stav, 'ceka');
  // z více termínů platí nejbližší nadcházející (dřív rozhodoval první v textu)
  s = stav('Celé to pošlete do 20. 10., hlavní část ale do zítra.', patek);
  assert.deepStrictEqual([s.stav, s.termin.fraze], ['hori', 'do zítra']);
  // věta s termínem pro náhled; tečky v datu větu nedělí; dlouhá věta nejvýš 140 znaků
  assert.strictEqual(stav('Ahoj. Pošlete to prosím do 3. 10. Díky moc.', patek).termin.veta, 'Pošlete to prosím do 3. 10.');
  s = stav('Ahoj, ' + 'tohle je hodně dlouhá věta bez tečky '.repeat(8) + 'a potřebujeme to do 3. 10. jinak nestihneme ' +
    'další dlouhé povídání '.repeat(6), patek);
  assert.ok(s.termin.veta.length <= 140 && s.termin.veta.indexOf('do 3. 10.') > 0, s.termin.veta);
  // nesmyslné datum se nepočítá; termín v příštím roce i s rokem
  assert.strictEqual(stav('Pošlete to do 31. 9.', patek).termin, null);
  assert.strictEqual(stav('Pošlete to do 5. 1.', Date.UTC(2026, 11, 20, 12)).termin.den, 'út 5. 1. 2027');
});

test('pošta: termín, věta s termínem, „po termínu“ a důvod v souhrnu', () => {
  const p = prostredi();
  const ted = Date.now();
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Trenér <trener@klub.test>', predmet: 'Podklady',
    text: 'Ahoj. Pošlete to prosím do zítra. Díky.', kdy: ted - 10 * 864e5 })], true);
  const o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  const v = o.data.osobni[0];
  assert.deepStrictEqual([v.stav, v.duvod, v.poTerminu, v.terminVeta, v.cekasOd], ['ceka', 'prosba „pošlete“', true, 'Pošlete to prosím do zítra.', null]);
  assert.ok(v.termin > ted - 10 * 864e5 && v.termin < ted);
  assert.deepStrictEqual([o.data.osobni[0].termin, o.data.osobni[0].terminVeta], [v.termin, v.terminVeta]);
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Trenér <trener@klub.test>', predmet: 'Sraz', text: 'Sraz v 8:30.', kdy: ted })], true);
  const bez = p.volej('posta', { znovu: true }).data.osobni[0];
  assert.deepStrictEqual([bez.termin, bez.terminVeta, bez.poTerminu, bez.duvod], [null, '', false, 'osobní zpráva']);
});

test('hoří jen od známých: naléhavá slova od cizích ne; neznámý bez prosby a otázky = informace', () => {
  const p = prostredi();
  const ted = Date.UTC(2026, 9, 2, 13);
  const stav = (text, znami, jsemPsal) => {
    const m = p.zprava({ id: 'x', od: 'Cizí <nekdo@cizi.test>', predmet: 'Věc', text, kdy: ted - 36e5 });
    return p.ctx.stavADuvod_(m, false, p.vlakno('vx', [m], true), false, ted, !!jsemPsal, znami);
  };
  const nikdo = {};
  assert.deepStrictEqual([stav('Web nefunguje, podívej se na to.', nikdo).stav, stav('Web nefunguje, podívej se na to.', nikdo).duvod],
    ['info', 'neznámý odesílatel']);
  assert.strictEqual(stav('Web nefunguje.', { 'nekdo@cizi.test': true }).stav, 'hori'); // psal jsem mu
  assert.strictEqual(stav('Web nefunguje.', { '@cizi.test': true }).stav, 'hori');      // kolega z pracovní domény
  assert.strictEqual(stav('Web nefunguje.', nikdo, true).stav, 'hori');                  // psal jsem v tomhle vlákně
  assert.strictEqual(stav('URGENT: posílám nabídku', nikdo).stav, 'info');
  // termín do 48 hodin hoří od kohokoli; prosba čeká; otazník je otázka
  assert.strictEqual(stav('Fakturu uhraďte do zítra.', nikdo).stav, 'hori');
  assert.strictEqual(stav('Pošlete prosím nabídku.', nikdo).stav, 'ceka');
  assert.strictEqual(stav('Máte zájem o spolupráci?', nikdo).stav, 'otazka');
  // bez seznamu (nevíme) je každý známý – jako dřív
  const m = p.zprava({ id: 'y', od: 'Cizí <x@cizi.test>', predmet: 'Věc', text: 'Výpadek!', kdy: ted });
  assert.strictEqual(p.ctx.stavPripadu_(m, false, null, false, ted, false), 'hori');
});

test('známí lidé: adresy z mé odeslané pošty (Komu, Kopie, Skrytá), mezipaměť nejvýš 6 hodin', () => {
  const p = prostredi();
  p.nastavOdeslana([p.vlakno('s1', [
    p.zprava({ id: 's1a', od: 'Já <' + JA + '>', komu: '"Novák, Jan" <Jan.Novak@x.test>, b@y.test', kopie: 'c@z.test', skryta: 'd@w.test',
      predmet: 'X', text: 'Ahoj', kdy: Date.UTC(2026, 8, 1) }),
    p.zprava({ id: 's1b', od: 'Cizí <cizi@spam.test>', komu: JA + ', e@v.test', predmet: 'Re: X', text: 'Ok', kdy: Date.UTC(2026, 8, 2) })
  ], false)]);
  const znami = JSON.parse(JSON.stringify(p.ctx.znamiLide_()));
  assert.deepStrictEqual(Object.keys(znami).sort(), ['b@y.test', 'c@z.test', 'd@w.test', 'jan.novak@x.test']); // ne cizí odpověď, ne já
  assert.ok(p.log.dotazy.includes('in:sent newer_than:365d'));
  assert.strictEqual(p.log.maxima['in:sent newer_than:365d'], 300);
  assert.ok(p.cache.has('znami') && p.ttl.get('znami') <= 21600);
  // v pracovní poště je kolega z pracovní domény známý, cizí s „nefunguje“ jen informace
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  assert.ok(!p.cache.has('znami')); // změna adresy = nový seznam
  const kdy = Date.now() - 36e5;
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Kolega <kolega@firma.test>', predmet: 'Tiskárna', text: 'Tiskárna nefunguje.', kdy })], true);
  let v = p.volej('posta', { znovu: true }).data.osobni[0];
  assert.deepStrictEqual([v.stav, v.duvod], ['hori', 'slovo „nefunguje“']);
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Prodejce <obchod@cizi.test>', predmet: 'Tiskárna', text: 'Vaše tiskárna nefunguje dobře.', kdy })], true);
  v = p.volej('posta', { znovu: true }).data.osobni[0];
  assert.deepStrictEqual([v.stav, v.duvod], ['info', 'neznámý odesílatel']);
});

test('důvod stavu: krátce česky, proč je konverzace tam, kde je', () => {
  const p = prostredi();
  const ted = Date.UTC(2026, 9, 2, 13);
  const duvod = (o, odeMe, jeOznameni, jsemPsal) => {
    const m = p.zprava(Object.assign({ id: 'x', od: 'Někdo <nekdo@firma.test>', predmet: 'Věc', kdy: ted - 36e5 }, o));
    return p.ctx.stavADuvod_(m, !!odeMe, p.vlakno('vx', [m], true), !!jeOznameni, ted, !!jsemPsal).duvod;
  };
  assert.strictEqual(duvod({ text: 'Web nefunguje.' }), 'slovo „nefunguje“');
  assert.strictEqual(duvod({ predmet: 'URGENTNÍ: předání', text: 'Ozvi se.' }), 'slovo „urgentní“');
  assert.strictEqual(duvod({ text: 'Pošlete to prosím do 3. 10.' }), 'termín „do 3. 10.“ – so 3. 10.');
  assert.strictEqual(duvod({ text: 'Účtenka' }, false, true), 'Gmail: Aktualizace');
  assert.strictEqual(duvod({ od: 'Banka <no-reply@banka.test>', text: 'Výpis' }), 'automatická adresa');
  // mimo kancelář: „v urgentních záležitostech“ nehoří (Outlook česky i anglicky)
  assert.strictEqual(duvod({ predmet: 'Automatická odpověď: Ubytování', text: 'Jsem mimo kancelář. V urgentních záležitostech volejte recepci.' }),
    'automatická odpověď (mimo kancelář)');
  assert.strictEqual(duvod({ predmet: 'Automatic reply: Ubytování', text: 'I am out of office, for urgent matters call reception.' }), 'automatická odpověď (mimo kancelář)');
  assert.strictEqual(duvod({ predmet: 'Re: Automatizace výkazů', text: 'Pošlete podklady.' }), 'prosba „pošlete“', 'jen začátek předmětu');
  assert.strictEqual(duvod({ text: 'Díky, platí.' }, true), 'tvoje „díky“ na konci');
  assert.strictEqual(duvod({ text: 'Pošlete podklady.' }), 'prosba „pošlete“');
  assert.strictEqual(duvod({ text: 'Jak to vypadá?' }), 'otazník v textu');
  assert.strictEqual(duvod({ text: 'Posílám výkres.' }, true), 'odpověděl jsi poslední');
  assert.strictEqual(duvod({ text: 'Posílám výkres.' }, false, false, true), 'píšete si, nic po tobě nechce');
  assert.strictEqual(duvod({ text: 'Posílám výkres.' }), 'osobní zpráva');
});

test('čekáš na ně: na koho (jména adresátů, i s čárkou v uvozovkách), co jsi psal a od kdy', () => {
  const p = prostredi();
  const kdy = Date.now() - 2 * 864e5;
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Já <' + JA + '>', predmet: 'Nabídka',
    komu: 'Petr Novák <petr@x.test>, "Svoboda, Jan" <jan@y.test>, c@z.test, d@w.test',
    text: 'Dobrý den,\n\nposílám nabídku, dejte vědět.\n\n> starší citace', kdy })], false);
  const v = p.volej('posta', { znovu: true }).data.osobni[0];
  assert.deepStrictEqual([v.stav, v.duvod], ['cekas', 'odpověděl jsi poslední']);
  assert.strictEqual(v.od, 'Čekáš na: Petr Novák, Svoboda, Jan, c@z.test'); // nejvýš tři
  assert.strictEqual(v.ukazka, 'posílám nabídku, dejte vědět.'); // první řádek vlastního textu, bez oslovení
  assert.strictEqual(v.cekasOd, kdy);
});

test('odeslání jen jednou: stejné idOdeslani pošle e-mail jednou, podruhé vrátí jizOdeslano', () => {
  const p = prostredi();
  const d = { rezim: 'novy', komu: 'a@b.test', predmet: 'Ahoj', text: 'Text', idOdeslani: 'psani-123' };
  let o = p.volej('odeslat', d);
  assert.deepStrictEqual([o.ok, o.data], [true, true]);
  o = p.volej('odeslat', d); // opakovaný pokus (třeba po výpadku sítě)
  assert.deepStrictEqual(o.data, { jizOdeslano: true });
  assert.strictEqual(p.log.odeslano.length, 1);
  assert.strictEqual(p.ttl.get('odeslano:psani-123'), 21600);
  assert.strictEqual(p.volej('odeslat', Object.assign({}, d, { idOdeslani: 'jine-psani' })).data, true);
  assert.strictEqual(p.log.odeslano.length, 2);
  assert.strictEqual(p.volej('odeslat', Object.assign({}, d, { idOdeslani: 'x'.repeat(65) })).ok, false);
  // neúspěšný pokus se nezapamatuje – opravený se stejným id odejde
  assert.strictEqual(p.volej('odeslat', { rezim: 'novy', komu: 'spatne', text: 'X', idOdeslani: 'psani-9' }).ok, false);
  assert.strictEqual(p.volej('odeslat', { rezim: 'novy', komu: 'a@b.test', text: 'X', idOdeslani: 'psani-9' }).data, true);
  assert.strictEqual(p.log.odeslano.length, 3);
});

test('odložit: Připomenout archivuje a zapamatuje, v den termínu se konverzace vrátí do Doručených', () => {
  const p = prostredi();
  const datum = (dni) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + dni * 864e5));
  const odlozene = () => JSON.parse(p.vlastnosti.get('ODLOZENE') || '[]');
  let o = p.volej('pripomenout', { id: 'v1', termin: datum(5) });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.slozka, 'CEKA'); // úkol ve schránce zůstává
  assert.deepStrictEqual(p.log.archiv, ['v1']);
  assert.deepStrictEqual(odlozene(), [{ id: 'v1', termin: datum(5) }]);
  p.volej('pripomenout', { id: 'v1', termin: datum(3) }); // znovu = jen nový termín, ne druhý záznam
  assert.deepStrictEqual(odlozene(), [{ id: 'v1', termin: datum(3) }]);
  p.volej('posta'); // před termínem se nic nevrací
  assert.deepStrictEqual(p.log.doDorucenych, []);
  // termín nastal → zpět do Doručených jako nepřečtená, ze seznamu pryč; pošta se načte znovu, ne z mezipaměti
  p.vlastnosti.set('ODLOZENE', JSON.stringify([{ id: 'v1', termin: datum(0) }, { id: 'v2', termin: datum(1) }, { id: 'smazane', termin: datum(-1) }]));
  const dotazu = p.log.dotazy.length;
  o = p.volej('posta');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([p.log.doDorucenych, p.log.neprecteno], [['v1'], ['v1']]);
  assert.deepStrictEqual(odlozene(), [{ id: 'v2', termin: datum(1) }]);
  assert.ok(p.log.dotazy.length > dotazu);
});

test('Vrátit po Hotovo nebo Spamu: zpět do Doručených i ze spamu; návrat a Hotovo vrácené konverzace ruší odložení', () => {
  const p = prostredi();
  const odlozene = () => JSON.parse(p.vlastnosti.get('ODLOZENE') || '[]').map((x) => x.id);
  assert.strictEqual(p.volej('oznacit', { id: 'v1', jak: 'spam' }).ok, true);
  assert.strictEqual(p.volej('oznacit', { id: 'v1', jak: 'vratit' }).ok, true);
  assert.deepStrictEqual(p.log.zeSpamu, ['v1']); // GmailApp.moveThreadToInbox
  assert.strictEqual(p.vlakna.v1.isInInbox(), true);
  // odložená a hned Hotovo (není v Doručených) – odložení platí dál
  p.volej('pripomenout', { id: 'v1', termin: '2099-01-01' });
  p.volej('oznacit', { id: 'v1', jak: 'archivovat' });
  assert.deepStrictEqual(odlozene(), ['v1']);
  // vrátila se (třeba s odpovědí) a teď je vyřízená → odložení neplatí
  p.vlakna.v1.moveToInbox();
  p.volej('oznacit', { id: 'v1', jak: 'archivovat' });
  assert.deepStrictEqual(odlozene(), []);
  // „Vrátit“ u odložené ruší odložení
  p.volej('pripomenout', { id: 'v2', termin: '2099-01-01' });
  p.volej('oznacit', { id: 'v2', jak: 'vratit' });
  assert.strictEqual(p.vlastnosti.has('ODLOZENE'), false);
});

test('hledání: koš a spam se vynechají, jen když je dotaz sám nechce', () => {
  const p = prostredi();
  ['in:spam faktura', 'label:trash', 'IN:anywhere smlouva', 'from:x -in:spam'].forEach((dotaz) => assert.strictEqual(p.volej('hledat', { dotaz }).ok, true));
  assert.ok(p.log.dotazy.includes('(in:spam faktura)'));
  assert.ok(p.log.dotazy.includes('(label:trash)'));
  assert.ok(p.log.dotazy.includes('(IN:anywhere smlouva)'));
  assert.ok(p.log.dotazy.includes('(from:x -in:spam) -in:trash -in:spam')); // vyloučení není „chci spam“
});

test('adresy: čárka ve jménu v uvozovkách nedělí (seznam, jméno, kontrola adresátů, počet adresátů)', () => {
  const p = prostredi();
  const seznam = (s) => JSON.parse(JSON.stringify(p.ctx.rozdelAdresy_(s)));
  assert.deepStrictEqual(seznam('"Novák, Jan" <jan@x.cz>, „Dr. X, Ph.D.“ <x@y.cz>; b@c.cz'),
    ['"Novák, Jan" <jan@x.cz>', '„Dr. X, Ph.D.“ <x@y.cz>', 'b@c.cz']);
  assert.deepStrictEqual(seznam('Jan "Honza <jan@x.cz>, b@c.cz'), ['Jan "Honza <jan@x.cz>', 'b@c.cz']); // nespárované uvozovky
  assert.deepStrictEqual(seznam(''), []);
  assert.deepStrictEqual(seznam('"Jan \\"Honza, ml.\\" Novák" <jan@x.cz>, b@c.cz').length, 2); // \" uvnitř jména
  assert.strictEqual(p.ctx.jmeno_('"Jan \\"Honza\\" Novák" <jan@x.cz>'), 'Jan "Honza" Novák');
  assert.strictEqual(p.ctx.jmeno_('"Novák, Jan" <jan@x.cz>, b@c.cz'), 'Novák, Jan');
  assert.strictEqual(p.ctx.jmeno_('„Dr. X, Ph.D.“ <x@y.cz>'), 'Dr. X, Ph.D.');
  assert.strictEqual(p.ctx.jmeno_('jan@x.cz'), 'jan@x.cz');
  const o = p.volej('odeslat', { rezim: 'novy', komu: '"Novák, Jan" <jan@x.cz>; b@c.cz', text: 'Ahoj' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(p.posledniOdeslano().komu, '"Novák, Jan" <jan@x.cz>, b@c.cz');
  // tři adresáti se jménem s čárkou jsou tři, ne šest → pořád „čekáš na ně“, ne hromadná zpráva
  const ted = Date.UTC(2026, 9, 2, 13);
  const m = p.zprava({ id: 'x', od: 'Já <' + JA + '>', komu: '"A, B" <a@x.test>, "C, D" <c@x.test>, "E, F" <e@x.test>', predmet: 'Věc', text: 'Posílám.', kdy: ted });
  assert.strictEqual(p.ctx.stavPripadu_(m, true, null, false, ted, true), 'cekas');
});

test('pošta: starší okno 30–90 dní – jen nevyřízené (hoří, čeká, otázka), nejvýš 25, bez duplicit', () => {
  const p = prostredi();
  const kdy = Date.now() - 45 * 864e5;
  const stara = (id, o) => p.vlakno(id, [p.zprava(Object.assign({ id: id + 'm', predmet: 'Starší ' + id, kdy }, o))], false);
  p.nastavStarsi([
    stara('s1', { od: 'Trenér <trener@klub.test>', text: 'Pošli prosím soupisku.' }), // čeká na tebe
    stara('s2', { od: 'Banka <no-reply@banka.test>', text: 'Výpis z účtu.' }),        // informace
    stara('s3', { od: 'Já <' + JA + '>', komu: 'trener@klub.test', text: 'Posílám.' }), // čekáš na ně
    stara('s4', { od: 'Trenér <trener@klub.test>', text: 'Kdy začíná trénink?' }),    // otázka
    p.vlakna.v1                                                                         // je i v novém okně
  ]);
  let o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(o.data.osobni.map((v) => v.id), ['v1', 's1', 's4']);
  const dotaz = 'in:inbox older_than:30d newer_than:90d -category:promotions -category:social -category:forums';
  assert.strictEqual(p.log.maxima[dotaz], 25);
  // pracovní účet stejně
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  p.nastavStarsi([], [stara('s5', { od: 'Investor <info@stavba.test>', komu: PRAC, text: 'Můžete to potvrdit?' }),
    stara('s6', { od: 'Dodavatel <obchod@cizi.test>', komu: PRAC, text: 'Pro informaci.' })]); // neznámý bez prosby = informace
  o = p.volej('posta', { znovu: true });
  assert.deepStrictEqual(o.data.pracovni.map((v) => v.id), ['v2', 's5']);
  assert.ok(p.log.dotazy.includes(dotaz + ' {to:' + PRAC + ' cc:' + PRAC + ' deliveredto:' + PRAC + '}'));
});

test('vlákno: dlouhý text a HTML se zkrátí („…“), jiná adresa pro odpověď (Reply-To) se ukáže', () => {
  const p = prostredi();
  const html = '<div>' + '<p>odstavec</p>'.repeat(20000) + '</div>'; // 300 000 znaků
  p.vlakna.v9 = p.vlakno('v9', [
    p.zprava({ id: 'm9', od: 'Firma <info@firma.test>', odpovedNa: 'Podpora <podpora@firma.test>', predmet: 'Newsletter',
      text: 'a'.repeat(150000), html, kdy: Date.now() - 864e5 }),
    p.zprava({ id: 'm10', od: 'Trenér <trener@klub.test>', odpovedNa: 'trener@klub.test', predmet: 'Re: Newsletter', text: 'Krátká', kdy: Date.now() })
  ], false);
  const o = p.volej('vlakno', { id: 'v9' });
  assert.strictEqual(o.ok, true, o.chyba);
  const [z1, z2] = o.data.zpravy;
  assert.deepStrictEqual([z1.text.length, z1.text.slice(-2)], [100001, 'a…']);
  assert.ok(z1.html.length <= 180001 && />…$/.test(z1.html), z1.html.slice(-20)); // řez za celým tagem
  assert.strictEqual(z1.odpovedNa, 'Podpora <podpora@firma.test>');
  assert.deepStrictEqual([z2.text, z2.html], ['Krátká', '<p>Krátká</p>']);
  assert.ok(!('odpovedNa' in z2)); // Reply-To = odesílatel
});

// ---------------------------------------------------------------- schránka: dopsat, nadpis, téma, návrh, smazat

const json = (x) => JSON.parse(JSON.stringify(x));

test('opakovaný požadavek (stejný rid, Google ztratil odpověď): zápis jen jednou, druhý pokus dostane stejnou odpověď', () => {
  const p = prostredi();
  p.schranka.createFolder('NOVE');
  const a = p.volej('poznamka', { text: 'Jednou', rid: 'pozadavek-1234' });
  assert.strictEqual(a.ok, true, a.chyba);
  const b = p.volej('poznamka', { text: 'Jednou', rid: 'pozadavek-1234' });
  assert.deepStrictEqual(b, a);
  assert.strictEqual(p.schranka.deti.NOVE.soubory.length, 1, 'poznámka jen jednou');
  // jiný rid = nový zápis; čtení se nepamatuje
  p.volej('poznamka', { text: 'Podruhé', rid: 'pozadavek-5678' });
  assert.strictEqual(p.schranka.deti.NOVE.soubory.length, 2);
  p.volej('info', { rid: 'cteni-12345678' });
  assert.strictEqual(p.cache.get('RID:cteni-12345678'), undefined);
  // chyba se nepamatuje – oprava a nový pokus projde
  assert.strictEqual(p.volej('poznamka', { text: '', rid: 'pozadavek-9999' }).ok, false);
  assert.strictEqual(p.volej('poznamka', { text: 'Oprava', rid: 'pozadavek-9999' }).ok, true);
});

test('schránka: nadpis a téma v hlavičce, dopsat i k vyřízené (zpět do NOVE), návrh od Clauda, smazat do koše', () => {
  const p = prostredi();
  const ceka = p.schranka.createFolder('CEKA');
  p.schranka.createFolder('NOVE');
  const hotovo = p.schranka.createFolder('HOTOVO');
  const mesic = hotovo.createFolder('2026-10');
  const navrh = { typ: 'udalost', nazev: 'Schůzka s Petrem', zacatek: '2026-10-06T10:00', konec: '2026-10-06T11:00', hoste: ['Petr Novák'], pozvat: true };
  ceka.createFile('2026-10-02_100000_ab12.md', '---\nkdy: 2026-10-02T10:00:00+02:00\nodkud: iPhone\ntyp: ukol-michal\nstav: rozhodni\nshrnuti: Schůzka s Petrem\nnavrh: ' +
    JSON.stringify(navrh) + '\n---\n\nPozvi Petra na schůzku v úterý v deset.\n\n## Claude – 2026-10-02 10:30\nPřipravil jsem návrh události.\n');
  mesic.createFile('2026-10-01_090000_cd34.md', '---\nkdy: 2026-10-01T09:00:00+02:00\n---\n\nKolik je místností?\n\n## Claude – 2026-10-01 09:30\n48.\n');
  let o = p.volej('schranka');
  assert.strictEqual(o.ok, true, o.chyba);
  const polozka = o.data.ceka[0];
  assert.deepStrictEqual(json(polozka.navrh), navrh);
  assert.deepStrictEqual([polozka.nadpis, polozka.tema], ['', '']);
  // nadpis a téma: hlavička se upraví, soubor zůstane v CEKA, vrátí se upravená položka
  o = p.volej('polozka', { id: polozka.id, jak: 'nadpis', text: '  Schůzka   s Petrem – úterý ' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.nadpis, 'Schůzka s Petrem – úterý');
  o = p.volej('polozka', { id: polozka.id, jak: 'tema', text: 'Prace' });
  assert.deepStrictEqual([o.data.tema, o.data.slozka, o.data.text], ['prace', 'CEKA', 'Pozvi Petra na schůzku v úterý v deset.']);
  assert.strictEqual(p.volej('polozka', { id: polozka.id, jak: 'tema', text: 'nesmysl s mezerou' }).ok, false);
  o = p.volej('polozka', { id: polozka.id, jak: 'nadpis', text: '' });
  assert.strictEqual(o.data.nadpis, '');
  // termín (Odložit / Změnit termín v aplikaci): RRRR-MM-DD nebo prázdný = bez termínu
  assert.strictEqual(p.volej('polozka', { id: polozka.id, jak: 'termin', text: '2026-10-09' }).data.termin, '2026-10-09');
  assert.strictEqual(p.volej('polozka', { id: polozka.id, jak: 'termin', text: 'zítra' }).ok, false);
  assert.strictEqual(p.volej('polozka', { id: polozka.id, jak: 'termin', text: '' }).data.termin, '');
  // kdy Claude naposledy zpracoval schránku (PREHLED.md)
  assert.strictEqual(p.volej('schranka').data.zpracovano, null);
  p.schranka.createFile('PREHLED.md', '# Schránka – přehled');
  assert.ok(p.volej('schranka').data.zpracovano > 0, 'čas z PREHLED.md');
  assert.ok(/^---\nkdy: [^\n]+\nodkud: iPhone\n/.test(p.vsechnySoubory[polozka.id].getBlob().getDataAsString()));
  // hotovo s textem (po založení události z návrhu) → HOTOVO/RRRR-MM, text v sekci Michal
  assert.strictEqual(p.volej('polozka', { id: polozka.id, jak: 'hotovo', text: 'Událost založena: Schůzka s Petrem, út 6. 10. 10:00' }).ok, true);
  o = p.volej('schranka');
  assert.strictEqual(o.data.ceka.length, 0);
  const hotova = o.data.hotovo.find((x) => x.id === polozka.id);
  assert.strictEqual(hotova.vlakno.pop().text, 'Událost založena: Schůzka s Petrem, út 6. 10. 10:00');
  // dopsat k vyřízené → zpět do NOVE jako nový pokyn
  const stara = o.data.hotovo.find((x) => x.id !== polozka.id);
  assert.strictEqual(p.volej('polozka', { id: stara.id, jak: 'dopsat', text: 'A kolik jich je ve 3. NP?' }).ok, true);
  o = p.volej('schranka');
  const dopsana = o.data.nove.find((x) => x.id === stara.id);
  assert.ok(dopsana, 'dopsaná položka má být v NOVE');
  const posledni = dopsana.vlakno[dopsana.vlakno.length - 1];
  assert.deepStrictEqual([posledni.kdo, posledni.text], ['Michal', 'A kolik jich je ve 3. NP?']);
  assert.strictEqual(p.volej('polozka', { id: stara.id, jak: 'dopsat', text: '  ' }).ok, false);
  // smazat → koš (ve výpisu schránky už není)
  assert.strictEqual(p.volej('polozka', { id: stara.id, jak: 'smazat' }).ok, true);
  assert.strictEqual(p.vsechnySoubory[stara.id].vKosi, true);
  assert.ok(!p.volej('schranka').data.nove.some((x) => x.id === stara.id));
});

test('schránka: smazat a vrátit (pravé tlačítko) jen poznámky ze stromu schránky; moje poznámky – výpis, přidat, hotovo a zpět, smazat', () => {
  const p = prostredi();
  const nove = p.schranka.createFolder('NOVE');
  const mesic = p.schranka.createFolder('HOTOVO').createFolder('2026-10');
  const zdravi = p.schranka.createFolder('ZDRAVI');
  // bez složky MOJE: prázdný seznam a složka se při čtení nezakládá
  let o = p.volej('schranka');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.moje), []);
  assert.ok(!p.schranka.deti.MOJE, 'čtení složku MOJE nezakládá');
  // zkratka „Pro mě“ zapisuje stejný tvar jako do NOVE (BOM a CRLF z Windows nevadí)
  const moje = p.schranka.createFolder('MOJE');
  moje.createFile('2026-10-08_071500_aa11.md', '---\nkdy: 2026-10-08T07:15:00+02:00\nodkud: iPhone\n---\n\nKoupit žárovky do garáže.\n');
  moje.createFile('2026-10-09_183000_bb22.md', '﻿---\r\nkdy: 2026-10-09T18:30:00+02:00\r\nodkud: iPhone\r\n---\r\n\r\nZavolat kvůli\r\npneumatikám.\r\n');
  moje.createFile('poznamka.txt', 'jiný soubor');
  o = p.volej('schranka');
  assert.deepStrictEqual(json(o.data.moje).map((x) => [x.text, x.odkud]), [['Zavolat kvůli\npneumatikám.', 'iPhone'], ['Koupit žárovky do garáže.', 'iPhone']],
    'nejnovější nahoře, jen .md');
  assert.deepStrictEqual(Object.keys(o.data.moje[0]).sort(), ['id', 'kdy', 'odkud', 'text']);
  assert.strictEqual(o.data.moje[0].kdy, Date.parse('2026-10-09T18:30:00+02:00'));
  const pneu = o.data.moje[0].id;
  assert.ok(!o.data.nove.length && !o.data.ceka.length, 'moje poznámky nejsou mezi poznámkami pro Clauda');
  // přidat z aplikace: soubor v MOJE se stejnou hlavičkou jako poznámka pro Clauda, vrátí se ve tvaru seznamu
  const pridana = p.volej('mojePridat', { text: '  Vrátit knihu do knihovny  ', rid: 'moje-pridat-1' });
  assert.strictEqual(pridana.ok, true, pridana.chyba);
  assert.deepStrictEqual([pridana.data.text, pridana.data.odkud], ['Vrátit knihu do knihovny', 'aplikace']);
  assert.ok(/^---\nkdy: [^\n]+\nodkud: aplikace\n---\n\nVrátit knihu do knihovny\n$/.test(p.vsechnySoubory[pridana.data.id].getBlob().getDataAsString()));
  assert.deepStrictEqual(p.volej('mojePridat', { text: '  Vrátit knihu do knihovny  ', rid: 'moje-pridat-1' }), pridana, 'opakovaný požadavek jen jednou');
  assert.strictEqual(moje.soubory.filter((f) => /\.md$/.test(f.getName())).length, 3);
  assert.ok(/Prázdná/.test(p.volej('mojePridat', { text: '   ' }).chyba));
  assert.strictEqual(p.volej('schranka').data.moje[0].id, pridana.data.id);
  // hotovo → MOJE/HOTOVO (ze seznamu pryč), zpět → zase mezi aktivními
  const zarovky = o.data.moje[1].id;
  o = p.volej('mojeHotovo', { id: zarovky });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.ok(moje.deti.HOTOVO.soubory.some((f) => f.getId() === zarovky), 'v MOJE/HOTOVO');
  assert.ok(!p.volej('schranka').data.moje.some((x) => x.id === zarovky));
  assert.ok(/není mezi mými/.test(p.volej('mojeHotovo', { id: zarovky }).chyba), 'hotová podruhé ne');
  o = p.volej('mojeHotovo', { id: zarovky, zpet: true });
  assert.deepStrictEqual([o.ok, o.data && o.data.text], [true, 'Koupit žárovky do garáže.']);
  assert.ok(p.volej('schranka').data.moje.some((x) => x.id === zarovky), 'po Vrátit zase aktivní');
  // smazat moji poznámku → koš (aktivní i hotovou), Vrátit = schrankaObnovit
  assert.strictEqual(p.volej('mojeSmazat', { id: zarovky }).ok, true);
  assert.strictEqual(p.vsechnySoubory[zarovky].vKosi, true);
  assert.ok(!p.volej('schranka').data.moje.some((x) => x.id === zarovky));
  assert.ok(/v koši/.test(p.volej('mojeHotovo', { id: zarovky }).chyba));
  assert.strictEqual(p.volej('schrankaObnovit', { id: zarovky }).ok, true);
  assert.strictEqual(p.vsechnySoubory[zarovky].vKosi, false);
  assert.ok(p.volej('schranka').data.moje.some((x) => x.id === zarovky));
  // poznámka pro Clauda (NOVE, HOTOVO/RRRR-MM): smazat a vrátit; mojeHotovo / mojeSmazat na ni nesmí
  const proClauda = nove.createFile('2026-10-09_090000_cc33.md', '---\nkdy: 2026-10-09T09:00:00+02:00\nodkud: iPhone\n---\n\nZjisti, jak exportovat PDF.\n');
  const vyrizena = mesic.createFile('2026-10-01_090000_dd44.md', '---\nkdy: 2026-10-01T09:00:00+02:00\n---\n\nStará otázka.\n');
  assert.ok(/není mezi mými/.test(p.volej('mojeHotovo', { id: proClauda.getId() }).chyba));
  assert.ok(/není mezi mými/.test(p.volej('mojeSmazat', { id: proClauda.getId() }).chyba));
  assert.strictEqual(p.volej('schrankaSmazat', { id: proClauda.getId(), rid: 'smazat-nove-1' }).ok, true);
  assert.strictEqual(proClauda.vKosi, true);
  assert.ok(!p.volej('schranka').data.nove.some((x) => x.id === proClauda.getId()), 'smazaná ve výpisu není');
  assert.strictEqual(p.volej('schrankaObnovit', { id: proClauda.getId() }).ok, true);
  assert.ok(p.volej('schranka').data.nove.some((x) => x.id === proClauda.getId()), 'vrácená je zpět v NOVE');
  assert.strictEqual(p.volej('schrankaSmazat', { id: vyrizena.getId() }).ok, true);
  assert.strictEqual(vyrizena.vKosi, true);
  assert.strictEqual(p.volej('schrankaSmazat', { id: pridana.data.id }).ok, true, 'smazat jde i moje poznámka');
  // mimo schránku nic: soubor jinde ve schránce, jiný typ, kořen, neexistující id
  const json1 = zdravi.createFile('VAHA.json', '{}');
  const md = zdravi.createFile('poznamka.md', 'x');
  const prehled = p.schranka.createFile('PREHLED.md', '# Přehled');
  [json1, md, prehled].forEach((f) => {
    const r = p.volej('schrankaSmazat', { id: f.getId() });
    assert.deepStrictEqual([r.ok, /není ve schránce/.test(r.chyba), f.vKosi], [false, true, false], f.getName());
  });
  assert.ok(/není ve schránce/.test(p.volej('schrankaObnovit', { id: md.getId() }).chyba));
  assert.ok(/nenalezena/.test(p.volej('schrankaSmazat', { id: 'neexistuje' }).chyba));
  // úpravy položek (polozka) dál jen v NOVE / CEKA / HOTOVO – ne moje poznámky
  assert.ok(/není ve schránce/.test(p.volej('polozka', { id: zarovky, jak: 'dopsat', text: 'x' }).chyba));
  // seznam nejvýš 50 nejnovějších
  for (let i = 0; i < 55; i++) moje.createFile('2026-09-' + String(1 + (i % 28)).padStart(2, '0') + '_0800' + String(i).padStart(2, '0') + '_x' + i + '.md', '---\nkdy: 2026-09-' + String(1 + (i % 28)).padStart(2, '0') + 'T08:00:00+02:00\n---\n\nStará ' + i + '\n');
  o = p.volej('schranka');
  assert.strictEqual(o.data.moje.length, 50);
  assert.deepStrictEqual([o.data.moje[0].id, o.data.moje[1].id], [pneu, zarovky], 'nejnovější pořád nahoře');
  assert.ok(o.data.moje.every((x, i, a) => !i || a[i - 1].kdy >= x.kdy), 'seřazené od nejnovější');
  const akce = p.volej('info').data.akce;
  assert.ok(['schrankaSmazat', 'schrankaObnovit', 'mojePridat', 'mojeHotovo', 'mojeSmazat'].every((a) => akce.indexOf(a) >= 0), 'info hlásí nové akce');
});

// ---------------------------------------------------------------- štítky Gmailu, kontakty, podpisy

test('štítky: u konverzací v seznamu (z mezipaměti podruhé bez Gmailu), seznam štítků, konverzace štítku i archivované', () => {
  const p = prostredi();
  p.stitkyVlaken.v1 = ['Fotbal', 'Fotbal/Dorost'];
  let o = p.volej('posta');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.osobni[0].stitky), ['Fotbal', 'Fotbal/Dorost']);
  const volani = p.log.getLabels;
  o = p.volej('posta', { znovu: true });
  assert.deepStrictEqual(json(o.data.osobni[0].stitky), ['Fotbal', 'Fotbal/Dorost']);
  assert.strictEqual(p.log.getLabels, volani, 'štítky vlákna se mají brát z mezipaměti');
  // seznam štítků s nepřečtenými, seřazený po česku
  p.nastavStitkyGmailu({ 'Účty': { neprectenych: 2, vlakna: [] }, 'Fotbal': { neprectenych: 0, vlakna: [p.vlakna.v1, p.vlakna.v3] }, 'Auto': { neprectenych: 1, vlakna: [] } });
  o = p.volej('stitky');
  assert.deepStrictEqual(json(o.data).map((s) => s.nazev + ':' + s.neprectenych), ['Auto:1', 'Fotbal:0', 'Účty:2']);
  // konverzace štítku: i ta odeslaná/archivovaná (v3), každá se stavem
  o = p.volej('postaStitek', { nazev: 'Fotbal' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(o.data.vlakna.map((v) => v.id), ['v1', 'v3']);
  assert.strictEqual(o.data.vlakna[1].stav, 'cekas');
  assert.strictEqual(p.volej('postaStitek', { nazev: 'Neexistuje' }).ok, false);
});

test('kontakty ze odeslané pošty (jméno, adresa, počet) a podpisy osobní / pracovní', () => {
  const p = prostredi();
  let o = p.volej('kontakty');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data), [{ j: 'Trenér', a: 'trener@klub.test', n: 1 }]);
  // starý tvar mezipaměti (jen adresy) se sestaví znovu i se jmény
  const p2 = prostredi();
  p2.cache.set('znami', '1'); p2.cache.set('znami:0', JSON.stringify(['trener@klub.test']));
  assert.deepStrictEqual(json(p2.volej('kontakty').data), [{ j: 'Trenér', a: 'trener@klub.test', n: 1 }]);
  // podpisy: uložit, info je vrací, příliš dlouhý odmítnout
  o = p.volej('podpisyUlozit', { podpisy: { osobni: 'Michal\r\n', pracovni: 'S pozdravem\nMichal\nFirma' } });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.podpisy), { osobni: 'Michal', pracovni: 'S pozdravem\nMichal\nFirma' });
  assert.deepStrictEqual(json(p.volej('info').data.posta.podpisy), { osobni: 'Michal', pracovni: 'S pozdravem\nMichal\nFirma' });
  assert.strictEqual(p.volej('podpisyUlozit', { podpisy: { osobni: 'x'.repeat(2001) } }).ok, false);
});

// ---------------------------------------------------------------- fotbal a druhy kalendářů

const FOTBAL = fs.readFileSync(path.join(__dirname, 'fotbal', 'FOTBAL.json'), 'utf8');

test('fotbal: zápasy ze schránky, převod vybraných týmů do kalendářů „⚽ tým“, výsledek v názvu, bez duplicit', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-02T20:00:00+02:00'));
  let o = p.volej('fotbal');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.data, null); // soubor ještě není
  assert.ok(/FOTBAL\.json/.test(p.volej('fotbalKalendar', { tymy: ['A'] }).chyba));
  p.schranka.createFile('FOTBAL.json', FOTBAL);
  o = p.volej('fotbal');
  assert.deepStrictEqual([o.data.data.zapasy.length, o.data.vKalendari.length, o.data.data.tymy.map((t) => t.klic).join()], [34, 0, 'A,B,dorost']);
  o = p.volej('fotbalKalendar', { tymy: ['A', 'dorost', 'neexistuje'] });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.ok(o.data.pridano > 0 && o.data.upraveno === 0, JSON.stringify(o.data));
  const kalA = p.kalendare.find((k) => k.getName() === '⚽ A-tým');
  const kalD = p.kalendare.find((k) => k.getName() === '⚽ Dorost');
  assert.ok(kalA && kalD && !p.kalendare.some((k) => k.getName() === '⚽ B-tým'));
  const nazvy = kalA.udalosti.map((u) => u._.nazev);
  assert.ok(nazvy.indexOf('⚽ Šardice – Vnorovy (A-tým)') >= 0, nazvy.join(' | '));
  assert.ok(nazvy.some((n) => /^⚽ Vnorovy – Lysovice \(A-tým\) 1:3$/.test(n)), 'odehraný zápas s výsledkem');
  const sardice = kalA.udalosti.find((u) => /Šardice/.test(u._.nazev));
  assert.deepStrictEqual([sardice._.z, sardice._.k - sardice._.z, sardice._.misto], [Date.parse('2026-10-03T15:00:00+02:00'), 120 * 6e4, 'Šardice']);
  assert.ok(/6\. liga/.test(sardice._.popis) && /10\. kolo/.test(sardice._.popis) && /fotbal\.cz/.test(sardice._.popis));
  assert.strictEqual(sardice._.stitky.asistent.indexOf('fotbal:'), 0);
  assert.deepStrictEqual(json(sardice._.pripomenuti), [1440, 120]);
  // druh fotbal pro týmové kalendáře, nastavení zapamatované
  const seznam = p.volej('kalendare').data;
  assert.strictEqual(seznam.find((k) => k.nazev === '⚽ A-tým').druh, 'fotbal');
  assert.deepStrictEqual(json(p.volej('fotbal').data.vKalendari), ['A', 'dorost']);
  // podruhé nic nového
  o = p.volej('fotbalKalendar', { tymy: ['A', 'dorost'] });
  assert.deepStrictEqual([o.data.pridano, o.data.upraveno], [0, 0]);
  // nová data ve schránce (přeložený zápas + výsledek) → fotbal sám kalendář obnoví
  const data = JSON.parse(FOTBAL);
  const z = data.zapasy.find((x) => x.id === sardice._.stitky.asistent.slice(7));
  z.zacatek = '2026-10-03T16:30:00+02:00';
  p.schranka.soubory.find((x) => x.getName() === 'FOTBAL.json').setContent(JSON.stringify(data));
  o = p.volej('fotbal');
  assert.strictEqual(o.data.kalendar.upraveno, 1, JSON.stringify(o.data.kalendar));
  assert.strictEqual(sardice._.z, Date.parse('2026-10-03T16:30:00+02:00'));
  assert.strictEqual(p.ctx.kratkyKlub_('FK Hodonín "B"'), 'Hodonín B');
  assert.strictEqual(p.ctx.kratkyKlub_('TJ Sokol Těšany'), 'Těšany');
  assert.strictEqual(p.ctx.kratkyKlub_('FK Agro Vnorovy,z.s.'), 'Vnorovy');
});

test('druhy kalendářů: odhad podle názvu, uložení vlastního, neplatný odmítnut', () => {
  const p = prostredi();
  let o = p.volej('kalendare');
  assert.strictEqual(o.data[0].druh, 'osobni');
  assert.strictEqual(p.ctx.odhadDruhu_('Práce – projekty'), 'prace');
  assert.strictEqual(p.ctx.odhadDruhu_('Trénink dorostu'), 'fotbal');
  o = p.volej('kalendarUpravit', { id: 'osobni@gmail.test', druh: 'rodina' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.find((k) => k.id === 'osobni@gmail.test').druh, 'rodina');
  assert.strictEqual(p.volej('kalendarUpravit', { id: 'osobni@gmail.test', druh: 'nesmysl' }).ok, false);
});

// ---------------------------------------------------------------- zdraví: WHOOP + Apple Zdraví

const WHOOP_VZOR = {
  sleep: [
    { id: 's1', cycle_id: 101, start: '2026-10-01T21:10:00.000Z', end: '2026-10-02T05:05:00.000Z', timezone_offset: '+02:00', nap: false, score_state: 'SCORED',
      score: { stage_summary: { total_in_bed_time_milli: 28500000, total_awake_time_milli: 1500000, total_light_sleep_time_milli: 13000000,
        total_slow_wave_sleep_time_milli: 6500000, total_rem_sleep_time_milli: 7000000, sleep_cycle_count: 5, disturbance_count: 8 },
      sleep_needed: { baseline_milli: 27000000, need_from_sleep_debt_milli: 1200000, need_from_recent_strain_milli: 600000, need_from_recent_nap_milli: 0 },
      respiratory_rate: 15.2, sleep_performance_percentage: 91, sleep_consistency_percentage: 83, sleep_efficiency_percentage: 94.1 } },
    { id: 's0', cycle_id: 100, start: '2026-10-01T12:00:00.000Z', end: '2026-10-01T12:30:00.000Z', timezone_offset: '+02:00', nap: true, score_state: 'SCORED', score: {} }
  ],
  recovery: [{ cycle_id: 101, sleep_id: 's1', created_at: '2026-10-02T05:40:00.000Z', score_state: 'SCORED',
    score: { user_calibrating: false, recovery_score: 72, resting_heart_rate: 49, hrv_rmssd_milli: 84.34, spo2_percentage: 96.4, skin_temp_celsius: 33.9 } }],
  cycle: [{ id: 101, start: '2026-10-01T21:10:00.000Z', end: null, timezone_offset: '+02:00', score_state: 'SCORED',
    score: { strain: 9.44, kilojoule: 8000, average_heart_rate: 70, max_heart_rate: 150 }, step_count: 6012 }],
  workout: [{ id: 'w1', start: '2026-10-01T14:00:00.000Z', end: '2026-10-01T15:45:00.000Z', timezone_offset: '+02:00', sport_name: 'Soccer', score_state: 'SCORED',
    score: { strain: 15.8, average_heart_rate: 152, max_heart_rate: 191, kilojoule: 4210.5, percent_recorded: 100,
      zone_durations: { zone_zero_milli: 240000, zone_one_milli: 600000, zone_two_milli: 1500000, zone_three_milli: 1800000, zone_four_milli: 1200000, zone_five_milli: 360000 } } }]
};

function zdraviProstredi() {
  const p = prostredi();
  p.vlastnosti.set('WHOOP_CLIENT_ID', 'klient-id');
  p.vlastnosti.set('WHOOP_CLIENT_SECRET', 'klient-tajne');
  p.vlastnosti.set('WHOOP_REDIRECT_URI', 'https://script.google.com/macros/s/MOTOR/exec');
  p.whoop.data = JSON.parse(JSON.stringify(WHOOP_VZOR));
  p.nastavCas(Date.parse('2026-10-02T08:00:00Z'));
  return p;
}

test('zdraví: propojení WHOOP – odkaz se state, návrat do doGet (špatný state odmítnut), tokeny a první synchronizace', () => {
  const bez = prostredi();
  assert.ok(/WHOOP_CLIENT_ID/.test(bez.volej('whoopPropojit').chyba));
  const p = zdraviProstredi();
  const o = p.volej('whoopPropojit');
  assert.strictEqual(o.ok, true, o.chyba);
  const u = new URL(o.data.odkaz);
  assert.strictEqual(u.origin + u.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth');
  assert.deepStrictEqual([u.searchParams.get('response_type'), u.searchParams.get('client_id'), u.searchParams.get('redirect_uri')],
    ['code', 'klient-id', 'https://script.google.com/macros/s/MOTOR/exec']);
  assert.ok(/offline/.test(u.searchParams.get('scope')) && u.searchParams.get('state').length >= 32);
  // cizí state → nic
  let h = p.ctx.doGet({ parameter: { code: 'dobry-kod', state: 'cizi-state-12345678' } }).html;
  assert.ok(/nepropojen/.test(h) && !p.vlastnosti.has('WHOOP_TOKEN'));
  // správně → tokeny + data za 30 dní
  h = p.ctx.doGet({ parameter: { code: 'dobry-kod', state: u.searchParams.get('state') } }).html;
  assert.ok(/WHOOP propojen/.test(h), h);
  assert.strictEqual(JSON.parse(p.vlastnosti.get('WHOOP_TOKEN')).refresh_token, 'r1');
  assert.ok(p.whoop.volani.some((x) => x.indexOf('/developer/v2/activity/sleep?limit=25&start=') === 0));
  assert.ok(p.whoop.volani.some((x) => /nextToken=str2/.test(x)), 'druhá stránka');
  // state jde použít jen jednou
  h = p.ctx.doGet({ parameter: { code: 'dobry-kod', state: u.searchParams.get('state') } }).html;
  assert.ok(/nepropojen/.test(h));
  // běžný doGet beze změny
  assert.strictEqual(p.ctx.doGet({ parameter: {} }).text, 'Asistent – motor běží.');
  assert.strictEqual(p.ctx.doGet({ parameter: { verze: '' } }).text, /const VERZE = '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '..', 'Kod.gs'), 'utf8'))[1], 'verze pro nasazovací skript');
});

test('zdraví: WHOOP stahuje spouštěč na pozadí (nejvýš 1× za 30 min) – čtení Zdraví na WHOOP nečeká; nová data → značka zdraví', () => {
  const p = zdraviProstredi();
  p.vlastnosti.set('WHOOP_TOKEN', JSON.stringify({ access_token: 'a1', refresh_token: 'r1', expiresAt: Date.parse('2026-10-02T09:00:00Z') }));
  p.nastavCas(Date.parse('2026-10-02T06:00:00Z')); // 8:00 v Praze
  p.ctx.instagramKazdych10Min();
  const po = p.whoop.volani.length;
  assert.ok(po > 0, 'spouštěč stáhl WHOOP');
  const znacka = p.volej('zmeny').data.zdravi;
  assert.ok(znacka >= Date.parse('2026-10-02T06:00:00Z'), 'nová data z WHOOP → značka změny zdraví');
  p.nastavCas(Date.parse('2026-10-02T06:10:00Z'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(p.whoop.volani.length, po, 'do 30 minut znovu ne');
  p.nastavCas(Date.parse('2026-10-02T06:40:00Z'));
  assert.strictEqual(p.volej('zdravi').ok, true);
  assert.strictEqual(p.whoop.volani.length, po, 'otevření Zdraví na WHOOP nečeká (spouštěč jede)');
  p.ctx.instagramKazdych10Min();
  assert.ok(p.whoop.volani.length > po, 'po 30 minutách spouštěč znovu');
  assert.strictEqual(p.volej('zmeny').data.zdravi, znacka, 'stejná data → značka stojí (zařízení nic znovu nenačítají)');
  // spouštěč nejede (data starší 2 h) → čtení Zdraví WHOOP dotáhne samo
  const po2 = p.whoop.volani.length;
  p.nastavCas(Date.parse('2026-10-02T09:00:00Z'));
  p.vlastnosti.set('WHOOP_TOKEN', JSON.stringify({ access_token: 'a1', refresh_token: 'r1', expiresAt: Date.parse('2026-10-02T12:00:00Z') }));
  assert.strictEqual(p.volej('zdravi').ok, true);
  assert.ok(p.whoop.volani.length > po2, 'záloha při otevření');
});

test('zdraví: přehled po dnech (den probuzení), recovery přes spánek, zátěž cyklu, tréninky; obnova tokenu s rotací; 401 odpojí', () => {
  const p = zdraviProstredi();
  p.vlastnosti.set('WHOOP_TOKEN', JSON.stringify({ access_token: 'a1', refresh_token: 'r1', expiresAt: Date.parse('2026-10-02T09:00:00Z') }));
  let o = p.volej('zdravi');
  assert.strictEqual(o.ok, true, o.chyba);
  const d = o.data.dny.find((x) => x.den === '2026-10-02');
  assert.ok(d && d.whoop, JSON.stringify(o.data.dny));
  assert.deepStrictEqual(json(d.whoop.pripravenost), { skore: 72, hrv: 84.3, klidovyTep: 49, spo2: 96.4, teplota: 33.9, kalibrace: false });
  assert.strictEqual(d.whoop.spanek.celkem, 26500000);
  assert.deepStrictEqual([d.whoop.spanek.vykon, d.whoop.spanek.potreba, d.whoop.spanek.efektivita], [91, 28800000, 94.1]);
  assert.deepStrictEqual(json(d.whoop.zatez), { probiha: true, kroky: 6012, zatez: 9.4, kcal: 1912, tepPrumer: 70, tepMax: 150 });
  assert.deepStrictEqual(json(o.data.treninky.map((t) => [t.den, t.sport, t.zatez, t.kcal, t.zony.join(',')])),
    [['2026-10-01', 'soccer', 15.8, 1006, '4,10,25,30,20,6']]);
  assert.strictEqual(o.data.whoop.propojeno, true);
  // podruhé do 30 minut se WHOOP nevolá; znovu = vynutit; prošlý token → obnova a nový refresh token hned uložený
  const pocet = p.whoop.volani.length;
  p.volej('zdravi');
  assert.strictEqual(p.whoop.volani.length, pocet);
  p.nastavCas(Date.parse('2026-10-02T09:30:00Z'));
  o = p.volej('zdravi', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(JSON.parse(p.vlastnosti.get('WHOOP_TOKEN')).refresh_token, 'r2');
  assert.ok(p.whoop.volani.indexOf('/oauth/oauth2/token') >= 0);
  // WHOOP odvolal přístup → 401 → odpojeno, chyba v přehledu, uložená data zůstanou
  p.whoop.chyba401 = true;
  o = p.volej('zdravi', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.whoop.propojeno, /propoj znovu/.test(o.data.whoop.sync.chyba)], [false, true]);
  assert.ok(o.data.dny.some((x) => x.den === '2026-10-02' && x.whoop.pripravenost));
});

test('zdraví: zkratka Apple Zdraví – vlastní klíč, česká čísla a data, spánek přes půlnoc, data zůstanou vedle WHOOP', () => {
  const p = zdraviProstredi();
  let r = p.volej('zdraviApple', { kroky: '2026-10-01T00:00:00+02:00=11 873' }, 'spatny');
  assert.deepStrictEqual([r.ok, r.chyba, /nesedí/.test(r.zprava)], [false, 'klic', true], JSON.stringify(r));
  r = p.volej('zdraviApple', { kroky: '…' }, KLIC); // hlavní klíč tu neplatí – zkratka dostane i důvod
  assert.deepStrictEqual([r.ok, r.chyba, /hlavní klíč/.test(r.zprava)], [false, 'klic', true], JSON.stringify(r));
  assert.ok(JSON.stringify(r).indexOf(KLIC) < 0, 'klíč se v odpovědi nevrací');
  const k = p.volej('zdraviKlic').data.klic;
  assert.ok(k && k.length >= 32);
  // klíč s mezerou a odřádkováním (kopírování v iPhonu) a zpráva bez pole akce – pozná se podle klíče zkratky
  r = p.surovy(JSON.stringify({ klic: ' ' + k + '\n', kroky_dny: '1. 10. 2026 v 0:00', kroky: '6 000' }));
  assert.deepStrictEqual([r.ok, r.data && r.data.ulozeno], [true, 1], JSON.stringify(r));
  // běžné požadavky aplikace s hlavním klíčem jdou dál beze změny
  assert.strictEqual(p.volej('zdravi').ok, true);
  const o = p.volej('zdraviApple', {
    verze: '1',
    kroky: '2026-10-01T00:00:00+02:00=11\u00a0873;2026-10-02T00:00:00+02:00=512',
    energie: '1. 10. 2026=612,4', vzdalenost: '2026-10-01T00:00:00+02:00=8,47', vo2max: '2026-09-28T10:00:00+02:00=41,2',
    klidovy_tep: '2026-10-01T00:00:00+02:00=55', hrv: '2026-10-01T00:00:00+02:00=48,36',
    spanek: '2026-10-01T22:50:00+02:00|2026-10-01T23:40:00+02:00|Jádro;2026-10-01T23:40:00+02:00|2026-10-02T00:30:00+02:00|Hluboký;' +
      '2026-10-02T00:30:00+02:00|2026-10-02T00:40:00+02:00|Vzhůru;2026-10-02T00:40:00+02:00|2026-10-02T06:10:00+02:00|REM;' +
      '2026-10-01T22:40:00+02:00|2026-10-02T06:20:00+02:00|V posteli'
  }, k);
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.ulozeno, 3);
  const z = p.volej('zdravi').data;
  const den1 = z.dny.find((x) => x.den === '2026-10-01').apple;
  assert.deepStrictEqual([den1.kroky, den1.energie, den1.vzdalenost, den1.klidovyTep, den1.hrv], [11873, 612, 8.47, 55, 48.4]);
  const den2 = z.dny.find((x) => x.den === '2026-10-02').apple;
  assert.deepStrictEqual([den2.kroky, den2.spanek.celkem / 6e4, den2.spanek.hluboky / 6e4, den2.spanek.bdeni / 6e4], [512, 430, 50, 10]);
  assert.strictEqual(z.dny.find((x) => x.den === '2026-09-28').apple.vo2max, 41.2);
  assert.ok(z.apple.kdy > 0);
  // soubor na Disku: CLAUDE_SCHRANKA/ZDRAVI/2026-10.json (+ září kvůli VO2max)
  const zdravi = p.schranka.deti.ZDRAVI;
  assert.deepStrictEqual(zdravi.soubory.map((x) => x.getName()).sort(), ['2026-09.json', '2026-10.json']);
  // prázdná zpráva ze zkratky → srozumitelná chyba
  assert.ok(/žádná data/.test(p.volej('zdraviApple', { verze: '1' }, k).chyba));
  // jednodušší zkratka (bez Opakovat): dva seznamy – dny (výchozí formát data v iPhonu) a hodnoty, každý údaj na řádku
  const o2 = p.volej('zdraviApple', {
    kroky_dny: '3. 10. 2026 v 0:00\n4. 10. 2026 v 0:00\n5. října 2026', kroky: '9 812\n14 020\n1 203',
    energie_dny: '4. 10. 2026 v 0:00', energie: '702,5',
    klidovy_tep_dny: '3. 10. 2026 v 0:00\n4. 10. 2026 v 0:00', klidovy_tep: '0\n52' // nula = den bez měření („Doplnit chybějící“)
  }, k);
  assert.strictEqual(o2.ok, true, o2.chyba);
  const dny2 = p.volej('zdravi').data.dny;
  const a = (den) => (dny2.find((x) => x.den === den) || {}).apple || {};
  assert.deepStrictEqual([a('2026-10-03').kroky, a('2026-10-04').kroky, a('2026-10-05').kroky, a('2026-10-04').energie], [9812, 14020, 1203, 703]);
  assert.deepStrictEqual([a('2026-10-03').klidovyTep, a('2026-10-04').klidovyTep], [undefined, 52]);
  // seznamy poslané jako pole JSON (ne text po řádcích)
  assert.strictEqual(p.volej('zdraviApple', { kroky_dny: ['1. 10. 2026 v 0:00', '2. 10. 2026 v 0:00'], kroky: [7001, 7002] }, k).ok, true);
  const dny3 = p.volej('zdravi').data.dny;
  assert.strictEqual(dny3.find((x) => x.den === '2026-10-02').apple.kroky, 7002);
  // poslední zpráva ze zkratky: úspěch, nesrozumitelná data (s ukázkou), špatný klíč, hlavní klíč aplikace (bez klíče v záznamu)
  let pa = p.volej('zdravi').data.apple.posledni;
  assert.deepStrictEqual([pa.ok, pa.ulozeno, pa.od, pa.do], [true, 2, '2026-10-01', '2026-10-02']);
  assert.strictEqual(p.volej('zdraviApple', { kroky: 'nesmysl', kroky_dny: 'taky nesmysl' }, k).ok, false);
  pa = p.volej('zdravi').data.apple.posledni;
  assert.ok(!pa.ok && /žádná data/.test(pa.chyba) && pa.ukazka.kroky === 'nesmysl' && pa.pole.join() === 'kroky,kroky_dny', JSON.stringify(pa));
  p.volej('zdraviApple', { kroky: '1' }, 'spatny-klic');
  assert.ok(/nesedí/.test(p.volej('zdravi').data.apple.posledni.chyba));
  p.volej('zdraviApple', { kroky: '1' }, KLIC);
  pa = p.volej('zdravi').data.apple.posledni;
  assert.ok(/hlavní klíč/.test(pa.chyba) && JSON.stringify(pa).indexOf(KLIC) < 0, 'hlavní klíč poznán, ale nezapsán');
});

// ---------------------------------------------------------------- upozornění do iPhonu (ntfy)

test('upozornění: bez tématu nic; hoří v poště jen počtem (bez jmen a předmětů) a jednou; ranní souhrn jednou denně', () => {
  const p = prostredi();
  p.chmu.cap = 'cap_rijen.xml';
  p.nastavCas(Date.parse('2026-10-02T07:30:00+02:00'));
  p.ctx.kazdouHodinu();
  assert.ok(!p.log.ntfy, 'bez NTFY_TEMA se nic neposílá');
  p.vlastnosti.set('NTFY_TEMA', 'asistent-test');
  // nepřečtená naléhavá zpráva od známého (trenérovi jsem psal)
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm1', od: 'Trenér <trener@klub.test>', predmet: 'Hřiště', text: 'Urgentně: nefunguje osvětlení, ozvi se.', kdy: Date.parse('2026-10-02T07:00:00+02:00'), neprectena: true })], true);
  p.schranka.createFolder('CEKA').createFile('2026-10-01_090000_ab12.md', '---\nkdy: 2026-10-01T09:00:00+02:00\nstav: tvuj-ukol\n---\n\nZavolat.\n');
  p.ctx.kazdouHodinu();
  const zpravy = json(p.log.ntfy);
  const hori = zpravy.find((z) => /Hoří/.test(z.title));
  assert.ok(hori, JSON.stringify(zpravy));
  assert.strictEqual(hori.topic, 'asistent-test');
  assert.ok(/1 nová konverzace/.test(hori.message) && !/Trenér|Hřiště|osvětlení/.test(hori.title + hori.message), hori.message);
  const rano = zpravy.find((z) => z.title === 'Dobré ráno');
  assert.ok(rano && /1 ve schránce/.test(rano.message) && /°C/.test(rano.message), JSON.stringify(rano));
  // podruhé za hodinu nic nového
  const pocet = p.log.ntfy.length;
  p.nastavCas(Date.parse('2026-10-02T08:30:00+02:00'));
  p.ctx.kazdouHodinu();
  assert.strictEqual(p.log.ntfy.length, pocet);
});

test('upozornění z aplikace: zapnout (téma + zkušební zpráva), stav, test, vypnout; hlídá je spouštěč každých 10 minut', () => {
  const p = prostredi();
  p.chmu.cap = 'cap_rijen.xml';
  p.nastavCas(Date.parse('2026-10-02T07:30:00+02:00'));
  assert.deepStrictEqual(json(p.volej('upozorneni').data), { zapnuto: false, tema: '' });
  assert.strictEqual(p.volej('upozorneniTest').data.odeslano, false, 'bez tématu nic');
  const z = p.volej('upozorneniZapnout').data;
  assert.ok(z.zapnuto && /^asistent-[0-9a-f]{24}$/.test(z.tema) && z.odeslano, JSON.stringify(z));
  assert.deepStrictEqual([p.log.ntfy.length, p.log.ntfy[0].topic, p.log.ntfy[0].message], [1, z.tema, 'Upozornění fungují ✓']);
  assert.strictEqual(p.volej('upozorneniZapnout').data.tema, z.tema, 'podruhé stejné téma');
  // spouštěč každých 10 minut (instagramKazdych10Min) hlídá poštu i bez Instagramu
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm1', od: 'Trenér <trener@klub.test>', predmet: 'Hřiště', text: 'Urgentně: nefunguje osvětlení, ozvi se.', kdy: Date.parse('2026-10-02T07:20:00+02:00'), neprectena: true })], true);
  p.ctx.instagramKazdych10Min();
  assert.ok(p.log.ntfy.some((x) => /Hoří/.test(x.title)), JSON.stringify(p.log.ntfy));
  const pocet = p.log.ntfy.length;
  p.nastavCas(Date.parse('2026-10-02T07:40:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(p.log.ntfy.length, pocet, 'za 10 minut nic znovu');
  assert.strictEqual(p.volej('upozorneniTest').data.odeslano, true);
  assert.deepStrictEqual(json(p.volej('upozorneniVypnout').data), { zapnuto: false, tema: '' });
  p.nastavCas(Date.parse('2026-10-02T07:50:00+02:00'));
  p.vlakna.v2 = p.vlakno('v2', [p.zprava({ id: 'm2', od: 'Trenér <trener@klub.test>', predmet: 'Zápas', text: 'Urgentně: změna času, ozvi se.', kdy: Date.parse('2026-10-02T07:45:00+02:00'), neprectena: true })], true);
  const poVypnuti = p.log.ntfy.length;
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(p.log.ntfy.length, poVypnuti, 'po vypnutí nic');
});

// ---------------------------------------------------------------- počasí (ČHMÚ)

test('počasí: výstrahy pro ORP ze skutečného CAP (28. 6. 2026), řeka a předpovědi; přehled se drží v mezipaměti', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-06-28T09:20:00Z'));
  let o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  const d = o.data;
  assert.strictEqual(d.misto, 'Veselí nad Moravou');
  assert.deepStrictEqual(d.vystrahy.map((v) => v.nazev + '/' + v.uroven),
    ['Extrémně vysoké teploty/cervena', 'Nebezpečí požárů/zluta', 'Silné bouřky/zluta', 'Výhled nebezpečných jevů/vyhled']);
  assert.strictEqual(d.souhrn, 'Extrémně vysoké teploty, Nebezpečí požárů, Silné bouřky');
  const bourky = d.vystrahy[2];
  assert.strictEqual(bourky.od, Date.parse('2026-06-29T15:00:00+02:00'));
  assert.ok(bourky.celyKraj && !/http|tinyurl/i.test(bourky.text), bourky.text);
  assert.deepStrictEqual(d.reky.map((r) => [r.nazev, r.hladina, r.typ]), [['Morava – Strážnice', 82, 'hladina'], ['Morava – Spytihněv', 37, 'hladina']]);
  assert.deepStrictEqual(d.predpovedi.map((x) => x.den), ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
  assert.deepStrictEqual([d.predpovedi[1].ikona, d.predpovedi[1].tMax, d.predpovedi[1].uvod], ['slunce', [21, 24], 'Opět slunečné počasí']);
  assert.ok(!p.chmu.dotazy.some((x) => x.podminene), 'poprvé se stahuje celé');
  // podruhé z mezipaměti – žádné stahování
  const pocet = p.chmu.dotazy.length;
  assert.strictEqual(p.volej('pocasi').ok, true);
  assert.strictEqual(p.chmu.dotazy.length, pocet);
  // „Obnovit“: výstrahy a vodní stavy podmíněně (304, nic se nestahuje), předpovědi hodinu z mezipaměti
  o = p.volej('pocasi', { znovu: true });
  assert.deepStrictEqual(json(o.data.vystrahy), json(d.vystrahy));
  const nove = p.chmu.dotazy.slice(pocet);
  assert.strictEqual(nove.length, 4);
  assert.ok(nove.every((x) => x.podminene));
  assert.strictEqual(p.chmu.neukazano, 4);
});

test('počasí: bez výstrah „Žádné výstrahy ČHMÚ“, výpadek → záloha z archivu, chyba jednoho zdroje nesmaže zbytek', () => {
  let p = prostredi();
  p.chmu.cap = 'cap_rijen.xml';
  p.nastavCas(Date.parse('2026-10-02T19:30:00Z'));
  let o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.souhrn, o.data.vystrahy.length], ['Žádné výstrahy ČHMÚ', 0]);
  assert.deepStrictEqual(o.data.predpovedi.map((x) => x.nazev), ['Předpověď na pátek', 'Předpověď na sobotu', 'Předpověď na neděli', 'Předpověď na pondělí']);
  assert.strictEqual(o.data.reky[0].maxPredpoved, 82); // modelová předpověď dorovnaná na měření
  // hlavní adresa výstrah nejde → nejnovější soubor z archivu opendata
  p = prostredi();
  p.chmu.chyby['XOCZ50'] = 503;
  p.nastavCas(Date.parse('2026-10-02T19:30:00Z'));
  o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.ok(!o.data.chyby, JSON.stringify(o.data.chyby));
  assert.ok(p.chmu.dotazy.some((x) => /alert_cap_50_021119\.xml$/.test(x.url)));
  // nejdou ani výstrahy, ani archiv → ostatní zůstane, přehled jen na 5 minut
  p = prostredi();
  p.chmu.chyby['XOCZ50'] = 503;
  p.chmu.chyby['/alerts/cap/'] = 500;
  p.nastavCas(Date.parse('2026-10-02T19:30:00Z'));
  o = p.volej('pocasi');
  assert.deepStrictEqual(json(o.data.chyby), ['výstrahy (HTTP 503)']);
  assert.strictEqual(o.data.predpovedi.length, 4);
  assert.strictEqual(p.ttl.get('pocasi:prehled'), 300);
});

test('počasí: vlastní místo ve vlastnosti POCASI, chybný JSON nezastaví info', () => {
  const p = prostredi();
  p.vlastnosti.set('POCASI', JSON.stringify({ misto: 'Hodonín', orp: { '6206': 'Hodonín' }, stanice: [] }));
  p.nastavCas(Date.parse('2026-10-02T19:30:00Z'));
  let o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.misto, o.data.reky.length], ['Hodonín', 0]);
  assert.strictEqual(p.volej('info').data.pocasi.misto, 'Hodonín');
  assert.ok(p.volej('info').data.akce.includes('pocasi'));
  p.vlastnosti.set('POCASI', '{nejson');
  o = p.volej('pocasi', { znovu: true });
  assert.deepStrictEqual(o, { ok: false, chyba: 'Vlastnost POCASI není platný JSON.' });
  o = p.volej('info');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.pocasi.misto, '');
});

test('počasí: povodeň z CAP (profil, vývoj) a hladina nad 2. SPA z měření', () => {
  const p = prostredi();
  p.chmu.cap = { text: `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>TEST</identifier><sent>2026-10-02T10:00:00+02:00</sent><status>Actual</status><msgType>Update</msgType>
<info><language>cs</language><category>Met</category><event>Povodňová pohotovost</event><responseType>Prepare</responseType>
<urgency>Immediate</urgency><severity>Severe</severity><certainty>Observed</certainty>
<eventCode><valueName>HPPS</valueName><value>XI.2</value></eventCode><onset>2026-10-02T09:00:00+02:00</onset>
<description>Na dolní Moravě je dosaženo 2. SPA.</description>
<instruction>Lokálně se mohou vyskytnout rozlivy do níže položených míst. Nevstupovat do koryt toků a řídit se pokyny povodňových orgánů.</instruction>
<parameter><valueName>floodWarning</valueName><value>Morava, Strážnice, 610 cm, 360 m3s-1, rising</value></parameter>
<parameter><valueName>hydroOutlook</valueName><value>Kulminaci ve Strážnici očekáváme v noci na sobotu.</value></parameter>
<parameter><valueName>awareness_level</valueName><value>3; orange; Severe</value></parameter>
<area><areaDesc>Jihomoravský kraj (Hodonín, Veselí nad Moravou)</areaDesc><geocode><valueName>CISORP</valueName><value>6218</value></geocode></area></info>
<info><language>cs</language><category>Met</category><event>Silný vítr</event><responseType>AllClear</responseType><urgency>Past</urgency>
<severity>Moderate</severity><certainty>Likely</certainty><area><areaDesc>Jihomoravský kraj</areaDesc><geocode><valueName>CISORP</valueName><value>6218</value></geocode></area></info>
</alert>` };
  p.nastavCas(Date.parse('2026-10-02T10:00:00Z'));
  const o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.vystrahy.length, 1); // odvolaný vítr vynechán
  const v = o.data.vystrahy[0];
  assert.deepStrictEqual([v.typ, v.uroven, v.do, v.profily[0].stanice, v.profily[0].spa], ['povoden', 'oranzova', null, 'Strážnice', 2]);
  assert.strictEqual(v.text, 'Nevstupovat do koryt toků a řídit se pokyny povodňových orgánů.');
  assert.strictEqual(v.vyvoj, 'Kulminaci ve Strážnici očekáváme v noci na sobotu.');
  assert.strictEqual(o.data.souhrn, 'Povodňová pohotovost');
  // vodní stav nad 2. SPA (Strážnice 600 cm)
  const C = vm.runInContext('CHMU_', p.ctx);
  const meta = C.hydroMeta(fs.readFileSync(path.join(__dirname, 'chmu', 'meta1.json'), 'utf8'), ['0-203-1-421500']);
  const stanice = JSON.parse(fs.readFileSync(path.join(__dirname, 'chmu', '0-203-1-421500.json'), 'utf8'));
  stanice.objList[0].tsList.find((x) => x.tsConID === 'H').tsData.slice(-1)[0].value = 610;
  const r = json(C.reka(stanice, meta, Date.parse('2026-10-02T19:20:00Z')));
  assert.deepStrictEqual([r.typ, r.uroven, r.spa, r.stav], ['povoden', 'oranzova', 2, '2. SPA – pohotovost']);
  assert.deepStrictEqual(json(C.teploty('Nejnižší teploty −2 až −6 °C')), [-6, -2]);
});

test('počasí podle polohy: ORP z ČÚZK → výstrahy pro CISORP, obec jako místo, nejbližší stanice, místo se pamatuje', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-02T10:00:00Z'));
  let o = p.volej('pocasi', { poloha: { lat: 48.9333, lon: 17.2977 } }); // Strážnice
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.misto, 'Strážnice');
  assert.strictEqual(o.data.podlePolohy, true);
  assert.ok(!o.data.chyby, JSON.stringify(o.data.chyby));
  const mista = JSON.parse(p.vlastnosti.get('POCASI_MISTA'));
  const m = mista['48.93,17.30'];
  assert.deepStrictEqual([m.orp, m.kraj], [['6218', 'Veselí nad Moravou'], 'RPJM']);
  assert.ok(m.stanice.indexOf('0-203-1-421500') >= 0, 'Strážnice/Morava mezi nejbližšími: ' + JSON.stringify(m.stanice));
  const dotazu = p.log.cuzk;
  p.volej('pocasi', { poloha: { lat: 48.9301, lon: 17.3002 }, znovu: true }); // stejná dlaždice 0,01° → bez ČÚZK
  assert.strictEqual(p.log.cuzk, dotazu, 'místo z paměti');
  // upozornění (bez polohy) použijí poslední polohu z aplikace; aplikace bez polohy → výchozí místo a poloha zapomenuta
  assert.ok(JSON.parse(p.vlastnosti.get('POCASI_POLOHA')).lat === 48.93);
  o = p.volej('pocasi', { poloha: null });
  assert.strictEqual(o.data.misto, 'Veselí nad Moravou');
  assert.ok(!p.vlastnosti.has('POCASI_POLOHA'), 'vypnutá poloha se zapomene');
  // mimo ČR → výchozí místo
  assert.strictEqual(p.volej('pocasi', { poloha: { lat: 52.5, lon: 13.4 } }).data.misto, 'Veselí nad Moravou');
  const C = vm.runInContext('CHMU_', p.ctx);
  assert.deepStrictEqual(json(C.nejblizsi([['a', 'A', 'x', 49, 17, 1], ['b', 'B', 'x', 49.1, 17, 1], ['c', 'C', 'x', 49.01, 17, 0], ['d', 'D', 'x', 50, 17, 1]], 49, 17, 30, 2)), ['a', 'b']);
});

test('počasí: domov – v okolí 8 km (poloha z Wi-Fi o pár km vedle) i bez polohy domov, dál skutečné místo, přibližná poloha s přesností', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-09T16:00:00Z'));
  assert.deepStrictEqual(json(p.volej('info').data.pocasi), { misto: 'Veselí nad Moravou', domov: false });
  let o = p.volej('pocasiDomov', { lat: 48.85, lon: 17.13, nazev: 'Hodonín' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.misto, json(o.data.domov)], ['Hodonín', { lat: 48.85, lon: 17.13 }]);
  assert.deepStrictEqual(json(p.volej('info').data.pocasi), { misto: 'Hodonín', domov: true });
  // telefon / PC hlásí bod ~5,5 km vedle (Wi-Fi) s malou „přesností“ → domov
  o = p.volej('pocasi', { poloha: { lat: 48.80, lon: 17.13, presnost: 40 } });
  assert.deepStrictEqual([o.data.misto, o.data.domov, o.data.podlePolohy, o.data.presnost], ['Hodonín', true, true, undefined]);
  // bez polohy (vypnutá na PC) → taky domov se jménem
  o = p.volej('pocasi', { poloha: null });
  assert.deepStrictEqual([o.data.misto, o.data.domov], ['Hodonín', true]);
  // daleko (Brno, přesně) → skutečné místo podle ČÚZK, ne domov
  o = p.volej('pocasi', { poloha: { lat: 49.2, lon: 16.6, presnost: 30 } });
  assert.ok(o.data.misto !== 'Hodonín' && !o.data.domov && o.data.podlePolohy, JSON.stringify([o.data.misto, o.data.domov]));
  // přibližná poloha (iPhone bez Přesné polohy) mimo domov → přesnost pro „≈“ v aplikaci (ne z mezipaměti předchozího volání)
  o = p.volej('pocasi', { poloha: { lat: 49.2, lon: 16.6, presnost: 6000 } });
  assert.strictEqual(o.data.presnost, 6000);
  o = p.volej('pocasi', { poloha: { lat: 49.2, lon: 16.6, presnost: 25 } });
  assert.strictEqual(o.data.presnost, undefined, 'přesnost z mezipaměti nepřetrvá');
  // 23 km od domova, přesně, ale ve stejném ORP (výstrahy stejné) → domov
  o = p.volej('pocasi', { poloha: { lat: 49.03, lon: 17.45, presnost: 20 } });
  assert.deepStrictEqual([o.data.misto, o.data.domov], ['Hodonín', true]);
  // přibližná poloha 9 km od domova, ale s nejistotou 7 km → domov (kruh nejistoty domov pokrývá)
  o = p.volej('pocasi', { poloha: { lat: 48.77, lon: 17.13, presnost: 7000 } });
  assert.deepStrictEqual([o.data.misto, o.data.domov], ['Hodonín', true]);
  assert.strictEqual(p.volej('pocasiDomov', { lat: 52.5, lon: 13.4, nazev: 'Berlín' }).ok, false, 'domov jen v Česku');
  // zrušení domova → výchozí místo
  o = p.volej('pocasiDomov', { smazat: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(p.volej('info').data.pocasi), { misto: 'Veselí nad Moravou', domov: false });
  assert.strictEqual(p.volej('pocasi', { poloha: null }).data.domov, undefined);
});

test('nedělní přehled: události po dnech bez zápasů, zápasy týmů, úkoly s termínem, počasí – bez názvů', () => {
  const p = prostredi();
  const T = vm.runInContext('TYDEN_', p.ctx);
  const po = Date.parse('2026-10-05T00:00:00+02:00'); // pondělí
  const h = (den, hod) => po + den * 864e5 + hod * 36e5;
  const text = T.text({ od: po,
    udalosti: [{ nazev: 'Porada', zacatek: h(0, 8), konec: h(0, 9) }, { nazev: 'Zubař', zacatek: h(0, 14), konec: h(0, 15) },
      { nazev: 'Školení', zacatek: h(3, 10), konec: h(3, 12) }, { nazev: '⚽ Vnorovy – Šardice', zacatek: h(5, 15), konec: h(5, 17) },
      { nazev: 'Mimo týden', zacatek: h(8, 10), konec: h(8, 11) }],
    zapasy: [{ zacatek: h(5, 15), tym: 'A-tým', doma: false }, { zacatek: h(6, 12.25), tym: 'Dorost', doma: true }, { zacatek: h(-2, 10), tym: 'B-tým', doma: true }],
    terminy: ['2026-10-01', '2026-10-07', '2026-10-30'],
    predpovedi: [{ den: '2026-10-05', tMax: [17, 20], ikona: 'polojasno' }, { den: '2026-10-06', tMax: [14, 16], ikona: 'dest' }, { den: '2026-10-04', tMax: [20, 22], ikona: 'slunce' }],
    vystrahy: [] });
  assert.strictEqual(text, 'Kalendář: 3 (Po 2, Čt 1)\nZápasy: So 15:00 A-tým venku · Ne 12:15 Dorost doma\nÚkoly s termínem: 2 (po termínu 1)\nPočasí: Po 20 °C · Út 16 °C déšť');
  assert.ok(!/Porada|Zubař|Školení/.test(text), 'žádné názvy událostí přes cizí server');
});

test('docházka: souhrn akcí (přišlo, omluveno s komentářem, neomluveno, možná), jména bez textů omluv, jen v rozsahu', () => {
  const p = prostredi();
  const D = vm.runInContext('DOCHAZKA_', p.ctx);
  const data = { hraci: [{ id: '1', jmeno: 'Hráč A' }, { id: '2', jmeno: 'Hráč B' }, { id: '3', jmeno: 'Hráč C' }, { id: '4', jmeno: 'Hráč D' }, { id: '5', jmeno: 'Hráč E' }],
    udalosti: [{ id: 1, zacatek: '2026-10-01T17:30:00+02:00', nazev: 'ČT - DOROST', druh: 'T_CT', zruseno: false, venku: false,
      ucast: { 1: ['G', ''], 2: ['G', ''], 3: ['N', 'nemoc'], 4: ['N', ''], 5: ['M', ''] } },
    { id: 2, zacatek: '2026-06-01T17:30:00+02:00', druh: 'T_PO', ucast: { 1: ['G', ''] } }] };
  const s = json(D.souhrn(data, Date.parse('2026-09-01T00:00:00Z'), Date.parse('2026-10-05T00:00:00Z')));
  assert.strictEqual(s.udalosti.length, 1);
  const u = s.udalosti[0];
  assert.deepStrictEqual(u.pocty, { prislo: 2, omluveno: 1, neomluveno: 1, mozna: 1, bez: 0, pozvano: 5 });
  assert.deepStrictEqual([u.omluveni, u.neomluveni, u.druh], [['Hráč C'], ['Hráč D'], 'T_CT']);
  assert.ok(!/nemoc/.test(JSON.stringify(s)), 'texty omluv se nepředávají');
});

test('návrhy odpovědí: podklady pro Clauda na Disk, návrh u konverzace a v detailu, zahodit, vypnout', () => {
  const p = prostredi();
  let o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  const ceka = o.data.osobni.find((v) => v.stav === 'ceka');
  assert.ok(ceka, 'vlákno čekající na odpověď');
  assert.ok(!('_odpoved' in ceka), 'podklad nejde do aplikace');
  const podklad = () => p.schranka.soubory.find((f) => f.getName() === 'POSTA_K_ODPOVEDI.json' && !f.vKosi);
  assert.ok(podklad(), 'podklady zapsané');
  const data = JSON.parse(podklad().getBlob().getDataAsString());
  const v = data.vlakna.find((x) => x.id === ceka.id);
  assert.ok(v && v.zpravaId && v.text && v.ucet === 'osobni', 'vlákno v podkladech: ' + JSON.stringify(data.vlakna));
  const zapisu = p.log.soubory.filter((x) => x.n === 'POSTA_K_ODPOVEDI.json').length;
  p.volej('posta', { znovu: true });
  assert.strictEqual(p.log.soubory.filter((x) => x.n === 'POSTA_K_ODPOVEDI.json').length, zapisu, 'beze změny se nezapisuje znovu');
  // Claude napsal návrh → značka v seznamu, text v detailu
  p.schranka.deti.ODPOVEDI.createFile(ceka.id + '.json', JSON.stringify({ vlakno: ceka.id, zpravaId: v.zpravaId, text: 'Ahoj, beru to.', kdy: '2026-10-03T08:00:00+02:00' }));
  o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.data.osobni.find((x) => x.id === ceka.id).navrh, true);
  const vl = p.volej('vlakno', { id: ceka.id, precist: false });
  assert.strictEqual(vl.data.navrhOdpovedi && vl.data.navrhOdpovedi.text, 'Ahoj, beru to.');
  // návrh k jiné (starší) zprávě se neukáže
  p.schranka.deti.ODPOVEDI.soubory[0].setContent(JSON.stringify({ zpravaId: 'jina', text: 'staré' }));
  assert.ok(!p.volej('vlakno', { id: ceka.id, precist: false }).data.navrhOdpovedi, 'návrh k jiné zprávě');
  assert.strictEqual(p.volej('navrhZahodit', { id: ceka.id }).data.smazano, 1);
  assert.strictEqual(p.volej('navrhZahodit', { id: '../x' }).ok, false);
  // vypnuto → prázdné podklady, info ví o nastavení
  assert.strictEqual(p.volej('navrhyNastavit', { rezim: 'vypnuto' }).data.navrhyOdpovedi, 'vypnuto');
  p.volej('posta', { znovu: true });
  assert.strictEqual(JSON.parse(podklad().getBlob().getDataAsString()).vlakna.length, 0);
  assert.strictEqual(p.volej('navrhyNastavit', { rezim: 'nesmysl' }).ok, false);
});

test('pošta: záložky jako v Gmailu – Aktualizace v Doručené označené, Promoakce na klepnutí, čísla nepřečtených, přečíst vše', () => {
  const p = prostredi();
  const promo1 = p.vlakno('p1', [p.zprava({ id: 'pm1', od: 'Slevomat <info@slevomat.test>', predmet: 'Dárek k svátku', text: 'Máte 200 Kč kredit.', kdy: Date.UTC(2026, 9, 2, 10), neprectena: true })], true);
  const promo2 = p.vlakno('p2', [p.zprava({ id: 'pm2', od: 'CK Test <news@ck.test>', predmet: 'Lyže v Alpách', text: 'Zájezdy od 9 990 Kč.', kdy: Date.UTC(2026, 9, 1, 10) })], false);
  p.nastavKategorie({ promotions: [promo1, promo2] });
  p.nastavAktualizace([p.vlakna.v1]);
  let o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.osobni.find((v) => v.id === 'v1').aktualizace, true, 'aktualizace označená');
  assert.deepStrictEqual(json(o.data.pocty), { promo: 1, socialni: 0, fora: 0 });
  assert.strictEqual(o.data.prehled, null, 'přehled od Clauda zatím není');
  // denní limit Gmailu: seznam pošty bez metod vlákna (každá = jedno volání), všechno ze zpráv
  assert.strictEqual(p.log.drahe || 0, 0, 'drahá volání vlákna v seznamu pošty');
  assert.deepStrictEqual([o.data.osobni[0].neprectena, o.data.osobni[0].predmet, typeof o.data.osobni[0].kdy], [true, 'Sraz v sobotu', 'number']);
  o = p.volej('postaKategorie', { kategorie: 'promo' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(o.data.vlakna.map((v) => [v.id, v.od, v.neprectena]), [['p1', 'Slevomat', true], ['p2', 'CK Test', false]]);
  assert.ok(o.data.vlakna.every((v) => !v.aktualizace), 'promoakce nejsou aktualizace');
  assert.ok(p.log.dotazy.indexOf('in:inbox category:promotions newer_than:30d') >= 0, JSON.stringify(p.log.dotazy.slice(-3)));
  assert.ok(/Neznámá kategorie/.test(p.volej('postaKategorie', { kategorie: 'spam' }).chyba));
  // „Označit vše jako přečtené“ – jen nepřečtené v Doručené
  o = p.volej('postaPrectene', { kategorie: 'promo' });
  assert.deepStrictEqual(json(o.data), { precteno: 1, ids: ['p1'] });
  assert.ok(p.log.precteno.indexOf('p1') >= 0 && p.log.precteno.indexOf('p2') < 0);
});

test('pošta: beze změny v Doručené (pořadí, nepřečtená, návrhy) vrátí uložený seznam bez načítání zpráv', () => {
  const p = prostredi();
  let o = p.volej('posta');
  assert.strictEqual(o.ok, true, o.chyba);
  const poprve = p.log.nacteniZprav;
  assert.ok(poprve > 0, 'poprvé se zprávy načtou');
  // server za 10 minut: krátká mezipaměť je pryč, Doručená stejná → bez getMessagesForThreads
  p.cache.delete('posta');
  o = p.volej('posta');
  assert.strictEqual(p.log.nacteniZprav, poprve, 'beze změny se zprávy nenačítají');
  assert.deepStrictEqual(o.data.osobni.map((v) => v.id), ['v1']);
  // přišla nová zpráva (jiné pořadí vláken) → sestaví se znovu
  p.cache.delete('posta');
  p.vlakna.v3 = p.vlakno('v3', [p.zprava({ id: 'm5', od: 'Trenér <trener@klub.test>', predmet: 'Nová zpráva', text: 'Ahoj.', kdy: Date.now(), neprectena: true })], true);
  const puvodni = p.ctx.GmailApp.search;
  p.ctx.GmailApp.search = (q, od, max) => (/^in:inbox newer_than:30d/.test(q) && q.indexOf('{to:') < 0 && q.indexOf('category:updates') < 0 ? [p.vlakna.v3, p.vlakna.v1] : puvodni(q, od, max));
  o = p.volej('posta');
  assert.ok(p.log.nacteniZprav > poprve, 'změna → zprávy znovu');
  assert.deepStrictEqual(o.data.osobni.map((v) => v.id), ['v3', 'v1']);
  // změna z aplikace (archiv) maže i uložený seznam
  p.ctx.GmailApp.search = puvodni;
  const pred = p.log.nacteniZprav;
  p.volej('oznacit', { id: 'v1', jak: 'prectene' });
  p.volej('posta');
  assert.ok(p.log.nacteniZprav > pred, 'po změně z aplikace sestavit znovu');
});

test('pošta: přesun do štítku (skupiny) jako v Gmailu – štítek a pryč z Doručené, jen štítek, odebrat', () => {
  const p = prostredi();
  p.nastavStitkyGmailu({ AUTO: { neprectenych: 0, vlakna: [] }, 'AUTO/PATRIOT': { neprectenych: 0, vlakna: [] } });
  let o = p.volej('postaPresunout', { id: 'v1', stitek: 'AUTO', archivovat: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data), { id: 'v1', stitky: ['AUTO'], archivovano: true });
  assert.deepStrictEqual(p.log.archiv, ['v1']);
  o = p.volej('postaPresunout', { id: 'v2', stitek: 'AUTO/PATRIOT', archivovat: false });
  assert.deepStrictEqual([json(o.data.stitky), o.data.archivovano, p.log.archiv.length], [['AUTO/PATRIOT'], false, 1], 'jen štítek');
  o = p.volej('postaPresunout', { id: 'v1', stitek: 'AUTO', pridat: false });
  assert.deepStrictEqual(json(o.data.stitky), [], 'odebrat');
  assert.ok(/není/.test(p.volej('postaPresunout', { id: 'v1', stitek: 'Neexistuje' }).chyba));
  // nová skupina: založí štítek a přesune
  o = p.volej('postaPresunout', { id: 'v2', stitek: ' VÝVOJ ', archivovat: true, novy: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([p.log.zalozenyStitek, json(o.data.stitky).indexOf('VÝVOJ') >= 0, o.data.archivovano], ['VÝVOJ', true, true]);
  assert.ok(/40 znaků/.test(p.volej('postaPresunout', { id: 'v2', stitek: 'a/', novy: true }).chyba));
});

test('pošta: podklady pro přehled od Clauda (jednou za 4 hodiny, jen při změně) a přehled v Doručené', () => {
  const p = prostredi();
  const promo = p.vlakno('p1', [p.zprava({ id: 'pm1', od: 'Slevomat <info@slevomat.test>', predmet: 'Dárek k svátku',
    text: '\u200c \u200c \u200c\u034f [image: Slevomat] Máte 200 Kč kredit https://slevomat.test/x?a=1 < do neděle.', kdy: Date.UTC(2026, 9, 2, 10), neprectena: true })], true);
  p.nastavKategorie({ promotions: [promo] });
  p.nastavAktualizace([p.vlakna.v2]);
  // skupina VÝVOJ (oznámení mimo Doručenou): čerstvé jdou do podkladů, staré ne, dvakrát nic
  const selhani = p.vlakno('g1', [p.zprava({ id: 'gm1', od: 'GitHub <notifications@github.test>', predmet: 'Run failed: Tabulka', text: 'Job failed.', kdy: Date.parse('2026-10-05T07:30:00+02:00') })], true);
  const stare = p.vlakno('g2', [p.zprava({ id: 'gm2', od: 'GitHub <notifications@github.test>', predmet: 'Run failed: starý', text: 'Job failed.', kdy: Date.parse('2026-09-20T07:30:00+02:00') })], false);
  p.nastavStitkyGmailu({ 'VÝVOJ': { neprectenych: 1, vlakna: [selhani, stare, p.vlakna.v2] } });
  const soubor = () => p.schranka.soubory.find((f) => f.getName() === 'POSTA_K_PREHLEDU.json' && !f.vKosi);
  p.nastavCas(Date.parse('2026-10-05T06:30:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.ok(!soubor(), 'v noci a brzy ráno nic');
  p.nastavCas(Date.parse('2026-10-05T09:00:00+02:00'));
  p.ctx.instagramKazdych10Min();
  const d = JSON.parse(soubor().getBlob().getDataAsString());
  assert.deepStrictEqual(d.zpravy.map((z) => [z.id, z.kategorie, z.stitek || '']), [['v2', 'aktualizace', ''], ['p1', 'promo', ''], ['g1', 'stitek', 'VÝVOJ']]);
  assert.deepStrictEqual([d.zpravy[1].od, d.zpravy[1].predmet, d.zpravy[1].ukazka, d.zpravy[1].neprectena],
    ['Slevomat', 'Dárek k svátku', 'Máte 200 Kč kredit do neděle.', true], 'bez odkazů, obrázků a neviditelných znaků');
  const dotazu = p.log.dotazy.length;
  p.nastavCas(Date.parse('2026-10-05T10:00:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(p.log.dotazy.length, dotazu, 'do 4 hodin se Gmail znovu neprochází');
  p.nastavCas(Date.parse('2026-10-05T13:30:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(JSON.parse(soubor().getBlob().getDataAsString()).vytvoreno, d.vytvoreno, 'beze změny se nepřepisuje');
  assert.strictEqual(p.log.drahe || 0, 0, 'podklady bez drahých metod vlákna');
  // Claude napsal přehled → v Doručené (jen očištěné položky)
  p.schranka.createFile('POSTA_PREHLED.json', JSON.stringify({ vytvoreno: '2026-10-05T09:20:00+02:00', prosel: 2, dulezite: [],
    zajimave: [{ id: 'p1', od: 'Slevomat', predmet: 'Dárek k svátku', proc: 'Kredit 200 Kč – platí do neděle.', kategorie: 'promo' },
      { id: '../x', predmet: 'Divné id', proc: 'x', kategorie: 'spam' }],
    ostatni: [{ skupina: 'Oznámení', pocet: 1, text: 'Protokol ze stavby.' }, { nesmysl: true }] }));
  const o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.prehled.zajimave.map((x) => [x.id, x.proc, x.kategorie])), [['p1', 'Kredit 200 Kč – platí do neděle.', 'promo'], ['', 'x', '']]);
  assert.deepStrictEqual([o.data.prehled.prosel, o.data.prehled.ostatni.length, o.data.prehled.dulezite.length], [2, 1, 0]);
});

// ---- pošta 9. 10.: náhled bez hlaviček, upozornění Apps Scriptu, přednačtené detaily, přesun přetažením a Vrátit

test('pošta: náhled v seznamu bez hlaviček přeposlání a citací (CZ i EN), bez odkazů a podpisu z mobilu', () => {
  const p = prostredi();
  const n = (t) => p.ctx.nahledZpravy_(t);
  // přeposlané ze Seznamu (Michalův příklad 9. 10.) – uvnitř ještě jedna přeposlaná z Gmailu
  assert.strictEqual(n(['---------- Původní e-mail ----------', 'Od: Jan Novák <jan@x.test>', 'Komu: Michal <michal@y.test>', 'Datum: 9. 10. 2026 10:00:00',
    'Předmět: Fwd: Smlouva', '', '---------- Forwarded message ---------', 'From: Petr <petr@z.test>', 'Date: Wed, Oct 8, 2026 at 9:12 AM',
    'Subject: Smlouva', 'To: Jan Novák <jan@x.test>', '', 'V příloze smlouva k podpisu.', 'Díky, Petr'].join('\n')), 'V příloze smlouva k podpisu. Díky, Petr');
  // poznámka nad přeposlanou zprávou + její text (Gmail česky)
  assert.strictEqual(n('FYI, viz níže.\n\n---------- Přeposlaná zpráva ---------\nOd: Jan <jan@x.test>\nDate: čt 9. 10. 2026 v 10:00\nSubject: Nabídka\nTo: <michal@y.test>\n\n' +
    'Dobrý den, posílám nabídku.'), 'FYI, viz níže. Dobrý den, posílám nabídku.');
  // odpověď: citace pod „Dne … napsal:“ (zalomené na dva řádky) i „On … wrote:“ pryč
  assert.strictEqual(n('Díky, beru.\n\nDne čt 9. 10. 2026 v 10:00 odesílatel Jan Novák <jan@x.test>\nnapsal:\n> Ahoj, pošli mi to.\n> Díky'), 'Díky, beru.');
  assert.strictEqual(n('Sounds good.\r\n\r\nOn Thu, Oct 9, 2026 at 10:00 AM Jan <jan@x.test> wrote:\r\n> Shall we meet?'), 'Sounds good.');
  // Outlook: hlavička pod vlastním textem = citace; bez vlastního textu = přeposlaná zpráva
  const outlook = '________________________________\nOd: Jan Novák <jan@x.test>\nOdesláno: čtvrtek 9. října 2026 10:00\nKomu: Michal\nPředmět: RE: Termín\n\nMůžeš ve čtvrtek?';
  assert.strictEqual(n('Potvrzuji.\n\n' + outlook), 'Potvrzuji.');
  assert.strictEqual(n(outlook), 'Můžeš ve čtvrtek?');
  assert.strictEqual(n('-----Original Message-----\nFrom: A <a@x.test>\nSent: Monday\nTo: B\nSubject: X\n\nText původní.'), 'Text původní.');
  // odkazy, podpis z mobilu a podpis za „-- “ pryč; běžný text beze změny (nejvýš 180 znaků)
  assert.strictEqual(n('Pošli mi prosím odkaz https://example.test/a?b=1 a <https://x.test/y>\n\nOdesláno z iPhonu'), 'Pošli mi prosím odkaz a');
  assert.strictEqual(n('Ahoj,\nzítra v 8.\n-- \nJan Novák\nTo: je podpis'), 'Ahoj, zítra v 8.');
  assert.strictEqual(n('a'.repeat(300)).length, 180);
  // v seznamu pošty: náhled přeposlané zprávy začíná jejím textem
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm1', od: 'Jan Novák <jan@x.test>', predmet: 'Fwd: Nabídka', kdy: Date.now() - 36e5, neprectena: true,
    text: '---------- Původní e-mail ----------\nOd: Firma <obchod@firma.test>\nKomu: jan@x.test\nDatum: 9. 10. 2026\nPředmět: Nabídka\n\nDobrý den, posíláme nabídku.' })], true);
  const o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.data.osobni.find((v) => v.id === 'v1').ukazka, 'Dobrý den, posíláme nabídku.');
});

test('pošta: upozornění Apps Scriptu = informace – ne hoří ani čeká, „tiche“ pro Dnes, žádné ntfy, ne v přehledu od Clauda', () => {
  const p = prostredi();
  p.chmu.cap = 'cap_rijen.xml';
  p.nastavCas(Date.parse('2026-10-02T07:30:00+02:00'));
  p.vlastnosti.set('NTFY_TEMA', 'asistent-test');
  const chyba = p.vlakno('v1', [p.zprava({ id: 'm1', od: 'Apps Script <apps-scripts-notifications@google.com>', predmet: 'Summary of failures for Google Apps Script: Asistent',
    text: 'Urgentně: spouštěč nefunguje, opravte to prosím do zítra.', kdy: Date.parse('2026-10-02T07:00:00+02:00'), neprectena: true })], true);
  p.vlakna.v1 = chyba;
  assert.strictEqual(p.ctx.stavPripadu_(chyba.getMessages()[0], false, chyba, false, Date.now(), false), 'info');
  // i česky a z jiné adresy Googlu
  const cesky = p.zprava({ id: 'x', od: 'Google <no-reply@google.com>', predmet: 'Souhrn selhání pro Google Apps Script: Schránka', text: 'Prosím zkontrolujte.', kdy: Date.now() });
  assert.strictEqual(p.ctx.stavPripadu_(cesky, false, null, false, Date.now(), true), 'info');
  const o = p.volej('posta', { znovu: true });
  const v = o.data.osobni.find((x) => x.id === 'v1');
  assert.deepStrictEqual([v.stav, v.tiche, v.duvod, v.termin], ['info', true, 'upozornění Google Apps Script', null]);
  // spouštěč: žádné „Hoří v poště“
  p.ctx.kazdouHodinu();
  assert.ok(!(p.log.ntfy || []).some((z) => /Hoří/.test(z.title)), JSON.stringify(p.log.ntfy));
  // podklady pro přehled od Clauda: bez upozornění Apps Scriptu (Aktualizace)
  p.nastavAktualizace([chyba, p.vlakna.v2]);
  p.nastavCas(Date.parse('2026-10-02T09:00:00+02:00'));
  p.ctx.ulozPostuKPrehledu_(true);
  const soubor = p.schranka.soubory.find((f) => f.getName() === 'POSTA_K_PREHLEDU.json' && !f.vKosi);
  assert.deepStrictEqual(JSON.parse(soubor.getBlob().getDataAsString()).zpravy.map((z) => z.id), ['v2']);
});

test('pošta: přednačtení detailů – tvar jako vlákno, nic nepřečte, mezipaměť podle otisku bez Gmailu, návrh čerstvý, nejvýš 10', () => {
  const p = prostredi();
  assert.ok(vm.runInContext('CTENI_MOTORU', p.ctx).indexOf('postaDetaily') >= 0, 'čtení – rid se nepamatuje');
  const souhrn = p.volej('posta', { znovu: true }).data.osobni.find((x) => x.id === 'v1');
  let gmail = 0;
  const puvodni = p.ctx.GmailApp.getThreadById;
  p.ctx.GmailApp.getThreadById = (id) => { gmail++; return puvodni(id); };
  let o = p.volej('postaDetaily', { ids: [{ id: 'v1', kdy: souhrn.kdy, pocet: souhrn.pocet }, 'v2', 'neni', '../x'] });
  assert.strictEqual(o.ok, true, o.chyba);
  const vlakno = p.volej('vlakno', { id: 'v1', precist: false }).data;
  assert.deepStrictEqual(Object.keys(o.data.detaily.v1).sort(), Object.keys(vlakno).sort(), 'stejný tvar jako akce vlakno');
  assert.deepStrictEqual(json(o.data.detaily.v1.zpravy), json(vlakno.zpravy));
  assert.ok(o.data.detaily.v2 && o.data.chyby.neni && !('../x' in o.data.chyby), JSON.stringify(Object.keys(o.data.chyby)));
  assert.deepStrictEqual(p.log.precteno, [], 'přednačtení nic neoznačí jako přečtené');
  // podruhé se stejným otiskem ze souhrnu: z mezipaměti, Gmail ani jednou
  gmail = 0;
  o = p.volej('postaDetaily', { ids: [{ id: 'v1', kdy: souhrn.kdy, pocet: souhrn.pocet }] });
  assert.strictEqual(gmail, 0, 'mezipaměť');
  assert.strictEqual(o.data.detaily.v1.zpravy[0].text, 'Ahoj, sraz v 8:30.');
  // nová zpráva ve vlákně (jiný otisk) → znovu z Gmailu
  o = p.volej('postaDetaily', { ids: [{ id: 'v1', kdy: souhrn.kdy + 1000, pocet: 2 }] });
  assert.strictEqual(gmail, 1, 'jiný otisk → Gmail');
  // návrh od Clauda: vždy čerstvý (ne z mezipaměti)
  p.schranka.createFolder('ODPOVEDI').createFile('v1.json', JSON.stringify({ zpravaId: 'm1', text: 'Ahoj, budu tam.' }));
  o = p.volej('postaDetaily', { ids: [{ id: 'v1', kdy: souhrn.kdy, pocet: souhrn.pocet }] });
  assert.strictEqual(o.data.detaily.v1.navrhOdpovedi && o.data.detaily.v1.navrhOdpovedi.text, 'Ahoj, budu tam.');
  // obří text vedle HTML se při přednačtení zkrátí (aplikace ukazuje HTML), nejvýš 10 konverzací v jednom dotazu
  p.vlakna.v9 = p.vlakno('v9', [p.zprava({ id: 'm9', od: 'Firma <info@firma.test>', predmet: 'Newsletter', text: 'a'.repeat(50000), html: '<p>Newsletter</p>', kdy: Date.now() })], false);
  o = p.volej('postaDetaily', { ids: ['v9'] });
  assert.deepStrictEqual([o.data.detaily.v9.zpravy[0].text.length, o.data.detaily.v9.zpravy[0].html], [3001, '<p>Newsletter</p>']);
  o = p.volej('postaDetaily', { ids: Array.from({ length: 12 }, (_, i) => 'n' + i) });
  assert.strictEqual(Object.keys(o.data.chyby).length, 10);
  // otevření (akce vlakno) dál označí přečtené a uloží detail pro přednačtení
  p.volej('vlakno', { id: 'v1' });
  assert.deepStrictEqual(p.log.precteno, ['v1']);
});

test('pošta: přetažení na skupinu – přesun i ze skupiny do jiné (odebrat), Vrátit = odebrat štítek a zpět do Doručené jedním dotazem', () => {
  const p = prostredi();
  p.nastavStitkyGmailu({ AUTO: { neprectenych: 0, vlakna: [] }, 'AUTO/PATRIOT': { neprectenych: 0, vlakna: [] } });
  let o = p.volej('postaPresunout', { id: 'v1', stitek: 'AUTO', archivovat: true });
  assert.deepStrictEqual(json(o.data), { id: 'v1', stitky: ['AUTO'], archivovano: true });
  // ve výběru štítku AUTO přetažená na AUTO/PATRIOT: štítek AUTO pryč
  o = p.volej('postaPresunout', { id: 'v1', stitek: 'AUTO/PATRIOT', archivovat: true, odebrat: 'AUTO' });
  assert.deepStrictEqual(json(o.data.stitky), ['AUTO/PATRIOT']);
  // Vrátit: zpět do AUTO (štítek AUTO/PATRIOT pryč) a pak úplně zpět do Doručené bez štítku
  o = p.volej('postaPresunout', { id: 'v1', stitek: 'AUTO', odebrat: ['AUTO/PATRIOT'] });
  assert.deepStrictEqual(json(o.data.stitky), ['AUTO']);
  const predVracenim = p.log.doDorucenych.length;
  o = p.volej('postaPresunout', { id: 'v1', stitek: 'AUTO', pridat: false, doDorucenych: true });
  assert.deepStrictEqual([json(o.data.stitky), o.data.vDorucenych, p.log.doDorucenych.length - predVracenim], [[], true, 1]);
  assert.ok(p.vlakna.v1.isInInbox(), 'zpět v Doručené');
  assert.ok(!p.cache.has('posta'), 'mezipaměť pošty smazaná');
});

test('reely: seznam z REELY/reely.json, odkaz na video na Disku, skóre z FOTBAL.json, zveřejněno, jen platná data', () => {
  const p = prostredi();
  let o = p.volej('reely');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data), { aktualizovano: '', reely: [], zverejneno: {}, plan: {}, popiskyPlanu: {}, instagram: { nastaveno: false, ucet: '' } }); // export ještě neproběhl
  const reely = p.schranka.createFolder('REELY');
  reely.createFile('reely.json', JSON.stringify({ verze: 1, aktualizovano: '2026-10-05T08:05:02+02:00', reely: [
    { id: 'reel_dorost_tesany', nazev: 'Vnorovy – Těšany', tym: 'dorost', tymy: ['dorost'], tymNazev: 'Dorost', datum_zapasu: '2026-10-04', vyrobeno: '2026-10-05T07:48',
      delka_s: 48.2, velikost_mb: 51.3, video: 'reel_dorost_tesany.mp4', popisek: 'Hattrick! ⚽⚽⚽\n\nDorost doma porazil Těšany.\n\n#fkagrovnorovy',
      nahled: 'data:image/jpeg;base64,/9j/AAAA', zapasy: [{ datum: '2026-10-04', tym: 'dorost', domaci: 'Vnorovy', hoste: 'Těšany', skore: '', id: 'z-tesany' }], tajne: 'x' },
    { id: 'reel_benfika_lipov', tymy: ['B'], datum_zapasu: '2026-09-12', video: 'reel_benfika_lipov.mp4', popisek: '', nahled: 'javascript:alert(1)',
      zapasy: [{ datum: '2026-09-12', tym: 'B', domaci: 'Vnorovy B', hoste: 'Lipov', skore: '4:5' }] },
    { id: '../ven', video: 'x.mp4' }
  ] }));
  // výsledek, který export ještě neznal, doplní motor z fotbal.cz (podle id zápasu)
  const fotbal = JSON.parse(FOTBAL);
  fotbal.zapasy.push({ id: 'z-tesany', tym: 'dorost', zacatek: '2026-10-04T12:15:00+02:00', domaci: 'FK Agro Vnorovy', hoste: 'TJ Sokol Těšany', doma: true, vysledek: '3:1' });
  p.schranka.createFile('FOTBAL.json', JSON.stringify(fotbal));
  o = p.volej('reely', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(o.data.reely.map((r) => r.id), ['reel_dorost_tesany', 'reel_benfika_lipov'], 'neplatné id vynechané');
  const t = o.data.reely[0];
  assert.deepStrictEqual([t.nazev, t.zapasy[0].skore, t.datum, t.delka, t.tymy.join()], ['Vnorovy – Těšany 3:1', '3:1', '2026-10-04', 48.2, 'dorost']);
  assert.strictEqual(t.popisek, 'Hattrick! ⚽⚽⚽\n\nDorost doma porazil Těšany.\n\n#fkagrovnorovy', 'popisek beze změny (prázdné řádky, emoji)');
  assert.ok(!('tajne' in t), 'jen očekávaná pole');
  assert.deepStrictEqual([t.video, t.odkaz], [true, ''], 'video se ještě nahrává na Disk');
  assert.strictEqual(o.data.reely[1].nahled, '', 'náhled jen jako data:image/jpeg');
  assert.strictEqual(p.ttl.get('reely:seznam'), 60, 'dokud video chybí, mezipaměť jen minutu');
  // video doputovalo na Disk → odkaz na soubor (sdílení se nemění – otevře ho jen můj účet)
  const videa = reely.createFolder('videa');
  videa.createFile('reel_dorost_tesany.mp4', 'video');
  assert.strictEqual(p.volej('reely').data.reely[0].odkaz, '', 'z mezipaměti');
  o = p.volej('reely', { znovu: true });
  assert.strictEqual(o.data.reely[0].odkaz, 'https://drive.google.com/file/d/soubor-videa-reel_dorost_tesany.mp4/view');
  // zveřejněno: uložit, zrušit, neplatné id odmítnout; stav je čerstvý i z mezipaměti
  o = p.volej('reelStav', { id: 'reel_dorost_tesany', zverejneno: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(o.data.zverejneno.reel_dorost_tesany));
  assert.ok(p.volej('reely').data.zverejneno.reel_dorost_tesany);
  assert.deepStrictEqual(json(p.volej('reelStav', { id: 'reel_dorost_tesany', zverejneno: false }).data.zverejneno), {});
  assert.strictEqual(p.volej('reelStav', { id: '../x', zverejneno: true }).ok, false);
  // stav drží jen nejnovějších 150 (vlastnost má limit 9 kB)
  const zmenStav = vm.runInContext('REELY_.zmenStav', p.ctx); // const v motoru není vlastnost kontextu
  let s = {};
  for (let i = 0; i < 160; i++) s = zmenStav(s, 'reel_x' + i, true, '2026-' + String(1 + (i % 12)).padStart(2, '0') + '-01');
  assert.ok(Object.keys(s).length === 150 && JSON.stringify(s).length < 9000, 'limit stavu');
  // chybný soubor = srozumitelná chyba
  reely.soubory.find((f) => f.getName() === 'reely.json').setContent('{');
  assert.ok(/reely\.json/.test(p.volej('reely', { znovu: true }).chyba));
});

test('doplňky: odškrtnutí na Disk (ZDRAVI/DOPLNKY.json) – víc položek naráz, odškrtnout zpět, staré dny pryč, se Zdravím', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-05T08:00:00+02:00'));
  let o = p.volej('doplnky', { den: '2026-10-05', zmeny: { kreatin: true, champion: true } });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.dny), { '2026-10-05': { kreatin: true, champion: true } });
  o = p.volej('doplnky', { den: '2026-10-05', zmeny: { champion: false, '../x': true } });
  assert.deepStrictEqual(json(o.data.dny), { '2026-10-05': { kreatin: true } }, 'odškrtnuto zpět, divné id ne');
  o = p.volej('doplnky', { den: '2026-05-01', zmeny: { kreatin: true } });
  assert.ok(!('2026-05-01' in o.data.dny), 'starší než 120 dní se nedrží');
  assert.ok(/RRRR-MM-DD/.test(p.volej('doplnky', { den: '5. 10.', zmeny: { kreatin: true } }).chyba));
  const soubor = p.schranka.deti.ZDRAVI.soubory.find((f) => f.getName() === 'DOPLNKY.json');
  assert.deepStrictEqual(JSON.parse(soubor.getBlob().getDataAsString()).dny, { '2026-10-05': { kreatin: true, champion: false } }, 'zrušené = výslovné ne');
  assert.deepStrictEqual(json(p.volej('zdravi').data.doplnky), { '2026-10-05': { kreatin: true } });
});

test('pití a jídlo: zápis z aplikace, zápisy Clauda z diktátu, smazání obojího, se Zdravím', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-05T10:00:00+02:00'));
  let o = p.volej('pitiJidlo', { den: '2026-10-05', jak: 'piti', ml: 250 });
  assert.strictEqual(o.ok, true, o.chyba);
  o = p.volej('pitiJidlo', { den: '2026-10-05', jak: 'jidlo', co: '  Tvaroh s ovocem ', bilkoviny: '30', kcal: 280 });
  assert.deepStrictEqual(o.data.dny['2026-10-05'].piti.map((x) => x.ml), [250]);
  assert.deepStrictEqual(o.data.dny['2026-10-05'].jidlo.map((x) => [x.co, x.bilkoviny, x.kcal]), [['Tvaroh s ovocem', 30, 280]]);
  assert.ok(/ml/.test(p.volej('pitiJidlo', { den: '2026-10-05', jak: 'piti', ml: 0 }).chyba));
  assert.ok(/snědl/.test(p.volej('pitiJidlo', { den: '2026-10-05', jak: 'jidlo', co: ' ' }).chyba));
  // Claude z diktátu (vlastní soubor, id c-…) – motor ho přidá, divné záznamy vynechá
  p.schranka.deti.ZDRAVI.createFile('PITI_JIDLO_CLAUDE.json', JSON.stringify({ zapisy: [
    { id: 'c-1', den: '2026-10-05', kdy: '2026-10-05T12:30:00+02:00', druh: 'jidlo', co: 'Kuřecí prsa s rýží', bilkoviny: 45, kcal: 650 },
    { id: 'c-2', den: '2026-10-05', kdy: '2026-10-05T09:00:00+02:00', druh: 'piti', ml: 500, co: 'voda' },
    { id: 'bez-c', den: '2026-10-05', druh: 'piti', ml: 300 }, { id: 'c-3', den: '5. 10.', druh: 'piti', ml: 300 }] }));
  let z = p.volej('zdravi').data.pitiJidlo['2026-10-05'];
  assert.deepStrictEqual(z.piti.map((x) => [x.ml, !!x.claude]), [[500, true], [250, false]], 'podle času');
  assert.deepStrictEqual(z.jidlo.map((x) => x.co), ['Tvaroh s ovocem', 'Kuřecí prsa s rýží']);
  // smazat Claudův zápis (jeho soubor zůstane) i vlastní
  o = p.volej('pitiJidlo', { den: '2026-10-05', jak: 'smazat', id: 'c-2' });
  o = p.volej('pitiJidlo', { den: '2026-10-05', jak: 'smazat', id: z.jidlo[0].id });
  z = o.data.dny['2026-10-05'];
  assert.deepStrictEqual([z.piti.map((x) => x.ml), z.jidlo.map((x) => x.co)], [[250], ['Kuřecí prsa s rýží']]);
  assert.ok(/zapisy/.test(p.schranka.deti.ZDRAVI.soubory.find((f) => f.getName() === 'PITI_JIDLO_CLAUDE.json').getBlob().getDataAsString()), 'Claudův soubor nezměněn');
});

test('jídlo bez bílkovin: místní odhad + poznámka pro Clauda (jedna, skrytá v aplikaci), Claudův odhad, hodnocení dne, doplňky z diktátu', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-09T12:30:00+02:00'));
  let o = p.volej('pitiJidlo', { den: '2026-10-09', jak: 'jidlo', co: 'kuře s rýží', bilkoviny: 38, kcal: 560, odhad: true });
  assert.strictEqual(o.ok, true, o.chyba);
  const j1 = o.data.dny['2026-10-09'].jidlo[0];
  assert.deepStrictEqual([j1.co, j1.bilkoviny, j1.odhad], ['kuře s rýží', 38, 'mistni']);
  p.nastavCas(Date.parse('2026-10-09T18:10:00+02:00'));
  o = p.volej('pitiJidlo', { den: '2026-10-09', jak: 'jidlo', co: '3 vejce a chleba', bilkoviny: 23, kcal: 420, odhad: true });
  p.volej('pitiJidlo', { den: '2026-10-09', jak: 'jidlo', co: 'tvaroh', bilkoviny: 30, kcal: 250 }); // bílkoviny zadal sám → bez Clauda
  const nove = p.schranka.deti.NOVE.soubory.filter((f) => /_jidl\.md$/.test(f.getName()));
  assert.strictEqual(nove.length, 1, 'jedna poznámka „jídlo k odhadu“, další jídla se připíšou');
  const text = nove[0].getBlob().getDataAsString();
  assert.ok(/typ: jidlo/.test(text) && /„kuře s rýží“ \(aplikace odhadla 38 g bílkovin, 560 kcal\)/.test(text) && /„3 vejce a chleba“/.test(text) && !/tvaroh/.test(text), text);
  assert.ok(/PITI_JIDLO_CLAUDE\.json/.test(text), 'pokyn kam zapsat');
  assert.strictEqual(p.volej('schranka').data.nove.length, 0, 'aplikace poznámku pro Clauda neukazuje');
  // Claude odhadne (odhady), zhodnotí den a z diktátu zapíše doplněk
  const j2 = o.data.dny['2026-10-09'].jidlo[1];
  p.schranka.deti.ZDRAVI.createFile('PITI_JIDLO_CLAUDE.json', JSON.stringify({
    zapisy: [],
    odhady: { [j1.id]: { bilkoviny: 42, kcal: 610, poznamka: 'porce ~180 g kuřete' }, [j2.id]: { bilkoviny: 22, kcal: 400 } },
    hodnoceni: { '2026-10-09': { znamka: 'B', text: 'Bílkovin 94 g ze 130 – chybí večeře s masem; voda dobrá.', kdy: '2026-10-09T21:45:00+02:00' } },
    doplnky: { '2026-10-09': { elektrolyty: true, kreatin: true }, '2026-10-08': { omega: true } }
  }));
  p.cache.delete('zmena:claude');
  let z = p.volej('zdravi').data;
  const jidla = z.pitiJidlo['2026-10-09'].jidlo;
  assert.deepStrictEqual(jidla.map((x) => [x.co, x.bilkoviny, x.odhad || '']), [['kuře s rýží', 42, 'claude'], ['3 vejce a chleba', 22, 'claude'], ['tvaroh', 30, '']]);
  assert.strictEqual(jidla[0].poznamka, 'porce ~180 g kuřete');
  assert.deepStrictEqual([z.pitiJidlo['2026-10-09'].hodnoceni.znamka, /Bílkovin 94 g/.test(z.pitiJidlo['2026-10-09'].hodnoceni.text)], ['B', true]);
  assert.deepStrictEqual(json(z.doplnky), { '2026-10-09': { elektrolyty: true, kreatin: true }, '2026-10-08': { omega: true } });
  // Michal v aplikaci zruší Claudův doplněk → výslovné „ne“ přebije diktát
  o = p.volej('doplnky', { den: '2026-10-09', zmeny: { kreatin: false } });
  assert.deepStrictEqual(json(o.data.dny), { '2026-10-09': { elektrolyty: true }, '2026-10-08': { omega: true } });
  assert.deepStrictEqual(json(p.volej('zdravi').data.doplnky['2026-10-09']), { elektrolyty: true }, 'i ve Zdraví (nová verze dat po zápisu)');
});

// Michal 10. 10.: „nadiktoval sem jídlo co jsem jedl včera … zapsalo se mi to do dneška“ (v 8:04 „v pátek ráno sem měl 3 rohlíky…“)
test('pití a jídlo zpětně: den nejvýš 14 dní zpátky a ne do budoucna, poznámka pro odhad s dnem jídla, přehodnocení dne', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-10T08:04:00+02:00')); // sobota
  assert.ok(p.volej('info').data.akce.indexOf('pitiJidloPresun') >= 0, 'schopnost přesunu v info');
  assert.ok(/budoucna/.test(p.volej('pitiJidlo', { den: '2026-10-11', jak: 'piti', ml: 250 }).chyba), 'zítřek ne');
  assert.ok(/14 dní/.test(p.volej('pitiJidlo', { den: '2026-09-25', jak: 'jidlo', co: 'rohlík', bilkoviny: 4 }).chyba), '15 dní zpátky ne');
  assert.ok(/budoucna/.test(p.volej('pitiJidlo', { den: '2026-10-11', jak: 'presun', id: 'x' }).chyba), 'přesun do budoucna ne');
  assert.strictEqual(p.volej('pitiJidlo', { den: '2026-09-26', jak: 'piti', ml: 250 }).ok, true, '14 dní zpátky ještě ano');
  // jídlo za včerejšek (pátek) s místním odhadem → poznámka pro Clauda s dnem jídla a zvlášť, kdy se zapsalo
  let o = p.volej('pitiJidlo', { den: '2026-10-09', jak: 'jidlo', co: 'v pátek ráno 3 rohlíky', bilkoviny: 12, kcal: 380, odhad: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(o.data.dny['2026-10-09'].jidlo.map((x) => x.co), ['v pátek ráno 3 rohlíky']);
  const jidl = p.schranka.deti.NOVE.soubory.find((f) => /_jidl\.md$/.test(f.getName())).getBlob().getDataAsString();
  assert.ok(/2026-10-09 \(zapsáno 2026-10-10 08:04\): „v pátek ráno 3 rohlíky“/.test(jidl), jidl);
  // dny před dneškem (14 dní zpátky a pátek) → jedna poznámka „hodnocení dne“, další den se do ní připíše
  const hodn = () => p.schranka.deti.NOVE.soubory.filter((f) => /_hodn\.md$/.test(f.getName()));
  assert.strictEqual(hodn().length, 1, 'jedna poznámka pro přehodnocení');
  const text = hodn()[0].getBlob().getDataAsString();
  assert.ok(/typ: hodnoceni-jidla/.test(text) && /- 2026-09-26 \(znovu/.test(text) && /- 2026-10-09 \(znovu/.test(text) && /hlavni/.test(text), text);
  assert.strictEqual(p.volej('schranka').data.nove.length, 0, 'aplikace poznámku neukazuje');
  p.volej('pitiJidlo', { den: '2026-10-09', jak: 'piti', ml: 500 });
  assert.strictEqual(hodn()[0].getBlob().getDataAsString().split('- 2026-10-09').length, 2, 'stejný den se nepřipisuje dvakrát');
  // dnešní zápis žádné přehodnocení nechce (večer se hodnotí sám)
  p.volej('pitiJidlo', { den: '2026-10-10', jak: 'piti', ml: 250 });
  assert.ok(!/- 2026-10-10/.test(hodn()[0].getBlob().getDataAsString()), 'dnešek ne');
});

test('pití a jídlo: přesun na jiný den – vlastní i Claudův zápis, odhad od Clauda a doplňky z textu jdou s ním, staré hodnocení dne', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-09T20:00:00+02:00'));
  p.volej('pitiJidlo', { den: '2026-10-09', jak: 'piti', ml: 1500 });
  // Michalův zápis z 10. 10. 8:04: jídlo z pátku (s elektrolyty v textu) spadlo do soboty
  p.nastavCas(Date.parse('2026-10-10T08:04:00+02:00'));
  let o = p.volej('pitiJidlo', { den: '2026-10-10', jak: 'jidlo', co: 'v pátek ráno 3 rohlíky, na oběd kuře s rýží', bilkoviny: 60, kcal: 1100,
    odhad: true, doplnky: ['elektrolyty', '../x'] });
  const j = o.data.dny['2026-10-10'].jidlo[0];
  assert.deepStrictEqual(json(j.doplnky), ['elektrolyty'], 'doplňky z textu u jídla (divné id ne)');
  p.volej('doplnky', { den: '2026-10-10', zmeny: { elektrolyty: true, kreatin: true } });
  // Claude mezitím zhodnotil pátek (bez toho jídla), upřesnil odhad a má vlastní zápis z diktátu v sobotu
  const claude = { zapisy: [{ id: 'c-7', den: '2026-10-10', kdy: '2026-10-10T07:30:00+02:00', druh: 'jidlo', co: 'Tvaroh', bilkoviny: 30, kcal: 250 }],
    odhady: { [j.id]: { bilkoviny: 64, kcal: 1180, poznamka: 'porce kuřete ~150 g' } },
    hodnoceni: { '2026-10-09': { znamka: 'D', text: 'Skoro žádné jídlo, bílkovin 0 g.', kdy: '2026-10-09T21:45:00+02:00' } } };
  p.schranka.deti.ZDRAVI.createFile('PITI_JIDLO_CLAUDE.json', JSON.stringify(claude));
  p.cache.delete('zmena:claude');
  assert.ok(!p.volej('zdravi').data.pitiJidlo['2026-10-09'].hodnoceni.stare, 'před přesunem hodnocení platí');
  o = p.volej('pitiJidlo', { den: '2026-10-09', jak: 'presun', id: j.id });
  assert.strictEqual(o.ok, true, o.chyba);
  const pa = o.data.dny['2026-10-09'], so = o.data.dny['2026-10-10'];
  assert.deepStrictEqual(pa.jidlo.map((x) => [x.id, x.co, x.bilkoviny, x.odhad]), [[j.id, j.co, 64, 'claude']], 'odhad od Clauda jde s jídlem');
  assert.deepStrictEqual(so.jidlo.map((x) => x.id), ['c-7'], 'v sobotě zůstal jen Claudův zápis');
  assert.strictEqual(pa.hodnoceni.stare, true, 'pátek už Claude hodnotil bez toho jídla');
  assert.deepStrictEqual(json(o.data.doplnky), { '2026-10-09': { elektrolyty: true }, '2026-10-10': { kreatin: true } }, 'elektrolyty z textu jdou s jídlem');
  const hodn = p.schranka.deti.NOVE.soubory.filter((f) => /_hodn\.md$/.test(f.getName()));
  assert.ok(hodn.length === 1 && /- 2026-10-09 \(znovu/.test(hodn[0].getBlob().getDataAsString()), 'Claude pátek přehodnotí');
  // Claude zapíše nové hodnocení → už ne staré; Zdraví ukazuje totéž co odpověď
  claude.hodnoceni['2026-10-09'] = { znamka: 'B', text: 'Rohlíky a kuře s rýží – bílkovin 64 g.', kdy: '2026-10-10T08:40:00+02:00' };
  p.schranka.deti.ZDRAVI.soubory.find((f) => f.getName() === 'PITI_JIDLO_CLAUDE.json').setContent(JSON.stringify(claude));
  p.cache.delete('zmena:claude');
  let z = p.volej('zdravi').data;
  assert.deepStrictEqual([z.pitiJidlo['2026-10-09'].hodnoceni.znamka, !!z.pitiJidlo['2026-10-09'].hodnoceni.stare], ['B', false]);
  assert.deepStrictEqual(json(z.doplnky), { '2026-10-09': { elektrolyty: true }, '2026-10-10': { kreatin: true } });
  // Claudův zápis z diktátu: jeho soubor se nemění, nový den si pamatuje motor; zpátky na původní den = bez přesunu
  o = p.volej('pitiJidlo', { den: '2026-10-08', jak: 'presun', id: 'c-7' });
  assert.deepStrictEqual([o.data.dny['2026-10-08'].jidlo.map((x) => x.id), (o.data.dny['2026-10-10'] || { jidlo: [] }).jidlo.length], [['c-7'], 0]);
  assert.ok(/"den":"2026-10-10"/.test(p.schranka.deti.ZDRAVI.soubory.find((f) => f.getName() === 'PITI_JIDLO_CLAUDE.json').getBlob().getDataAsString()), 'Claudův soubor beze změny');
  o = p.volej('pitiJidlo', { den: '2026-10-10', jak: 'presun', id: 'c-7' });
  assert.deepStrictEqual(o.data.dny['2026-10-10'].jidlo.map((x) => x.id), ['c-7']);
  const ulozeno = JSON.parse(p.schranka.deti.ZDRAVI.soubory.find((f) => f.getName() === 'PITI_JIDLO.json').getBlob().getDataAsString());
  assert.deepStrictEqual(json(ulozeno.presunute), {}, 'zpět na původní den = žádný přesun');
  assert.ok(ulozeno.zmeneno['2026-10-09'] && ulozeno.zmeneno['2026-10-08'] && !ulozeno.zmeneno['2026-10-10'], 'zpětně změněné dny: ' + JSON.stringify(ulozeno.zmeneno));
  assert.ok(!('2026-10-10' in ulozeno.dny) || ulozeno.dny['2026-10-10'].piti.length || ulozeno.dny['2026-10-10'].jidlo.length, 'prázdný den se nedrží');
  // smazání najde zápis i v jiném dni, než ukazovala aplikace; neexistující zápis přesunout nejde
  o = p.volej('pitiJidlo', { den: '2026-10-10', jak: 'smazat', id: j.id });
  assert.deepStrictEqual(o.data.dny['2026-10-09'].jidlo.length, 0, 'smazáno z pátku');
  assert.ok(/už není/.test(p.volej('pitiJidlo', { den: '2026-10-09', jak: 'presun', id: j.id }).chyba));
  assert.ok(/už není/.test(p.volej('pitiJidlo', { den: '2026-10-09', jak: 'presun', id: 'c-nic' }).chyba));
  assert.ok(/Neznámá akce/.test(p.volej('pitiJidlo', { den: '2026-10-09', jak: 'prevest', id: 'c-7' }).chyba));
});

test('hodnocení dne: od 21:30 jednou denně poznámka pro Clauda, jen když se jedlo nebo pilo', () => {
  const p = prostredi();
  const hodn = () => p.schranka.deti.NOVE ? p.schranka.deti.NOVE.soubory.filter((f) => /_hodn\.md$/.test(f.getName())) : [];
  p.nastavCas(Date.parse('2026-10-09T21:40:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(hodn().length, 0, 'bez zápisů nic');
  p.nastavCas(Date.parse('2026-10-09T20:00:00+02:00'));
  p.volej('pitiJidlo', { den: '2026-10-09', jak: 'piti', ml: 500 });
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(hodn().length, 0, 'před 21:30 ne');
  p.nastavCas(Date.parse('2026-10-09T21:40:00+02:00'));
  p.ctx.instagramKazdych10Min();
  p.nastavCas(Date.parse('2026-10-09T21:50:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(hodn().length, 1, 'jednou za den');
  assert.ok(/typ: hodnoceni-jidla/.test(hodn()[0].getBlob().getDataAsString()) && /2026-10-09/.test(hodn()[0].getBlob().getDataAsString()));
  assert.ok(/hlavni/.test(hodn()[0].getBlob().getDataAsString()), 'pokyn: doplňky jen hlavní');
});

// týdenní shrnutí zdraví (Michal 9. 10.: „nedělní shrnutí … napsat mailem tu moji aktivitu“) – vymyšlená data, týden 5.–11. 10. 2026
const REZIM_TYDNE = { bilkovinyCil: 130, pitiCil: 2500, treninkDny: [3, 5], zapasTymy: ['A'], hlavni: ['kreatin', 'omega3', 'horcik', 'kofein'],
  polozky: [{ id: 'kreatin', nazev: 'Kreatin', kdy: 'rano' }, { id: 'omega3', nazev: 'Omega-3', kdy: 'obed' }, { id: 'horcik', nazev: 'Hořčík', kdy: 'vecer' },
    { id: 'multi', nazev: 'Multivitamin', kdy: 'rano' }, { id: 'kofein', nazev: 'Kofein', kdy: 'zapas', jen: 'zapas' },
    { id: 'whey', nazev: 'Protein', kdy: 'po', jen: 'zatez', bilkoviny: 20 }] };
const ms = (s) => Date.parse(s);

test('týdenní shrnutí: čísla týdne – jídlo a voda po dnech, jen hlavní doplňky (k zápasu jen v den zápasu), ranní váha, WHOOP proti minulému týdnu', () => {
  const p = prostredi();
  p.nastavCas(ms('2026-10-11T18:00:00+02:00'));
  const T = vm.runInContext('ZDRAVI_TYDEN_', p.ctx);
  assert.deepStrictEqual([T.isoTyden('2026-10-05'), T.isoTyden('2026-12-28'), T.isoTyden('2027-01-04'), T.pondeliTydne('2026-W41'), T.pondeliTydne('2026-W53')],
    ['2026-W41', '2026-W53', '2027-W01', '2026-10-05', '2026-12-28']);
  assert.deepStrictEqual([T.rozsah('2026-10-05', '2026-10-11'), T.rozsah('2026-09-28', '2026-10-04'), T.cislo(12345.6, 1), T.cislo(-0.7, 1)],
    ['5.–11. 10. 2026', '28. 9.–4. 10. 2026', '12 345,6', '−0,7']);
  const s = json(T.souhrn({
    od: '2026-10-05', rezim: REZIM_TYDNE, zapasy: ['2026-10-10'],
    doplnky: { '2026-10-05': { kreatin: true, omega3: true, horcik: true, multi: true }, '2026-10-06': { kreatin: true },
      '2026-10-10': { kreatin: true, omega3: true, horcik: true, kofein: true }, '2026-10-11': { kreatin: true, omega3: true, horcik: true, whey: true } },
    piti: { '2026-10-05': { piti: [{ ml: 500 }, { ml: 2000 }], jidlo: [{ co: 'a', bilkoviny: 40, kcal: 600 }, { co: 'b', bilkoviny: 95, kcal: 900 }], hodnoceni: { znamka: 'b', text: 'x' } },
      '2026-10-11': { piti: [{ ml: 1000 }], jidlo: [{ co: 'c', bilkoviny: 30, kcal: 400 }] } },
    vaha: [{ kdy: ms('2026-10-05T07:00:00+02:00'), kg: 84.3 }, { kdy: ms('2026-10-07T21:00:00+02:00'), kg: 85.5 }, { kdy: ms('2026-10-11T07:30:00+02:00'), kg: 83.6 }],
    dny: { '2026-10-05': { whoop: { pripravenost: { skore: 60 }, spanek: { celkem: 7 * 36e5 }, zatez: { zatez: 10 } }, apple: { kroky: 8000, energie: 500, cviceni: 30 } },
      '2026-10-06': { whoop: { pripravenost: { skore: 70 }, spanek: { celkem: 8 * 36e5 }, zatez: { zatez: 12, kroky: 9500 } }, apple: { kroky: 10000, energie: 700, cviceni: 45 } },
      '2026-09-28': { whoop: { pripravenost: { skore: 50 } }, apple: { kroky: 6000 } }, '2026-09-29': { whoop: { pripravenost: { skore: 60 } } } },
    treninky: [{ den: '2026-10-07', sport: 'soccer', start: ms('2026-10-07T18:00:00+02:00'), konec: ms('2026-10-07T19:30:00+02:00') },
      { den: '2026-10-04', sport: 'running', start: 0, konec: 36e5 }]
  }));
  assert.strictEqual(s.tyden, '2026-W41');
  assert.deepStrictEqual(s.dny.map((d) => [d.nazev, d.bilkoviny, d.vodaMl, d.doplnky.vzato + '/' + d.doplnky.celkem, d.znamka]), [
    ['Po 5. 10.', 135, 2500, '3/3', 'B'], ['Út 6. 10.', null, null, '1/3', ''], ['St 7. 10.', null, null, '0/3', ''], ['Čt 8. 10.', null, null, '0/3', ''],
    ['Pá 9. 10.', null, null, '0/3', ''], ['So 10. 10.', null, null, '4/4', ''], ['Ne 11. 10.', 50, 1000, '3/3', '']], 'multivitamin a protein se nepočítají, kofein jen v den zápasu, protein do bílkovin');
  assert.deepStrictEqual([s.doplnky.splneno, s.doplnky.dnu, s.doplnky.polozky.map((x) => x.id + ' ' + x.vzato + '/' + x.dni).join()], [3, 7, 'kreatin 4/7,omega3 3/7,horcik 3/7,kofein 1/1']);
  assert.deepStrictEqual([s.jidlo.dnu, s.jidlo.bilkoviny, s.jidlo.dnuCil, s.voda.ml, s.voda.dnuCil], [2, 92.5, 1, 1750, 1]);
  assert.deepStrictEqual([s.vaha.zacatek.kg, s.vaha.konec.kg, s.vaha.rozdil, s.vaha.ranni, s.vaha.pocet], [84.3, 83.6, -0.7, 2, 3], 'večerní vážení se nesrovnává');
  assert.deepStrictEqual([s.whoop.pripravenost.ted, s.whoop.pripravenost.minule, s.whoop.spanek.ted, s.whoop.zatez.ted, s.apple.kroky.ted, s.apple.kroky.minule, s.apple.cviceni],
    [65, 55, 7.5 * 36e5, 11, 9000, 6000, 75]);
  assert.deepStrictEqual([s.treninky.pocet, s.treninky.minut, s.treninky.sporty], [1, 90, { Fotbal: 1 }], 'jen tréninky z týdne');
  assert.strictEqual(s.maData, true);
  const text = T.text(s, null);
  assert.ok(/Po 5\. 10\.: 135 g bílkovin · 1 500 kcal · voda 2,5 l · doplňky 3\/3 · hodnocení B \| zotavení 60 % · spánek 7:00 · zátěž 10,0/.test(text), text);
  assert.ok(/So 10\. 10\. \(zápas\)/.test(text) && /Kreatin 4\/7 · Omega-3 3\/7/.test(text) && /84,3 kg \(po 5\. 10\.\) → 83,6 kg \(ne 11\. 10\.\), −0,7 kg/.test(text), text);
  assert.ok(/zotavení ø 65 % \(minulý týden 55 %\)/.test(text) && /Fotbal 1×/.test(text), text);
  const html = T.html(s, { text: 'Skvělý **týden**.\n\n- víc vody\n- <script>x</script>' });
  assert.ok(/<b>týden<\/b>/.test(html) && /<li>víc vody<\/li>/.test(html) && /&lt;script&gt;/.test(html) && !/<script/.test(html), 'Claudův text bezpečně');
  assert.ok(!/<img|https?:|<style|<link/i.test(html), 'žádné cizí obrázky ani styly');
  assert.ok(/Zotavení ø/.test(html) && /65 %/.test(html) && /↑ 10 %/.test(html) && /Po 5\. 10\./.test(html) && /3\/3 ✓/.test(html), 'čísla v HTML');
  // prázdný týden
  assert.strictEqual(T.souhrn({ od: '2026-10-05', rezim: {}, dny: {}, piti: {}, doplnky: {}, vaha: [], treninky: [] }).maData, false);
});

test('týdenní shrnutí: v neděli od 18:00 poznámka pro Clauda (skrytá), e-mail s jeho textem jednou, v noci ne, v pondělí v 8:00 i bez něj', () => {
  const p = prostredi();
  const zdravi = () => p.schranka.deti.ZDRAVI || p.schranka.createFolder('ZDRAVI');
  const tyden = () => (p.schranka.deti.NOVE ? p.schranka.deti.NOVE.soubory.filter((f) => /_tyden\.md$/.test(f.getName())) : []);
  const maily = () => p.log.odeslano.filter((x) => x.jak === 'send' && /Tvůj týden/.test(x.predmet));
  const napisClaude = (text) => {
    const obsah = JSON.stringify({ zapisy: [], tydny: { '2026-W41': { text, kdy: '2026-10-11T18:20:00+02:00' } } });
    const f = zdravi().soubory.find((x) => x.getName() === 'PITI_JIDLO_CLAUDE.json');
    if (f) f.setContent(obsah); else zdravi().createFile('PITI_JIDLO_CLAUDE.json', obsah);
    p.cache.delete('zmena:claude');
  };
  p.schranka.createFile('ZDRAVI_REZIM.json', JSON.stringify(REZIM_TYDNE));
  p.schranka.createFile('FOTBAL.json', JSON.stringify({ tymy: [{ klic: 'A', nazev: 'A-tým' }], zapasy: [{ id: 'z1', tym: 'A', zacatek: '2026-10-10T16:00:00+02:00', domaci: 'Vnorovy', hoste: 'Test', doma: true }] }));
  zdravi().createFile('2026-10.json', JSON.stringify({ dny: { '2026-10-06': { whoop: { pripravenost: { skore: 66 }, spanek: { celkem: 7 * 36e5 } } } }, treninky: {} }));
  p.nastavCas(ms('2026-10-06T12:00:00+02:00'));
  p.volej('pitiJidlo', { den: '2026-10-06', jak: 'jidlo', co: 'Kuře s rýží', bilkoviny: 45, kcal: 650 });
  p.volej('doplnky', { den: '2026-10-10', zmeny: { kofein: true, kreatin: true } });
  p.nastavCas(ms('2026-10-11T17:50:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(tyden().length, 0, 'před 18:00 nic');
  p.nastavCas(ms('2026-10-11T18:00:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(tyden().length, 1, 'v neděli v 18:00 poznámka pro Clauda');
  const pozn = tyden()[0].getBlob().getDataAsString();
  assert.ok(/typ: tyden-zdravi/.test(pozn) && /tyden: 2026-W41/.test(pozn) && /„tydny“ → „2026-W41“/.test(pozn) && /Út 6\. 10\.: 45 g bílkovin/.test(pozn) && /Kofein 1\/1/.test(pozn), pozn);
  assert.strictEqual(maily().length, 0, 'e-mail čeká na Clauda');
  assert.strictEqual(p.volej('schranka').data.nove.length, 0, 'aplikace poznámku neukazuje');
  p.nastavCas(ms('2026-10-11T18:10:00+02:00'));
  p.ctx.tydenniShrnutiNaPozadi_();
  assert.strictEqual(tyden().length, 1, 'poznámka jen jednou');
  // Claude napíše text → další běh pošle e-mail (na vlastní adresu se značkou → v Poště „Informace“)
  p.nastavCas(ms('2026-10-11T18:20:00+02:00'));
  napisClaude('Dobrý týden, **bílkoviny** v úterý sedly.\n\n- zítra víc vody');
  p.nastavCas(ms('2026-10-11T18:30:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(maily().length, 1, 'e-mail hned, jak je Claudův text');
  const m = json(maily()[0]);
  assert.strictEqual(m.komu, 'osobni+notifikace@gmail.test');
  assert.ok(/5\.–11\. 10\. 2026/.test(m.predmet) && m.m.name === 'Asistent', m.predmet);
  assert.ok(/<b>bílkoviny<\/b>/.test(m.m.htmlBody) && /Út 6\. 10\./.test(m.m.htmlBody) && /45 g/.test(m.m.htmlBody), 'HTML s Claudovým textem a čísly');
  assert.ok(/^Týdenní shrnutí z aplikace Asistent/.test(m.t) && /\n\nDobrý týden/.test(m.t) && /Út 6\. 10\.: 45 g bílkovin/.test(m.t), 'textová verze');
  // náhled v seznamu pošty (prvních 180 znaků) jde i do účtu Firebase → bez čísel a Claudova textu
  assert.ok(!/\d/.test(m.t.slice(0, 180)) && m.t.indexOf('Dobrý') > 180, 'začátek e-mailu bez zdravotních údajů: ' + m.t.slice(0, 180));
  const nahled = String(m.m.htmlBody).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
  assert.ok(!/bílkovin|Dobrý|\d+ g|\d+ %/.test(nahled), 'ani HTML nezačíná čísly: ' + nahled);
  const posledni = p.zprava({ id: 'tyden', od: 'Asistent <' + JA + '>', komu: m.komu, predmet: m.predmet, text: m.t.slice(0, 200), kdy: ms('2026-10-11T18:30:00+02:00') });
  assert.strictEqual(p.ctx.stavADuvod_(posledni, true, null, false, ms('2026-10-11T18:31:00+02:00'), true, {}).stav, 'info', 'v Poště aplikace jako Informace, ne Čekáš na ně');
  // nikdy dvakrát
  p.nastavCas(ms('2026-10-11T18:40:00+02:00'));
  p.ctx.tydenniShrnutiNaPozadi_();
  p.nastavCas(ms('2026-10-12T08:10:00+02:00'));
  napisClaude('Oprava textu');
  p.ctx.tydenniShrnutiNaPozadi_();
  assert.strictEqual(maily().length, 1, 'jednou za týden');
  // aplikace: karta s posledním shrnutím
  p.cache.clear();
  const z = p.volej('zdravi').data.tydenni;
  assert.deepStrictEqual([z.tyden, z.od, z.do, z.text, z.odeslano], ['2026-W41', '2026-10-05', '2026-10-11', 'Oprava textu', true]);
  p.nastavCas(ms('2026-10-20T12:00:00+02:00'));
  p.cache.clear();
  assert.strictEqual(p.volej('zdravi').data.tydenni, null, 'po týdnu karta zmizí');
});

test('týdenní shrnutí: Claudův text v noci počká na 6:00, bez textu e-mail v pondělí v 8:00 (jen čísla), prázdný týden nic', () => {
  const noc = prostredi();
  const zdravi = (p) => p.schranka.deti.ZDRAVI || p.schranka.createFolder('ZDRAVI');
  const maily = (p) => p.log.odeslano.filter((x) => x.jak === 'send' && /Tvůj týden/.test(x.predmet));
  noc.schranka.createFile('ZDRAVI_REZIM.json', JSON.stringify(REZIM_TYDNE));
  noc.nastavCas(ms('2026-10-07T12:00:00+02:00'));
  noc.volej('pitiJidlo', { den: '2026-10-07', jak: 'piti', ml: 750 });
  noc.nastavCas(ms('2026-10-11T19:00:00+02:00'));
  noc.ctx.tydenniShrnutiNaPozadi_();
  noc.nastavCas(ms('2026-10-11T22:30:00+02:00'));
  zdravi(noc).createFile('PITI_JIDLO_CLAUDE.json', JSON.stringify({ tydny: { '2026-W41': { text: 'Večerní text', kdy: '2026-10-11T22:30:00+02:00' } } }));
  noc.cache.delete('zmena:claude');
  noc.nastavCas(ms('2026-10-11T22:40:00+02:00'));
  noc.ctx.tydenniShrnutiNaPozadi_();
  noc.nastavCas(ms('2026-10-12T05:50:00+02:00'));
  noc.ctx.tydenniShrnutiNaPozadi_();
  assert.strictEqual(maily(noc).length, 0, 'v noci ne');
  noc.nastavCas(ms('2026-10-12T06:00:00+02:00'));
  noc.ctx.tydenniShrnutiNaPozadi_();
  assert.strictEqual(maily(noc).length, 1, 'ráno v 6:00');
  assert.ok(/Večerní text/.test(maily(noc)[0].m.htmlBody) && /0,8 l/.test(maily(noc)[0].m.htmlBody), 'text i čísla');

  const bez = prostredi();
  bez.schranka.createFile('ZDRAVI_REZIM.json', JSON.stringify(REZIM_TYDNE));
  bez.nastavCas(ms('2026-10-09T12:00:00+02:00'));
  bez.volej('vaha', { kg: 84.1, kdy: ms('2026-10-09T07:10:00+02:00') });
  bez.nastavCas(ms('2026-10-11T20:00:00+02:00'));
  bez.ctx.tydenniShrnutiNaPozadi_();
  bez.nastavCas(ms('2026-10-12T07:50:00+02:00'));
  bez.ctx.tydenniShrnutiNaPozadi_();
  assert.strictEqual(maily(bez).length, 0, 'do 8:00 čeká na Clauda');
  bez.nastavCas(ms('2026-10-12T08:00:00+02:00'));
  bez.ctx.instagramKazdych10Min();
  assert.strictEqual(maily(bez).length, 1, 'v pondělí v 8:00 i bez Clauda');
  assert.ok(!/>Claude</.test(maily(bez)[0].m.htmlBody) && /84,1 kg ráno/.test(maily(bez)[0].m.htmlBody), 'jen čísla');
  bez.nastavCas(ms('2026-10-12T09:00:00+02:00'));
  zdravi(bez).createFile('PITI_JIDLO_CLAUDE.json', JSON.stringify({ tydny: { '2026-W41': { text: 'Pozdě', kdy: '2026-10-12T09:00:00+02:00' } } }));
  bez.cache.delete('zmena:claude');
  bez.ctx.tydenniShrnutiNaPozadi_();
  bez.nastavCas(ms('2026-10-13T10:00:00+02:00'));
  bez.ctx.tydenniShrnutiNaPozadi_();
  assert.strictEqual(maily(bez).length, 1, 'pozdní text už druhý e-mail nepošle');

  const prazdny = prostredi();
  prazdny.nastavCas(ms('2026-10-11T18:00:00+02:00'));
  prazdny.ctx.tydenniShrnutiNaPozadi_();
  prazdny.nastavCas(ms('2026-10-12T08:00:00+02:00'));
  prazdny.ctx.tydenniShrnutiNaPozadi_();
  assert.strictEqual(maily(prazdny).length + (prazdny.schranka.deti.NOVE ? prazdny.schranka.deti.NOVE.soubory.length : 0), 0, 'bez dat ani poznámka, ani e-mail');
  // okno: neděle od 18:00 a pondělí čekají na Clauda (v noci ticho), od pondělí 8:00 a v úterý i bez něj, jinak nic
  const okno = (t) => { const o = prazdny.ctx.tydenZdraviOkno_(ms(t)); return o && [o.tyden, o.od, o.do, o.faze, o.ticho].join(' '); };
  assert.deepStrictEqual([okno('2026-10-11T17:59:00+02:00'), okno('2026-10-11T18:00:00+02:00'), okno('2026-10-11T22:10:00+02:00'),
    okno('2026-10-12T07:59:00+02:00'), okno('2026-10-12T08:00:00+02:00'), okno('2026-10-13T12:00:00+02:00'), okno('2026-10-14T18:00:00+02:00')],
  [null, '2026-W41 2026-10-05 2026-10-11 ceka false', '2026-W41 2026-10-05 2026-10-11 ceka true', '2026-W41 2026-10-05 2026-10-11 ceka false',
    '2026-W41 2026-10-05 2026-10-11 posli false', '2026-W41 2026-10-05 2026-10-11 posli false', null]);
});

test('váha: zápis s časem zápisu, česká čárka, nesmysl odmítnut, smazání překlepu, v přehledu Zdraví', () => {
  const p = prostredi();
  const rano = Date.parse('2026-10-05T07:12:00+02:00');
  p.nastavCas(rano);
  let o = p.volej('vaha', { kg: '80,4' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.zaznamy), [{ kdy: rano, kg: 80.4 }]);
  p.nastavCas(Date.parse('2026-10-06T21:05:00+02:00'));
  assert.strictEqual(p.volej('vaha', { kg: 79.86 }).data.zaznamy[1].kg, 79.9);
  assert.strictEqual(p.volej('vaha', { kg: 'osmdesát' }).ok, false);
  assert.strictEqual(p.volej('vaha', { kg: 8 }).ok, false);
  assert.strictEqual(p.volej('vaha', { kg: '' }).ok, false);
  assert.strictEqual(p.ctx.vahaKg_('80.4 kg'), 80.4);
  // zpětně s časem vážení (zapsal až později): mezi ostatní podle času; budoucnost a víc než 60 dní zpátky ne
  const vcerRano = Date.parse('2026-10-06T07:05:00+02:00');
  let z2 = p.volej('vaha', { kg: '80,1', kdy: vcerRano }).data.zaznamy;
  assert.deepStrictEqual(json(z2.map((x) => [x.kdy, x.kg])), [[rano, 80.4], [vcerRano, 80.1], [Date.parse('2026-10-06T21:05:00+02:00'), 79.9]]);
  z2 = p.volej('vaha', { kg: 80.2, kdy: '2026-10-06T07:05:00+02:00' }).data.zaznamy; // stejná minuta → o vteřinu dál
  assert.strictEqual(z2.filter((x) => Math.abs(x.kdy - vcerRano) < 60000).length, 2);
  assert.ok(/60 dnech/.test(p.volej('vaha', { kg: 80, kdy: Date.parse('2026-10-07T09:00:00+02:00') }).chyba), 'budoucnost ne');
  assert.ok(/60 dnech/.test(p.volej('vaha', { kg: 80, kdy: Date.parse('2026-07-01T09:00:00+02:00') }).chyba), 'moc staré ne');
  p.volej('vaha', { smazat: vcerRano + 1000 });
  p.volej('vaha', { smazat: vcerRano });
  // jen na Disku ve složce ZDRAVI, s časy zápisu
  const soubor = p.schranka.deti.ZDRAVI.soubory.find((f) => f.getName() === 'VAHA.json');
  assert.deepStrictEqual(JSON.parse(soubor.getBlob().getDataAsString()).zaznamy.map((x) => x.kdy), [rano, Date.parse('2026-10-06T21:05:00+02:00')]);
  assert.deepStrictEqual(p.volej('zdravi').data.vaha.map((x) => x.kg), [80.4, 79.9]);
  // smazat překlep
  o = p.volej('vaha', { smazat: rano });
  assert.deepStrictEqual(o.data.zaznamy.map((x) => x.kg), [79.9]);
});

test('dávka: víc čtení v jednom požadavku, chyba jedné akce nezastaví ostatní, zápisy v dávce nejdou; poznámky z mezipaměti', () => {
  const p = prostredi();
  p.schranka.createFolder('NOVE').createFile('2026-10-05_090000_ab12.md', '---\nkdy: 2026-10-05T09:00:00+02:00\nodkud: iPhone\n---\n\nPrvní verze.\n');
  const o = p.volej('davka', { polozky: [{ akce: 'info' }, { akce: 'schranka' }, { akce: 'fotbal' }, { akce: 'vaha', kg: 80 }, { akce: 'neexistuje' }] });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(o.data.map((x) => x.ok), [true, true, true, false, false]);
  assert.ok(o.data[0].data.akce.indexOf('davka') >= 0, 'info hlásí, že motor dávku umí');
  assert.strictEqual(o.data[1].data.nove[0].text, 'První verze.');
  assert.ok(/dávce/.test(o.data[3].chyba), 'zápis váhy v dávce nejde');
  assert.ok(!p.schranka.deti.ZDRAVI, 'nic se nezapsalo');
  // poznámka se z Disku čte jen poprvé a po změně
  const soubor = p.schranka.deti.NOVE.soubory[0];
  let cteni = 0;
  const blob = soubor.getBlob;
  soubor.getBlob = () => { cteni++; return blob(); };
  p.volej('schranka');
  assert.strictEqual(cteni, 0, 'nezměněná poznámka z mezipaměti');
  soubor.setContent('---\nkdy: 2026-10-05T09:00:00+02:00\n---\n\nDruhá verze.\n');
  assert.strictEqual(p.volej('schranka').data.nove[0].text, 'Druhá verze.');
  assert.strictEqual(cteni, 1, 'změněná poznámka se přečte znovu');
  p.volej('posta');
  assert.strictEqual(p.ttl.get('posta'), 300, 'pošta v mezipaměti 5 minut');
});

// ---- Instagram: naplánované zveřejnění reelu (klíč i účet vymyšlené)
function reelyProInstagram(p) {
  const reely = p.schranka.createFolder('REELY');
  reely.createFile('reely.json', JSON.stringify({ verze: 1, aktualizovano: '2026-10-05T08:05:02+02:00', reely: [
    { id: 'reel_dorost_tesany', tymy: ['dorost'], datum_zapasu: '2026-10-04', video: 'reel_dorost_tesany.mp4', popisek: 'Hattrick! ⚽⚽⚽\n\n#fkagrovnorovy',
      zapasy: [{ datum: '2026-10-04', tym: 'dorost', domaci: 'Vnorovy', hoste: 'Těšany', skore: '3:1' }] },
    { id: 'reel_bez_videa', tymy: ['B'], datum_zapasu: '2026-10-04', video: 'chybi.mp4', popisek: 'Text', zapasy: [] },
    { id: 'reel_bez_popisku', tymy: ['A'], datum_zapasu: '2026-10-04', video: 'reel_bez_popisku.mp4', popisek: '', zapasy: [] }
  ] }));
  const videa = reely.createFolder('videa');
  videa.createFile('reel_dorost_tesany.mp4', 'video');
  videa.createFile('reel_bez_popisku.mp4', 'video');
  return videa.soubory[0];
}

test('Instagram: plán reelu (klíč, čas, video, popisek), zrušení, stav v odpovědi reely', () => {
  const p = prostredi();
  reelyProInstagram(p);
  const za = Date.now() + 2 * 36e5;
  assert.ok(/IG_TOKEN/.test(p.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: za }).chyba), 'bez klíče nejde');
  p.vlastnosti.set('IG_TOKEN', 'testovaci-ig-klic');
  assert.ok(/nesedí/.test(p.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: Date.now() - 864e5 }).chyba));
  assert.ok(/Disku/.test(p.volej('reelNaplanovat', { id: 'reel_bez_videa', kdy: za }).chyba));
  assert.ok(/popisek/.test(p.volej('reelNaplanovat', { id: 'reel_bez_popisku', kdy: za }).chyba));
  let o = p.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: za });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.plan), { reel_dorost_tesany: { kdy: za, stav: 'ceka', oznacit: [], upraveno: false } });
  assert.ok(/Neplatné jméno/.test(p.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: za, oznacit: 'dorost agro!' }).chyba));
  // označení a upravený popisek (jen pro Instagram)
  o = p.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: za, oznacit: '@Dorost_Agro, dorost_agro', popisek: 'Upravený text\r\n#fkagrovnorovy' });
  assert.deepStrictEqual(json(o.data.plan.reel_dorost_tesany), { kdy: za, stav: 'ceka', oznacit: ['dorost_agro'], upraveno: true });
  assert.deepStrictEqual(json(o.data.popisky), { reel_dorost_tesany: 'Upravený text\n#fkagrovnorovy' });
  assert.strictEqual(p.volej('reely').data.popiskyPlanu.reel_dorost_tesany, 'Upravený text\n#fkagrovnorovy');
  const r = p.volej('reely', { znovu: true }).data;
  assert.deepStrictEqual(json(r.instagram), { nastaveno: true, ucet: '' });
  assert.strictEqual(r.plan.reel_dorost_tesany.stav, 'ceka');
  o = p.volej('reelZrusitPlan', { id: 'reel_dorost_tesany' });
  assert.deepStrictEqual(json(o.data.plan), {});
  assert.deepStrictEqual(json(o.data.popisky), {}, 'upravený popisek se zrušením pryč');
  // spouštěč bez plánu nic nevolá (jen obnova klíče)
  p.ctx.instagramKazdych10Min();
  assert.deepStrictEqual(p.ig.volani.map((v) => v.cesta), ['refresh_access_token']);
  assert.strictEqual(p.vlastnosti.get('IG_TOKEN'), 'obnoveny-klic', 'klíč obnovený');
});

test('Instagram: spouštěč zveřejní reel – tajný odkaz jen na dobu stahování, popisek beze změny, zveřejněno s odkazem', () => {
  const p = prostredi();
  const video = reelyProInstagram(p);
  p.vlastnosti.set('IG_TOKEN', 'testovaci-ig-klic');
  p.vlastnosti.set('IG_TOKEN_OBNOVA', String(Date.now()));
  assert.strictEqual(p.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: Date.now() + 30e3, oznacit: ['dorost_agro'] }).ok, true);
  p.ctx.instagramKazdych10Min();
  const kontejner = p.ig.volani.find((v) => v.cesta === '17841400000/media');
  assert.strictEqual(kontejner.telo.media_type, 'REELS');
  assert.strictEqual(kontejner.telo.caption, 'Hattrick! ⚽⚽⚽\n\n#fkagrovnorovy', 'popisek přesně z reely.json');
  assert.deepStrictEqual(JSON.parse(kontejner.telo.user_tags), [{ username: 'dorost_agro' }], 'označený účet');
  assert.ok(/drive\.usercontent\.google\.com\/download\?id=soubor-videa-reel_dorost_tesany\.mp4/.test(kontejner.telo.video_url), kontejner.telo.video_url);
  assert.ok(!('access_token' in kontejner.telo) || kontejner.telo.access_token === 'testovaci-ig-klic');
  assert.deepStrictEqual(video.sdileni, ['ANYONE_WITH_LINK:VIEW', 'PRIVATE:NONE'], 'odkaz jen po dobu stahování');
  assert.strictEqual(p.ig.zverejneno, 1);
  const plan = JSON.parse(p.vlastnosti.get('REELY_PLAN')).reel_dorost_tesany;
  assert.deepStrictEqual([plan.stav, plan.odkaz, plan.media], ['hotovo', 'https://www.instagram.com/reel/TEST123/', 'media-1']);
  assert.ok(JSON.parse(p.vlastnosti.get('REELY_STAV')).reel_dorost_tesany, 'označeno jako zveřejněné');
  assert.ok(!p.log.ntfy, 'bez zapnutých upozornění nic');
  // další běh nic nezveřejní znovu
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(p.ig.zverejneno, 1);
});

test('Instagram: se zapnutými upozorněními přijde „Reel je na Instagramu“ s odkazem na příspěvek', () => {
  const p = prostredi();
  reelyProInstagram(p);
  p.vlastnosti.set('IG_TOKEN', 'testovaci-ig-klic');
  p.vlastnosti.set('IG_TOKEN_OBNOVA', String(Date.now()));
  p.volej('upozorneniZapnout');
  p.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: Date.now() });
  p.ctx.instagramKazdych10Min();
  const u = p.log.ntfy.find((x) => x.title === 'Reel je na Instagramu ✓');
  assert.ok(u && u.click === 'https://www.instagram.com/reel/TEST123/', JSON.stringify(p.log.ntfy));
});

test('Instagram: video se zpracovává dlouho → příští běh; odmítnuté video → chyba a sdílení pryč', () => {
  const p = prostredi();
  const video = reelyProInstagram(p);
  p.vlastnosti.set('IG_TOKEN', 'testovaci-ig-klic');
  p.vlastnosti.set('IG_TOKEN_OBNOVA', String(Date.now()));
  p.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: Date.now() });
  // zpracování trvá déle než jeden běh (čas v motoru se posune za limit čekání)
  p.ig.stavy = ['IN_PROGRESS'];
  const ted = Date.now();
  let krok = 0;
  vm.runInContext('Date.now = function () { return ' + ted + ' + (globalThis.__krok = (globalThis.__krok || 0) + 1) * 60000; };', p.ctx);
  p.ctx.instagramKazdych10Min();
  vm.runInContext('Date.now = function () { return ' + ted + ' + 3600000 * 0.5; };', p.ctx);
  let plan = JSON.parse(p.vlastnosti.get('REELY_PLAN')).reel_dorost_tesany;
  assert.deepStrictEqual([plan.stav, plan.kontejner], ['nahrava', 'kontejner-1']);
  assert.deepStrictEqual(video.sdileni, ['ANYONE_WITH_LINK:VIEW'], 'během zpracování odkaz zůstává');
  assert.ok(/nahrává/.test(p.volej('reelZrusitPlan', { id: 'reel_dorost_tesany' }).chyba), 'během nahrávání zrušit nejde');
  // příští běh: Instagram video odmítl
  p.ig.stavy = ['ERROR'];
  p.ctx.instagramKazdych10Min();
  plan = JSON.parse(p.vlastnosti.get('REELY_PLAN')).reel_dorost_tesany;
  assert.strictEqual(plan.stav, 'chyba');
  assert.ok(/odmítl/.test(plan.chyba), plan.chyba);
  assert.deepStrictEqual(video.sdileni, ['ANYONE_WITH_LINK:VIEW', 'PRIVATE:NONE'], 'po chybě sdílení pryč');
  assert.strictEqual(p.ig.zverejneno, undefined, 'nic se nezveřejnilo');
  // chyba při založení kontejneru (třeba neplatný klíč) → chyba hned, odkaz pryč
  const p2 = prostredi();
  const video2 = reelyProInstagram(p2);
  p2.vlastnosti.set('IG_TOKEN', 'spatny');
  p2.vlastnosti.set('IG_TOKEN_OBNOVA', String(Date.now()));
  p2.ig.chybaKontejneru = 'Invalid OAuth access token';
  p2.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: Date.now() });
  p2.volej('upozorneniZapnout');
  p2.ctx.instagramKazdych10Min();
  const plan2 = JSON.parse(p2.vlastnosti.get('REELY_PLAN')).reel_dorost_tesany;
  assert.deepStrictEqual([plan2.stav, /OAuth/.test(plan2.chyba)], ['chyba', true]);
  assert.deepStrictEqual(video2.sdileni, ['ANYONE_WITH_LINK:VIEW', 'PRIVATE:NONE']);
  assert.ok(p2.log.ntfy.some((x) => x.title === 'Reel nevyšel na Instagramu' && x.priority === 4), JSON.stringify(p2.log.ntfy));
});

test('Instagram: reel rovnou i do příběhu – stejné video, dva kontejnery, nevyjde-li příběh, reel platí', () => {
  const p = prostredi();
  const video = reelyProInstagram(p);
  p.vlastnosti.set('IG_TOKEN', 'testovaci-ig-klic');
  p.vlastnosti.set('IG_TOKEN_OBNOVA', String(Date.now()));
  let o = p.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: Date.now(), pribeh: true });
  assert.strictEqual(o.data.plan.reel_dorost_tesany.pribeh, true);
  p.ig.stavy = ['FINISHED'];
  p.ctx.instagramKazdych10Min();
  const kontejnery = p.ig.volani.filter((v) => v.cesta === '17841400000/media');
  assert.deepStrictEqual(kontejnery.map((k) => k.telo.media_type), ['REELS', 'STORIES']);
  assert.strictEqual(kontejnery[1].telo.video_url, kontejnery[0].telo.video_url, 'stejné video');
  assert.ok(!('caption' in kontejnery[1].telo), 'příběh bez popisku');
  assert.strictEqual(p.ig.zverejneno, 2, 'reel i příběh');
  let plan = JSON.parse(p.vlastnosti.get('REELY_PLAN')).reel_dorost_tesany;
  assert.deepStrictEqual([plan.stav, plan.media, plan.mediaPribeh, plan.pribehChyba], ['hotovo', 'media-1', 'media-2', '']);
  assert.deepStrictEqual(video.sdileni, ['ANYONE_WITH_LINK:VIEW', 'PRIVATE:NONE']);
  // příběh Instagram odmítne (třeba delší video) → reel zveřejněný, důvod u příběhu
  const p2 = prostredi();
  reelyProInstagram(p2);
  p2.vlastnosti.set('IG_TOKEN', 'testovaci-ig-klic');
  p2.vlastnosti.set('IG_TOKEN_OBNOVA', String(Date.now()));
  p2.ig.stavy = ['FINISHED'];
  p2.ig.chybaPribehu = 'Video příběhu může mít nejvýš 60 s';
  p2.volej('reelNaplanovat', { id: 'reel_dorost_tesany', kdy: Date.now(), pribeh: true });
  p2.ctx.instagramKazdych10Min();
  plan = JSON.parse(p2.vlastnosti.get('REELY_PLAN')).reel_dorost_tesany;
  assert.deepStrictEqual([plan.stav, plan.media, plan.mediaPribeh], ['hotovo', 'media-1', '']);
  assert.ok(/60 s/.test(plan.pribehChyba), plan.pribehChyba);
  assert.strictEqual(p2.ig.zverejneno, 1);
});

// ---- plakáty: program víkendu (stránka Plakáty), popisek od Clauda, Instagram příspěvek + příběh
function plakatyFotbal(p) {
  p.schranka.createFile('FOTBAL.json', JSON.stringify({ verze: 2, tymy: [{ klic: 'A', nazev: 'A-tým' }, { klic: 'B', nazev: 'B-tým' }, { klic: 'dorost', nazev: 'Dorost' }],
    zapasy: [
      { id: 'z1', tym: 'A', zacatek: '2026-10-17T14:30:00+02:00', domaci: 'FK Agro Vnorovy', hoste: 'FK Milotice', doma: true, vysledek: '' },
      { id: 'z2', tym: 'dorost', zacatek: '2026-10-17T10:00:00+02:00', domaci: 'FK Hodonín "B"', hoste: 'FK Agro Vnorovy', doma: false, vysledek: '' },
      { id: 'z3', tym: 'B', zacatek: '2026-10-25T14:30:00+01:00', domaci: 'Vnorovy B', hoste: 'Kozojídky', doma: true, vysledek: '', puvodniTermin: '2026-10-24' },
      { id: 'z4', tym: 'A', zacatek: '2026-10-31T14:00:00+01:00', domaci: 'SK Vojkovice', hoste: 'FK Agro Vnorovy', doma: false, vysledek: '' }
    ] }));
}
const JPEG = 'data:image/jpeg;base64,' + Buffer.from('jpeg-obsah').toString('base64');

test('plakáty: ruční úprava kola a zpět, nastavení, popisek od Clauda (poznámka skrytá v aplikaci), novější popisek vyhrává', () => {
  const p = prostredi();
  plakatyFotbal(p);
  p.nastavCas(Date.parse('2026-10-12T09:00:00+02:00'));
  let o = p.volej('plakaty');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.kola), {});
  o = p.volej('plakatUlozit', { tyden: '2026-10-17', stav: { nadpis: 'PROGRAM VÍKENDU', doma: [{ tym: 'A', souper: 'FK MILOTICE' }] } });
  assert.deepStrictEqual(json(o.data.kola['2026-10-17'].stav.doma), [{ tym: 'A', souper: 'FK MILOTICE' }]);
  assert.ok(/RRRR-MM-DD/.test(p.volej('plakatUlozit', { tyden: '17. 10.', stav: {} }).chyba));
  o = p.volej('plakatNastaveni', { nastaveni: { tymy: { A: 'A-TÝM', B: 'BENFIKA', dorost: 'DOROST' }, misto: 'AGRO ARÉNA VNOROVY' } });
  assert.strictEqual(o.data.nastaveni.tymy.B, 'BENFIKA');
  assert.strictEqual(p.volej('plakaty').data.nastaveni.misto, 'AGRO ARÉNA VNOROVY');
  o = p.volej('plakatUlozit', { tyden: '2026-10-17', smazat: true });
  assert.deepStrictEqual(json(o.data.kola), {}, 'zpět podle rozlosování');
  // požádat Clauda – poznámka v NOVE se stylem a zápasy z FOTBAL.json, aplikace ji neukazuje
  o = p.volej('plakatPopisek', { tyden: '2026-10-17', styl: 'vtipně, ať přijde hodně lidí' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.popisky['2026-10-17'].cekaNaClauda, o.data.popisky['2026-10-17'].styl], [true, 'vtipně, ať přijde hodně lidí']);
  const pozn = p.schranka.deti.NOVE.soubory.find((f) => /_plak\.md$/.test(f.getName()));
  const text = pozn.getBlob().getDataAsString();
  assert.ok(/typ: plakat-popisek/.test(text) && /17\.–18\. 10\. 2026/.test(text) && /popisky_claude\.json → „2026-10-17“/.test(text), text);
  assert.ok(/SO 17\. 10\. 14:30 · A-tým · doma · FK Agro Vnorovy – FK Milotice/.test(text) && /SO 17\. 10\. 10:00 · Dorost · venku/.test(text), text);
  assert.ok(/Styl: vtipně/.test(text));
  assert.strictEqual(p.volej('schranka').data.nove.length, 0, 'poznámka pro Clauda se v aplikaci neukazuje');
  // Claude napíše popisek → aplikace ho dostane, už nečeká
  const plakaty = p.schranka.deti.PLAKATY;
  plakaty.createFile('popisky_claude.json', JSON.stringify({ '2026-10-17': { text: 'Áčko hostí Milotice! ⚽ #fkagrovnorovy', kdy: '2026-10-12T09:30:00+02:00', styl: 'vtipně' } }));
  o = p.volej('plakaty').data.popisky['2026-10-17'];
  assert.deepStrictEqual([o.text, o.zdroj, o.cekaNaClauda], ['Áčko hostí Milotice! ⚽ #fkagrovnorovy', 'claude', false]);
  // Michal ho upraví → novější ruční; Claude napíše nový (novější) → zase Claudův
  p.nastavCas(Date.parse('2026-10-12T10:00:00+02:00'));
  o = p.volej('plakatPopisekUlozit', { tyden: '2026-10-17', text: 'Upraveno ručně' }).data.popisky['2026-10-17'];
  assert.deepStrictEqual([o.text, o.zdroj], ['Upraveno ručně', 'rucne']);
  plakaty.soubory.find((f) => f.getName() === 'popisky_claude.json').setContent(JSON.stringify({ '2026-10-17': { text: 'Nový od Clauda', kdy: '2026-10-12T11:00:00+02:00' } }));
  assert.strictEqual(p.volej('plakaty').data.popisky['2026-10-17'].text, 'Nový od Clauda');
  assert.ok(/2 200/.test(p.volej('plakatPopisekUlozit', { tyden: '2026-10-17', text: 'x'.repeat(2201) }).chyba));
});

test('plakáty: sám požádá o popisek k nejbližšímu víkendu s domácím zápasem (po–so, jednou), ne v neděli ani bez domácího', () => {
  const p = prostredi();
  plakatyFotbal(p);
  const pozn = () => (p.schranka.deti.NOVE ? p.schranka.deti.NOVE.soubory.filter((f) => /_plak\.md$/.test(f.getName())) : []);
  p.nastavCas(Date.parse('2026-10-10T09:00:00+02:00')); // sobota 10. 10. – víkend před 10. kolem (popisky až od 17. 10.)
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(pozn().length, 0, 'před 10. kolem ne');
  p.nastavCas(Date.parse('2026-10-11T10:00:00+02:00')); // neděle
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(pozn().length, 0, 'v neděli ne');
  p.nastavCas(Date.parse('2026-10-12T07:00:00+02:00')); // pondělí ráno – před 8. hodinou
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(pozn().length, 0, 'před 8:00 ne');
  p.nastavCas(Date.parse('2026-10-12T08:10:00+02:00'));
  p.ctx.instagramKazdych10Min();
  p.nastavCas(Date.parse('2026-10-14T12:00:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(pozn().length, 1, 'jednou na víkend');
  assert.ok(/2026-10-17/.test(pozn()[0].getBlob().getDataAsString()));
  assert.strictEqual(p.volej('plakaty').data.popisky['2026-10-17'].cekaNaClauda, true);
  // víkend 31. 10. – jen venku → nežádá
  p.nastavCas(Date.parse('2026-10-26T09:00:00+01:00'));
  p.ctx.instagramKazdych10Min();
  assert.ok(!pozn().some((f) => /2026-10-31/.test(f.getBlob().getDataAsString())), 'jen venku – bez popisku');
  // víkend 24.–25. 10. (B doma v neděli, přeložené) → v pondělí 19. 10. požádá
  p.nastavCas(Date.parse('2026-10-19T09:00:00+02:00'));
  p.ctx.instagramKazdych10Min();
  const t = pozn().map((f) => f.getBlob().getDataAsString()).find((x) => /2026-10-24/.test(x));
  assert.ok(t && /NE 25\. 10\. 14:30 · B-tým · doma · Vnorovy B – Kozojídky \(přeloženo\)/.test(t), t);
});

test('plakáty na Instagram: obrázky (JPEG), plán jen s popiskem a obrázky, spouštěč – příspěvek s popiskem + příběh, odkazy jen po dobu stahování', () => {
  const p = prostredi();
  plakatyFotbal(p);
  p.nastavCas(Date.parse('2026-10-12T09:00:00+02:00'));
  const za = Date.parse('2026-10-15T18:00:00+02:00');
  assert.ok(/IG_TOKEN/.test(p.volej('plakatNaplanovat', { tyden: '2026-10-17', kdy: za, pribeh: true }).chyba));
  p.vlastnosti.set('IG_TOKEN', 'testovaci-ig-klic');
  p.vlastnosti.set('IG_TOKEN_OBNOVA', String(Date.now()));
  assert.ok(/obrázek plakátu/.test(p.volej('plakatNaplanovat', { tyden: '2026-10-17', kdy: za, pribeh: true }).chyba));
  assert.ok(/JPEG/.test(p.volej('plakatObrazky', { tyden: '2026-10-17', prispevek: 'data:image/png;base64,AAAA' }).chyba));
  let o = p.volej('plakatObrazky', { tyden: '2026-10-17', prispevek: JPEG, pribeh: JPEG });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.obrazky['2026-10-17'].prispevek, o.data.obrazky['2026-10-17'].pribeh], [true, true]);
  o = p.volej('plakatObrazky', { tyden: '2026-10-17', prispevek: JPEG, pribeh: JPEG }); // znovu = staré do koše
  assert.strictEqual(p.schranka.deti.PLAKATY.soubory.filter((f) => /_prispevek\.jpg$/.test(f.getName()) && !f.vKosi).length, 1);
  assert.ok(/popisek/.test(p.volej('plakatNaplanovat', { tyden: '2026-10-17', kdy: za, pribeh: true }).chyba), 'bez popisku ne');
  p.volej('plakatPopisekUlozit', { tyden: '2026-10-17', text: 'Áčko hostí Milotice! #fkagrovnorovy' });
  o = p.volej('plakatNaplanovat', { tyden: '2026-10-17', kdy: za, pribeh: true });
  assert.deepStrictEqual(json(o.data.plan['2026-10-17']), { kdy: za, stav: 'ceka', pribeh: true });
  assert.strictEqual(p.volej('plakaty').data.plan['2026-10-17'].stav, 'ceka');
  // před časem nic; v čase příspěvek + příběh
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(p.ig.zverejneno, undefined);
  p.nastavCas(za + 60e3);
  p.ig.stavy = ['FINISHED'];
  p.ctx.instagramKazdych10Min();
  const kontejnery = p.ig.volani.filter((v) => v.cesta === '17841400000/media');
  assert.deepStrictEqual(kontejnery.map((k) => [k.telo.media_type || 'IMAGE', !!k.telo.image_url, k.telo.caption || '']),
    [['IMAGE', true, 'Áčko hostí Milotice! #fkagrovnorovy'], ['STORIES', true, '']]);
  assert.notStrictEqual(kontejnery[0].telo.image_url, kontejnery[1].telo.image_url, 'příběh má vlastní obrázek 9:16');
  const plan = JSON.parse(p.vlastnosti.get('PLAKATY_PLAN'))['2026-10-17'];
  assert.deepStrictEqual([plan.stav, plan.media, plan.mediaPribeh, !!plan.odkaz], ['hotovo', 'media-1', 'media-2', true]);
  const soubory = p.schranka.deti.PLAKATY.soubory.filter((f) => /\.jpg$/.test(f.getName()) && !f.vKosi);
  soubory.forEach((f) => assert.deepStrictEqual(f.sdileni, ['ANYONE_WITH_LINK:VIEW', 'PRIVATE:NONE'], f.getName()));
  assert.ok(/už na Instagramu/.test(p.volej('plakatNaplanovat', { tyden: '2026-10-17', kdy: za + 120e3, pribeh: true }).chyba));
  // zrušení plánu jiného víkendu
  p.volej('plakatObrazky', { tyden: '2026-10-24', prispevek: JPEG });
  p.volej('plakatPopisekUlozit', { tyden: '2026-10-24', text: 'Neděle doma' });
  assert.ok(/příběh/.test(p.volej('plakatNaplanovat', { tyden: '2026-10-24', kdy: za + 864e5, pribeh: true }).chyba), 'příběh bez obrázku ne');
  assert.strictEqual(p.volej('plakatNaplanovat', { tyden: '2026-10-24', kdy: za + 864e5, pribeh: false }).ok, true);
  assert.deepStrictEqual(Object.keys(p.volej('plakatZrusitPlan', { tyden: '2026-10-24' }).data.plan), ['2026-10-17']);
});

// ---- auto: tabulka Google (vymyšlená čísla – repo je veřejné)
const TAB_AUTO = 'TABULKA-auta-1234567890abcd';
function tabulkaAuta(p) {
  return p.zalozTabulku(TAB_AUTO, 'Ukázkové auto - Test', {
    'Přehled': [['Kategorie', 'Součet', '', 'Michal', '', 'Katka'], ['Koupě auta', 500000, '', 112000, '', 400000]],
    'Náklady': [
      ['Datum', 'Položka', 'Kategorie', 'Částka (Kč)', 'Stav km', 'Nákup', 'ROK', 'Poznámka'],
      ['01.04.2025', '', 'Dálniční známka', '', '', '', '2025', 'zaplatil prodejce'],
      [new Date(2025, 9, 3), '', 'Koupě auta', 500000, 10000, '', '', 'Nákup auta'],
      [new Date(2025, 9, 3), '', 'Pojištění', 12000, '', 'M', '', 'Roční'],
      ['7.12.2025', 'Směs do ostřikovačů', 'Nákup doplňků', 150, '15 000', 'M', '', ''],
      [new Date(2026, 3, 12), 'Myčka', 'Myčka', 120, '', 'K', '2026', 'myčka'],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', 'Servis', '', '', '', '', '']
    ],
    'Tankování': [
      ['Datum', 'Položka', 'Kategorie', 'Částka (Kč)', 'Stav km', 'Cena za litr', 'Počet litrů', 'Nákup', 'Poznámka'],
      [new Date(2025, 9, 4), 'Tankování', 'Palivo', 1500, 10000, 30, 50, 'M', 'Pumpa A'],
      [new Date(2025, 10, 1), 'Tankování', 'Palivo', 1200, 10800, 30, 40, 'M', 'Pumpa A'],
      ['19.02.2026', 'Tankování', 'Palivo', 1000, '11 500', 40, 25, 'M', 'Pumpa B'],
      [new Date(2026, 2, 8), 'Tankování', 'Palivo', 800, '', 40, 20, 'M', ''],
      ['', '', '', '', '', '', '', '', '']
    ]
  });
}
const UCTENKA_NAFTA = ['ČSAD Hodonín a.s.', 'Čerpací stanice Test', 'IČO: 12345678', 'DIČ: CZ12345678', 'Datum: 07.08.2026 14:32',
  'NAFTA MOTOROVÁ', '42,75 l x 43,50 Kč/l', '1 859,63', 'DPH 21 %   322,75', 'Celkem bez DPH 1 536,88', 'CELKEM K ÚHRADĚ   1 859,63 Kč', 'Platba kartou 1 859,63'].join('\n');

test('auto: propojení odkazem, čtení listů (datum i jako text, km s mezerou, litry), kategorie, kdo platil', () => {
  const p = prostredi();
  tabulkaAuta(p);
  assert.deepStrictEqual(json(p.volej('auto').data), { nastaveno: false });
  assert.ok(/odkaz/.test(p.volej('autoNastavit', { odkaz: 'https://example.com/neco' }).chyba));
  assert.ok(/nepodařilo otevřít/.test(p.volej('autoNastavit', { odkaz: 'https://docs.google.com/spreadsheets/d/NEEXISTUJE-1234567890abcd/edit' }).chyba));
  const o = p.volej('autoNastavit', { odkaz: 'https://docs.google.com/spreadsheets/d/' + TAB_AUTO + '/edit#gid=0' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(p.vlastnosti.get('AUTO_TABULKA'), TAB_AUTO);
  const d = p.volej('auto').data;
  assert.strictEqual(d.nazev, 'Ukázkové auto - Test');
  assert.deepStrictEqual(d.naklady.map((z) => z.radek), [2, 3, 4, 5, 6]);
  assert.strictEqual(d.naklady[0].datum, new Date(2025, 3, 1).getTime());
  assert.strictEqual(d.naklady[0].castka, null);
  assert.strictEqual(d.naklady[3].km, 15000);
  assert.strictEqual(d.naklady[4].kdo, 'K');
  assert.deepStrictEqual(d.tankovani.map((z) => z.km), [10000, 10800, 11500, null]);
  assert.deepStrictEqual(d.tankovani.map((z) => z.litry), [50, 40, 25, 20]);
  assert.strictEqual(d.tankovani[2].datum, new Date(2026, 1, 19).getTime());
  assert.ok(d.kategorie.indexOf('Myčka') >= 0 && d.kategorie.indexOf('Servis') >= 0 && d.kategorie.indexOf('Dálniční známka') >= 0, d.kategorie.join());
  assert.ok(d.kategorie.indexOf('Koupě auta') < 0 && d.kategorie.indexOf('Palivo') < 0, 'koupě a palivo se nezapisují jako výdaj');
  assert.deepStrictEqual(json(d.platili), { Michal: 112000, Katka: 400000 });
  assert.ok(/spreadsheets\/d\/TABULKA-auta/.test(d.odkaz));
  assert.strictEqual(d.myskoda, null, 'bez souboru z MyŠkoda nic');
  // stav auta z MyŠkoda (soubor z domácího PC) – jen vybrané údaje, poloha ani VIN by neprošly
  p.schranka.createFolder('AUTO').createFile('myskoda.json', JSON.stringify({ aktualizovano: '2026-10-05T13:42:35+02:00',
    tankovani: [{ od: '2026-10-06T03:30:00+02:00', do: '2026-10-07T03:30:00+02:00', den: '2026-10-06', km: 32950, litry: 36.4, misto: 'nic' },
      { od: '2026-10-08T03:30:00+02:00', do: '2026-10-09T03:30:00+02:00', den: '<b>', km: 33400, litry: 30 }], auta: [{ nazev: 'Octavia', model: 'Škoda Octavia Combi',
    km: 32810, km_kdy: '2026-10-05T11:32:32+00:00', palivo_pct: 61, dojezd_km: 510, adblue_km: 2900, zamceno: 'YES', vin: 'TMBXXX', poloha: { lat: 49 },
    servis: { olej_km: 7700, olej_dni: 280, prohlidka_km: 27700, prohlidka_dni: 697 } }] }));
  const ms = p.volej('auto').data.myskoda;
  assert.deepStrictEqual(json(ms.auta[0]), { nazev: 'Octavia', model: 'Škoda Octavia Combi', km: 32810, kmKdy: '2026-10-05T11:32:32+00:00', palivo: 61, dojezd: 510,
    adblue: 2900, zamceno: 'YES', servis: { olejKm: 7700, olejDni: 280, prohlidkaKm: 27700, prohlidkaDni: 697 } });
  assert.deepStrictEqual(json(ms.tankovani), [{ od: '2026-10-06T03:30:00+02:00', do: '2026-10-07T03:30:00+02:00', den: '2026-10-06', km: 32950, litry: 36.4 },
    { od: '2026-10-08T03:30:00+02:00', do: '2026-10-09T03:30:00+02:00', den: '', km: 33400, litry: 30 }], 'tankování z auta bez cizích polí, den jen jako datum');
  // odkaz s /u/1/ (víc účtů Googlu v prohlížeči)
  assert.strictEqual(p.volej('autoNastavit', { odkaz: 'https://docs.google.com/spreadsheets/u/1/d/' + TAB_AUTO + '/edit' }).ok, true);
  // kategorie z rozbalovacího seznamu tabulky mají přednost
  p.tabulky[TAB_AUTO].listy['Náklady'].nastavValidaci({ getCriteriaValues: () => [['Servis', 'Parkování', 'Myčka']] });
  assert.deepStrictEqual(p.volej('auto').data.kategorie.slice(0, 3), ['Servis', 'Parkování', 'Myčka']);
  // bez povolení k Tabulkám: srozumitelný návod
  p.bezPovoleniTabulek(true);
  assert.ok(/povolitTabulky/.test(p.volej('auto').chyba));
});

test('auto: zápis tankování a výdaje do prvního volného řádku (vzorec litrů, formát z řádku nad), kontrola, smazání posledního', () => {
  const p = prostredi();
  const tab = tabulkaAuta(p);
  p.vlastnosti.set('AUTO_TABULKA', TAB_AUTO);
  const t = tab.listy['Tankování'], n = tab.listy['Náklady'];
  t.getRange(5, 4).setNumberFormat('#,##0 "Kč"');
  let o = p.volej('autoZapsat', { druh: 'tankovani', datum: '2026-10-05', castka: '1 860', cenaLitr: '43,50', km: '27 100', kdo: 'm', poznamka: 'Pumpa A' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(t.bunky[5][0].getTime(), new Date(2026, 9, 5).getTime());
  assert.deepStrictEqual(t.bunky[5].slice(1), ['Tankování', 'Palivo', 1860, 27100, 43.5, 42.76, 'M', 'Pumpa A']);
  assert.strictEqual(t.vzorce['6:7'], '=D6/$F6');
  assert.strictEqual(t.formaty['6:4'], '#,##0 "Kč"', 'formát částky jako o řádek výš');
  assert.strictEqual(o.data.tankovani.length, 5);
  // výdaj: první prázdný řádek pod posledním zápisem, sloupec ROK (sloučené buňky) se nemění
  o = p.volej('autoZapsat', { druh: 'naklad', datum: '2026-10-05', kategorie: 'Servis', polozka: 'Výměna oleje', castka: 3500, kdo: 'K' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(n.bunky[6].slice(1, 7), ['Výměna oleje', 'Servis', 3500, '', 'K', '']);
  assert.strictEqual(n.bunky[8][2], 'Servis', 'seznam kategorií pod tabulkou zůstal');
  // kontrola vstupu
  assert.ok(/kladné/.test(p.volej('autoZapsat', { druh: 'naklad', datum: '2026-10-05', kategorie: 'Servis', castka: 0 }).chyba));
  assert.ok(/Cena za litr/.test(p.volej('autoZapsat', { druh: 'tankovani', datum: '2026-10-05', castka: 900, cenaLitr: 5 }).chyba));
  assert.ok(/kategorii/.test(p.volej('autoZapsat', { druh: 'naklad', datum: '2026-10-05', castka: 100 }).chyba));
  assert.ok(/datum/.test(p.volej('autoZapsat', { druh: 'naklad', datum: '5. 10.', kategorie: 'Servis', castka: 100 }).chyba));
  assert.ok(/km/.test(p.volej('autoZapsat', { druh: 'naklad', datum: '2026-10-05', kategorie: 'Servis', castka: 100, km: 'hodně' }).chyba));
  // smazat jde jen poslední zápis a jen když sedí
  assert.ok(/poslední/.test(p.volej('autoSmazat', { list: 'naklady', radek: 6, datum: new Date(2026, 3, 12).getTime(), castka: 120 }).chyba));
  assert.ok(/změnil/.test(p.volej('autoSmazat', { list: 'naklady', radek: 7, datum: new Date(2026, 9, 5).getTime(), castka: 999 }).chyba));
  o = p.volej('autoSmazat', { list: 'naklady', radek: 7, datum: new Date(2026, 9, 5).getTime(), castka: 3500 });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(n.bunky[6].filter((x) => x !== ''), []);
  assert.strictEqual(o.data.naklady.length, 5);
  o = p.volej('autoSmazat', { list: 'tankovani', radek: 6, datum: new Date(2026, 9, 5).getTime(), castka: 1860 });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(t.vzorce['6:7'], undefined, 'vzorec litrů smazaný taky');
});

test('auto: účtenka – fotka na Disk (AUTO/uctenky), text přes OCR → návrh, zápis s odkazem na fotku', () => {
  const p = prostredi();
  tabulkaAuta(p);
  p.vlastnosti.set('AUTO_TABULKA', TAB_AUTO);
  p.nastavCas(Date.parse('2026-08-07T15:00:00+02:00'));
  p.nastavOcr(UCTENKA_NAFTA);
  const fotka = 'data:image/jpeg;base64,' + Buffer.from('jpeg-data').toString('base64');
  let o = p.volej('autoUctenka', { obrazek: fotka });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.navrh), { druh: 'tankovani', datum: '2026-08-07', castka: 1859.63, litry: 42.75, cenaLitr: 43.5, kategorie: null, obchod: 'ČSAD' });
  const fotky = p.schranka.deti.AUTO.deti.uctenky.soubory;
  assert.strictEqual(fotky.length, 1);
  assert.ok(/_uctenka\.jpg$/.test(fotky[0].getName()));
  assert.strictEqual(p.log.ocr[0].volby.ocrLanguage, 'cs');
  assert.strictEqual(p.vsechnySoubory['ocr-1'].vKosi, true, 'dočasný dokument s textem do koše');
  // zápis s odkazem na fotku v poznámce
  o = p.volej('autoZapsat', { druh: 'tankovani', datum: '2026-08-07', castka: 1859.63, cenaLitr: 43.5, poznamka: 'ČSAD', uctenka: o.data.uctenka });
  assert.strictEqual(o.ok, true, o.chyba);
  const bunka = p.tabulky[TAB_AUTO].listy['Tankování'].odkazy['6:9'];
  assert.strictEqual(bunka.text, 'ČSAD · účtenka');
  assert.strictEqual(bunka.text.slice(bunka.od, bunka.do), 'účtenka');
  assert.ok(/drive\.google\.com\/file\/d\/soubor-uctenky/.test(bunka.odkaz));
  // bez služby Drive API: fotka se uloží, návrh prázdný a vysvětlení
  vm.runInContext('Drive = undefined;', p.ctx);
  o = p.volej('autoUctenka', { obrazek: fotka });
  assert.ok(/Drive API/.test(o.data.chybaTextu));
  assert.strictEqual(o.data.navrh.castka, null);
  assert.ok(/JPEG/.test(p.volej('autoUctenka', { obrazek: 'data:image/png;base64,AAAA' }).chyba));
});

test('auto: účtenka rovnou do tabulky (stejná fotka nic dvakrát), oprava zápisu, fotka k zápisu jen z účtenek', () => {
  const p = prostredi();
  tabulkaAuta(p);
  p.vlastnosti.set('AUTO_TABULKA', TAB_AUTO);
  p.nastavCas(Date.parse('2026-08-07T15:00:00+02:00'));
  p.nastavOcr(UCTENKA_NAFTA);
  const fotka = 'data:image/jpeg;base64,' + Buffer.from('jpeg-data-2').toString('base64');
  const otisk = 'a1b2c3d4e5f60718293a4b5c';
  let o = p.volej('autoUctenka', { obrazek: fotka, otisk, zapsat: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.zapsano), { list: 'tankovani', radek: 6 });
  const z = o.data.data.tankovani.find((x) => x.radek === 6);
  assert.deepStrictEqual([z.castka, z.cenaLitr, z.poznamka, z.kdo], [1859.63, 43.5, 'ČSAD', 'M']);
  assert.ok(/uctenka_a1b2c3d4e5f60718293a4b5c\.jpg$/.test(z.uctenka), z.uctenka);
  // stejná fotka znovu (výpadek spojení) → žádný další soubor ani řádek a OCR se neopakuje
  const ocr = p.log.ocr.length;
  o = p.volej('autoUctenka', { obrazek: fotka, otisk, zapsat: true });
  assert.deepStrictEqual(json(o.data.zapsano), { list: 'tankovani', radek: 6 });
  assert.strictEqual(p.schranka.deti.AUTO.deti.uctenky.soubory.length, 1);
  assert.strictEqual(p.log.ocr.length, ocr, 'text z minulého pokusu');
  assert.strictEqual(o.data.data.tankovani.filter((x) => x.uctenka).length, 1);
  // nejasná účtenka (bez částky) → nic se nezapíše, aplikace dostane návrh pro okno
  p.nastavOcr('Děkujeme za nákup');
  o = p.volej('autoUctenka', { obrazek: 'data:image/jpeg;base64,' + Buffer.from('jina').toString('base64'), otisk: 'ffffeeeeddddccccbbbbaaaa', zapsat: true });
  assert.deepStrictEqual([o.ok, o.data.zapsano, o.data.navrh.castka], [true, undefined, null]);
  // oprava zápisu: jiná částka a km → tabulka; odkaz na fotku zůstane, „účtenka“ v poznámce se nezdvojí
  o = p.volej('autoUpravit', { list: 'tankovani', radek: 6, puvodniDatum: z.datum, puvodniCastka: z.castka, druh: 'tankovani',
    datum: '2026-08-07', castka: 1900, cenaLitr: 43.5, km: 32100, kdo: 'M', poznamka: 'ČSAD Veselí', uctenka: z.uctenka });
  assert.strictEqual(o.ok, true, o.chyba);
  const z2 = o.data.tankovani.find((x) => x.radek === 6);
  assert.deepStrictEqual([z2.castka, z2.km, z2.poznamka, z2.uctenka, z2.litry], [1900, 32100, 'ČSAD Veselí', z.uctenka, 43.68]);
  assert.strictEqual(p.tabulky[TAB_AUTO].listy['Tankování'].odkazy['6:9'].text, 'ČSAD Veselí · účtenka');
  // mezitím jiný stav řádku → odmítnuto; druh se změnit nedá
  assert.ok(/mezitím změnil/.test(p.volej('autoUpravit', { list: 'tankovani', radek: 6, puvodniDatum: z.datum, puvodniCastka: 1859.63,
    druh: 'tankovani', datum: '2026-08-07', castka: 1, cenaLitr: 43.5 }).chyba));
  assert.ok(/Druh zápisu/.test(p.volej('autoUpravit', { list: 'tankovani', radek: 6, puvodniDatum: z.datum, puvodniCastka: 1900,
    druh: 'naklad', datum: '2026-08-07', castka: 1, kategorie: 'Myčka' }).chyba));
  // fotka k zápisu: jen soubory ze složky účtenek
  const f = p.volej('autoUctenkaFoto', { id: z.uctenka });
  assert.ok(f.ok && f.data.obrazek === 'data:image/jpeg;base64,' + Buffer.from('jpeg-data-2').toString('base64'), JSON.stringify(f).slice(0, 160));
  const jiny = p.schranka.createFile('jiny-soubor.txt', 'tajné');
  assert.ok(/není mezi účtenkami/.test(p.volej('autoUctenkaFoto', { id: jiny.getId() }).chyba));
});

test('auto: účtenka poslaná znovu, než první běh doběhl (fronta v telefonu) – pod zámkem nic dvakrát (soubor ani řádek)', () => {
  const p = prostredi();
  const tab = tabulkaAuta(p);
  p.vlastnosti.set('AUTO_TABULKA', TAB_AUTO);
  p.nastavCas(Date.parse('2026-08-07T15:00:00+02:00'));
  p.nastavOcr(UCTENKA_NAFTA);
  const fotka = 'data:image/jpeg;base64,' + Buffer.from('jpeg-soubezne').toString('base64');
  const otisk = 'abcdefabcdef012345678901';
  let o = p.volej('autoUctenka', { obrazek: fotka, otisk, zapsat: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.zapsano), { list: 'tankovani', radek: 6 });
  // druhý běh: před zámkem zápis ještě nevidí (první běh ho zapisuje právě teď) – pod zámkem ho najde a vrátí
  const t = tab.listy['Tankování'];
  const odkaz = t.odkazy['6:9'];
  delete t.odkazy['6:9'];
  let zamku = 0;
  p.ctx.LockService.getScriptLock = () => ({ waitLock() { zamku++; if (zamku === 2) t.odkazy['6:9'] = odkaz; }, releaseLock() {} });
  o = p.volej('autoUctenka', { obrazek: fotka, otisk, zapsat: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.zapsano), { list: 'tankovani', radek: 6 }, 'řádek prvního běhu');
  assert.strictEqual(zamku, 2, 'soubor i zápis pod zámkem');
  assert.ok(t.bunky.length <= 6 || t.bunky.slice(6).every((r) => r.every((x) => x === '' || x == null)), 'žádný druhý řádek');
  assert.strictEqual(o.data.data.tankovani.filter((x) => x.uctenka).length, 1);
  assert.strictEqual(p.schranka.deti.AUTO.deti.uctenky.soubory.length, 1, 'jeden soubor fotky');
});

test('auto: péče o auto jako text do vlastního listu za Péče o auto – jiné listy nemění, obsah nepřepíše', () => {
  const p = prostredi();
  tabulkaAuta(p);
  p.vlastnosti.set('AUTO_TABULKA', TAB_AUTO);
  p.tabulky[TAB_AUTO].listy['Péče o auto'] = { getName: () => 'Péče o auto' };
  p.tabulky[TAB_AUTO].poradi.push('Péče o auto', 'Zbytek');
  p.tabulky[TAB_AUTO].listy.Zbytek = { getName: () => 'Zbytek' };
  const radky = [['PÉČE O AUTO', '', ''], ['PLÁN ÚDRŽBY', 'Kdy', 'Poznámka'], ['Olej + filtr', 'každých 15 000 km nebo 1× ročně', 'termín hlásí auto']];
  let o = p.volej('autoPeceZapsat', { radky, nadpisy: [0], hlavicky: [1] });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data), { list: 'Péče o auto – text', radku: 3 });
  const t = p.tabulky[TAB_AUTO];
  assert.strictEqual(t.poradi[t.poradi.indexOf('Péče o auto') + 1], 'Péče o auto – text', 'list hned za Péče o auto');
  const l = t.listy['Péče o auto – text'];
  assert.deepStrictEqual(l.bunky.map((r) => r.slice(0, 3)), radky);
  assert.deepStrictEqual([l.styly['1:1'].tucne, l.styly['1:1'].velikost, l.styly['2:1'].pozadi], [true, 14, '#e6f0ee']);
  assert.strictEqual(l.sirky[2], 640);
  // aplikace dostane text s daty auta (karta Péče o auto), bez prázdných řádků
  assert.deepStrictEqual(json(p.volej('auto').data.pece), { radky, nadpisy: [0, 1] }, 'tučné řádky = nadpisy');
  // podruhé nic nepřepíše, s prepsat ano
  assert.ok(/už obsah má/.test(p.volej('autoPeceZapsat', { radky }).chyba));
  o = p.volej('autoPeceZapsat', { radky: [['Jen jeden řádek']], prepsat: true });
  assert.deepStrictEqual([o.ok, l.bunky.length, l.bunky[0][0]], [true, 1, 'Jen jeden řádek']);
  assert.ok(/Žádný text/.test(p.volej('autoPeceZapsat', { radky: [] }).chyba));
});

test('auto: připomínky – přezutí a zima podle data (hotové podle zápisu), servis a AdBlue z auta, pojištění, dálniční známka', () => {
  const p = prostredi();
  const prip = (d, ted) => json(vm.runInContext('AUTO_.pripominky', p.ctx)(d, ted));
  const ms = (t) => new Date(t).getTime();
  const naklady = [{ datum: ms('2025-10-03T00:00:00'), kategorie: 'Pojištění', polozka: '', poznamka: 'Roční', castka: 12000 },
    { datum: ms('2025-04-01T00:00:00'), kategorie: 'Dálniční známka', polozka: '', poznamka: '', castka: null },
    { datum: ms('2026-10-02T00:00:00'), kategorie: 'Nákup doplňků', polozka: 'Směs do ostřikovačů', poznamka: '', castka: 85 }];
  const auto = { auta: [{ adblue: 2900, servis: { olejKm: 7700, olejDni: 280, prohlidkaKm: 27700, prohlidkaDni: 697 } }] };
  let x = prip({ naklady, myskoda: auto }, ms('2026-10-05T12:00:00'));
  const podle = (id) => x.find((y) => y.id === id) || null;
  assert.deepStrictEqual([podle('pneu-zimni').stav, podle('pneu-zimni').hotovo, podle('pneu-zimni').klic], ['brzy', false, 'pneu-zimni-2026'], '5. 10.: přezutí brzy');
  assert.deepStrictEqual([podle('zima').stav, podle('zima').hotovo], ['ted', true], 'zima: směs do ostřikovačů už zapsaná');
  assert.strictEqual(podle('pneu-letni'), null, 'letní až na jaře');
  assert.strictEqual(podle('olej'), null, 'olej za 7 700 km – zatím ne');
  assert.strictEqual(podle('adblue'), null, 'AdBlue 2 900 km – zatím ne');
  assert.deepStrictEqual([podle('pojisteni').stav, /3\. 10\. 2026/.test(podle('pojisteni').text)], ['ted', true], 'výročí pojištění');
  assert.ok(podle('znamka').stav === 'ted' && /31\. 3\. 2026/.test(podle('znamka').text), JSON.stringify(podle('znamka')));
  // 20. 10.: zimní teď; po zápisu „Servis - PNEU“ hotovo; servis podle auta blízko; AdBlue skoro prázdné
  x = prip({ naklady: naklady.concat([{ datum: ms('2026-10-18T00:00:00'), kategorie: 'Servis - PNEU', polozka: 'Přezutí', poznamka: '', castka: 800 }]),
    myskoda: { auta: [{ adblue: 800, servis: { olejKm: 1200, olejDni: 200 } }] } }, ms('2026-10-20T12:00:00'));
  assert.deepStrictEqual([podle('pneu-zimni').stav, podle('pneu-zimni').hotovo], ['ted', true]);
  assert.deepStrictEqual([podle('olej').stav, podle('adblue').stav], ['ted', 'ted']);
  // termíny ze souboru (aplikace / Claude): známka platí do 12. 4. 2027 → teď nic; STK za 30 dní → brzy
  x = prip({ naklady, myskoda: auto, terminy: { znamka: '2027-04-12', stk: '2026-11-04' } }, ms('2026-10-05T12:00:00'));
  assert.strictEqual(podle('znamka'), null, 'platná známka – žádná připomínka');
  assert.deepStrictEqual([podle('stk').stav, /4\. 11\. 2026/.test(podle('stk').text)], ['brzy', true]);
  x = prip({ naklady, myskoda: auto, terminy: { znamka: '2027-04-12' } }, ms('2027-03-25T12:00:00'));
  assert.ok(podle('znamka') && podle('znamka').stav === 'ted' && /12\. 4\. 2027/.test(podle('znamka').text), JSON.stringify(podle('znamka')));
  // po skončení okna příští rok (16. 11. → zimní 2027 až za rok, letní od března)
  x = prip({ naklady: [] }, ms('2026-11-16T12:00:00'));
  assert.strictEqual(podle('pneu-zimni'), null);
  x = prip({ naklady: [] }, ms('2027-03-01T12:00:00'));
  assert.deepStrictEqual([podle('pneu-letni').stav, podle('pneu-letni').klic], ['brzy', 'pneu-letni-2027']);
});

test('jmeniny: oblíbení lidé se uloží (jen jména, kdo nepovinné) a přijdou s info', () => {
  const p = prostredi();
  assert.deepStrictEqual(json(p.volej('info').data.jmeniny), []);
  const o = p.volej('jmeninyUlozit', { oblibeni: [{ jmeno: '  Petra ', kdo: 'manželka' }, { jmeno: 'Jan' }, { jmeno: '<script>' }, { jmeno: '' }] });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data), [{ jmeno: 'Petra', kdo: 'manželka' }, { jmeno: 'Jan', kdo: '' }]);
  assert.deepStrictEqual(json(p.volej('info').data.jmeniny), [{ jmeno: 'Petra', kdo: 'manželka' }, { jmeno: 'Jan', kdo: '' }]);
  assert.strictEqual(p.volej('jmeninyUlozit', { oblibeni: 'Petra' }).ok, false);
});

test('značky změn: zápis k autu ji posune, čtení ne', () => {
  const p = prostredi();
  tabulkaAuta(p);
  p.vlastnosti.set('AUTO_TABULKA', TAB_AUTO);
  assert.deepStrictEqual(json(p.volej('zmeny').data), { auto: 0, zdravi: 0 });
  p.nastavCas(Date.parse('2026-10-05T21:00:00+02:00'));
  p.volej('auto');
  assert.strictEqual(p.volej('zmeny').data.auto, 0, 'čtení značku nemění');
  assert.strictEqual(p.volej('autoTermin', { id: 'stk', datum: '2028-06-01' }).ok, true);
  assert.strictEqual(p.volej('zmeny').data.auto, Date.parse('2026-10-05T21:00:00+02:00'));
  assert.strictEqual(p.volej('autoTermin', { id: 'nesmysl', datum: '' }).ok, false);
  assert.strictEqual(p.volej('zmeny').data.zdravi, 0, 'zápis k autu zdraví neposune');
});

test('značky změn: voda, doplňky a váha z aplikace i Claudův soubor na Disku posunou zdraví; značky jdou i v dávce (server)', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-09T15:00:00+02:00'));
  p.volej('zdravi');
  assert.strictEqual(p.volej('zmeny').data.zdravi, 0, 'čtení zdraví značku nemění');
  assert.strictEqual(p.volej('pitiJidlo', { den: '2026-10-09', jak: 'piti', ml: 500 }).ok, true);
  assert.strictEqual(p.volej('zmeny').data.zdravi, Date.parse('2026-10-09T15:00:00+02:00'));
  p.nastavCas(Date.parse('2026-10-09T15:05:00+02:00'));
  assert.strictEqual(p.volej('doplnky', { den: '2026-10-09', zmeny: { kreatin: true } }).ok, true);
  assert.strictEqual(p.volej('zmeny').data.zdravi, Date.parse('2026-10-09T15:05:00+02:00'));
  assert.strictEqual(p.volej('zmeny').data.auto, 0);
  // Claude zapíše diktát „vypil jsem…“ rovnou na Disk (bez motoru) → značka podle času úpravy souboru (po minutě mezipaměti)
  p.nastavCas(Date.parse('2026-10-09T15:20:00+02:00'));
  const zdraviSlozka = p.schranka.deti.ZDRAVI;
  zdraviSlozka.createFile('PITI_JIDLO_CLAUDE.json', JSON.stringify({ zapisy: [] }));
  p.cache.delete('zmena:claude');
  assert.ok(p.volej('zmeny').data.zdravi >= Date.parse('2026-10-09T15:20:00+02:00'), 'Claudův soubor posune značku zdraví');
  // server bere značky v dávce s ostatními rychlými čteními
  const d = p.volej('davka', { polozky: [{ akce: 'info' }, { akce: 'zmeny' }] });
  assert.strictEqual(d.ok, true, d.chyba);
  assert.strictEqual(d.data[1].ok, true, d.data[1].chyba);
  assert.ok(d.data[1].data.zdravi >= Date.parse('2026-10-09T15:20:00+02:00'));
});

test('auto: termíny (známka, STK, pojištění) do AUTO/terminy.json – zápis z aplikace, čtení s daty auta', () => {
  const p = prostredi();
  tabulkaAuta(p);
  p.vlastnosti.set('AUTO_TABULKA', TAB_AUTO);
  let o = p.volej('autoTermin', { id: 'znamka', datum: '2027-04-12' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.terminy), { znamka: '2027-04-12' });
  o = p.volej('autoTermin', { id: 'stk', datum: '2028-06-01' });
  assert.deepStrictEqual(json(p.volej('auto').data.terminy), { znamka: '2027-04-12', stk: '2028-06-01' });
  o = p.volej('autoTermin', { id: 'stk', datum: '' });
  assert.deepStrictEqual(json(o.data.terminy), { znamka: '2027-04-12' }, 'smazání');
  assert.ok(/Neznámý termín/.test(p.volej('autoTermin', { id: 'servis', datum: '2027-01-01' }).chyba));
  assert.ok(/RRRR-MM-DD/.test(p.volej('autoTermin', { id: 'stk', datum: '1. 6. 2028' }).chyba));
});

test('upozornění: připomínky k autu jednou denně, každá jen jednou za sezónu', () => {
  const p = prostredi();
  tabulkaAuta(p);
  p.vlastnosti.set('AUTO_TABULKA', TAB_AUTO);
  p.volej('upozorneniZapnout');
  p.nastavCas(Date.parse('2026-10-12T09:00:00+02:00'));
  const pred = p.log.ntfy.length;
  p.ctx.instagramKazdych10Min();
  const auto = p.log.ntfy.slice(pred).filter((z) => /^Auto: /.test(z.title));
  assert.ok(auto.some((z) => /zimní pneumatiky/.test(z.title)), JSON.stringify(auto.map((z) => z.title)));
  const po = p.log.ntfy.length;
  p.nastavCas(Date.parse('2026-10-12T09:20:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.strictEqual(p.log.ntfy.filter((z, i) => i >= po && /^Auto: /.test(z.title)).length, 0, 'týž den nic');
  p.nastavCas(Date.parse('2026-10-13T09:00:00+02:00'));
  p.ctx.instagramKazdych10Min();
  assert.ok(!p.log.ntfy.slice(po).some((z) => /zimní pneumatiky/.test(z.title)), 'druhý den totéž znovu ne');
});

test('auto: čtení účtenek – myčka, servis, částka bez klíčového slova, datum nesmí být v budoucnu', () => {
  const p = prostredi();
  const zUctenky = (text, ted) => json(vm.runInContext('AUTO_.zUctenky', p.ctx)(text, ted));
  const ted = Date.parse('2026-10-05T12:00:00+02:00');
  let n = zUctenky('MYČKA ČSAD\nProgram 3 - aktivní pěna\n04.10.2026 18:02\nCELKEM 150,00 Kč\nHotovost 200,00\nVráceno 50,00', ted);
  assert.deepStrictEqual([n.druh, n.kategorie, n.castka, n.datum, n.obchod], ['naklad', 'Myčka', 150, '2026-10-04', 'ČSAD']);
  n = zUctenky('AutoServis Novák\nVýměna oleje a filtru\nk úhradě: 3.450,00\n12.12.2026', ted);
  assert.deepStrictEqual([n.kategorie, n.castka, n.datum, n.obchod], ['Servis', 3450, null, 'AutoServis Novák']);
  n = zUctenky('Prodejna\nKapalina do ostřikovačů 1,5 l   89,90\n', ted);
  assert.deepStrictEqual([n.druh, n.kategorie, n.castka], ['naklad', 'Nákup doplňků', 89.9]);
  n = zUctenky('', ted);
  assert.deepStrictEqual([n.castka, n.datum, n.litry, n.obchod], [null, null, null, null]);
});

console.log(`\n${ok} testů prošlo` + (process.exitCode ? ', některé SELHALY' : ''));
