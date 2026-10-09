// Plakát FK Agro Vnorovy – data převzatá z webu dorostu (assets/js/plakat-data.js, 9. 10. 2026): znaky klubů, výchozí
// názvy týmů a soutěží, pořadí kol podzimu 2026 a zápasy mládeže (žáci, přípravky) z rozlosování.
// A-tým, B-tým a dorost se tu záměrně nevedou – berou se z fotbal.cz (stav.fotbal); jejich řádky z rozlosování na webu
// dorostu jsou zastaralé (přeložené zápasy). Co Michal změní v aplikaci, drží motor (nastavení, ruční úpravy kol).

// znaky v plakat/znaky/ (58 souborů; krivky.png a veseli-nad-moravou.png jsou zatím bajtově stejné – nechané oba)
export const LOGA = ['agroken-dorost.png', 'blatnice.jpg', 'breclav.png', 'brumovice.png', 'bzenec.jpg',
  'charvatska-nova-ves.jpg', 'damborice.jpg', 'dolni-bojanovice.jpg', 'domanin.png',
  'dubnany.png', 'hodonin.png', 'hroznova-lhota.png', 'hruba-vrbka.png', 'knezdub.png',
  'kostelec.jpg', 'kozojidky.png', 'krivky.png', 'krumvir.png', 'kyjov.png', 'lanzhot.png',
  'lipov.png', 'luzice.jpg', 'lysovice.png', 'milotice.png', 'moravsky-pisek.png',
  'mutenice.png', 'nasedlovice.jpg', 'nikolcice.png', 'nova-lhota.jpg', 'orechov.png',
  'petrov.jpg', 'poddvorov.png', 'podluzi.png', 'podoli.png', 'prusanky.png',
  'ratiskovice.jpg', 'rohatec.png', 'sardice.jpg', 'slatina.png', 'start-brno.png',
  'straznice.jpg', 'suchov.jpg', 'temice.png', 'tesany.jpg', 'tvarozna-lhota.png',
  'uhersky-brod.png', 'vacenovice.png', 'velka-nad-velickou.png', 'velke-pavlovice.png',
  'veseli-nad-moravou.png', 'vnorovy.png', 'vojkovice.png', 'vyskov.png', 'zadovice.jpg',
  'zarazice.png', 'zdanice.jpg', 'zeravice.png', 'zidlochovice.jpg'];

// klíče jako týmy ve fotbal.cz (stav.fotbal.data.tymy[].klic) – pořadí = pořadí dlaždic a řádků na plakátu
export const TYMY = { A: 'A-TÝM', B: 'BENFIKA', dorost: 'DOROST' };
export const SOUTEZE = {
  A: '6. LIGA DOSPĚLÍ JMKFS (B)',
  B: '9. LIGA DOSPĚLÍ SK. C',
  dorost: '5. LIGA STARŠÍHO DOROSTU JMKFS (C)'
};

/** Výchozí nastavení plakátu – motor drží jen to, co Michal změní (akce plakatNastaveni). */
export const NASTAVENI = {
  tymy: TYMY, souteze: SOUTEZE, misto: 'AGRO ARÉNA VNOROVY', nadpis: 'PROGRAM VÍKENDU',
  vyzva: 'PŘIJĎTE PODPOŘIT NAŠE KLUKY!', podtitul: 'Děkujeme všem našim fanouškům za podporu!',
  nasZnak: 'vnorovy.png', instagram: 'fkagrovnorovy', aliasy: {},
  popiskyOd: '2026-10-17' // od kterého víkendu motor sám žádá Clauda o popisky (jako PLAKATY_POPISKY_OD v motoru)
};

// Soupeři z fotbal.cz, jejichž znak nejde poznat podle obce (klíč = název velkými, bez písmena družstva).
// Ostatní se najdou samy: název obce bez diakritiky s pomlčkami (velka-nad-velickou.png), .png i .jpg.
export const ALIASY = {
  'SLAVOJ VELKÉ PAVLOVICE': 'velke-pavlovice.png', 'SLAVOJ ROHATEC': 'rohatec.png',
  'BANÍK DUBŇANY': 'dubnany.png', 'BANÍK RATÍŠKOVICE': 'ratiskovice.jpg',
  'FKM PODLUŽÍ': 'podluzi.png', 'PODLUŽÍ': 'podluzi.png', 'PODLUŽAN PRUŠÁNKY': 'prusanky.png',
  'MSK BŘECLAV': 'breclav.png', 'KYJOV 1919': 'kyjov.png',
  'VESELÍ N. MORAVOU': 'veseli-nad-moravou.png', 'VESELÍ N.M.': 'veseli-nad-moravou.png', 'VESELÍ': 'veseli-nad-moravou.png',
  'VELKÁ N. VELIČKOU': 'velka-nad-velickou.png', 'VELKÁ': 'velka-nad-velickou.png',
  'HR. LHOTA': 'hroznova-lhota.png', 'BZENEC-VRACOV': 'bzenec.jpg', 'START BRNO': 'start-brno.png',
  'AGROKEN': 'agroken-dorost.png'
};

// 13 víkendů podzimu 2026 (sobota) – „10. kolo“ = 10. víkend podzimu = 17.–18. 10. (jako kola na webu dorostu)
export const KOLA = ['2026-08-15', '2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26',
  '2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07'];

/* Mládež z rozlosování podzimu 2026 (jen žáci a přípravky) po víkendech (klíč = sobota):
     doma:  [kategorie, soupeř, znak, den, čas]
     venku: [kategorie, soupeř, znak, den + čas]
     tyden: [kategorie, hrajeme doma?, soupeř, den a datum, čas]   – zápasy mimo víkend (blok V TÝDNU)
   Verzálky jako na plakátu; sdružené družstvo má znak jednoho z klubů. */
export const MLADEZ = {
  '2026-08-15': { doma: [], venku: [], tyden: [] },

  /* POZOR (z webu dorostu): zápasy starších a mladších žáků s Rohatcem se tento víkend nehrají – přeloženy na
     ČT 10. 9. cca 17:00 (v rozlosování u nich bylo místo data „???“). Až Michal termín potvrdí, patří jako zápasy
     mimo víkend na plakát 5.–6. 9. do bloku V TÝDNU. */
  '2026-08-22': { doma: [],
    venku: [['ST. PŘÍPRAVKA', 'HODONÍN B', 'hodonin.png', 'SO 10:00'],
      ['ML. PŘÍPRAVKA', 'TĚMICE B', 'temice.png', 'SO 10:00']], tyden: [] },

  '2026-08-29': {
    doma: [['ST. PŘÍPRAVKA', 'BLATNICE', 'blatnice.jpg', 'NEDĚLE', '14:00'],
      ['ML. PŘÍPRAVKA', 'BLATNICE', 'blatnice.jpg', 'NEDĚLE', '14:00']],
    venku: [['ST. ŽÁCI', 'MILOTICE/SVATOBOŘICE', 'milotice.png', 'SO 14:30'],
      ['ML. ŽÁCI', 'VELKÁ/BLATNICE', 'velka-nad-velickou.png', 'SO 10:00']],
    tyden: [['ST. ŽÁCI', false, 'HR. LHOTA/LIPOV', 'ST 2. 9.', '17:30']] },

  '2026-09-05': {
    doma: [['ST. ŽÁCI', 'PETROV', 'petrov.jpg', 'SOBOTA', '14:00'],
      ['ML. ŽÁCI', 'BZENEC-VRACOV B', 'bzenec.jpg', 'SOBOTA', '12:30']],
    venku: [['ST. PŘÍPRAVKA', 'HR. LHOTA', 'hroznova-lhota.png', 'SO 10:00'],
      ['ML. PŘÍPRAVKA', 'HR. LHOTA', 'hroznova-lhota.png', 'NE 10:00']],
    tyden: [['ML. PŘÍPRAVKA', true, 'LIPOV', 'ÚT 8. 9.', '16:30']] },

  '2026-09-12': {
    doma: [['ST. PŘÍPRAVKA', 'KNĚŽDUB', 'knezdub.png', 'NEDĚLE', '10:00'],
      ['ML. PŘÍPRAVKA', 'KNĚŽDUB', 'knezdub.png', 'NEDĚLE', '10:00']],
    venku: [['ST. ŽÁCI', 'NÁSEDLOVICE/ŽAROŠICE', 'nasedlovice.jpg', 'NE 13:30'],
      ['ML. ŽÁCI', 'ŽÁDOVICE/JEŽOV', 'zadovice.jpg', 'NE 14:00']], tyden: [] },

  '2026-09-19': {
    doma: [['ST. ŽÁCI', 'LUŽICE', 'luzice.jpg', 'SOBOTA', '13:30']],
    venku: [['ST. PŘÍPRAVKA', 'STRÁŽNICE', 'straznice.jpg', 'NE 10:00'],
      ['ML. PŘÍPRAVKA', 'STRÁŽNICE', 'straznice.jpg', 'NE 10:00']], tyden: [] },

  '2026-09-26': {
    doma: [['ST. PŘÍPRAVKA', 'VESELÍ NAD MORAVOU', 'veseli-nad-moravou.png', 'SOBOTA', '16:00'],
      ['ML. PŘÍPRAVKA', 'VESELÍ NAD MORAVOU', 'veseli-nad-moravou.png', 'SOBOTA', '16:00']],
    venku: [['ST. ŽÁCI', 'ŽDÁNICE', 'zdanice.jpg', 'NE 13:15'],
      ['ML. ŽÁCI', 'ZARAZICE', 'zarazice.png', 'NE 10:00']],
    tyden: [['ML. PŘÍPRAVKA', false, 'BZENEC-VRACOV B', 'ST 30. 9.', '17:00']] },

  '2026-10-03': {
    doma: [['ST. ŽÁCI', 'TĚMICE', 'temice.png', 'NEDĚLE', '10:45'],
      ['ML. ŽÁCI', 'TĚMICE', 'temice.png', 'NEDĚLE', '9:15'],
      ['ST. PŘÍPRAVKA', 'PETROV', 'petrov.jpg', 'SOBOTA', '10:00'],
      ['ML. PŘÍPRAVKA', 'PETROV', 'petrov.jpg', 'SOBOTA', '10:00']],
    venku: [], tyden: [] },

  '2026-10-10': { doma: [],
    venku: [['ST. ŽÁCI', 'STRÁŽNICE/VESELÍ', 'straznice.jpg', 'SO 9:00'],
      ['ML. ŽÁCI', 'STRÁŽNICE/VESELÍ', 'straznice.jpg', 'SO 11:00'],
      ['ST. PŘÍPRAVKA', 'VELKÁ N. VELIČKOU', 'velka-nad-velickou.png', 'NE 10:00'],
      ['ML. PŘÍPRAVKA', 'VELKÁ N. VELIČKOU', 'velka-nad-velickou.png', 'NE 10:00']], tyden: [] },

  '2026-10-17': {
    doma: [['ST. ŽÁCI', 'RATÍŠKOVICE B', 'ratiskovice.jpg', 'NEDĚLE', '12:15'],
      ['ST. PŘÍPRAVKA', 'LIPOV', 'lipov.png', 'NEDĚLE', '10:00'],
      ['ML. PŘÍPRAVKA', 'TĚMICE A', 'temice.png', 'NEDĚLE', '10:00']],
    venku: [],
    tyden: [['ML. ŽÁCI', false, 'HR. LHOTA/LIPOV', 'PÁ 16. 10.', '16:45']] },

  '2026-10-24': { doma: [],
    venku: [['ST. ŽÁCI', 'VACENOVICE', 'vacenovice.png', 'SO 14:30'],
      ['ST. PŘÍPRAVKA', 'ROHATEC', 'rohatec.png', 'SO 10:00']], tyden: [] },

  '2026-10-31': {
    doma: [['ST. PŘÍPRAVKA', 'TĚMICE', 'temice.png', 'NEDĚLE', '11:00'],
      ['ML. PŘÍPRAVKA', 'ZARAZICE', 'zarazice.png', 'NEDĚLE', '11:00']],
    venku: [['ST. ŽÁCI', 'BLATNICE/VELKÁ', 'velka-nad-velickou.png', 'NE 13:30']], tyden: [] },

  '2026-11-07': {
    doma: [['ST. ŽÁCI', 'KOSTELEC', 'kostelec.jpg', 'SOBOTA', '11:30']],
    venku: [], tyden: [] }
};
