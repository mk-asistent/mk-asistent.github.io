// Připojení k motoru (úvodní obrazovka), Nastavení (pošta, kalendáře z iPhonu, vzhled) a barva akcentu.

import { stav, zmeneno, staryMotor, umiMotor } from './stav.js';
import { volej, pripojeni, jeDemo, ulozPripojeni, zapomenPripojeni } from './api.js';
import { esc, uloziste, kdyKratce } from './pomocne.js';
import { otevriPanel, obnovPanel, jeOtevreny, elementPanelu } from './panely.js';
import { toast, potvrd, segment } from './ui.js';
import { IKONY } from './ikony.js';
import { smazUlozene as smazKalendar, nactiKalendar } from './kalendar.js';
import { nactiPostu } from './posta.js';
import { zapasyHtml } from './udalost.js';
import { tymyHtml as fotbalTymyHtml } from './fotbal.js';
import { DRUHY } from './kalendar.js';
import * as pocasi from './pocasi.js';
import * as ucet from './ucet.js';

export const VERZE_APLIKACE = '2026-10-05';

// předvolby hlavní barvy – tlumené tmavé odstíny jako ve stylu Fixtrack (lesní zelená je výchozí)
const AKCENTY = [['#1f3d2c', 'Lesní zelená'], ['#1d4250', 'Ocelová'], ['#2a3f8f', 'Modrá'], ['#4b2d63', 'Švestková'], ['#7a3a1d', 'Cihlová'], ['#2b2f33', 'Grafitová']];
const BARVY_KALENDARE = ['#2f5bd3', '#0f7c8c', '#2e7a4d', '#a8620c', '#8e5bd3', '#c0392b', '#b5407a', '#37474f'];
const n = { upravaPripojeni: false, ukazKod: false, novaBarva: BARVY_KALENDARE[1], pracuje: false, sekce: 'pripojeni', klicZdravi: '' };
// Rozbalené návody přežijí překreslení okna (data z motoru dorazí za pár vteřin a okno se překreslí – návod se
// dřív zavřel a stránka „uskočila“ zpět, Michal 5. 10.). Pamatuje se, co Michal sám rozbalil nebo zavřel.
const rozbaleno = {};
function detail(klic, vychozi) {
  const otevreno = klic in rozbaleno ? rozbaleno[klic] : !!vychozi;
  return '<details class="napoveda" data-detail="' + klic + '"' + (otevreno ? ' open' : '') + '>';
}
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d && d.matches && d.matches('details[data-detail]')) rozbaleno[d.dataset.detail] = d.open;
}, true); // toggle nebublá – zachytit cestou dolů

// záložky okna Nastavení – vždy je vidět jen jedna
const ZALOZKY = [['pripojeni', 'Připojení'], ['posta', 'Pošta'], ['kalendare', 'Kalendáře'], ['pocasi', 'Počasí'], ['zdravi', 'Zdraví'], ['vzhled', 'Vzhled'], ['aplikace', 'Aplikace']];

// ---------------------------------------------------------------- vzhled

export function aplikujVzhled() {
  const motiv = uloziste.cti('asistent.motiv') || 'auto';
  if (motiv === 'auto') document.documentElement.removeAttribute('data-motiv');
  else document.documentElement.setAttribute('data-motiv', motiv);
  nastavAkcent(uloziste.cti('asistent.akcent') || AKCENTY[0][0]);
}

function hexNaHsl(hex) {
  const c = parseInt(hex.slice(1), 16);
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

/** Z jedné barvy dopočítá tmavší odstín, jemný nádech a varianty pro tmavý režim. */
function nastavAkcent(hex) {
  const st = document.documentElement.style;
  const jmena = ['--a-l', '--a-l-dark', '--a-l-tint', '--a-d', '--a-d-dark', '--a-d-tint'];
  if (!/^#[0-9a-f]{6}$/i.test(hex) || hex.toLowerCase() === AKCENTY[0][0]) { jmena.forEach((j) => st.removeProperty(j)); return; }
  const [h, s, l] = hexNaHsl(hex);
  const sd = Math.min(s + 10, 90);
  // světlý režim: barva, tmavší pro najetí, jemný nádech; tmavý režim: světlá na text, sytá tmavší na tlačítka
  const hodnoty = [hex, `hsl(${h} ${s}% ${Math.max(l - 7, 6)}%)`, `hsl(${h} ${Math.min(s, 60)}% 94%)`,
    `hsl(${h} ${sd}% 70%)`, `hsl(${h} ${sd}% 34%)`, `hsl(${h} ${sd}% 70% / .15)`];
  jmena.forEach((j, i) => st.setProperty(j, hodnoty[i]));
}

// ---------------------------------------------------------------- úvod – připojení zařízení k motoru

function formularPripojeniHtml(predvyplnit) {
  const p = predvyplnit ? pripojeni() || {} : {};
  return '<div class="fmr">' +
    '<label class="fmr__cely"><span class="label">Adresa motoru</span><input class="field" data-pripojeni-url type="url" inputmode="url" ' +
      'autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(p.url || '') + '"></label>' +
    '<label class="fmr__cely"><span class="label">Klíč</span><input class="field" data-pripojeni-klic type="password" ' +
      'autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="64 znaků z Apps Scriptu"></label></div>';
}

const ADRESA_MOTORU = /^https:\/\/script\.google\.com\/macros\/(u\/\d+\/)?s\/[\w-]+\/exec$/;

/** „Kód pro připojení“ = adresa motoru#klíč v jednom – na telefonu stačí vložit jednu věc do pole Adresa. */
function rozdelKod(text) {
  const m = /^(\S+?\/exec)[\s#]+(\S{32,})$/.exec(String(text || '').trim());
  return m && ADRESA_MOTORU.test(m[1]) ? { url: m[1], klic: m[2] } : null;
}

async function zkusPripojit(koren, tlacitko) {
  let url = koren.querySelector('[data-pripojeni-url]').value.trim();
  let klic = koren.querySelector('[data-pripojeni-klic]').value.trim();
  const kod = rozdelKod(url);
  if (kod) { url = kod.url; if (!klic) klic = kod.klic; }
  const chyba = koren.querySelector('[data-pripojeni-chyba]');
  const ukaz = (t) => { chyba.textContent = t; chyba.hidden = !t; };
  if (!ADRESA_MOTORU.test(url)) { ukaz('Adresa má tvar https://script.google.com/macros/s/…/exec'); return false; }
  if (klic.length < 32) { ukaz('Klíč je krátký – zkopíruj ho celý.'); return false; }
  tlacitko.disabled = true;
  ukaz('');
  try {
    const info = await volej('info', {}, { url, klic });
    if (!info || !info.verze) throw new Error('Adresa neodpovídá jako motor Asistenta – zkontroluj, že je to nasazení projektu „Asistent“.');
    ulozPripojeni({ url, klic });
    stav.info = info;
    uloziste.pis('asistent.info', info);
    return true;
  } catch (e) {
    ukaz(e.message);
    return false;
  } finally {
    tlacitko.disabled = false;
  }
}

function poleUctuHtml(email) {
  return '<label class="fmr__cely"><span class="label">E-mail</span><input class="field" data-ucet-email type="email" name="email" ' +
      'autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" value="' + esc(email || '') + '"></label>' +
    '<label class="fmr__cely"><span class="label">Heslo</span><input class="field" data-ucet-heslo type="password" name="password" ' +
      'autocomplete="current-password" autocapitalize="off" spellcheck="false"></label>';
}

/**
 * Přihlášení účtem (Firebase). Připojené zařízení uloží svou adresu motoru a klíč do účtu (bere je odtud server
 * a další zařízení), nové zařízení si je z účtu načte, ověří motorem a uloží. Vrací 'ucet' | 'pripojeno' | false.
 */
async function prihlasUctem(koren, tlacitko) {
  const email = koren.querySelector('[data-ucet-email]').value.trim();
  const heslo = koren.querySelector('[data-ucet-heslo]').value;
  const chyba = koren.querySelector('[data-ucet-chyba]');
  const ukaz = (t) => { chyba.textContent = t; chyba.hidden = !t; };
  if (!email || !heslo) { ukaz('Napiš e-mail i heslo.'); return false; }
  const popisek = tlacitko.textContent;
  tlacitko.disabled = true;
  tlacitko.textContent = 'Přihlašuji…';
  ukaz('');
  try {
    const zUctu = await ucet.prihlas(email, heslo);
    const mistni = jeDemo() ? null : pripojeni();
    if (mistni && mistni.url && mistni.klic && !stav.chyby.info) {
      if (!zUctu || zUctu.url !== mistni.url || zUctu.klic !== mistni.klic) await ucet.ulozPripojeni(mistni);
      return 'ucet';
    }
    if (!zUctu) {
      ukaz('Přihlášeno, ale v účtu ještě není připojení k motoru. Nejdřív se přihlas na zařízení, kde aplikace jede ' +
        '(Nastavení → Připojení → Účet) – uloží ho tam.');
      return false;
    }
    const info = await volej('info', {}, zUctu);
    if (!info || !info.verze) throw new Error('Motor neodpovídá – zkus to za chvíli.');
    ulozPripojeni(zUctu);
    stav.info = info;
    uloziste.pis('asistent.info', info);
    return 'pripojeno';
  } catch (e) {
    ukaz(e.kod === 'klic' ? 'Klíč motoru v účtu už neplatí – na zařízení, kde aplikace jede, se v Nastavení odhlas a znovu přihlas (uloží platný).'
      : e.message);
    return false;
  } finally {
    tlacitko.disabled = false;
    tlacitko.textContent = popisek;
  }
}

export function vykresliUvod(poPripojeni) {
  const el = document.getElementById('uvod');
  document.getElementById('aplikace').hidden = true;
  el.hidden = false;
  let jinak = !ucet.nastaveno();
  const logo = '<div class="uvod-logo"><span>' + IKONY.dnes + '</span><b>Asistent</b></div>';
  const vykresli = () => {
    // přihlášení účtem (e-mail a heslo), jinak adresa motoru a klíč jako dřív
    el.innerHTML = '<div class="card uvod-karta">' + logo + (!jinak
      ? '<p>Přihlas se účtem Asistenta – adresa motoru a klíč se načtou z účtu a data se ukážou hned.</p>' +
        '<form class="fmr" data-uvod-form>' + poleUctuHtml(ucet.stavUctu().email) +
          '<p class="pruh pruh-varovani fmr__cely" data-ucet-chyba hidden></p>' +
          '<div class="akce fmr__cely"><button type="button" class="odkaz" data-uvod-jinak>Připojit adresou a klíčem</button>' +
          '<button type="submit" class="btn btn--primary" data-uvod-prihlasit>Přihlásit</button></div></form>'
      : '<p>Schránka pro Clauda, pošta a kalendář na jednom místě. Na tomhle zařízení ještě není připojený motor.</p>' +
        formularPripojeniHtml(false) +
        '<p class="napoveda">Adresu (končí /exec) najdeš v Apps Scriptu v Nasadit → Spravovat nasazení, klíč v protokolu po spuštění ' +
          'nastavApi. Na dalším zařízení stačí do Adresy vložit <b>kód pro připojení</b> z Nastavení (obsahuje obojí). ' +
          'Klíč zůstane jen v tomhle zařízení – je to jako heslo k poště.</p>' +
        '<p class="pruh pruh-varovani" data-pripojeni-chyba hidden></p>' +
        '<div class="akce">' + (ucet.nastaveno() ? '<button type="button" class="odkaz" data-uvod-heslem>Přihlásit účtem</button>' : '') +
          '<button type="button" class="odkaz" data-uvod-ukazka>Jen vyzkoušet s ukázkovými daty</button>' +
          '<button type="button" class="btn btn--primary" data-uvod-pripojit>Připojit</button></div>') + '</div>';
    const form = el.querySelector('[data-uvod-form]');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); // přihlašuje Firebase, formulář se nikam neodesílá
        if (await prihlasUctem(el, form.querySelector('[data-uvod-prihlasit]'))) poPripojeni();
      });
      el.querySelector(ucet.stavUctu().email ? '[data-ucet-heslo]' : '[data-ucet-email]').focus();
    }
  };
  vykresli();
  el.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-uvod-jinak')) { jinak = true; vykresli(); }
    if (t.hasAttribute('data-uvod-heslem')) { jinak = false; vykresli(); }
    if (t.hasAttribute('data-uvod-ukazka')) { ulozPripojeni({ demo: true }); poPripojeni(); }
    if (t.hasAttribute('data-uvod-pripojit') && await zkusPripojit(el, t)) poPripojeni();
  };
  el.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-pripojeni-url], [data-pripojeni-klic]')) el.querySelector('[data-uvod-pripojit]').click();
  };
}

// ---------------------------------------------------------------- informace z motoru

export function nactiInfo() {
  if (stav.nacita.info) return Promise.resolve();
  stav.nacita.info = true;
  return volej('info')
    .then((info) => { stav.info = info; stav.chyby.info = null; uloziste.pis('asistent.info', info); })
    .catch((e) => { stav.chyby.info = e; })
    .then(() => { stav.nacita.info = false; zmeneno(); if (jeOtevreny('nastaveni')) obnovPanel('nastaveni'); });
}

// ---------------------------------------------------------------- panel Nastavení

export function otevriNastaveni(sekce) {
  // z pruhu „Motor není připojený“ rovnou formulář s adresou a klíčem
  n.upravaPripojeni = sekce === 'pripojeni' && !!stav.chyby.info;
  n.ukazKod = false;
  if (sekce && ZALOZKY.some((z) => z[0] === sekce)) n.sekce = sekce;
  else if (staryMotor() || stav.chyby.info) n.sekce = 'pripojeni';
  otevriPanel({ id: 'nastaveni', trida: 'panel-okno panel-nastaveni', titul: 'Nastavení', vykresli: nastaveniHtml });
  nactiInfo();
}

function sekcePripojeni() {
  let h = '<section class="card nast-sekce" data-sekce="pripojeni"><h3>Připojení</h3>';
  if (jeDemo()) {
    h += '<p class="nast-stav"><i></i>Ukázkový režim – data nejsou skutečná.</p>';
  } else if (stav.chyby.info) {
    h += '<p class="nast-stav chyba"><i></i>' + esc(stav.chyby.info.message) + '</p>';
  } else if (stav.info) {
    h += '<p class="nast-stav ok"><i></i>Připojeno · motor ' + esc(stav.info.verze || '') + (stav.info.ucet ? ' · ' + esc(stav.info.ucet) : '') + '</p>';
    if (staryMotor()) h += novaVerzeMotoruHtml();
  } else {
    h += '<p class="nast-stav"><i></i>Ověřuji…</p>';
  }
  if (n.upravaPripojeni || jeDemo()) {
    h += formularPripojeniHtml(!jeDemo()) + '<p class="pruh pruh-varovani" data-pripojeni-chyba hidden></p>' +
      '<div class="akce"><button type="button" class="btn btn--primary" data-nast="ulozit-pripojeni">Uložit a vyzkoušet</button></div>';
  } else {
    if (n.ukazKod) {
      const p = pripojeni() || {};
      h += '<label><span class="label">Kód pro připojení dalšího zařízení</span><input class="field kod-pripojeni" data-kod-pripojeni readonly value="' +
        esc(p.url + '#' + p.klic) + '"></label>' +
        '<p class="napoveda">Je v něm adresa i klíč (heslo k poště). Pošli si ho bezpečně – třeba e-mailem sám sobě –, v telefonu ho vlož ' +
        'do pole Adresa a e-mail pak smaž.</p>';
    }
    h += '<div class="akce">' +
      (n.ukazKod ? '<button type="button" class="btn btn--primary btn--sm" data-nast="kopirovat-kod">Kopírovat kód</button>'
        : '<button type="button" class="btn btn--ghost btn--sm" data-nast="kod-zarizeni">Připojit další zařízení</button>') +
      '<button type="button" class="btn btn--ghost btn--sm" data-nast="zmenit-pripojeni">Změnit adresu nebo klíč</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-nast="odpojit">Odpojit toto zařízení</button></div>';
  }
  if (!jeDemo()) h += uctuHtml();
  return h + '</section>';
}

function popisChybyUctu(e) {
  const kod = String((e && e.code) || '');
  if (/permission-denied/.test(kod)) return 'Databáze odmítla přístup – přihlas se znovu.';
  if (/unavailable|network/.test(kod)) return 'Firebase není dostupný (síť) – data se berou z motoru.';
  return (e && e.message) || String(e);
}

/** Účet Asistenta (Firebase): přihlášení na dalších zařízeních e-mailem a heslem a data ze serveru hned po otevření. */
function uctuHtml() {
  const u = ucet.stavUctu();
  if (!u.nastaveno) return '';
  let h = '<h3>Účet</h3>';
  if (u.zapnuty && u.prihlasen) {
    const sv = u.server;
    const chyby = (sv && sv.chyby) || [];
    h += '<p class="nast-stav ok"><i></i>Přihlášeno · ' + esc(u.email) + '</p>';
    h += sv && sv.kdy
      ? '<p class="nast-stav ' + (chyby.length ? 'chyba' : 'ok') + '"><i></i>Data ze serveru ' + esc(kdyKratce(sv.kdy)) +
        (u.obnovuje ? ' · obnovuji…' : '') + '</p>' + (chyby.length ? '<p class="napoveda">' + chyby.map(esc).join('<br>') + '</p>' : '')
      : '<p class="nast-stav"><i></i>' + (u.obnovuje ? 'Server chystá první data…' : 'Server zatím data nepřipravil.') + '</p>';
    if (u.chyba) h += '<p class="pruh pruh-varovani">' + esc(popisChybyUctu(u.chyba)) + '</p>';
    h += '<p class="napoveda">Server se motoru ptá každých 10 minut (6–23 h), při otevření aplikace se staršími daty a chvíli po každé změně. ' +
      'Aplikace data ukáže hned, na motor čeká jen u akcí. Na dalším zařízení stačí e-mail a heslo.</p>' +
      '<div class="akce"><button type="button" class="btn btn--ghost btn--sm" data-nast="ucet-obnovit"' + (u.obnovuje ? ' disabled' : '') + '>Obnovit na serveru</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-nast="ucet-odhlasit">Odhlásit účet</button></div>';
  } else {
    h += u.zapnuty ? '<p class="nast-stav chyba"><i></i>Přihlášení vypršelo – přihlas se znovu.</p>'
      : '<p class="napoveda">S účtem se na dalším zařízení přihlásíš jen e-mailem a heslem a data se načtou hned – server je pro aplikaci ' +
        'chystá každých 10 minut. Adresa motoru a klíč se po přihlášení uloží do účtu (vidí je jen tvůj účet a server).</p>';
    h += '<form class="fmr" data-ucet-form>' + poleUctuHtml(u.email) + '<p class="pruh pruh-varovani fmr__cely" data-ucet-chyba hidden></p>' +
      '<div class="akce fmr__cely"><button type="submit" class="btn btn--primary btn--sm" data-ucet-prihlasit>Přihlásit účet</button></div></form>';
  }
  return h;
}

// přihlášení účtem v Nastavení (formulář kvůli Klíčence v iPhonu – nabídne uložení hesla)
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!form.matches || !form.matches('[data-ucet-form]')) return;
  e.preventDefault();
  const vysledek = await prihlasUctem(form, form.querySelector('[data-ucet-prihlasit]'));
  if (vysledek === 'pripojeno') { location.reload(); return; }
  if (vysledek) { toast('Účet přihlášen ✓'); obnovPanel('nastaveni'); }
});

function sekcePosty() {
  const p = (stav.info && stav.info.posta) || {};
  let h = '<section class="card nast-sekce" data-sekce="posta"><h3>Pošta</h3>';
  h += '<p>Osobní: <b>' + esc(p.osobniAdresa || '—') + '</b></p>';
  h += '<div class="fmr"><label><span class="label">Pracovní adresa</span><input class="field" data-nast-pracovni type="email" inputmode="email" ' +
    'autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="jmeno@firma.cz" value="' + esc(p.pracovniAdresa || '') + '"></label>' +
    '<div><button type="button" class="btn btn--ghost" data-nast="ulozit-postu">Uložit</button></div></div>';
  if (p.pracovniAdresa) {
    h += '<p class="nast-stav ' + (p.lzeOdesilatZPracovni ? 'ok' : 'chyba') + '"><i></i>' +
      (p.lzeOdesilatZPracovni ? 'Odpovědi na pracovní poštu půjdou z pracovní adresy.' : 'Z pracovní adresy zatím odesílat nejde – Gmail ji nemá v „Odesílat poštu jako“.') + '</p>';
    // odesílání z pracovní adresy = alias v Gmailu (ověřený); motor ho jen přečte, nastavit ho musí Michal (heslo k pracovní schránce)
    if (!p.lzeOdesilatZPracovni) {
      h += '<ol class="napoveda kroky"><li>Gmail na počítači → ozubené kolo → <b>Zobrazit všechna nastavení</b> → <b>Účty a import</b> → ' +
        'Odesílat poštu jako → <b>Přidat další e-mailovou adresu</b>.</li>' +
        '<li>Jméno a adresa <b>' + esc(p.pracovniAdresa) + '</b> → Další → SMTP server <b>wes1-smtp.wedos.net</b>, port <b>587</b> (TLS), ' +
        'uživatelské jméno = celá adresa, heslo k pracovní schránce (zadáš jen ty).</li>' +
        '<li>Gmail pošle <b>ověřovací kód</b> na pracovní adresu – přijde přes přeposílání z WEDOSu; kód zadej nebo klikni na odkaz.</li>' +
        '<li>Pak tady <b>Zkontrolovat znovu</b>.</li></ol>' +
        '<div class="akce"><button type="button" class="btn btn--ghost" data-nast="znovu-info">Zkontrolovat znovu</button></div>';
    }
  }
  h += detail('posta-pracovni') + '<summary>Jak dostat pracovní poštu do aplikace</summary><ol>' +
    '<li>WEDOS WebMail → Nastavení → Filtry → Vytvořit: Všechny zprávy, akce <b>Přeposlat zprávu na</b> tvůj Gmail a tlačítkem + druhá akce ' +
    '<b>Zkopírovat zprávu do → Příchozí pošta</b> (jinak WEDOS přeposlané maže). Gmail sám poštu z jiných serverů od 2026 nestahuje.</li>' +
    '<li>V Gmailu: Nastavení → Účty a import → <b>Přidat další e-mailovou adresu</b> (Odesílat poštu jako) → SMTP serveru WEDOS ' +
    '(wes1-smtp.wedos.net, login celá adresa, heslo zadáš jen ty).</li>' +
    '<li>Sem napiš pracovní adresu a ulož. Aplikace pak pracovní poštu oddělí a odpovídá z ní.</li></ol>' +
    '<p>Přeposíláním se firemní e-maily ukládají i v osobním účtu Google – je to rozhodnutí firmy, ne aplikace.</p></details>';
  // podpis na konec e-mailu – vloží se do psaní (nový e-mail i odpověď), před odesláním jde upravit
  const podpisy = p.podpisy || {};
  const jmeno = uloziste.cti('asistent.jmeno') || '';
  h += '<h3>Podpis</h3><p class="napoveda">Vloží se na konec nového e-mailu i odpovědi; před odesláním ho můžeš upravit.' +
    (staryMotor() ? ' Uložit ho půjde po nasazení nové verze motoru.' : '') + '</p>' +
    '<label><span class="label">Osobní</span><textarea class="field" rows="3" data-nast-podpis="osobni" placeholder="S pozdravem&#10;' + esc(jmeno || 'Jméno') + '">' +
      esc(podpisy.osobni || '') + '</textarea></label>' +
    (p.pracovniAdresa ? '<label><span class="label">Pracovní · ' + esc(p.pracovniAdresa) + '</span><textarea class="field" rows="5" data-nast-podpis="pracovni" ' +
      'placeholder="S pozdravem&#10;&#10;' + esc(jmeno || 'Jméno Příjmení') + '&#10;pozice · firma&#10;telefon · web">' + esc(podpisy.pracovni || '') + '</textarea></label>' : '') +
    '<div class="akce"><button type="button" class="btn btn--primary" data-nast="ulozit-podpisy"' + (staryMotor() ? ' disabled' : '') + '>Uložit podpis</button></div>';
  // návrhy odpovědí od Clauda: motor dá konverzace „čeká na tebe“ na Disk, naplánovaná úloha k nim napíše návrh
  if (umiMotor('navrhyNastavit')) {
    const r = p.navrhyOdpovedi || 'obe';
    h += '<h3>Návrhy odpovědí od Clauda</h3><p class="napoveda">U konverzací, které čekají na tvou odpověď, připraví Claude návrh (naplánovaná úloha ' +
      '„Návrhy odpovědí“). Text e-mailů jde jen přes tvůj Disk a Clauda; odesíláš vždycky ty.</p>' +
      '<div class="segment" role="group" aria-label="Návrhy odpovědí">' + [['obe', 'Osobní i pracovní'], ['osobni', 'Jen osobní'], ['vypnuto', 'Vypnuto']].map((x) =>
        '<button type="button" class="chip" data-nast-navrhy="' + x[0] + '" aria-pressed="' + (r === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  }
  return h + '</section>';
}

function sekceKalendaru() {
  const kalendare = (stav.info && stav.info.kalendare) || [];
  let h = '<section class="card nast-sekce" data-sekce="kalendare"><h3>Kalendáře</h3>';
  if (kalendare.length) {
    h += '<ul class="kal-polozky">' + kalendare.map((k) => '<li class="kal-polozka" style="--b:' + esc(k.barva) + '"><i class="tecka-kal"></i>' +
      '<span class="grow"><b>' + esc(k.nazev) + '</b><small>' + (k.zdroj === 'icloud' ? 'z iPhonu (iCloud) · jen čtení' : 'Google' + (k.zapis ? ' · zápis' : ' · jen čtení')) + '</small></span>' +
      (staryMotor() ? '' : '<select class="field field--sm" data-nast-kal-druh="' + esc(k.id) + '" aria-label="Druh kalendáře ' + esc(k.nazev) + '">' +
        DRUHY.map((d) => '<option value="' + d[0] + '"' + ((k.druh || 'osobni') === d[0] ? ' selected' : '') + '>' + d[1] + '</option>').join('') + '</select>') +
      (k.zdroj === 'icloud' ? '<button type="button" class="btn btn--ghost btn--sm" data-nast-kal-odebrat="' + esc(k.id) + '">Odebrat</button>' : '') +
      '<label class="prepinac" title="Ukazovat v aplikaci"><input type="checkbox" data-nast-kal-zobrazit="' + esc(k.id) + '"' + (k.skryty ? '' : ' checked') +
      ' aria-label="Ukazovat ' + esc(k.nazev) + '"><span></span></label></li>').join('') + '</ul>';
  } else {
    h += '<p class="muted">Zatím žádný kalendář.</p>';
  }
  h += '<h3>Přidat kalendář z iPhonu</h3>' +
    '<div class="napoveda"><ol><li>V iPhonu otevři <b>Kalendář</b> → dole <b>Kalendáře</b> → ⓘ u kalendáře.</li>' +
    '<li>Zapni <b>Veřejný kalendář</b> → <b>Sdílet odkaz</b> → <b>Kopírovat</b>.</li>' +
    '<li>Odkaz vlož sem. Kdo odkaz zná, kalendář přečte – nikomu ho neposílej; zůstane jen v motoru.</li></ol></div>' +
    '<div class="fmr"><label><span class="label">Název</span><input class="field" data-nast-kal-nazev type="text" placeholder="např. Rodina"></label>' +
    '<label class="fmr__cely"><span class="label">Odkaz</span><input class="field" data-nast-kal-odkaz type="url" inputmode="url" autocomplete="off" ' +
      'autocapitalize="off" spellcheck="false" placeholder="webcal://p…-caldav.icloud.com/published/…"></label></div>' +
    '<div class="spread"><div class="barvy" role="group" aria-label="Barva kalendáře">' + BARVY_KALENDARE.map((b) => '<button type="button" class="barva" style="--b:' + b +
      '" data-nast-kal-barva="' + b + '" aria-pressed="' + (b === n.novaBarva) + '" aria-label="Barva ' + b + '"></button>').join('') + '</div>' +
    '<button type="button" class="btn btn--primary" data-nast="pridat-kalendar">Přidat</button></div>';
  h += '<h3>Zápis a zápasy</h3>' +
    '<p class="napoveda">Nové události a zápasy se zapisují do kalendářů Google (iCloud jde jen číst). V iPhonu je uvidíš vedle iCloudu, když si ' +
    'jednou přidáš účet Google: Nastavení → Aplikace → Kalendář → Účty kalendářů → Přidat účet → Google (stejný účet jako Gmail).</p>' +
    (fotbalTymyHtml() || zapasyHtml(false));
  return h + '</section>';
}

function sekceVzhledu() {
  const motiv = uloziste.cti('asistent.motiv') || 'auto';
  const akcent = uloziste.cti('asistent.akcent') || AKCENTY[0][0];
  return '<section class="card nast-sekce" data-sekce="vzhled"><h3>Vzhled</h3>' +
    segment([['auto', 'Podle zařízení'], ['svetly', 'Světlý'], ['tmavy', 'Tmavý']], motiv, 'data-nast-motiv', 'Motiv') +
    '<div class="barvy" role="group" aria-label="Barva aplikace">' + AKCENTY.map((a) => '<button type="button" class="barva" style="--b:' + a[0] +
      '" data-nast-akcent="' + a[0] + '" aria-pressed="' + (a[0] === akcent) + '" title="' + esc(a[1]) + '" aria-label="' + esc(a[1]) + '"></button>').join('') + '</div>' +
    // jméno jen v tomhle zařízení (do veřejného kódu nepatří) – na telefonu nahoře a v pozdravu
    '<div class="fmr"><label><span class="label">Jméno</span><input class="field" data-nast-jmeno type="text" autocomplete="given-name" ' +
      'placeholder="např. Michal" value="' + esc(uloziste.cti('asistent.jmeno') || '') + '"></label>' +
    '<label><span class="label">Oslovení v pozdravu</span><input class="field" data-nast-osloveni type="text" autocomplete="off" ' +
      'placeholder="např. Michale" value="' + esc(uloziste.cti('asistent.osloveni') || '') + '"></label></div></section>';
}

function sekceAplikace() {
  return '<section class="card nast-sekce" data-sekce="aplikace"><h3>Aplikace</h3>' +
    '<p>Verze ' + VERZE_APLIKACE + '. Nové verze se načtou samy při dalším otevření.</p>' +
    '<div class="akce"><button type="button" class="btn btn--ghost btn--sm" data-nast="smazat-data">Smazat uložená data v zařízení</button></div></section>';
}

/** Motor bez seznamu akcí = starší kód. Nové věci (počasí, zdraví…) ukáže až Nová verze nasazení. */
function novaVerzeMotoruHtml() {
  return '<div class="pruh pruh-varovani"><b>Motor je starší verze</b> – počasí a další novinky ukáže až nový kód.</div>' +
    '<ol class="napoveda kroky"><li>Otevři projekt motoru na script.google.com a vlož do <b>Kód.gs</b> nový kód z GitHubu (apps-script/Kod.gs).</li>' +
    '<li><b>Uložit</b> (Ctrl+S).</li><li><b>Nasadit → Spravovat nasazení</b> → tužka → Verze: <b>Nová verze</b> → Nasadit. Adresa zůstane stejná.</li>' +
    '<li>Tady v aplikaci klepni na Obnovit.</li></ol>';
}

function sekcePocasi() {
  const misto = (stav.info && stav.info.pocasi && stav.info.pocasi.misto) || (stav.pocasi && stav.pocasi.misto);
  let h = '<section class="card nast-sekce" data-sekce="pocasi"><h3>Počasí · ČHMÚ</h3>';
  if (staryMotor()) return h + '<p>Počasí ukáže nová verze motoru.</p>' + novaVerzeMotoruHtml() + '</section>';
  const zap = pocasi.polohaZapnuta();
  h += '<label class="prepinac-radek"><span><b>Podle mé polohy</b><small>na tomhle zařízení – výstrahy pro obec, kde jsi, nejbližší řeka, předpověď kraje a teplota teď</small></span>' +
    '<span class="prepinac"><input type="checkbox" data-nast-poloha' + (zap ? ' checked' : '') + '><span></span></span></label>' +
    (zap && stav.chybaPolohy ? '<p class="nast-stav chyba"><i></i>' + esc(stav.chybaPolohy) + '</p>' : '') +
    '<p class="napoveda">Poloha (zaokrouhlená na ~1 km) jde jen tvému motoru, mapové službě ČÚZK (kód obce) a Open-Meteo (teplota teď). ' +
    'Motor si pamatuje poslední místo pro ranní upozornění – po vypnutí ho zapomene.</p>' +
    '<p>Místo: <b>' + esc(misto || (jeDemo() ? 'Veselí nad Moravou (ukázka)' : '—')) + '</b>' + (stav.pocasi && stav.pocasi.podlePolohy ? ' <span class="tag">podle polohy</span>' : '') + '</p>' +
    '<p class="napoveda">Na Dnes je jen to důležité: výstrahy ČHMÚ pro tvoje místo (bouřky, vedro, mráz, povodně, smog), povodňový stupeň ' +
    'na řece a krátká předpověď kraje na dnes až tři dny. Klepnutím na kartu Počasí se otevře celý přehled.</p>' +
    detail('pocasi-misto') + '<summary>Jak změnit místo</summary><ol>' +
    '<li>V projektu motoru: Nastavení projektu (ozubené kolo) → Vlastnosti skriptu → Přidat: <b>POCASI</b>.</li>' +
    '<li>Hodnota (JSON), např. <code>{"misto":"Hodonín","orp":{"6206":"Hodonín"},"stanice":["0-203-1-421500"],"kraj":"RPJM"}</code> – ' +
    'kód ORP je ve výstrahách ČHMÚ (CISORP), stanice na hydro.chmi.cz, kraj: RPJM = Jihomoravský.</li></ol></details>' +
    '<p class="napoveda">Data: Český hydrometeorologický ústav (otevřená data, CC BY 4.0). Motor je stahuje šetrně – ' +
    'jen když se změní, přehled drží 15 minut.</p>';
  return h + '</section>';
}

function sekceZdravi() {
  let h = '<section class="card nast-sekce" data-sekce="zdravi"><h3>Zdraví · WHOOP</h3>';
  if (staryMotor()) return h + '<p>Zdraví ukáže nová verze motoru.</p>' + novaVerzeMotoruHtml() + '</section>';
  const w = (stav.zdravi && stav.zdravi.whoop) || {};
  const motor = (pripojeni() || {}).url || 'https://script.google.com/macros/s/…/exec';
  h += '<p class="nast-stav ' + (w.propojeno ? 'ok' : w.nastaveno ? '' : 'chyba') + '"><i></i>' +
    (w.propojeno ? 'Propojeno' + (w.sync && w.sync.kdy ? ' · data z ' + new Date(w.sync.kdy).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
      : w.nastaveno ? 'Nastaveno, ještě nepropojeno' : 'Zatím nenastaveno') + '</p>' +
    (w.sync && w.sync.chyba ? '<p class="pruh pruh-varovani">' + esc(w.sync.chyba) + '</p>' : '') +
    // nejčastější chyba propojení: adresa pro návrat (redirect) ve WHOOP nebo ve vlastnosti motoru není přesně adresa motoru
    (w.nastaveno && !w.propojeno && !jeDemo() ? '<p class="napoveda">Když WHOOP hlásí <i>„redirect_uri … does not match“</i>: v developer-dashboard.whoop.com ' +
      '(aplikace → <b>Redirect URLs</b>) i ve vlastnosti skriptu <code>WHOOP_REDIRECT_URI</code> musí být <b>přesně</b> tahle adresa motoru – bez mezer ' +
      'a lomítka na konci:</p><div class="akce"><code class="adresa-motoru">' + esc(motor) + '</code>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-nast="kopirovat-adresu">Kopírovat adresu</button></div>' : '') +
    '<div class="akce">' + (w.propojeno ? '<button type="button" class="btn btn--ghost btn--sm" data-nast="whoop-odpojit">Odpojit WHOOP</button>' : '') +
    (w.nastaveno || jeDemo() ? '<button type="button" class="btn btn--primary btn--sm" data-zdravi="propojit">' + (w.propojeno ? 'Propojit znovu' : 'Propojit WHOOP') + '</button>' : '') + '</div>' +
    detail('whoop', !w.nastaveno) + '<summary>Jak nastavit WHOOP (jednou, na PC, asi 10 minut)</summary><ol class="kroky">' +
    '<li>Otevři <a href="https://developer-dashboard.whoop.com" target="_blank" rel="noopener">developer-dashboard.whoop.com</a> a přihlas se účtem WHOOP. ' +
      '<b>Get Started</b> → název týmu (např. „Michal – osobní“) → <b>Create Team</b>.</li>' +
    '<li><b>Apps → Create</b>: Name <code>Asistent</code>, Contacts tvůj e-mail, Privacy Policy URL <code>https://mk-asistent.github.io/soukromi.html</code>, ' +
      'Redirect URL přesně adresa motoru: <code>' + esc(motor) + '</code> (bez # a parametrů), Scopes: read:recovery, read:cycles, read:sleep, read:workout, ' +
      'read:body_measurement. Webhooks nech prázdné → <b>Create</b>.</li>' +
    '<li>V detailu aplikace jsou <b>Client ID</b> a <b>Client Secret</b>. Nikam je neposílej (chat, e-mail, Disk) – rovnou do motoru:</li>' +
    '<li>script.google.com → projekt motoru → ⚙ Nastavení projektu → <b>Vlastnosti skriptu</b> → Přidat: <code>WHOOP_CLIENT_ID</code>, ' +
      '<code>WHOOP_CLIENT_SECRET</code> a <code>WHOOP_REDIRECT_URI</code> (= stejná adresa motoru jako výš) → Uložit.</li>' +
    '<li>Tady klepni na <b>Propojit WHOOP</b> → přihlas se → <b>Allow</b>. Data za 30 dní se načtou sama.</li></ol></details>';
  // výsledek posledního spuštění zkratky (motor ho drží 6 h) – zkratka sama běží potichu
  const pa = stav.zdravi && stav.zdravi.apple && stav.zdravi.apple.posledni;
  const cas = (t) => new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const den = (s) => String(s || '').split('-').reverse().slice(0, 2).map(Number).join('. ') + '.';
  h += '<h3>Apple Watch – zkratka v iPhonu</h3>' +
    '<p class="napoveda">Data ze Zdraví jdou číst jen při odemčeném iPhonu, proto je posílá zkratka, když otevřeš aplikaci WHOOP ' +
    '(ráno stejně koukáš na připravenost). Zkratka má vlastní klíč – umí jen zapsat data Zdraví, poštu neotevře.</p>' +
    (pa ? '<p class="nast-stav ' + (pa.ok ? 'ok' : 'chyba') + '"><i></i>Poslední zpráva ze zkratky ' + esc(cas(pa.kdy)) + ': ' +
        (pa.ok ? 'uloženo ' + pa.ulozeno + ' dní (' + esc(den(pa.od)) + ' – ' + esc(den(pa.do)) + ')' : esc(pa.chyba)) + '</p>' +
      (pa.pole && pa.pole.length ? '<p class="napoveda">Přišla pole: ' + esc(pa.pole.join(', ')) + '</p>' : '') +
      (pa.ukazka ? '<pre class="ukazka-zkratky">' + esc(Object.keys(pa.ukazka).map((k) => k + ': ' + pa.ukazka[k]).join('\n')) + '</pre>' : '') : '') +
    (n.klicZdravi ? '<label><span class="label">Klíč pro zkratku (pole „klic“)</span><input class="field kod-pripojeni" data-klic-zdravi readonly value="' + esc(n.klicZdravi) + '"></label>' +
      '<div class="akce"><button type="button" class="btn btn--ghost btn--sm" data-nast="zdravi-klic-novy">Vyrobit nový</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-nast="kopirovat-adresu">Kopírovat adresu motoru</button>' +
      '<button type="button" class="btn btn--primary btn--sm" data-nast="zdravi-klic-kopirovat">Kopírovat klíč</button></div>'
      : '<div class="akce"><button type="button" class="btn btn--ghost btn--sm" data-nast="kopirovat-adresu">Kopírovat adresu motoru</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-nast="zdravi-klic">Ukázat klíč pro zkratku</button></div>') +
    detail('zkratka-zdravi') + '<summary>Jak udělat zkratku „Zdraví do Asistenta“</summary><ol class="kroky">' +
    '<li>Aplikace <b>Zkratky</b> → <b>+</b> → název <code>Zdraví do Asistenta</code>. Na každý údaj stačí <b>dvě akce</b>:' +
      '<br>① <b>Najít vzorky zdravotních dat</b> – Typ (Steps, Aktivní energie, Minuty cvičení, Klidová tepová frekvence, Chůze a běh…), ' +
      'Datum začátku je v posledních 7 dnech, <b>Seskupit podle: Den</b>, Doplnit chybějící vypnout. Musí tam stát „<b>Najít</b>“ – když se ' +
      'ukáže „Filtrovat položky…“, napojila se na předchozí akci: klepni na modré „Vzorky zdravotních dat“ hned za „typu“ → Vymazat.' +
      '<br>② <b>Nastavit proměnnou</b> – jméno <code>kroky</code> (pak <code>energie</code>, <code>cviceni</code>, <code>klidovy_tep</code>, ' +
      '<code>vzdalenost</code>, <code>stani</code>, <code>hrv</code>, <code>vo2max</code>).</li>' +
    '<li>Na konec <b>Načíst obsah URL</b>: adresa motoru (tlačítko výš) → Metoda POST → Tělo požadavku JSON → pole typu Text: <code>klic</code> = klíč ' +
      'pro zkratku, <code>akce</code> = <code>zdraviApple</code>. Pro každou proměnnou <b>dvě pole</b>: <code>kroky</code> = proměnná kroky → klepni na ni ' +
      '→ <b>Hodnota</b>; <code>kroky_dny</code> = proměnná kroky → <b>Datum začátku</b>. Stejně <code>energie</code> + <code>energie_dny</code> atd.</li>' +
    '<li>Zkratku jednou spusť (▶). iPhone se zeptá na <b>přístup ke Zdraví</b> → zapni všechny údaje → Povolit. <i>Teprve potom</i> se Zkratky objeví ' +
      'v aplikaci Zdraví → profil → Soukromí → Aplikace (tam jde přístup později změnit) – dřív tam nejsou.</li>' +
    '<li>Automatizace → <b>+</b> → Vytvořit osobní automatizaci → <b>Aplikace</b> → WHOOP → je otevřená → <b>Spustit okamžitě</b> → zkratka výš.</li></ol></details>';
  h += '<h3>Upozornění do iPhonu</h3>' + detail('upozorneni') + '<summary>Ráno připravenost, výstrahy ČHMÚ (nepovinné, aplikace ntfy)</summary><ol class="kroky">' +
    '<li>V editoru motoru spusť funkci <b>nastavUpozorneni</b> – v protokolu je téma (jméno kanálu, funguje jako heslo).</li>' +
    '<li>iPhone: App Store → <b>ntfy</b> → + → téma z protokolu, server ntfy.sh → povol oznámení.</li>' +
    '<li>Editor → Spouštěče (budík) → Přidat spouštěč → <b>kazdouHodinu</b> → Časový → Hodinový časovač → Každou hodinu.</li></ol></details>';
  return h + '</section>';
}

function nastaveniHtml() {
  const s = ZALOZKY.some((z) => z[0] === n.sekce) ? n.sekce : 'pripojeni';
  const obsah = { pripojeni: sekcePripojeni, posta: sekcePosty, kalendare: sekceKalendaru, pocasi: sekcePocasi, zdravi: sekceZdravi, vzhled: sekceVzhledu, aplikace: sekceAplikace }[s]();
  return '<div class="nast-zalozky" role="tablist" aria-label="Části nastavení">' + ZALOZKY.map((z) =>
    '<button type="button" class="chip" role="tab" data-nast-sekce="' + z[0] + '" aria-selected="' + (z[0] === s) + '" aria-pressed="' + (z[0] === s) + '">' + z[1] +
    (z[0] === 'pripojeni' && (staryMotor() || stav.chyby.info) ? ' <i class="tecka"></i>' : '') + '</button>').join('') + '</div>' +
    '<div class="nast">' + obsah + '</div>';
}

function poZmeneKalendaru(kalendare) {
  if (stav.info) stav.info.kalendare = kalendare;
  smazKalendar();
  nactiKalendar(true);
  obnovPanel('nastaveni');
  zmeneno();
}

// ---------------------------------------------------------------- ovládání

export function klikNastaveni(el) {
  const panel = elementPanelu('nastaveni');
  const akce = el.dataset.nast;
  if (el.dataset.nastSekce) {
    n.sekce = el.dataset.nastSekce;
    obnovPanel('nastaveni');
    const telo = panel && elementPanelu('nastaveni').querySelector('.panel-telo');
    if (telo) telo.scrollTop = 0;
    return true;
  }
  if (el.dataset.nastNavrhy) {
    el.disabled = true;
    volej('navrhyNastavit', { rezim: el.dataset.nastNavrhy })
      .then((posta) => { if (stav.info) stav.info.posta = posta; uloziste.pis('asistent.info', stav.info); toast('Uloženo ✓'); obnovPanel('nastaveni'); })
      .catch((e) => { el.disabled = false; toast(e.message, true); });
    return true;
  }
  if (akce === 'ucet-obnovit') { ucet.obnovNaServeru(true); return true; }
  if (akce === 'ucet-odhlasit') {
    potvrd('Odhlásit účet?', { text: 'Toto zařízení zůstane připojené k motoru, jen bez dat ze serveru (načítá se zase jen z motoru).', ano: 'Odhlásit' })
      .then((ano) => { if (ano) ucet.odhlas().then(() => { toast('Účet odhlášen'); obnovPanel('nastaveni'); }); });
    return true;
  }
  if (akce === 'kopirovat-adresu') {
    const adresa = (pripojeni() || {}).url || '';
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(adresa).then(() => toast('Adresa motoru zkopírovaná'), () => toast(adresa));
    else toast(adresa);
    return true;
  }
  if (akce === 'zmenit-pripojeni') { n.upravaPripojeni = true; obnovPanel('nastaveni'); return true; }
  if (akce === 'kod-zarizeni') { n.ukazKod = true; obnovPanel('nastaveni'); return true; }
  if (akce === 'kopirovat-kod') {
    const pole = panel.querySelector('[data-kod-pripojeni]');
    const hotovo = () => toast('Kód zkopírovaný – po vložení v telefonu ho smaž, kam sis ho poslal');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pole.value).then(hotovo, () => { pole.select(); toast('Označeno – zkopíruj Ctrl+C'); });
    else { pole.select(); toast('Označeno – zkopíruj Ctrl+C'); }
    return true;
  }
  if (akce === 'ulozit-pripojeni') {
    zkusPripojit(panel, el)
      .then((ok) => (ok && ucet.prihlasen() ? ucet.ulozPripojeni(pripojeni()).then(() => ok, () => ok) : ok)) // nový klíč i do účtu
      .then((ok) => { if (ok) { toast('Připojeno ✓'); location.reload(); } });
    return true;
  }
  if (akce === 'odpojit') {
    potvrd('Odpojit toto zařízení?', { text: 'Smaže se adresa motoru, klíč i uložená data v tomhle zařízení. Na ostatních zařízeních se nic nemění.',
      ton: 'nebezpeci', ano: 'Odpojit' }).then((ano) => {
      if (!ano) return;
      ucet.odhlas().then(() => {
        uloziste.klice('asistent.').forEach((k) => uloziste.smaz(k));
        zapomenPripojeni();
        location.reload();
      });
    });
    return true;
  }
  if (akce === 'smazat-data') {
    uloziste.klice('asistent.data.').concat(uloziste.klice('asistent.koncept.')).forEach((k) => uloziste.smaz(k));
    toast('Uložená data smazána');
    setTimeout(() => location.reload(), 600);
    return true;
  }
  if (akce === 'znovu-info') {
    el.disabled = true;
    nactiInfo().then(() => {
      const p = (stav.info && stav.info.posta) || {};
      toast(p.lzeOdesilatZPracovni ? 'Pracovní adresa funguje ✓' : 'Gmail ji pořád nemá – zkontroluj ověření adresy', !p.lzeOdesilatZPracovni);
    });
    return true;
  }
  if (akce === 'ulozit-postu') {
    const adresa = panel.querySelector('[data-nast-pracovni]').value.trim();
    el.disabled = true;
    volej('nastavPostu', { pracovniAdresa: adresa })
      .then((posta) => {
        if (stav.info) stav.info.posta = posta;
        uloziste.pis('asistent.info', stav.info);
        toast('Uloženo ✓');
        nactiPostu(true);
        obnovPanel('nastaveni');
      })
      .catch((e) => { el.disabled = false; toast(e.message, true); });
    return true;
  }
  if (akce === 'ulozit-podpisy') {
    const cti = (u) => { const t = panel.querySelector('[data-nast-podpis="' + u + '"]'); return t ? t.value : ((stav.info && stav.info.posta && stav.info.posta.podpisy) || {})[u] || ''; };
    el.disabled = true;
    volej('podpisyUlozit', { podpisy: { osobni: cti('osobni'), pracovni: cti('pracovni') } })
      .then((posta) => { if (stav.info) stav.info.posta = posta; uloziste.pis('asistent.info', stav.info); toast('Podpis uložen ✓'); obnovPanel('nastaveni'); })
      .catch((e) => { el.disabled = false; toast(e.message, true); });
    return true;
  }
  if (akce === 'zdravi-klic' || akce === 'zdravi-klic-novy') {
    const novy = akce === 'zdravi-klic-novy';
    (novy ? potvrd('Vyrobit nový klíč?', { text: 'Starý přestane platit – ve zkratce ho pak vyměň.', ano: 'Vyrobit' }) : Promise.resolve(true)).then((ano) => {
      if (!ano) return;
      volej('zdraviKlic', { novy }).then((d) => { n.klicZdravi = d.klic; obnovPanel('nastaveni'); }).catch((e) => toast(e.message, true));
    });
    return true;
  }
  if (akce === 'zdravi-klic-kopirovat') {
    const pole = panel.querySelector('[data-klic-zdravi]');
    const hotovo = () => toast('Klíč zkopírovaný – vlož ho do zkratky do pole klic');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pole.value).then(hotovo, () => { pole.select(); toast('Označeno – zkopíruj'); });
    else { pole.select(); toast('Označeno – zkopíruj'); }
    return true;
  }
  if (akce === 'whoop-odpojit') {
    potvrd('Odpojit WHOOP?', { text: 'Motor zapomene přístup; uložená data zůstanou na tvém Disku.', ano: 'Odpojit' }).then((ano) => {
      if (!ano) return;
      volej('whoopOdpojit').then((w) => { if (stav.zdravi) stav.zdravi.whoop = w; obnovPanel('nastaveni'); zmeneno(); toast('WHOOP odpojen'); }).catch((e) => toast(e.message, true));
    });
    return true;
  }
  if (akce === 'pridat-kalendar') {
    const odkaz = panel.querySelector('[data-nast-kal-odkaz]').value.trim();
    const nazev = panel.querySelector('[data-nast-kal-nazev]').value.trim();
    if (!odkaz) { toast('Vlož odkaz na kalendář.'); return true; }
    el.disabled = true;
    el.textContent = 'Ověřuji…';
    volej('kalendarPridat', { nazev, odkaz, barva: n.novaBarva })
      .then((kalendare) => { toast('Kalendář přidán ✓'); poZmeneKalendaru(kalendare); })
      .catch((e) => { el.disabled = false; el.textContent = 'Přidat'; toast(e.message, true); });
    return true;
  }
  if (el.dataset.nastKalOdebrat) {
    const id = el.dataset.nastKalOdebrat;
    potvrd('Odebrat kalendář z aplikace?', { text: 'V iPhonu zůstane, jen ho tu přestaneš vidět.', ano: 'Odebrat' }).then((ano) => {
      if (ano) volej('kalendarOdebrat', { id }).then(poZmeneKalendaru).catch((e) => toast(e.message, true));
    });
    return true;
  }
  if (el.dataset.nastKalBarva) { n.novaBarva = el.dataset.nastKalBarva; obnovPanelPoli(); return true; }
  if (el.dataset.nastMotiv) {
    if (el.dataset.nastMotiv === 'auto') uloziste.smaz('asistent.motiv'); else uloziste.pis('asistent.motiv', el.dataset.nastMotiv);
    aplikujVzhled();
    obnovPanelPoli();
    return true;
  }
  if (el.dataset.nastAkcent) { uloziste.pis('asistent.akcent', el.dataset.nastAkcent); aplikujVzhled(); obnovPanelPoli(); return true; }
  return false;
}

/** Překreslí panel, ale rozepsané hodnoty v polích nechá. */
function obnovPanelPoli() {
  const panel = elementPanelu('nastaveni');
  if (!panel) return;
  const hodnoty = {};
  panel.querySelectorAll('input[type="text"], input[type="url"], input[type="email"], input[type="password"]').forEach((i) => {
    const klic = Object.keys(i.dataset)[0];
    if (klic) hodnoty[klic] = i.value;
  });
  obnovPanel('nastaveni');
  Object.keys(hodnoty).forEach((klic) => {
    const i = elementPanelu('nastaveni').querySelector('[data-' + klic.replace(/[A-Z]/g, (z) => '-' + z.toLowerCase()) + ']');
    if (i) i.value = hodnoty[klic];
  });
}

export function zmenaNastaveni(e) {
  const t = e.target;
  // jméno a oslovení se ukládají jen v zařízení
  if (t.dataset && (t.dataset.nastJmeno !== undefined || t.dataset.nastOsloveni !== undefined)) {
    const klic = t.dataset.nastJmeno !== undefined ? 'asistent.jmeno' : 'asistent.osloveni';
    if (t.value.trim()) uloziste.pis(klic, t.value.trim().slice(0, 40)); else uloziste.smaz(klic);
    zmeneno();
    return true;
  }
  if (t.dataset && t.dataset.nastKalDruh) {
    volej('kalendarUpravit', { id: t.dataset.nastKalDruh, druh: t.value }).then(poZmeneKalendaru).catch((chyba) => toast(chyba.message, true));
    return true;
  }
  if (t.matches && t.matches('[data-nast-poloha]')) {
    // první zapnutí = iPhone / prohlížeč se zeptá na povolení polohy
    pocasi.nastavPolohu(t.checked).then(() => {
      toast(t.checked ? (stav.chybaPolohy ? stav.chybaPolohy : 'Počasí podle polohy: ' + ((stav.pocasi && stav.pocasi.misto) || 'zapnuto')) : 'Počasí zase pro výchozí místo', !!(t.checked && stav.chybaPolohy));
      if (jeOtevreny('nastaveni')) obnovPanel('nastaveni');
    });
    return true;
  }
  if (!t.dataset || !t.dataset.nastKalZobrazit) return false;
  volej('kalendarUpravit', { id: t.dataset.nastKalZobrazit, skryty: !t.checked })
    .then(poZmeneKalendaru)
    .catch((chyba) => { t.checked = !t.checked; toast(chyba.message, true); });
  return true;
}
