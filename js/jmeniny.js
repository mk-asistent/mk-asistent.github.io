// Jmeniny (český občanský kalendář) a oblíbení lidé, jejichž svátek se v kalendáři zvýrazní – bez upozornění.
// Zdroj: česká Wikipedie, stránky dnů v roce, oddíl Svátky → Česko, první řádek (5. 10. 2026). Opraveno ručně: dny se
// státním svátkem bez jména (1. 1., 1. 5., 8. 5., 6. 7., 28. 10., 2. 11., 25. 12.) a dny, kde Wikipedie místo jména
// uvádí pranostiku (1. 11., 4. 11., 16. 11.); 30. 4. Blahoslav, 5. 7. Cyril a Metoděj, 29. 6. Petr a Pavel.
// První jméno se ukazuje, další podoby slouží k poznání oblíbených (Honza → napiš Jan).

export const JMENINY = {
  '01-01': '', '01-02': 'Karina, Karin', '01-03': 'Radmila, Radomila', '01-04': 'Diana', '01-05': 'Dalimil, Dalimír, Dalimíra',
  '01-06': 'Tři králové', '01-07': 'Vilma, Viléma, Vilemína, Mína', '01-08': 'Čestmír, Čestmíra', '01-09': 'Vladan, Vladana, Vladivoj',
  '01-10': 'Břetislav, Břetislava, Bratislav', '01-11': 'Bohdana', '01-12': 'Pravoslav, Pravoslava, Pravdomil, Pravdomila, Pravomil, Pravomila',
  '01-13': 'Edita', '01-14': 'Radovan, Radan, Radúz, Radvan', '01-15': 'Alice', '01-16': 'Ctirad, Česlav, Ctirada, Ctislav, Ctislava',
  '01-17': 'Drahoslav, Drahoň, Drahoš, Draslav', '01-18': 'Vladislav, Vladislava', '01-19': 'Doubravka, Doubrava', '01-20': 'Ilona',
  '01-21': 'Běla, Bianka, Albena', '01-22': 'Slavomír, Slavomíra, Slavomil, Slavomila, Slávek', '01-23': 'Zdeněk, Zdeslav, Zdík',
  '01-24': 'Milena', '01-25': 'Miloš, Milík, Miloň, Milota, Milouš, Milutín', '01-26': 'Zora, Zoran, Zoroslav, Zoroslava',
  '01-27': 'Ingrid, Ingrida, Ingeborg, Ingeborga, Inka', '01-28': 'Otýlie', '01-29': 'Zdislava, Zdislav, Zdeslava, Zdeslav, Zdík',
  '01-30': 'Robin', '01-31': 'Marika',
  '02-01': 'Hynek, Jasmína', '02-02': 'Nela', '02-03': 'Blažej', '02-04': 'Jarmila', '02-05': 'Dobromila, Dobromil, Dobromír, Dobromíra, Dobrava',
  '02-06': 'Vanda', '02-07': 'Veronika, Verona', '02-08': 'Milada', '02-09': 'Apolena', '02-10': 'Mojmír', '02-11': 'Božena',
  '02-12': 'Slavěna, Slávka', '02-13': 'Věnceslav, Věnceslava, Věnek, Věnka', '02-14': 'Valentýn, Valentin, Valentina, Valentýna',
  '02-15': 'Jiřina', '02-16': 'Ljuba', '02-17': 'Miloslava', '02-18': 'Gizela, Gisela', '02-19': 'Patrik', '02-20': 'Oldřich, Ulrich',
  '02-21': 'Lenka, Lena, Leonora, Eleonora', '02-22': 'Petr, Petronius', '02-23': 'Svatopluk, Svatoboj, Svatobor, Svatoslav',
  '02-24': 'Matěj, Matyáš', '02-25': 'Liliana', '02-26': 'Dorota, Dora, Doris', '02-27': 'Alexandr', '02-28': 'Lumír, Lumíra',
  '02-29': 'Horymír, Horymíra, Majoš',
  '03-01': 'Bedřich', '03-02': 'Anežka, Ines, Inesa, Inéz', '03-03': 'Kamil', '03-04': 'Stela, Estela', '03-05': 'Kazimír, Kazi, Kazimíra',
  '03-06': 'Miroslav, Mirek, Mirko, Miromil', '03-07': 'Tomáš, Tomáška, Tomislav', '03-08': 'Gabriela', '03-09': 'Františka',
  '03-10': 'Viktorie', '03-11': 'Anděla, Anděl, Andělín, Andělína, Angela, Angelika', '03-12': 'Řehoř, Řehořka',
  '03-13': 'Růžena, Rosa, Rozálie, Rozana, Rozina, Rozita', '03-14': 'Rút', '03-15': 'Ida', '03-16': 'Elena',
  '03-17': 'Vlastimil, Vlastimila, Vlastimír, Vlastimíra', '03-18': 'Eduard, Eduarda, Edvard, Edvarda', '03-19': 'Josef, Josefa, Josefína',
  '03-20': 'Světlana, Světla', '03-21': 'Radek, Radegast, Radhost, Radko, Radoš, Rajko', '03-22': 'Leona, Lea, Leokádie, Leon, Leontina',
  '03-23': 'Ivona', '03-24': 'Gabriel', '03-25': 'Marian, Mario, Marius', '03-26': 'Emanuel, Emanuela, Manuel, Manuela', '03-27': 'Dita',
  '03-28': 'Soňa', '03-29': 'Taťána, Táňa', '03-30': 'Arnošt, Arnoštka, Arna, Arne, Ernst, Ernest', '03-31': 'Kvido',
  '04-01': 'Hugo', '04-02': 'Erika', '04-03': 'Richard, Richarda', '04-04': 'Ivana', '04-05': 'Miroslava, Miromila, Mnislava, Myrna',
  '04-06': 'Vendula, Vendulka, Venuše', '04-07': 'Heřman, Hermína', '04-08': 'Ema', '04-09': 'Dušan, Dušana', '04-10': 'Darja, Daria, Darie',
  '04-11': 'Izabela, Isabela', '04-12': 'Julius, Julián', '04-13': 'Aleš, Aleška', '04-14': 'Vincent, Vincenc, Vincencie',
  '04-15': 'Anastázie, Anastáz, Stáza, Nastasja, Nasťa', '04-16': 'Irena, Irenej, Ireneus', '04-17': 'Rudolf, Rudolfa, Rudolfína',
  '04-18': 'Valérie, Valerián', '04-19': 'Rostislav, Rostislava, Rastislav, Rastislava', '04-20': 'Marcela, Marcelína',
  '04-21': 'Alexandra, Saskia, Saskie', '04-22': 'Evženie, Eugenie', '04-23': 'Vojtěch, Vojtěška', '04-24': 'Jiří', '04-25': 'Marek',
  '04-26': 'Oto, Ota', '04-27': 'Jaroslav', '04-28': 'Vlastislav, Vlastislava', '04-29': 'Robert, Roberta', '04-30': 'Blahoslav, Blahomil, Blahomír',
  '05-01': '', '05-02': 'Zikmund', '05-03': 'Alexej', '05-04': 'Květoslav, Květoň, Květoš', '05-05': 'Klaudie',
  '05-06': 'Radoslav, Radoslava, Radislav, Radislava, Radslava', '05-07': 'Stanislav, Stanimír, Stojan, Stojmír', '05-08': '', '05-09': 'Ctibor',
  '05-10': 'Blažena', '05-11': 'Svatava, Svatoslava', '05-12': 'Pankrác', '05-13': 'Servác', '05-14': 'Bonifác', '05-15': 'Žofie, Sofie',
  '05-16': 'Přemysl', '05-17': 'Aneta', '05-18': 'Nataša', '05-19': 'Ivo', '05-20': 'Zbyšek, Zbyslav, Zbislav, Zbyhněv', '05-21': 'Monika, Mona',
  '05-22': 'Emil, Emilián', '05-23': 'Vladimír, Vladimíra, Vladěna', '05-24': 'Jana, Johana', '05-25': 'Viola, Violeta',
  '05-26': 'Filip, Filipa, Hermiona', '05-27': 'Valdemar, Valdemara', '05-28': 'Vilém, Vilibald, Vilmar', '05-29': 'Maxmilián, Maxim, Max, Maxima',
  '05-30': 'Ferdinand, Ferdinanda', '05-31': 'Kamila, Mila',
  '06-01': 'Laura, Laurencie', '06-02': 'Jarmil, Jaromil', '06-03': 'Tamara', '06-04': 'Dalibor, Dalibora', '06-05': 'Dobroslav, Dobroslava',
  '06-06': 'Norbert, Norberta, Norman', '06-07': 'Iveta', '06-08': 'Medard', '06-09': 'Stanislava', '06-10': 'Gita', '06-11': 'Bruno',
  '06-12': 'Antonie', '06-13': 'Antonín, Antal', '06-14': 'Roland', '06-15': 'Vít, Víta', '06-16': 'Zbyněk, Zbyňka, Zbyhněv, Zbyhněva, Zbyslava, Zbyška',
  '06-17': 'Adolf, Adolfa, Adolfína', '06-18': 'Milan, Milana', '06-19': 'Leoš, Leo, Leon, Leonard, Leonid, Leontýn, Lionel',
  '06-20': 'Květa, Květuše', '06-21': 'Alois, Aloisie', '06-22': 'Pavla', '06-23': 'Zdeňka, Zdena', '06-24': 'Jan', '06-25': 'Ivan',
  '06-26': 'Adriana, Adrian', '06-27': 'Ladislav, Ladislava', '06-28': 'Lubomír, Lubomíra', '06-29': 'Petr a Pavel', '06-30': 'Šárka',
  '07-01': 'Jaroslava', '07-02': 'Patricie', '07-03': 'Radomír, Radomíra, Radimír, Radimíra', '07-04': 'Prokop, Prokopa',
  '07-05': 'Cyril a Metoděj', '07-06': '', '07-07': 'Bohuslava', '07-08': 'Nora', '07-09': 'Drahoslava, Drahuše', '07-10': 'Libuše',
  '07-11': 'Olga, Helga', '07-12': 'Bořek, Bořislav, Bořislava', '07-13': 'Markéta, Margita', '07-14': 'Karolína, Karla', '07-15': 'Jindřich',
  '07-16': 'Luboš', '07-17': 'Martina, Arleta', '07-18': 'Drahomíra, Drahomír, Drahomila, Drahomil', '07-19': 'Čeněk, Čeňka',
  '07-20': 'Ilja, Iljana', '07-21': 'Vítězslav, Vítězslava, Vítoslav', '07-22': 'Magdaléna, Magda', '07-23': 'Libor, Libora',
  '07-24': 'Kristýna, Kristán, Křišťan', '07-25': 'Jakub, Jakuba, Jakubka', '07-26': 'Anna', '07-27': 'Věroslav', '07-28': 'Viktor, Viktorín',
  '07-29': 'Marta', '07-30': 'Bořivoj, Bořislava', '07-31': 'Ignác, Ignácie',
  '08-01': 'Oskar', '08-02': 'Gustav, Gustava', '08-03': 'Miluše', '08-04': 'Dominik, Dominika', '08-05': 'Kristián', '08-06': 'Oldřiška',
  '08-07': 'Lada', '08-08': 'Soběslav, Soběslava, Soběbor', '08-09': 'Roman, Romeo, Romul, Romulus',
  '08-10': 'Vavřinec, Lars, Laurenc, Lorenc, Laurentýn, Laurentin, Laurentinus', '08-11': 'Zuzana', '08-12': 'Klára', '08-13': 'Alena',
  '08-14': 'Alan, Alen, Sylva', '08-15': 'Hana', '08-16': 'Jáchym, Joachim', '08-17': 'Petra, Petronila, Petronela, Petruše',
  '08-18': 'Helena, Ela, Elena', '08-19': 'Ludvík, Ludivoj', '08-20': 'Bernard, Bernarda, Beno', '08-21': 'Johana',
  '08-22': 'Bohuslav, Bohuchval, Bohun, Bohuš, Božislav', '08-23': 'Sandra', '08-24': 'Bartoloměj, Natanael', '08-25': 'Radim',
  '08-26': 'Luděk, Ludiše, Luďka', '08-27': 'Otakar, Otakara, Otokar', '08-28': 'Augustin, August, Augusta, Augustýna', '08-29': 'Evelína',
  '08-30': 'Vladěna', '08-31': 'Pavlína',
  '09-01': 'Linda, Lina', '09-02': 'Adéla', '09-03': 'Bronislav, Bronislava', '09-04': 'Jindřiška, Jindra', '09-05': 'Boris',
  '09-06': 'Boleslav, Boleslava', '09-07': 'Regina, Gina', '09-08': 'Mariana', '09-09': 'Daniela', '09-10': 'Irma, Irmina',
  '09-11': 'Denisa, Denis, Dionýzie', '09-12': 'Marie, Marieta, Marion, Marita, Marlena, Marisa', '09-13': 'Lubor',
  '09-14': 'Radka, Radoslava, Radslava, Radislava', '09-15': 'Jolana', '09-16': 'Ludmila, Lidmila', '09-17': 'Naděžda, Naďa',
  '09-18': 'Kryštof', '09-19': 'Zita', '09-20': 'Oleg', '09-21': 'Matouš', '09-22': 'Darina', '09-23': 'Berta', '09-24': 'Jaromír, Jaromíra',
  '09-25': 'Zlata, Zlatan, Zlatko, Zlatomíra, Zlatuše', '09-26': 'Andrea', '09-27': 'Jonáš', '09-28': 'Václav, Václava', '09-29': 'Michal, Michael',
  '09-30': 'Jeroným',
  '10-01': 'Igor, Ivar, Ivor', '10-02': 'Olívie, Oliver', '10-03': 'Bohumil, Bohun, Bohuslav, Bohuš', '10-04': 'František, Fráňa, Franc',
  '10-05': 'Eliška, Elza', '10-06': 'Hanuš', '10-07': 'Justýna', '10-08': 'Věra, Věroslava', '10-09': 'Štefan', '10-10': 'Marina',
  '10-11': 'Andrej', '10-12': 'Marcel', '10-13': 'Renata, Renáta', '10-14': 'Agáta', '10-15': 'Tereza, Terezie, Thea', '10-16': 'Havel, Gál',
  '10-17': 'Hedvika, Heda', '10-18': 'Lukáš', '10-19': 'Michaela, Michael', '10-20': 'Vendelín, Vendelína', '10-21': 'Brigita, Berit, Birgita, Brita',
  '10-22': 'Sabina', '10-23': 'Teodor, Teodorik, Theodor', '10-24': 'Nina', '10-25': 'Beáta', '10-26': 'Erik, Erich', '10-27': 'Šarlota, Zoe',
  '10-28': '', '10-29': 'Silvie, Silvána, Sylva', '10-30': 'Tadeáš', '10-31': 'Štěpánka, Štěpána',
  '11-01': 'Felix', '11-02': '', '11-03': 'Hubert', '11-04': 'Karel', '11-05': 'Miriam', '11-06': 'Liběna, Liboslava, Luboslava', '11-07': 'Saskie',
  '11-08': 'Bohumír, Bohumíra', '11-09': 'Bohdan, Božidar, Božidara', '11-10': 'Evžen, Eugen', '11-11': 'Martin', '11-12': 'Benedikt, Benedikta',
  '11-13': 'Tibor', '11-14': 'Sáva, Sába', '11-15': 'Leopold, Leopolda, Leopoldýna', '11-16': 'Otmar, Otomar', '11-17': 'Mahulena',
  '11-18': 'Romana', '11-19': 'Alžběta', '11-20': 'Nikola, Nikol, Koleta', '11-21': 'Albert, Adalbert, Albrecht, Aldo', '11-22': 'Cecílie, Celie',
  '11-23': 'Klement', '11-24': 'Emílie', '11-25': 'Kateřina', '11-26': 'Artur, Artuš', '11-27': 'Xenie', '11-28': 'René', '11-29': 'Zina',
  '11-30': 'Ondřej, Andrej',
  '12-01': 'Iva', '12-02': 'Blanka', '12-03': 'Svatoslav', '12-04': 'Barbora', '12-05': 'Jitka', '12-06': 'Mikuláš', '12-07': 'Ambrož, Benjamín',
  '12-08': 'Květoslava', '12-09': 'Vratislav, Vratislava', '12-10': 'Julie, Julia', '12-11': 'Dana', '12-12': 'Simona', '12-13': 'Lucie',
  '12-14': 'Lýdie', '12-15': 'Radana', '12-16': 'Albína', '12-17': 'Daniel', '12-18': 'Miloslav', '12-19': 'Ester', '12-20': 'Dagmar, Dagmara',
  '12-21': 'Natálie', '12-22': 'Šimon', '12-23': 'Vlasta', '12-24': 'Adam a Eva', '12-25': '', '12-26': 'Štěpán', '12-27': 'Žaneta',
  '12-28': 'Bohumila', '12-29': 'Judita', '12-30': 'David, Davida', '12-31': 'Silvestr'
};

const dvou = (n) => String(n).padStart(2, '0');
const klicDne = (t) => { const d = new Date(t); return dvou(d.getMonth() + 1) + '-' + dvou(d.getDate()); };
/** Bez diakritiky a velikosti písmen – „Eliška“ = „eliska“. */
export const bezDiakritiky = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const jmenaZaznamu = (z) => String(z || '').split(/,\s*|\s+a\s+/).map((x) => x.trim()).filter(Boolean);

/** Kdo má v den t svátek – celý záznam („Eliška, Elza“), '' u státních svátků bez jména. */
export function jmeninyDne(t) { return JMENINY[klicDne(t)] || ''; }

/** Jméno, které se ukazuje: první podoba („Eliška“), u dvojic celé („Adam a Eva“). */
export function hlavniJmeno(t) { return jmeninyDne(t).split(',')[0].trim(); }

/** Oblíbení lidé ({ jmeno, kdo }), kteří mají v den t svátek. */
export function oblibeniDne(t, oblibeni) {
  const dnes = jmenaZaznamu(jmeninyDne(t)).map(bezDiakritiky);
  return (oblibeni || []).filter((o) => dnes.indexOf(bezDiakritiky(o.jmeno)) >= 0);
}

/** Kdy má jméno svátek → 'MM-DD' (první den, kde je), nebo ''. */
export function denJmena(jmeno) {
  const h = bezDiakritiky(jmeno);
  return Object.keys(JMENINY).find((k) => jmenaZaznamu(JMENINY[k]).some((x) => bezDiakritiky(x) === h)) || '';
}

/** Všechna jména z kalendáře (k našeptávání), abecedně. */
export function vsechnaJmena() {
  const s = new Set();
  Object.keys(JMENINY).forEach((k) => jmenaZaznamu(JMENINY[k]).forEach((x) => { if (x !== 'Tři králové') s.add(x); }));
  return Array.from(s).sort((a, b) => a.localeCompare(b, 'cs'));
}
