// Připojení k motoru (úvodní obrazovka), Nastavení (pošta, kalendáře z iPhonu, vzhled) a barva akcentu.

import { stav, zmeneno } from './stav.js';
import { volej, pripojeni, jeDemo, ulozPripojeni, zapomenPripojeni } from './api.js';
import { esc, uloziste } from './pomocne.js';
import { otevriPanel, obnovPanel, jeOtevreny, elementPanelu } from './panely.js';
import { toast, potvrd, segment } from './ui.js';
import { IKONY } from './ikony.js';
import { smazUlozene as smazKalendar, nactiKalendar } from './kalendar.js';
import { nactiPostu } from './posta.js';
import { zapasyHtml } from './udalost.js';

export const VERZE_APLIKACE = '2026-10-02';

// předvolby hlavní barvy – tlumené tmavé odstíny jako ve stylu Fixtrack (lesní zelená je výchozí)
const AKCENTY = [['#1f3d2c', 'Lesní zelená'], ['#1d4250', 'Ocelová'], ['#2a3f8f', 'Modrá'], ['#4b2d63', 'Švestková'], ['#7a3a1d', 'Cihlová'], ['#2b2f33', 'Grafitová']];
const BARVY_KALENDARE = ['#2f5bd3', '#0f7c8c', '#2e7a4d', '#a8620c', '#8e5bd3', '#c0392b', '#b5407a', '#37474f'];
const n = { upravaPripojeni: false, ukazKod: false, novaBarva: BARVY_KALENDARE[1], pracuje: false };

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

export function vykresliUvod(poPripojeni) {
  const el = document.getElementById('uvod');
  document.getElementById('aplikace').hidden = true;
  el.hidden = false;
  el.innerHTML = '<div class="card uvod-karta">' +
    '<div class="uvod-logo"><span>' + IKONY.dnes + '</span><b>Asistent</b></div>' +
    '<p>Schránka pro Clauda, pošta a kalendář na jednom místě. Na tomhle zařízení ještě není připojený motor.</p>' +
    formularPripojeniHtml(false) +
    '<p class="napoveda">Adresu (končí /exec) najdeš v Apps Scriptu v Nasadit → Spravovat nasazení, klíč v protokolu po spuštění ' +
      'nastavApi. Na dalším zařízení stačí do Adresy vložit <b>kód pro připojení</b> z Nastavení (obsahuje obojí). ' +
      'Klíč zůstane jen v tomhle zařízení – je to jako heslo k poště.</p>' +
    '<p class="pruh pruh-varovani" data-pripojeni-chyba hidden></p>' +
    '<div class="akce"><button type="button" class="odkaz" data-uvod-ukazka>Jen vyzkoušet s ukázkovými daty</button>' +
    '<button type="button" class="btn btn--primary" data-uvod-pripojit>Připojit</button></div></div>';
  el.onclick = async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-uvod-ukazka')) { ulozPripojeni({ demo: true }); poPripojeni(); }
    if (t.hasAttribute('data-uvod-pripojit') && await zkusPripojit(el, t)) poPripojeni();
  };
  el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('input')) el.querySelector('[data-uvod-pripojit]').click(); };
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
  otevriPanel({
    id: 'nastaveni', trida: 'panel-bocni', titul: 'Nastavení', vykresli: nastaveniHtml,
    poOtevreni: (el) => {
      if (sekce) { const cil = el.querySelector('[data-sekce="' + sekce + '"]'); if (cil) cil.scrollIntoView({ block: 'start' }); }
    }
  });
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
  return h + '</section>';
}

function sekcePosty() {
  const p = (stav.info && stav.info.posta) || {};
  let h = '<section class="card nast-sekce" data-sekce="posta"><h3>Pošta</h3>';
  h += '<p>Osobní: <b>' + esc(p.osobniAdresa || '—') + '</b></p>';
  h += '<div class="fmr"><label><span class="label">Pracovní adresa</span><input class="field" data-nast-pracovni type="email" inputmode="email" ' +
    'autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="jmeno@firma.cz" value="' + esc(p.pracovniAdresa || '') + '"></label>' +
    '<div><button type="button" class="btn btn--ghost" data-nast="ulozit-postu">Uložit</button></div></div>';
  if (p.pracovniAdresa) {
    h += '<p class="nast-stav ' + (p.lzeOdesilatZPracovni ? 'ok' : 'chyba') + '"><i></i>' +
      (p.lzeOdesilatZPracovni ? 'Odpovědi na pracovní poštu půjdou z pracovní adresy.' : 'Z pracovní adresy zatím odesílat nejde.') + '</p>';
  }
  h += '<details class="napoveda"><summary>Jak dostat pracovní poštu do aplikace</summary><ol>' +
    '<li>WEDOS WebMail → Nastavení → Filtry → Vytvořit: Všechny zprávy, akce <b>Přeposlat zprávu na</b> tvůj Gmail a tlačítkem + druhá akce ' +
    '<b>Zkopírovat zprávu do → Příchozí pošta</b> (jinak WEDOS přeposlané maže). Gmail sám poštu z jiných serverů od 2026 nestahuje.</li>' +
    '<li>V Gmailu: Nastavení → Účty a import → <b>Přidat další e-mailovou adresu</b> (Odesílat poštu jako) → SMTP serveru WEDOS ' +
    '(wes1-smtp.wedos.net, login celá adresa, heslo zadáš jen ty).</li>' +
    '<li>Sem napiš pracovní adresu a ulož. Aplikace pak pracovní poštu oddělí a odpovídá z ní.</li></ol>' +
    '<p>Přeposíláním se firemní e-maily ukládají i v osobním účtu Google – je to rozhodnutí firmy, ne aplikace.</p></details>';
  return h + '</section>';
}

function sekceKalendaru() {
  const kalendare = (stav.info && stav.info.kalendare) || [];
  let h = '<section class="card nast-sekce" data-sekce="kalendare"><h3>Kalendáře</h3>';
  if (kalendare.length) {
    h += '<ul class="kal-polozky">' + kalendare.map((k) => '<li class="kal-polozka" style="--b:' + esc(k.barva) + '"><i class="tecka-kal"></i>' +
      '<span class="grow"><b>' + esc(k.nazev) + '</b><small>' + (k.zdroj === 'icloud' ? 'z iPhonu (iCloud) · jen čtení' : 'Google' + (k.zapis ? ' · zápis' : ' · jen čtení')) + '</small></span>' +
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
    zapasyHtml(false);
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

function nastaveniHtml() {
  return '<div class="nast">' + sekcePripojeni() + sekcePosty() + sekceKalendaru() + sekceVzhledu() + sekceAplikace() + '</div>';
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
    zkusPripojit(panel, el).then((ok) => { if (ok) { toast('Připojeno ✓'); location.reload(); } });
    return true;
  }
  if (akce === 'odpojit') {
    potvrd('Odpojit toto zařízení?', { text: 'Smaže se adresa motoru, klíč i uložená data v tomhle zařízení. Na ostatních zařízeních se nic nemění.',
      ton: 'nebezpeci', ano: 'Odpojit' }).then((ano) => {
      if (!ano) return;
      uloziste.klice('asistent.').forEach((k) => uloziste.smaz(k));
      zapomenPripojeni();
      location.reload();
    });
    return true;
  }
  if (akce === 'smazat-data') {
    uloziste.klice('asistent.data.').concat(uloziste.klice('asistent.koncept.')).forEach((k) => uloziste.smaz(k));
    toast('Uložená data smazána');
    setTimeout(() => location.reload(), 600);
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
  if (!t.dataset || !t.dataset.nastKalZobrazit) return false;
  volej('kalendarUpravit', { id: t.dataset.nastKalZobrazit, skryty: !t.checked })
    .then(poZmeneKalendaru)
    .catch((chyba) => { t.checked = !t.checked; toast(chyba.message, true); });
  return true;
}
