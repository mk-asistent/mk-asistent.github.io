# Asistent

Osobní přehled v jedné aplikaci: **schránka poznámek pro Clauda**, **pošta** (osobní a pracovní účet), **kalendář**
(Google + kalendáře z iPhonu), **počasí ČHMÚ**, **zdraví** (WHOOP + Apple Watch), **zápasy klubu** z fotbal.cz
a hotové **reely** s popisky pro Instagram, **plakát na víkend** (A3 k tisku, obrázek a Instagram) a **auto** (náklady
a tankování z tabulky Google, účtenky z fotky).
Webová aplikace (PWA) – na iPhonu, iPadu i PC se přidá na plochu a otevírá se jako samostatná aplikace.

## Z čeho se skládá

| Část | Co |
|---|---|
| `index.html`, `app.css`, `js/` | aplikace – statické soubory na GitHub Pages, žádné sestavování ani knihovny |
| `apps-script/Kod.gs` | **motor** v Google Apps Scriptu: Gmail, Kalendář Google, kalendáře z iPhonu (`.ics`), schránka na Disku, počasí ČHMÚ, WHOOP, data ze zkratky Zdraví, zápasy |
| `apps-script/appsscript.json` | manifest motoru – časové pásmo Praha a nutná oprávnění |
| `sw.js`, `manifest.webmanifest`, `ikony/` | instalace na plochu a start bez sítě (vždy se načte živá verze, když síť je) |
| `soukromi.html` | zásady soukromí (WHOOP je chce při registraci aplikace) |
| `firebase/` | **účet a server** (Firebase, projekt asistent-michal): přihlášení e-mailem a heslem, kopie dat z motoru každých 10 minut – návod `firebase/NASAZENI.md` |
| `apps-script/test/`, `testy/` | testy motoru (Node, i na skutečných vzorcích ČHMÚ a fotbal.cz) a aplikace v prohlížeči (Playwright) |

Aplikace mluví s motorem přes `POST` s klíčem. **Adresa motoru a klíč jsou v zařízení a v účtu Firebase** (zadají se
jednou, další zařízení se přihlásí e-mailem a heslem) – nikdy v tomhle repozitáři. S účtem čte aplikace poštu, schránku,
kalendář, fotbal a reely z kopií, které server chystá každých 10 minut (hned po otevření, změny živě); na motor čeká
jen u akcí (odeslat, archivovat…) a u zdraví a počasí. Vzhled: styl „Fixtrack“, na telefonu „PriorAuth“, okna „CaseDraft“
(skill `osobni-vzhled`).

## Navigace
Na PC a iPadu postranní panel se všemi sekcemi. Na telefonu spodní lišta (Dnes, Schránka, +, Pošta, Kalendář) a **menu
zleva** po klepnutí na jméno nahoře – všechny sekce včetně Zdraví, Fotbalu, Reelů a Plakátů, dole Nastavení.

**Levý pás** (Michal 9. 10.: „víc pracovního místa“): na PC je celý s popisky jen na **Dnes**, na ostatních stránkách jen
ikony s počty v odznacích. Po **najetí myší** (nebo Tabem z klávesnice) se rozbalí **přes obsah** – stránka neposkočí;
výběr sekce ho zase sbalí, Escape taky. Tlačítko **Připnout** (špendlík nahoře v rozbaleném pásu) ho nechá celý na všech
stránkách – pamatuje si to zařízení (`asistent.rail`). iPad (760–1179 px) má jen ikony vždy (i na Dnes), rozbalí se stejně.

## Dnes
Každá věc jen jednou: nahoře **výstrahy ČHMÚ** (jen když nějaká platí). Přehledová čísla jsou na PC a iPadu **malé
dlaždice v horní liště** mezi hledáním a tlačítky (Michal 9. 10., šířky 2 : 2 : 1 : 1): **Počasí** (ikona, teplota, místo
zkráceně – klepnutí = detail), **Připravenost** (WHOOP % v barvě zóny, spánek, HRV → Zdraví), **Nepřečtené** (počet, hoří /
čeká na odpověď; nic = fajfka „vše přečteno“ → Pošta, filtr Nepřečtené) a **Denní kroužky** (`js/krouzky.js`: voda,
bílkoviny a pohyb za dnešek proti cílům z `ZDRAVI_REZIM.json` – `pitiCil` ml, `bilkovinyCil` g, `krokyCil` kroků; bez cíle
2,5 l, 130 g a 8 000 kroků; kroky z Apple Watch nebo WHOOP, větší číslo; čtvrtý kroužek **Doplňky** – vzato z hlavních doplňků,
které dnes platí, stejné číslo jako karta Doplňky dnes (`doplnkyDnes().plneni`); čísla v bublině → Zdraví). Na užší liště se hledání
zmenší na „Hledat“, „+ Poznámka“ na „+“ a popisky ubývají, čísla zůstanou. **Další zápas** v číslech není (je v kartě Fotbal
a v týdnu). Pod tím **Vyžaduje pozornost** (úkoly, rozhodnutí, návrhy od Clauda a připomínky auta podle naléhavosti),
**Moje poznámky**, **Pošta** jako vlastní karta (hoří, čeká na tebe, otázka a nepřečtené z Primární; nepřečtené Aktualizace
jedním řádkem) – když je všechno přečtené a vyřízené, karta zmizí a podnadpis řekne „pošta vyřízená“. Dál **týden jako
krátký výpis**, **Fotbal** (poslední výsledek a další zápas
každého týmu, šipka na stránku Fotbal), **Doplňky dnes** (odškrtávací seznam podle režimu z Disku – zápasové jen v den
zápasu, kofein do 14:00; den v pásku týdne jde otevřít a odškrtat zpětně) a **poznámka pro Clauda** s malým přehledem schránky a odpověďmi Clauda.
**Telefon:** zelená karta Čeká na tebe, malá čísla Počasí · Připravenost · Kroužky (s hodnotami), pod nimi Vyžaduje
pozornost a Pošta jako vlastní seznam (jen když něco čeká). Po návratu do aplikace
okno **Co je nového** (hoří, nová pošta, odpovědi Clauda, nové výstrahy).

## Schránka
Poznámky z iPhonu (zkratka „Pro Clauda“) i z aplikace; Claude je zpracovává každou půlhodinu (skill `asistent-schranka`).
U položky: **Dopsat** (i k vyřízené – vrátí se ke zpracování), **Nadpis**, **Téma** (práce, osobní, fotbal, zdraví,
domov, nákup – filtr nahoře), **Smazat** (bez dotazu – koš na Disku, v oznámení Vrátit). Diktát typu „pozvi Petra na schůzku v úterý
v deset“ nebo „napiš trenérovi, že…“ Claude převede na **návrh** – limetková karta **Založit událost** / **Napsat e-mail**
otevře předvyplněný formulář; nic se neodešle, dokud ho Michal neuloží / neodešle.

**Rychlý zápis** (bez čekání na Clauda): když poznámka v poli zní jako schůzka nebo zpráva – „schůzka s Petrem zítra
v 10 na 2 hodiny“, „pozvi Janu na poradu ve středu v půl deváté“, „napiš Petrovi, že v úterý nepřijdu“ – pod polem se
hned nabídne **Do kalendáře** / **Napsat e-mail** (`js/rozbor.js`, čeština bez AI, nic neodesílá). Po uložení události
nebo odeslání e-mailu se poznámka smaže; **Uložit** ji pořád pošle do schránky. Stejně tak diktát z iPhonu, který
Claude ještě nezpracoval: u položky je štítek **Rozpoznáno: událost** a v detailu **Založit událost** („zítra“ se počítá
od chvíle diktátu). Po uložení se k položce připíše „Událost založena: …“ a Claude vyřídí jen zbytek diktátu.

V hlavičce je, kdy Claude schránku naposledy zpracoval (podle `PREHLED.md`); když u Clauda něco čeká přes 3 hodiny a
schránka se mezitím nezpracovala, ukáže se upozornění (naplánovaná úloha běží jen na zapnutém PC). U tvého úkolu jde
nastavit **Termín** (dnes, zítra, za 3 dny, příští pondělí, za týden, bez termínu). Claudovy odpovědi mají klikací
odkazy, **tučné** písmo a odrážky. Vyřízené jsou ve „Vše“ sbalené na posledních 5.

**Stránka** (Michal 9. 10.: „je taková prázdná“): vlevo pole pro Clauda, filtry a seznam, vpravo **Týden v číslech**
(zadáno a vyřízeno za 7 dní, čeká na tebe – čísla s ↗ na filtr, sloupce zadaných poznámek po dnech, kdy Claude
naposledy zpracoval schránku), **Moje poznámky**, **Termíny** (po termínu nahoře, klepnutí úkol otevře) a **Nápady na
později** (ve „Vše“ jen tady, ve filtru Nápady v seznamu). Od 1180 px dva sloupce, iPad na výšku a telefon pod sebou.
**Pravé tlačítko** (na dotyku dlouhé podržení) na položce – v seznamu i na Dnes (Odpověděl jsem, Vyžaduje pozornost):
Otevřít, Hotovo / Vyřízeno / Zahodit, Dopsat / Navázat, **Smazat** (`js/nabidka.js`; motor `schrankaSmazat` /
`schrankaObnovit` – jen poznámky ze stromu schránky).

**Moje poznámky** (Michal 9. 10.: „poznámka sám pro sebe na později … na hlavní stránce pro mě“): zkratka „Pro mě“
v iPhonu, „+“ → Moje poznámka, pole na kartě (Enter). Jen pro Michala, Claude je nečte: `CLAUDE_SCHRANKA/MOJE` (stejný
tvar jako NOVE), hotové `MOJE/HOTOVO`, smazané do koše. Karta na Dnes (5 nejnovějších) a vpravo ve Schránce: kroužek =
Hotovo (Vrátit), klepnutí na text = celý text s odkazy, ⋯ / pravé tlačítko = Hotovo, Předat Claudovi (poznámka do
schránky), Kopírovat text, Smazat (Vrátit). Motor: `schranka` posílá i `moje` (nejvýš 50), akce `mojePridat`,
`mojeHotovo` (`zpet` = vrátit z hotových), `mojeSmazat` (`js/moje.js`).

## Pošta jako případy
Nápad převzatý z poštovního klienta [Mailer](https://www.fastmailer.one/) (pravidla jsou vlastní): každá konverzace
v Doručené poště má stav, který motor určí hned a bez AI:

| Stav | Kdy |
|---|---|
| **Hoří** | výslovná naléhavost nebo nahlášený problém od známých, termín do 48 hodin |
| **Čeká na tebe** | někdo po tobě něco chce („prosím“, „pošlete“, „k připomínkám“…), nebo osobní zpráva od známého |
| **Otázka** | ptá se, ale nic nežádá |
| **Čekáš na ně** | poslední jsi psal ty (ne krátké „díky“, ne hromadně, ne na automatické adresy) |
| **Řeší se** | živá konverzace, ve které se od tebe teď nic nečeká |
| **Informace** | oznámení, automatické zprávy, kategorie Aktualizace; konverzace uzavřená tvým „díky“ |

**Hotovo** = archiv, **Připomenout** = odložení (vrátí se v den termínu) + úkol do schránky, **Spam**, **Vrátit**.
Ve vlákně je **nejnovější zpráva nahoře** a pod ní **návrh odpovědi od Clauda** (nebo Další krok) – nejdřív čtení, pak
odpověď (Michal 9. 10.). **Řádek seznamu** = odesílatel, předmět, text a čas; stav jen barevným proužkem vlevo (hoří
korálová, čeká na tebe zelená, otázka žlutá – název a důvod v popisku), návrh od Clauda malou ikonou ✦, účet drobně jen
v zobrazení „Oba účty“. Náhled je bez hlaviček přeposlání a citací (motor `nahledZpravy_`, starší kopie čistí aplikace).
**Skupiny (štítky Gmailu)** jsou druhá lišta pod záložkami: čip s počtem nepřečtených, podštítek hned za rodičem
(„/ PATRIOT“), klepnutí = konverzace skupiny i archivované, znovu klepnutí = zpět; na telefonu se lišta posouvá do strany.
**Přetažení e-mailu myší na skupinu** = „Přesunout do“ (štítek + pryč z Doručené, ve výběru jiné skupiny i ta odebrána),
oznámení „Přesunuto do X · Vrátit“; na iPadu a telefonu **dlouhé podržení řádku** (nebo tlačítko v detailu) otevře
Přesunout do…. **Podpis** (osobní / pracovní) se vloží do psaní; v poli Komu i u hostů události **našeptává** lidi,
kterým jsi psal. Hledání v celé poště rozumí českým filtrům (`od:`, `předmět:`, `má:přílohu`, `po:1.10.2026`…).
Klávesy na PC: `j`/`k`, `e` hotovo, `h` připomenout, `v` přesunout, `r` odpovědět, `a` všem, `f` přeposlat, `c` nový, `/` hledat, `1`–`6` sekce.

**Rychlé otevření** (Michal 9. 10.: „vždy posledních 10 mít načtených“): když je aplikace v klidu, jde jedním dotazem
`postaDetaily` až 10 konverzací, které Michal nejspíš otevře (v Poště seznam, jinde Vyžaduje pozornost), a jen ty, jejichž
detail v zařízení chybí nebo je starší než souhrn (čas poslední zprávy, návrh od Clauda). Motor detaily drží v mezipaměti
`detail:<id>` (6 h) podle otisku „počet zpráv:čas poslední“ – beze změny Gmail nevolá; nic neoznačí jako přečtené.
Klepnutí pak ukáže detail hned (v testu 36 ms proti 1,9 s) a motor jen označí přečtené (`oznacit`). Detaily přežijí
přenačtení stránky (sessionStorage). **Upozornění Googlu na chyby Apps Scriptu** zůstanou v seznamu jako informace, ale
nesvítí na Dnes, nepočítají se do nepřečtených, nejdou do ntfy ani do podkladů pro přehled od Clauda (`tiche`).
**Pracovní bez pošty**: místo prázdné stránky vysvětlení (přeposílání z WEDOS) a tlačítko do Nastavení → Pošta.

**Záložky jako v Gmailu** (Michal 5. 10.): **Primární · Aktualizace · Promoakce · Sociální sítě · Fóra** s počtem
nepřečtených. Primární a Aktualizace jsou z Doručené (motor u konverzací z kategorie Aktualizace posílá `aktualizace`),
ostatní se načtou až na klepnutí (`postaKategorie`, v Doručené za 30 dní, 5 min v mezipaměti; čísla `pocty` posílá motor
s poštou). V záložkách kromě Primární je **Označit vše jako přečtené** (`postaPrectene`, nejvýš 100). **Přesunout do
skupiny** (tlačítko u konverzace, klávesa `v`, přetažení na skupinu, dlouhé podržení) = štítek Gmailu + pryč z Doručené jako
„Přesunout do“ v Gmailu; jde i jen přidat štítek nebo ho odebrat (`postaPresunout`), pole **Nová skupina** štítek rovnou
založí (`novy: true`); od motoru 2026-10-09.4 i `odebrat` (štítek, který konverzace ztratí) a `doDorucenych` (Vrátit).
Skupiny jsou v liště pod záložkami. Přehled od Clauda prochází i skupiny z vlastnosti `PREHLED_STITKY`
(výchozí `VÝVOJ`), aby selhání automatizací neutekla, ani když je filtr dá mimo Doručenou.

**Denní limit Gmailu** (5. 10. vyčerpaný – server obnovuje poštu každých 10 minut): souhrny konverzací se skládají ze
zpráv jednoho `getMessagesForThreads`, metody vlákna (`isUnread`, `getLastMessageDate`, `isImportant`…) jsou každá
zvlášť volání a v seznamech se nepoužívají (testy je počítají). Motor si pamatuje otisk Doručené (pořadí vláken,
nepřečtená, návrhy od Clauda) – beze změny vrátí uložený seznam a zprávy nenačítá.

**Přehled od Clauda** (balast přečte Claude): motor jednou za 4 hodiny (7–22 h, spouštěč `instagramKazdych10Min`) zapíše
konverzace z Aktualizací, Promoakcí, Sociálních sítí a Fór za 2 dny (odesílatel, předmět, začátek textu bez odkazů) do
`CLAUDE_SCHRANKA/POSTA_K_PREHLEDU.json`; naplánovaná úloha „Návrhy odpovědí a přehled pošty“ z nich napíše
`POSTA_PREHLED.json` – **Vyřiď** (zásilka, platba, bezpečnost účtu, selhání automatizací…), **Mohlo by tě zajímat**
(nejvýš 5, přísně) a **Ostatní stručně** po skupinách. Aplikace ho ukáže nahoře v Poště (v Primární jen Vyřiď a Zajímavé),
položka jde skrýt (pamatuje se v zařízení).

**Návrhy odpovědí od Clauda:** motor zapíše konverzace, které čekají na odpověď (hoří, čeká na tebe, otázka), do
`CLAUDE_SCHRANKA/POSTA_K_ODPOVEDI.json` (jen při změně, nejvýš 15). Naplánovaná úloha „Návrhy odpovědí“ (skill
`asistent-posta-odpovedi`, každou hodinu 7–21 h) k nim napíše návrh do `CLAUDE_SCHRANKA/ODPOVEDI/<id>.json`. V seznamu
je malá ikona ✦, v konverzaci pod e-mailem karta **Použít a upravit** (psaní s textem a podpisem) / **Zahodit**. Odesílá
vždy Michal; po odeslání odpovědi se návrh zahodí sám. Nastavení → Pošta: osobní i pracovní / jen osobní / vypnuto.

## Kalendář
- **Čtení:** zobrazené kalendáře Google + kalendáře z iPhonu (iCloud) přes soukromý odkaz (Nastavení → Kalendáře).
  Motor rozbaluje i opakované události. **Druhy** kalendářů (osobní, práce, fotbal, rodina, ostatní) – filtr nahoře
  v Kalendáři, skupiny v pravém panelu, změna v Nastavení → Kalendáře.
- **Zápis:** nová událost, úprava, smazání, opakování, připomenutí, **pozvánky e-mailem** (skupiny hostů) – jen do
  vlastních kalendářů Google (do iCloudu Apps Script zapisovat neumí).
- **Zápasy klubu:** fotbal.cz je za ochranou Cloudflare (servery Googlu ho nestáhnou) → zápasy stahuje nástroj v Michalově
  Chromu (`CLAUDE_PRACOVNI\NASTROJE\asistent\fotbal_cz`) do `CLAUDE_SCHRANKA/FOTBAL.json`. V Kalendáři (pravý panel)
  nebo v Nastavení se zapnou týmy → zápasy v kalendářích „⚽ A-tým / B-tým / Dorost“ (štítek s id zápasu – přeložení
  a výsledek se přepíšou, nic se nezdvojí). Ruční zápas: šablona Zápas ve formuláři.
- **Docházka dorostu (Týmuj):** u proběhlých tréninků a zápasů dorostu je v týdnu „18/21“ a v detailu počty (přišlo,
  omluveno, neomluveno) a jména bez omluvy. Zdroj: synchronizace Týmuj na webu dorostu (Firestore), motor čte souhrn
  (akce `dochazka`, 30 min v mezipaměti); texty omluv se do aplikace nepředávají.

**Kalendáře a svátky** (tlačítko Kalendáře na liště, na PC i boční panel): zaškrtnutí, které kalendáře ukazovat – jen v sekci
Kalendář a v tomhle zařízení (`asistent.kal.skryte`), „jen tento“, „Ukázat všechny“; úplné vypnutí kalendáře (motor ho
nenačítá) zůstává v Nastavení → Kalendáře. Pod kalendáři je sekce **Svátky** se dvěma řádky se zaškrtnutím (zase jen
v Kalendáři a v zařízení): **Jmeniny** (`js/jmeniny.js` – občanský kalendář podle české Wikipedie; šedě a bez místa navíc:
v měsíci vpravo vedle čísla dne, v týdnu pod datem, v nadpisu dne; `asistent.kal.jmeniny`) a **Oblíbení lidé**
(`asistent.kal.oblibeni`) – jejich svátek je celodenní položka sekce Svátky: korálový čip ★ v měsíci a v „celý den“
v týdnu, řádek „svátek · ★ jméno · vztah“ v seznamu dne a v Seznamu (i den bez událostí), na telefonu ★ v buňce a v pruhu
dnů – bez upozornění. Karta **Brzy má svátek** (boční panel, na telefonu a iPadu pod měsícem) ukáže oblíbené se svátkem
do 30 dní, klepnutí otevře ten den. **Týden na Dnes** má u každého ze 7 dní řádek se svátkem (i bez událostí, oblíbený ★
korálově); klepnutí na den otevře kalendář na něm.

Oblíbení (`jmeninyUlozit`, vlastnost `JMENINY_OBLIBENI`, chodí s `info`, nejvýš 60) se přidávají v okně Kalendáře a svátky
**hromadně**: „Pepa (děda), Verča, Saša – kolegyně“ – víc jmen oddělených čárkou (nebo „a“), vztah v závorce či za pomlčkou.
Náhled hned při psaní: domácké tvary převede na jméno z kalendáře (Pepa → Josef, Honza → Jan, Verča → Veronika –
slovník `DOMACKE_ZDROJ` v `js/jmeniny.js`), jiný pravopis taky (Kristina → Kristýna), nejednoznačné nabídne k výběru (Saša
→ Alexandr / Alexandra), jméno bez svátku řekne nahlas (s podobnými jmény), duplicity přeskočí a známému bez vztahu vztah
doplní; vše se uloží jedním voláním (co přidat nešlo, zůstane v poli k opravě). Státní svátky jsou kalendář Googlu.

## Fotbal
Stránka **Fotbal** (levý pruh, na telefonu šipka v kartě Fotbal na Dnes): přepínač týmů, souhrn místa v tabulce,
**další zápas**, **výsledky** s góly (minuta, střelec, vlastní góly, penalty) a kartami po rozkliknutí, **zbývající
zápasy**, **tabulka** celkem / doma / venku s naším řádkem, **střelci a karty** týmu za sezónu a odkazy na celou tabulku
a celé rozlosování na fotbal.cz. Data: `FOTBAL.json` verze 2 (tabulky + detaily zápasů) z nástroje
`NASTROJE\asistent\fotbal_cz` (naplánovaná úloha „asistent-fotbal“ v Michalově Chromu; detaily jen nových zápasů).

## Reely
Stránka **Reely** (levý pruh, tlačítko „Reely“ na stránce Fotbal a v kartě Fotbal na Dnes): hotové reely z fotbalu po
týdnech – náhled s tlačítkem přehrát (video na Disku Google, otevře ho jen Michalův účet), zápas a výsledek, **popisek**
přesně jako na Instagram (odřádkování, emoji) s tlačítkem **Kopírovat popisek** a přepínač **Zveřejněno**. Na Dnes
limetková karta **Reel k vyvěšení**, když je nezveřejněný reel ze zápasu za poslední týden (Kopírovat a Video jedním
ťuknutím; po zkopírování jde v oznámení rovnou označit „Zveřejněno“).

Data dělá domácí PC: nástroj `CLAUDE_PRACOVNI\NASTROJE\asistent\reely\export_reely.py` po dokončení reelu zkopíruje video
do `CLAUDE_SCHRANKA/REELY/videa/` a zapíše `REELY/reely.json` (popisky z `popisky\*.txt`, zápasy podle scénáře
a FOTBAL.json, malé náhledy z výsledkové desky). Motor (akce `reely`) k videím dohledá soubory na Disku a chybějící
výsledek doplní z FOTBAL.json; stav „zveřejněno“ drží vlastnost `REELY_STAV` (akce `reelStav`). Popisek se v aplikaci
jen kopíruje – mění se na PC. Do Fotek v iPhonu: aplikace Disk → ⋯ → Poslat kopii → Uložit video.

## Počasí (ČHMÚ)
Motor čte otevřená data ČHMÚ (CC BY 4.0): výstrahy CAP pro ORP, vodní stav řeky s povodňovými stupni a textovou
předpověď kraje na dnes až 3 dny. Stahuje šetrně (ETag → 304, výpis předpovědí jednou za hodinu), přehled drží 15 minut.
Místo bez polohy: **Domov** (Nastavení → Počasí → Domov: obec podle jména přes Open-Meteo geocoding, akce `pocasiDomov`
uloží do vlastnosti `POCASI` místo, ORP, kraj, stanice a `domov` {lat, lon}); bez něj Veselí nad Moravou. Platí pro
všechna zařízení.

**Podle polohy** (Nastavení → Počasí, na každém zařízení zvlášť): aplikace pošle polohu zaokrouhlenou na 0,01° (~1 km),
motor z ní přes RÚIAN (ČÚZK) zjistí ORP a obec, vezme výstrahy pro ten ORP, předpověď kraje a dvě nejbližší vodoměrné
stanice s povodňovými stupni (místa si pamatuje ve `POCASI_MISTA`). Teplotu teď a příštích 12 hodin bere telefon přímo
z **Open-Meteo** (model ČHMÚ ALADIN, bez klíče). Ranní upozornění použijí poslední polohu (nejvýš den starou); po vypnutí
se zapomene. Aplikace žádá **přesnou polohu** (GPS) a posílá i přesnost: poloha z Wi-Fi bývá o pár km vedle (u Michala
telefon i PC hlásily sousední obec, 9. 10.) – proto **v okolí domova** (8 km, při velké nejistotě i dál) ukáže domov;
přibližná poloha mimo domov má „≈“ a v detailu radu (iPhone: Polohové služby → Weby Safari → Přesná poloha).

## Zdraví (WHOOP + Apple Watch)
- **WHOOP** (API v2, OAuth): vlastní aplikace na developer-dashboard.whoop.com (Sandbox, jen pro sebe; Privacy Policy URL
  `https://mk-asistent.github.io/soukromi.html`, Redirect URL = adresa `/exec` motoru) → vlastnosti skriptu
  `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI` → v aplikaci Zdraví → **Propojit**. Tokeny spravuje motor.
- **Apple Watch:** zkratka v iPhonu „Zdraví do Asistenta“ (spouští ji otevření aplikace WHOOP – zamčený iPhone data Zdraví
  nevydá) pošle denní hodnoty za 7 dní (`akce: zdraviApple`, vlastní klíč `ZDRAVI_KLIC` jen pro zápis – ukáže ho
  Nastavení → Zdraví). Postup krok za krokem je přímo v aplikaci. Mezery kolem klíče nevadí, klíč zkratky stačí i bez
  pole `akce`; při chybě dostane zkratka v odpovědi i důvod (`zprava`, např. „ve zkratce je hlavní klíč aplikace“).
- Data po měsících v `CLAUDE_SCHRANKA/ZDRAVI/RRRR-MM.json` (soukromý Disk, nikdy do gitu). Trénink se spáruje s událostí
  v kalendáři (zápas, trénink) a čísla z WHOOP jsou i v detailu zápasu.
- **Váha:** ruční zápis v kartě Váha (Dnes i Zdraví, Enter nebo Zapsat) – čas = teď; hodiny u pole a „+“ → Váha otevřou
  okno s **časem vážení** (Teď / Dnes ráno / Včera večer / vlastní – Michal 9. 10.: „ne vždy si to hned napíšu“; motor
  `vaha` s `kdy`, nejvýš 60 dní zpátky) → `CLAUDE_SCHRANKA/ZDRAVI/VAHA.json`. Váha během dne kolísá o 1–2 kg, proto
  **rozdíl jen proti vážení ve stejnou denní dobu** (ráno do 11 h / přes den / večer od 17 h) a čára grafu přes ranní
  vážení (ostatní body prázdné). **Cíl** (`ZDRAVI_REZIM.json` → `cilVahy { kg, do, od: { kg, den } }`) jen ve Zdraví: pruh,
  zbývá, potřebné a skutečné tempo (z ranních vážení za 21 dní), čárkovaný plán v grafu – na Dnes ne (váha není hlavní).
- **Doplňky:** režim v `CLAUDE_SCHRANKA/ZDRAVI_REZIM.json` (položky s časem dne, `jen`: trenink / zapas / zatez,
  `treninkDny`, `zapasTymy`, `kofeinDo`) – motor ho posílá se Zdravím, aplikace z něj skládá Doplňky dnes. Časy dne:
  rano, svacina, obed, pred, zapas, po, vecer. **Odškrtnutí** jde přes motor (akce `doplnky`) do
  `CLAUDE_SCHRANKA/ZDRAVI/DOPLNKY.json` (120 dní) – stejné na telefonu i PC; neodeslané změny čekají v zařízení
  (`asistent.doplnkyCekajici`) a odejdou s dalším načtením Zdraví. Pod seznamem **Tento týden** (Po–Ne, plný /
  částečný den, procento) a u položky „vzato/dní“ za týden. **Zpětně:** klepnutí na den v pásku ukáže ten den (nadpis
  „Doplňky · út 6. 10.“, tlačítko Dnes zpět) a odškrtnutí se zapíše k němu; šipky ‹ › o týden, nejdál 8 týdnů zpátky,
  bez klepnutí se karta po 15 minutách vrátí na dnešek. Skutečný režim je jen na Disku (zdravotní údaje do repa
  nepatří).
  - **Hlavní doplňky** (Michal 9. 10.: „podstatné jsou … dál se to nemusí započítávat“): `ZDRAVI_REZIM.json` → `hlavni`
    (seznam id). Do plnění – „zbývá“, „vše ✓“, „x z y“, procenta a plné dny v týdnu, týdenní e-mail a Claudovo hodnocení
    dne – se počítají jen hlavní, a to jen ve dny, kdy podle režimu platí (`jen: zapas` → jen v den zápasu). Ostatní se
    ukazují šedě pod čarou „Ostatní · nepočítají se“ a jdou odškrtnout dál. Bez `hlavni` se počítá vše (starší režim).
    Aplikace: `doplnkyDnes().plneni` / `plneniDoplnku()` v `js/zdravi.js`.
- **Pití a jídlo** (karta na Dnes i ve Zdraví): voda tlačítky +0,25 / +0,5 l (zpět = poslední vlastní), bílkoviny
  a kcal z jídel a z odškrtnutých doplňků s `bilkoviny` v režimu, týden pití Po–Ne. Cíle v `ZDRAVI_REZIM.json`
  (`pitiCil` ml, `bilkovinyCil` g; výchozí 2,5 l a 130 g). Data `ZDRAVI/PITI_JIDLO.json` (akce `pitiJidlo`).
  - **Jídlo slovy** (Michal 9. 10.: „napíšu, co jsem měl, bez bílkovin“): okno „Co jsi jedl?“ (karta i „+“ → Jídlo) –
    při psaní hned odhad bílkovin a kcal z místní tabulky (`js/jidlo_odhad.js`, test `testy/test_jidlo_odhad.mjs`);
    doplňky v textu („elektrolyty“, „kreatin“) se jen odškrtnou (i mimo režim dne → „navíc“). Uloží se s `odhad: true`
    → motor zapíše jídlo s `odhad: 'mistni'` (v kartě „≈“) a do schránky poznámku pro Clauda `…_jidl.md` (`typ: jidlo`,
    aplikace ji neukazuje); Claude (úloha schránky na obou PC, skill `asistent-schranka`) zapíše upřesnění do
    `ZDRAVI/PITI_JIDLO_CLAUDE.json` → `odhady[id]` (v kartě štítek „Claude“). Bílkoviny vím přesně = bez Clauda.
  - **Hodnocení dne:** spouštěč motoru po 21:30 (jen když se jedlo nebo pilo) dá Claudovi poznámku `…_hodn.md` → Claude
    zapíše `hodnoceni[den] = { znamka A–E, text }` (strava, voda, šetrně pohyb); karta ho ukáže večer
    a ráno ještě za včerejšek.
  - Diktát přes schránku zapisuje Claude do `PITI_JIDLO_CLAUDE.json` → `zapisy` (jen přidává, id `c-…`) a doplňky
    → `doplnky[den][id]`; motor vše spojí (zrušení v aplikaci = `false` v DOPLNKY.json, přebije Claudův zápis), smazání
    Claudova zápisu = `smazane` v PITI_JIDLO.json. Hotový přehled Zdraví drží motor v mezipaměti (klíč `ZDRAVI_V` se mění
    s každým zápisem), takže čtení bez změny neotevírá sedm souborů na Disku.
- **Týdenní shrnutí e-mailem** (Michal 9. 10.: „nedělní shrnutí … napsat mailem tu moji aktivitu“): spouštěč
  `instagramKazdych10Min` v neděli od 18:00 spočítá týden po–ne (`ZDRAVI_TYDEN_` v motoru: bílkoviny, kcal a voda po dnech,
  hlavní doplňky, ranní váha začátek/konec týdne, WHOOP zotavení / spánek / zátěž a Apple kroky proti minulému týdnu,
  tréninky, hodnocení dnů A–E) a dá Claudovi poznámku `…_tyden.md` (`typ: tyden-zdravi`, aplikace ji neukazuje). Claude
  zapíše text do `PITI_JIDLO_CLAUDE.json` → `tydny["RRRR-Www"] = { text, kdy }` (skill `asistent-schranka`). Motor pošle
  e-mail (HTML s tabulkou, bez cizích obrázků, odesílatel „Asistent“) na vlastní adresu se značkou `+notifikace` – v Poště
  aplikace je to Informace, ne Čekáš na ně: jakmile je Claudův text (v noci 22–6 h počká na ráno), nejpozději v pondělí
  v 8:00 i bez něj (jen čísla), když motor v pondělí neběžel, ještě v úterý. Jednou za týden (`TYDEN_ZDRAVI_ODESLANO`),
  prázdný týden nic. Claudův text je pak týden v kartě **Týden · Claude** ve Zdraví (`zdravi.tydenni`).
- **Rozvržení a grafy:** karty Zdraví jsou ve sloupcích podle své výšky (od 900 px dva, od 1700 px tři, telefon jeden) –
  žádná se nenatahuje na výšku sousední. U všech grafů (14 dní, váha, pruh spánku, tepové zóny, týden pití a doplňků, Auto)
  je **bublina s hodnotou** (`js/grafy.js`, jedna pro celou aplikaci): myš najetím, dotyk klepnutím (zmizí klepnutím jinam),
  klávesnice – graf je jedno místo pro Tab, šipky ← → mezi body, Esc; drží se 8 px od okrajů obrazovky.
- **Upozornění do iPhonu** (ntfy, nepovinné): zapínají se v aplikaci **Nastavení → Upozornění** (motor vyrobí téma
  `NTFY_TEMA`, aplikace ho ukáže s návodem pro aplikaci ntfy a umí poslat zkušební). Kontroly běží **každých 10 minut**
  se spouštěčem `instagramKazdych10Min` (jiný spouštěč netřeba; starý `kazdouHodinu` dělá totéž): hoří v poště (6–22 h),
  oranžové a vyšší výstrahy ČHMÚ, reel zveřejněný na Instagramu (klepnutí otevře příspěvek) nebo když nevyšel, ráno
  souhrn a připravenost, v neděli 19–21 h **přehled příštího týdne** (počty událostí po dnech, zápasy týmů, úkoly
  s termínem, předpověď); WHOOP se kvůli upozornění stahuje nejvýš jednou za hodinu. Přes ntfy jdou jen počty a časy,
  žádné názvy událostí ani texty.

## Instagram – naplánované reely
Na stránce Reely jde reel **naplánovat na Instagram** (datum a čas, výchozí nejbližší 18:00). Motor ho v ten čas zveřejní
sám na klubovém účtu přes Instagram API (Meta aplikace „Asistent FK Vnorovy“ ve vývojovém režimu, účet je v ní tester).
V okně plánu jdou **označit účty** (u dorostu předvyplněný `@dorost_agro`, aplikace si pamatuje poslední označení týmu;
na Instagramu jde o označení osob v reelu – `user_tags`) a **upravit popisek** jen pro tenhle příspěvek (vlastnost
`REELY_POPISEK:<id>`, po zveřejnění nebo zrušení plánu se smaže; soubor `popisky\*.txt` zůstává jediná pravda):
- klíč `IG_TOKEN` ve Vlastnostech skriptu (vloží Michal, platí 60 dní, motor ho jednou týdně obnoví), plán `REELY_PLAN`;
- spouštěč **`instagramKazdych10Min`** (Spouštěče → Minutový časovač → Každých 10 minut) – jeden reel za běh;
- Instagram si video stahuje z adresy → video na Disku má jen po dobu stahování tajný odkaz (Michal souhlasil 5. 10.),
  hned potom se sdílení vypne; video jde beze změny (stejný soubor jako z PC – H.264 1080×1920), přepočítá ho až Instagram;
- popisek je přesně ten z `popisky\*.txt`, pokud ho Michal v okně plánu neupravil;
- po vložení klíče jednou spustit `overInstagram` (vypíše účet).

## Plakáty (program víkendu A3 a Instagram)
Stránka **Plakáty** (levý pruh, na telefonu menu; tlačítko „Plakát“ na stránce Fotbal) = stránka Plakáty z webu dorostu
FK Agro Vnorovy přenesená do aplikace – tvoření i tisk fungují stejně:
- **Výběr víkendu** ◀ ▶ (výchozí nejbližší nadcházející víkend; „10. kolo“ = 10. víkend podzimu = 17.–18. 10.), štítek
  **podle rozlosování / upraveno ručně** a **Vrátit podle rozlosování**.
- **Náhled** plakátu A3 na šířku (1400 × 990 px) zmenšený na šířku stránky a **editor**: datum, měsíc, nadpis, velké dlaždice
  doma, řádky mládeže, venku, v týdnu, patička – přidat a smazat, změna hned v náhledu, uložení 700 ms po psaní (motor).
  Přeložené zápasy a poznámky svazu z fotbal.cz ukáže editor nahoře („přeloženo z so 24. 10. 11:45 na ne 25. 10. 11:45“).
- **Vytisknout / PDF**: A3, na šířku, okraje žádné, grafika na pozadí (`@page` 420 × 297 mm, tiskne se jen plakát).
- **Stáhnout obrázek**: JPEG 2 800 px (html2canvas 1.4.1 v `js/vendor/` – načte se až při prvním obrázku, cizí skript do aplikace s klíčem nepouštíme; na iPhonu nabídka sdílení
  → Uložit obrázek).

Odkud plakát je: zápasy **A-týmu, B-týmu a dorostu** z fotbal.cz (`stav.fotbal`, FOTBAL.json) – doma velké dlaždice, venku
řádky „SO 14:30“, zápas v pátek před víkendem a po–čt po něm do bloku V TÝDNU; **mládež** (žáci, přípravky) z rozlosování
podzimu 2026 v `js/plakat_data.js` (`MLADEZ`, pořadí kol `KOLA`; na jaro přepsat). Znaky klubů `plakat/znaky/` (58, z webu
dorostu; aplikace je nepřednačítá – uloží se při prvním použití do mezipaměti `plakat-znaky`), znak soupeře podle aliasu
nebo podle obce bez diakritiky (TJ Sokol Hroznová Lhota → `hroznova-lhota.png`); bez znaku čárkovaný rámeček se zkratkou.
Čisté funkce (víkendy, plakát podle rozlosování, znaky, HTML, souhrn pro Clauda) jsou v `js/plakat.js`, stránka v
`js/plakaty.js`, vzhled v `plakaty.css`. Písma: Impact a Arial Narrow na iPhonu nejsou → **Anton** a **Roboto Condensed**
z Google Fonts (velikosti upravené tak, aby krabičky seděly na pixel jako na webu dorostu, hlavička + čára = 122 px).

**Instagram** (karta vedle editoru, na telefonu nad ním): **popisek** – pole **Styl popisku** („vtipně“, „derby“, „ať přijde
hodně lidí“) a **Popisek od Clauda**: aplikace pošle souhrn víkendu z plakátu (domácí zápasy mužů a dorostu, hlavní zápas
áčka, venku, tabulka), motor založí úkol v NOVE (`…_plak.md`) a Claude zapíše popisek do `PLAKATY/popisky_claude.json`
(„Claude píše popisek… do půl hodiny, když běží PC“); od víkendu v nastavení (`popiskyOd`) žádá motor sám v pondělí až
sobotu. Popisek jde upravit ručně (štítek „upraveno“, uloží se 700 ms po psaní). **Naplánovat na Instagram**: datum a čas
(výchozí čtvrtek před víkendem 18:00, když už prošel, za hodinu) a **i do příběhu** – aplikace vyrobí příspěvek (plakát
1440 px) a příběh 1080 × 1920 (plakát na tmavém pozadí, nahoře PROGRAM VÍKENDU a datum, dole výzva a @účet), nahraje je
(`plakatObrazky`) a naplánuje (`plakatNaplanovat`); motor je zveřejní stejně jako reely (`PLAKATY_PLAN`, spouštěč
`instagramKazdych10Min`). Stav: vyjde … / nahrává se / na Instagramu (odkaz; „příběh nevyšel: důvod“) / nepovedlo se.

**Nastavení plakátu** (sbalitelný oddíl na stránce): názvy týmů na plakátu, soutěže, nadpis, místo, výzva, druhý řádek
patičky, náš znak, Instagram, od kdy píše popisky Claude sám a aliasy znaků soupeřů. V motoru je jen rozdíl od výchozích
hodnot (`NASTAVENI` v `js/plakat_data.js`); platí pro plakáty podle rozlosování, ručně upravená kola si drží své.
Motor: akce `plakaty`, `plakatUlozit`, `plakatNastaveni`, `plakatPopisek`, `plakatPopisekUlozit`, `plakatObrazky`,
`plakatNaplanovat`, `plakatZrusitPlan` (data `CLAUDE_SCHRANKA/PLAKATY`); s účtem čte aplikace plakáty z kopie serveru.

## Auto (náklady a tankování)
Stránka Auto čte Michalovu tabulku Google (listy **Náklady**, **Tankování**, **Přehled**) – tabulka zůstává hlavní a je i záloha.
- Přehled: najeto od koupě, spotřeba (litry mezi tankováními se známým stavem km), nafta na 1 km, provoz bez koupě,
  cena nafty v čase, výdaje po měsících a kategoriích, kdo co zaplatil (z Přehledu), servis podle listu Péče o auto.
- Zápis: **Tankování** (částka, cena za litr → litry vzorcem jako v tabulce, stav km, stanice) a **Výdaj** (kategorie
  z tabulky) jdou do prvního volného řádku pod posledním zápisem; poslední zápis jde smazat (překlep).
- **Stav z auta (MyŠkoda)**: domácí PC jednou denně (úloha Windows „Asistent - MySkoda“, 3:30) zapíše
  `CLAUDE_SCHRANKA/AUTO/myskoda.json` – tachometr, nádrž, dojezd, servis (bez polohy a VIN); nástroj `NASTROJE\asistent\myskoda`.
- **Tankování z auta**: MyŠkoda historii tankování nemá – skript na PC ho pozná z rozdílu dvou čtení
  (dotankováno = změna nádrže + spotřeba jízd mezi čteními), den a stav km odhadne podle jízd (bez míst). Když v tabulce
  kolem toho dne tankování chybí, ukáže stránka Auto kartu **Auto hlásí tankování** s tlačítkem Zapsat (předvyplní den a km).
- **Účtenky**: vyfotit nebo vybrat z Fotek, i víc najednou (iPhone nabídne Fotky / Vyfotit / Soubory) → fotka do
  `CLAUDE_SCHRANKA/AUTO/uctenky`, text přes OCR Disku → **rovnou zápis do tabulky** (Michal 5. 10.), když je z účtenky
  jasné co (datum a částka; u tankování cena za litr, u výdaje kategorie; stav km z auta, když ho MyŠkoda ten den zná);
  jinak se otevře okno s předvyplněnými údaji (u víc účtenek jedna po druhé). V tabulce je u poznámky odkaz „účtenka“
  na fotku. Stejná fotka podruhé (otisk z aplikace – opakování po výpadku) nic nezdvojí; text z OCR se drží v popisu
  souboru. Čtení účtenky smí trvat až 150 s.
- **Úprava zápisu**: klepnutí na zápis v Zápisech (nebo Upravit v oznámení po účtence) → okno s údaji a fotkou účtenky
  (z Disku přes `autoUctenkaFoto`, jen složka účtenek) → `autoUpravit` přepíše řádek v tabulce, jen když v něm pořád
  sedí původní datum a částka.
- **Péče o auto – text**: obrázky z listu Péče o auto přepsané a doplněné (plán údržby, přehled podle km, zima/léto,
  DSG, mytí) v listu „Péče o auto – text“ (akce `autoPeceZapsat` – jiné listy nemění, obsah bez `prepsat` nepřepíše).
  V aplikaci tlačítko **Péče o auto** na liště stránky Auto → boční panel: Co řešit, Kdy přezouvat, Servis podle auta,
  přehled podle km jako osa a oddíly z listu (nadpis oddílu = tučný řádek).
- **Co řešit** (motor `AUTO_.pripominky`): přezutí na zimní od 10. 10. (do 15. 11.) a na letní od 20. 3., příprava na
  zimu (říjen), klimatizace a pylový filtr (duben–květen), olej a prohlídka podle auta (≤ 1 500 km / 21 dní), AdBlue,
  výročí pojištění (poslední roční platba + rok) a konec dálniční známky (365 dní) – **termíny zadané v Péče o auto →
  Termíny** (`CLAUDE_SCHRANKA/AUTO/terminy.json`: `znamka`, `stk`, `pojisteni`; zapisuje aplikace přes `autoTermin` i Claude
  ze schránky) mají přednost, STK se připomíná jen ze zadaného termínu (45 / 21 dní předem). Hotovo = odpovídající zápis
  v Náklady. Karta nahoře na stránce Auto, aktuální věci i na Dnes, do iPhonu jednou za sezónu (`upozorneniAuto_`,
  jednou denně, `OHLASENO_AUTO`).
- **Výdaje po měsících**: souvislá řada 13 měsíců s rokem; najetí myší nebo klepnutí na sloupec (i Tab a šipky) = bublina
  „říjen 2026 · 3 450 Kč“ s rozpisem po kategoriích („Ostatní“ = vše kromě paliva). **Cena nafty**: bublina u tankování
  s datem, Kč/l, litry, částkou a stavem km.
- Tabulka se propojí odkazem na stránce Auto (vlastnost `AUTO_TABULKA`). Motor k tomu potřebuje oprávnění k Tabulkám
  a službu Drive API – obojí je v `apps-script/appsscript.json`; po jeho vložení jednou spustit **`povolitTabulky`**.

## Nasazení motoru

**Automaticky z PC** (od 5. 10. 2026): `python NASTROJE\asistent\motor\nasad_motor.py` – testy motoru → kontrola projektu
na serveru (motor se tam jmenuje `Kód`, ostatní soubory – starý `Index.html` přehledové aplikace – pošle zpátky beze změny,
takže push nic nesmaže; stejná oprávnění) → `clasp push` → nová verze stávajícího nasazení (adresa `…/exec` zůstává)
→ ověření, že adresa vrací novou verzi (`/exec?verze=1`). ID projektu a nasazení jsou jen v `nastaveni.json` vedle skriptu
(mimo git). Jednorázově na každém PC: Google Apps Script API zapnuté (script.google.com/home/usersettings) a
`npx -y @google/clasp@3.4.1 login`. Když přibude oprávnění, skript kód nahraje, ale nasazení počká, až Michal v editoru
spustí `povolitTabulky` a klikne Povolit (pak skript pustit znovu).

**Ručně** (náhradní cesta, nebo nový projekt):

1. <https://script.google.com> → projekt motoru → `Kód.gs` nahradit obsahem `apps-script/Kod.gs`.
2. ⚙ Nastavení projektu → **Zobrazit soubor manifestu** → `appsscript.json` = obsah `apps-script/appsscript.json`
   (když přibude oprávnění – naposledy Tabulky a služba Drive API pro auto –, spustit jednou `povolitTabulky` a povolit).
3. Uložit; u nového projektu spustit **`nastavApi`** → povolit přístup → z protokolu zkopírovat **klíč** (nikam ho neposílat).
4. **Nasadit → Spravovat nasazení → tužka** → Webová aplikace, Spustit jako **Já**, Kdo má přístup **Kdokoli** →
   Verze **Nová verze** → Nasadit. Adresa (`…/exec`) zůstane stejná.
5. Kontrola: adresa v anonymním okně napíše „Asistent – motor běží.“ (s `?verze=1` jen číslo verze); aplikace v Nastavení →
   Připojení ukáže verzi motoru.

Aplikace pozná starší motor (bez seznamu akcí) a místo nových funkcí ukáže návod na Novou verzi.

Vlastnosti skriptu (⚙ → Vlastnosti skriptu) – všechny nepovinné kromě klíče, který vytvoří `nastavApi`:

| Vlastnost | K čemu |
|---|---|
| `API_KLIC` | klíč aplikace (heslo k poště) – vytváří `nastavApi`, nový `novyKlic` |
| `PRACOVNI_ADRESA`, `PODPISY` | pracovní pošta a podpisy (nastavuje aplikace) |
| `POCASI` | domov pro počasí (nastavuje aplikace: Nastavení → Počasí → Domov; výchozí Veselí nad Moravou) |
| `AUTO_ZMENA`, `ZDRAVI_ZMENA`, `WHOOP_OTISK` | značky změn auta a zdraví (`zmeny`); otisk posledních dat WHOOP (spravuje motor) |
| `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI` | propojení s WHOOP (zadá Michal sám) |
| `ZDRAVI_KLIC` | klíč zkratky Zdraví (vytvoří aplikace v Nastavení → Zdraví) |
| `NTFY_TEMA`, `UPOZORNENI_WHOOP` | upozornění do iPhonu (zapíná aplikace v Nastavení → Upozornění), poslední hodina stažení WHOOP pro upozornění |
| `TYDEN_ZDRAVI_POZADANO`, `TYDEN_ZDRAVI_ODESLANO` | týdenní shrnutí zdraví: poznámka pro Clauda už je (týden a čas úpravy jeho souborů), e-mail za týden odešel (spravuje motor) |
| `NAVRHY_ODPOVEDI` | návrhy odpovědí: obe / osobni / vypnuto (nastavuje aplikace) |
| `DOCHAZKA_URL`, `DOCHAZKA_WEB` | odkud číst docházku dorostu (výchozí: odvodí se z webu dorostu) |
| `POCASI_MISTA`, `POCASI_POLOHA` | místa podle polohy a poslední poloha pro upozornění (spravuje motor) |
| `REELY_STAV` | které reely už jsou na Instagramu (nastavuje aplikace) |
| `AUTO_TABULKA` | ID tabulky Google s náklady auta (nastaví aplikace odkazem na stránce Auto) |
| `IG_TOKEN`, `IG_UCET`, `IG_TOKEN_OBNOVA`, `REELY_PLAN` | Instagram: klíč (vloží Michal, motor obnovuje), účet, plán zveřejnění reelů (čas, označené účty) |
| `REELY_POPISEK:<id>` | upravený popisek reelu jen pro Instagram (do zveřejnění nebo zrušení plánu) |
| `FOTBAL`, `DRUHY_KALENDARU`, `ICS_KALENDARE`, `SKRYTE_KALENDARE`, … | spravuje motor sám |

## Instalace aplikace
Adresa: <https://mk-asistent.github.io> (organizace `mk-asistent`, vlastní adresa kvůli oddělení dat).
- **iPhone / iPad:** Safari → Sdílet → **Přidat na plochu** → v aplikaci se **přihlásit účtem** (e-mail a heslo),
  jinak „Připojit adresou a klíčem“ a vložit „kód pro připojení“ (Nastavení → Připojení → Připojit další zařízení na PC).
- **Účet:** založí se v konzoli Firebase (registrace je vypnutá). Na připojeném zařízení Nastavení → Připojení → Účet →
  přihlásit – adresa motoru a klíč se uloží do účtu (odtud je bere server a nová zařízení). Po novém klíči motoru
  (`novyKlic`) na připojeném zařízení „Změnit adresu nebo klíč“ – uloží se i do účtu.
- **PC:** Chrome nebo Edge → v adresním řádku **Nainstalovat aplikaci**.
- Bez motoru jde aplikaci vyzkoušet s ukázkovými daty („Jen vyzkoušet“).
- **Nové verze:** service worker posílá aplikaci vždy celou z jedné uložené verze (moduly k sobě sedí, start hned
  i bez sítě); novou verzi stáhne na pozadí a aplikace se sama jednou znovu načte (`js/start.js`, rozepsaný text
  nesmaže). `VERZE` v `sw.js` je otisk obsahu souborů → po každé změně `node testy/sw_verze.js --zapsat` (test jinak
  selže). Když se aplikace přesto nespustí (prázdná obrazovka), za 8 s nabídne **Načíst znovu** (smaže uložené soubory
  aplikace, data i přihlášení zůstanou). Dřív šel každý soubor zvlášť ze sítě s limitem 3 s a při pomalé síti se
  míchaly dvě verze – aplikace v mobilu se pak nespustila (5. 10.).

## Co se jak často načítá (šetří limity Googlu – Michal 5. 10.)
| Data | Server (Firebase, 6–23 h) | Aplikace |
|---|---|---|
| Pošta, schránka, kalendář | každých 10 min (pošta s otiskem – beze změny bez načítání zpráv) | z kopie hned |
| Fotbal, nastavení (`info`) | jednou za hodinu | kopie platí 3 h |
| Reely | jednou za půl hodiny | kopie platí 90 min |
| Značky změn (`zmeny`) | každá obnova (v dávce – do 9. 10. ji motor v dávce odmítal, aplikace se proto ptala zvlášť) | auto a zdraví se načtou, když se k nim zapisovalo odjinud (i zkratka, Claude, WHOOP) |
| Zdraví (voda, jídlo, doplňky, váha) | – (jen motor, zdravotní data jen na Disku; motor drží hotový přehled v mezipaměti) | s účtem jen po signálu / značce změny (záloha po 6 h), bez účtu při návratu nejvýš 1× za 15 min |
| WHOOP | spouštěč motoru každých 10 min stáhne nová data nejvýš 1× za 30 min | čtení Zdraví na WHOOP nečeká (dřív 10 s) |
| Počasí | – (jen motor, podle polohy zařízení) | při návratu nejvýš 1× za 30 min |
| Auto (tabulka) | – | na stránce Auto: poprvé, po 6 h, podle značky změny nebo hned po signálu |

**Start** (Michal 9. 10.: „dostat načtení na sekundu“): aplikace se ukáže hned z dat v zařízení a obnoví se potichu –
kolečko u Obnovit jen po klepnutí. Knihovny Firebase stahuje index.html hned (`modulepreload`) a service worker je po prvním
použití vydává ze zařízení; funkce Firebase (obnovHned) až při první obnově.

**Rychlost práce na stránce** (Michal 9. 10.: „co nejrychlejší práce na stránce“; měření `testy/mereni_rychlosti.js`):
- **Okamžitý snímek:** při odchodu z aplikace (do pozadí, zavření) a 4 s po posledním překreslení se uloží HTML viditelné
  stránky a lišt (`asistent.data.snimek`, `ulozSnimek` v app.js). Při dalším otevření ho `js/start.js` ukáže hned po
  načtení HTML – ještě než se stáhnou a spustí moduly; `start()` ho pak smaže a ve stejném kroku vykreslí aplikaci
  (`zrusSnimek`). Jen ze stejného dne, pro stejnou stránku (Dnes, Schránka, Pošta, Kalendář, Zdraví) a stejné rozložení
  (telefon / iPad / PC); klepnutí čekají na aplikaci; záchrana „Načíst znovu“ platí i pod snímkem. Maže se s uloženými
  daty, při odpojení a u nové verze (`asistentBezSnimku`); vypnout jde `asistent.bezSnimku` v localStorage.
- **Moduly naráz:** index.html přednačte všech 30 modulů, které app.js při startu importuje (`modulepreload`) – **nový modul
  `js/*.js` = řádek do index.html i do `SOUBORY` v sw.js** (test „index.html: modulepreload“ to hlídá). Ukázková data
  (`ukazka.js`) se načtou až v ukázkovém režimu.
- **Překresluje se jen změna:** Dnes (karty), Pošta (lišty a seznam), Schránka, Kalendář, hlavička a lišty se přepíšou, jen
  když se jejich HTML změnilo (`nastavHtml` v app.js) – načtení jiných dat nemaže rozepsanou odpověď Claudovi (text, fokus
  i kurzor se vrátí, i když se karta vymění), otevřenou bublinu grafu ani posun časové osy. Nový kód, který mění DOM přímo
  (třída, `hidden`, hodnota pole), musí počítat s tím, že ho překreslení nemusí vrátit zpět.
- **Pošta:** řádky mimo obrazovku prohlížeč neskládá (`content-visibility: auto`), náhledy se čistí jednou (paměť
  `cistaUkazka`), výška detailu vedle seznamu se měří (`--posta-detail-nahore`).
- **Telefon:** karty Dnes a Zdraví pod obrazovkou se skládají až při posunu k nim (`content-visibility` v app.css) – první
  obraz při otevření o ~0,4 s dřív (měřeno CPU 4×); test, který měří karty, musí stránku napřed projet. Snímek celé stránky
  (`fullPage`) by obsah mimo obrazovku nechal prázdný – testy ho na dobu snímku vykreslí (`novaStranka`), ruční kontrola
  přidá styl `* { content-visibility: visible !important }`.

**Hned na všech zařízeních** (Michal 9. 10.: „na mobilu jsem přidal vodu a na PC to není – má to být aktuální hned“):
- Zápis ke zdraví nebo k autu → aplikace zapíše do účtu signál `data/_signal` (`{ zdravi: ms, auto: ms }` – jen čas, žádná
  zdravotní data; pravidla `firestore.rules` nic jiného nepustí). Ostatní zařízení ho dostanou živě a načtou si zdraví / auto
  z motoru; zařízení, které zapisovalo, svůj signál znovu nenačítá. Zápis ke zdraví ani autu kopie na serveru nezneplatní.
- Ostatní zápisy zneplatní jen kopie své oblasti (poznámka → schránka, archivace → pošta, událost → kalendář; neznámý zápis
  všechno) a server za 2 s obnoví jen je (`obnovHned` s `jen`, bez omezení 45 s) – poznámka je na druhém zařízení za pár
  vteřin, bez čekání na poštu. Běží-li zrovna jiná obnova, ta po změně se pustí hned po ní.
- **Obnovit** a otevření se staršími kopiemi (> 4 min) = celá obnova (`vse`, nejvýš 1× za 45 s). Server jede 6:00–23:50.
Intervaly: `INTERVALY_MIN` v `firebase/functions/obnova.js`, platnost kopií `MAX_STARI_ID` a oblasti zápisů `KOPIE_ZAPISU`
v `js/ucet.js`.

**Nová verze aplikace** (service worker, `js/start.js`): přenačte se hned jen ve skryté aplikaci nebo do 8 s po otevření /
návratu z pozadí, a to bez otevřeného panelu a rozepsaného textu; jinak toast „načte se, až ji zavřeš“ a přenačtení při
odchodu do pozadí (dřív to Michala vyhazovalo z Nastavení).

## Ztracené odpovědi motoru
Google odpověď na POST webové aplikace občas ztratí (hlavně když běží víc pomalých dotazů naráz): prohlížeč pak skončí na
úvodu motoru (`doGet` – „Asistent – motor běží.“) nebo na 404 z `script.googleusercontent.com`, i když motor akci
provedl. Aplikace proto posílá s každým dotazem `rid` a ztracenou odpověď zkusí ještě 2× se stejným `rid`; motor zápis
se stejným `rid` podruhé neprovede a vrátí výsledek prvního běhu (CacheService 10 min, čtení se nepamatují –
`CTENI_MOTORU`). Server Firebase (jen čte) zkouší ztracenou odpověď znovu taky. Obnovit s účtem nechá poštu, kalendář
a reely na serveru (dřív posílal motoru deset dotazů naráz).

## Pracovní pošta
Motor čte jen Gmail. Pracovní schránka se do něj dostane **přeposíláním kopií** od poskytovatele; odpovídá se přes
Gmail → Nastavení → Účty → **Odesílat poštu jako**. V aplikaci Nastavení → Pošta zadat pracovní adresu – aplikace
poštu oddělí a odpovídá z adresy, na kterou zpráva přišla.

## Bezpečnost
- **Klíč je heslo k poště.** Při ztrátě zařízení: v editoru motoru spustit `novyKlic`.
- Zkratka Zdraví má **vlastní klíč jen pro zápis** – poštu neotevře. WHOOP secret je jen ve vlastnostech skriptu.
- HTML e-maily běží v rámečku **bez skriptů**; obrázky z webu se načtou až na klepnutí „Zobrazit“.
- Repozitář je veřejný (GitHub Pages zdarma jinak nejde): žádné adresy motoru, klíče, odkazy na kalendáře ani osobní
  údaje. Ukázková data jsou vymyšlená (i hráči na stránce Fotbal); testovací vzorky ČHMÚ a fotbal.cz jsou veřejná data.
  Konfigurace Firebase v `js/ucet.js` je veřejná z principu (není tajná) – přístup hlídá přihlášení a pravidla databáze.
  Commity mají jen skrytou adresu GitHubu (noreply), ne osobní e-mail.
- Aplikace smí volat jen motor (`script.google.com`), Open-Meteo a vlastní projekt Firebase (přihlášení, databáze,
  funkce – CSP `connect-src`; knihovny Firebase z `gstatic.com`); nic jiného z ní neodejde.
- **Firestore (účet):** adresa motoru a klíč (`uzivatele/{uid}`) a kopie dat pro rychlý start – přehled pošty (odesílatel,
  předmět, ukázka), schránka, kalendář na 2 měsíce, nastavení, fotbal a reely (`uzivatele/{uid}/data`). Čte je jen
  přihlášený vlastník a server; registrace je vypnutá. **Zdraví a počasí na server nejdou.**
- Data, která zůstávají jen na Michalově Disku: zdraví a režim doplňků, plné FOTBAL.json, podklady a návrhy odpovědí na
  poštu, videa reelů (nezletilí hráči – videa se nesdílí, odkaz otevře jen Michalův účet).

## Testy
```
node apps-script/test/ics.test.js      # kalendář .ics: opakování, zóny, výjimky
node testy/test_jmeniny.mjs            # svátky: domácké tvary, výběr, hromadné přidání oblíbených bez duplicit, nejbližší svátek
node apps-script/test/motor.test.js    # motor s napodobenými službami Googlu, ČHMÚ, WHOOP
cd testy && npm i && npx playwright install chromium && node test_aplikace.js   # telefon, iPad, PC, tmavý režim
JEN=telefon node test_aplikace.js      # jen testy, jejichž název obsahuje „telefon“
PORT_TESTU=8776 node test_aplikace.js  # jiný port, když na PC zrovna běží testy z jiné kopie repa
node testy/test_plakat.mjs             # plakát: víkendy, plakát podle rozlosování, znaky soupeřů, souhrn pro Clauda
node testy/sw_verze.js --zapsat        # po změně souborů aplikace: VERZE service workeru podle obsahu
node firebase/functions/test.js        # server: obnova kopií z napodobeného motoru
node testy/mereni_rychlosti.js         # rychlost: studený/teplý start, přepínání stránek, e-mail, psaní (telefon CPU 4×, pomalé 4G)
```
Testy aplikace běží i s účtem – Firebase je v nich napodobený (knihovny přes `page.route`, data v testu), skutečný
projekt se nevolá.
