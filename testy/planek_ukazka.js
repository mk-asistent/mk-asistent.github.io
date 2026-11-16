// Ukázka plánku cviku: 4 vymyšlené plánky jen ke čtení + editor (testy/planek_ukazka.html).
import { planekSvg, novyPlanek } from '../js/planek.js';
import { vytvorEditor } from '../js/planek_editor.js';

const PLANY = [
  {
    nazev: 'Přihrávkové ypsilon',
    kroky: ['A přihraje B.', 'B vrátí A.', 'A pošle dlouhý míč do C.', 'B si naběhne na místo C, C vede míč do středu.'],
    planek: {
      vyrez: [0, 0, 30, 20], hriste: 'trava',
      prvky: [
        { t: 'cone', x: 3, y: 10 }, { t: 'cone', x: 14, y: 10 }, { t: 'cone', x: 25, y: 4 }, { t: 'cone', x: 25, y: 16 },
        { t: 'p', side: 'home', x: 3, y: 11.5, num: 'A' }, { t: 'p', side: 'home', x: 14, y: 11.5, num: 'B' },
        { t: 'p', side: 'home', x: 25, y: 5.5, num: 'C' }, { t: 'p', side: 'home', x: 25, y: 14.5, num: 'D' },
        { t: 'ball', x: 4.3, y: 12.4 },
        { t: 'pass', x1: 4.5, y1: 11.5, x2: 12.5, y2: 11.5, krok: 1 },
        { t: 'pass', x1: 12.5, y1: 12.5, x2: 4.8, y2: 13, by: 2, krok: 2 },
        { t: 'pass', x1: 5, y1: 10.5, x2: 23.5, y2: 5.5, by: -3, krok: 3 },
        { t: 'run', x1: 15, y1: 10.5, x2: 23.5, y2: 4.2, krok: 4 },
        { t: 'dribble', x1: 25, y1: 7, x2: 18, y2: 9.5, krok: 4 }
      ]
    }
  },
  {
    nazev: 'Zakončení ve vápně',
    kroky: ['1 přihraje žolíkovi.', '1 oběhne figuríny.', 'Žolík vrátí do běhu.', '1 zakončí na první dotek.'],
    planek: {
      vyrez: [74, 8, 33, 52], hriste: 'cary',
      prvky: [
        { t: 'goal', id: 'b1', x: 105, y: 34, w: 7.32, rot: 180 },
        { t: 'p', id: 'gk', side: 'away', gk: true, x: 103.6, y: 34, num: 'B' },
        { t: 'mannequin', id: 'f1', x: 89, y: 30 }, { t: 'mannequin', id: 'f2', x: 89, y: 33 }, { t: 'mannequin', id: 'f3', x: 89, y: 36 },
        { t: 'cone', id: 'k1', x: 77, y: 36.5 },
        { t: 'p', id: 'a1', side: 'home', x: 78, y: 34, num: '1' },
        { t: 'ball', id: 'm1', x: 79.3, y: 35 },
        { t: 'p', id: 'n1', side: 'neutral', x: 90, y: 45, num: 'N' },
        { t: 'pass', id: 'c1', x1: 79.5, y1: 35.5, x2: 88.6, y2: 44, krok: 1 },
        { t: 'run', id: 'c2', x1: 79, y1: 32.5, x2: 93.5, y2: 38.5, bx: -1, by: -9, krok: 2 },
        { t: 'pass', id: 'c3', x1: 90.5, y1: 43.4, x2: 94.5, y2: 39.4, krok: 3 },
        { t: 'shot', id: 'c4', x1: 95.5, y1: 38.4, x2: 104.6, y2: 31.8, krok: 4 }
      ]
    }
  },
  {
    nazev: 'Rondo 4 na 2',
    kroky: ['Přihrávka po obvodu.', 'Bránící zdvojí na míč.', 'Přihrávka středem mezi bránící.'],
    planek: {
      vyrez: [0, 0, 16, 16], hriste: 'trava',
      prvky: [
        { t: 'zone', x: 2, y: 2, w: 12, h: 12 },
        { t: 'cone', x: 2, y: 2 }, { t: 'cone', x: 14, y: 2 }, { t: 'cone', x: 2, y: 14 }, { t: 'cone', x: 14, y: 14 },
        { t: 'p', side: 'home', x: 8, y: 2, num: '1' }, { t: 'p', side: 'home', x: 14, y: 8, num: '2' },
        { t: 'p', side: 'home', x: 8, y: 14, num: '3' }, { t: 'p', side: 'home', x: 2, y: 8, num: '4' },
        { t: 'p', side: 'away', x: 7, y: 6.5, num: '5' }, { t: 'p', side: 'away', x: 9.5, y: 9.5, num: '6' },
        { t: 'ball', x: 8.9, y: 2.8 },
        { t: 'pass', x1: 8.8, y1: 2.8, x2: 13.2, y2: 7.2, krok: 1 },
        { t: 'run', x1: 9.9, y1: 8.9, x2: 12.4, y2: 7.6, krok: 2 },
        { t: 'run', x1: 7.7, y1: 6.2, x2: 11.2, y2: 6.3, krok: 2 },
        { t: 'pass', x1: 13.3, y1: 8.8, x2: 3, y2: 8.6, by: 1.8, krok: 3 }
      ]
    }
  },
  {
    nazev: 'Roh nakrátko',
    kroky: ['Rohový kop nakrátko na 2.', '2 vede míč k vápnu.', '3 si naběhne na první tyč.', '2 centruje.', '3 zakončí.'],
    planek: {
      vyrez: [50.5, -2, 57.5, 72], hriste: 'cary',
      prvky: [
        { t: 'goal', x: 105, y: 34, w: 7.32, rot: 180 },
        { t: 'p', side: 'away', gk: true, x: 103.8, y: 34, num: 'B' },
        { t: 'p', side: 'home', x: 104.4, y: 67.4, num: '1' }, { t: 'ball', x: 103.4, y: 66.6 },
        { t: 'p', side: 'home', x: 98, y: 63, num: '2' },
        { t: 'p', side: 'home', x: 91, y: 46, num: '3' }, { t: 'p', side: 'home', x: 89, y: 27, num: '4' }, { t: 'p', side: 'home', x: 83, y: 37, num: '5' },
        { t: 'p', side: 'away', x: 101, y: 43, num: '6' }, { t: 'p', side: 'away', x: 94, y: 33, num: '7' }, { t: 'p', side: 'away', x: 98, y: 58, num: '8' },
        { t: 'pass', x1: 103, y1: 66.2, x2: 99.6, y2: 63.6, krok: 1 },
        { t: 'dribble', x1: 97.6, y1: 61.3, x2: 94, y2: 53, krok: 2 },
        { t: 'run', x1: 92.5, y1: 44, x2: 99.5, y2: 38.5, bx: -1, by: 1, krok: 3 },
        { t: 'pass', x1: 94.6, y1: 51.6, x2: 100.6, y2: 39.6, by: 1, krok: 4 },
        { t: 'shot', x1: 100, y1: 36.6, x2: 104.8, y2: 32.6, krok: 5 },
        { t: 'text', x: 70, y: 20, text: 'Roh nakrátko' }
      ]
    }
  }
];

const esc = (s) => String(s).replace(/[&<>"]/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[z]));

document.getElementById('uk-plany').innerHTML = PLANY.map((p) =>
  `<li class="uk-karta"><h3>${esc(p.nazev)}</h3>${planekSvg(p.planek, { legenda: true })}<ol>${p.kroky.map((k) => `<li>${esc(k)}</li>`).join('')}</ol></li>`).join('');

const vystup = document.getElementById('uk-vystup');
const start = novyPlanek('obdelnik');
start.prvky.push({ t: 'p', side: 'home', x: 6, y: 10, num: '1' }, { t: 'cone', x: 24, y: 10 });
window.__planek = { zmeny: [] };
window.__planek.editor = vytvorEditor(document.getElementById('uk-editor'), start, {
  onZmena(p) { window.__planek.zmeny.push(p); vystup.textContent = JSON.stringify(p, null, 1); }
});
vystup.textContent = JSON.stringify(window.__planek.editor.planek(), null, 1);

document.getElementById('uk-motiv').addEventListener('click', () => {
  const h = document.documentElement;
  const tmavy = h.dataset.motiv === 'tmavy' || (!h.dataset.motiv && matchMedia('(prefers-color-scheme: dark)').matches);
  h.dataset.motiv = tmavy ? 'svetly' : 'tmavy';
});
