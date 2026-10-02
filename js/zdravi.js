// Zdraví: WHOOP (připravenost, spánek, zátěž) + Apple Watch (kroky, pohyb, tréninky) – přes motor.
// Rozpracované: plná sekce přibude v další verzi; zatím jen rozhraní, které volá app.js.

import { stav, zmeneno, umiMotor } from './stav.js';
import { volej } from './api.js';
import { uloziste } from './pomocne.js';

const ULOZISTE = 'asistent.data.zdravi';

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.zdravi = v.data;
}

export function nactiZdravi(znovu) {
  if (!umiMotor('zdravi') || stav.nacita.zdravi) return Promise.resolve();
  stav.nacita.zdravi = true;
  stav.chyby.zdravi = null;
  zmeneno();
  return volej('zdravi', { znovu: !!znovu })
    .then((data) => { stav.zdravi = data; uloziste.pis(ULOZISTE, { data, kdy: Date.now() }); })
    .catch((e) => { stav.chyby.zdravi = e; })
    .then(() => { stav.nacita.zdravi = false; zmeneno(); });
}

export function dotahni() {
  if (umiMotor('zdravi') && !stav.zdravi && !stav.nacita.zdravi && !stav.chyby.zdravi) nactiZdravi();
}

export function maData() { return false; }

export function kartaZdravi() { return { nazev: 'Zdraví', hodnota: '–', jednotka: '', pod: '' }; }

export function vykresliZdravi(el) { el.innerHTML = '<div class="card"><div class="prazdne">Zdraví se připravuje.</div></div>'; }
