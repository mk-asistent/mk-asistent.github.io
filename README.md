# Asistent

Osobní přehled v jedné aplikaci: **schránka poznámek pro Clauda**, **pošta** (osobní a pracovní účet), **kalendář**
(Google + kalendáře z iPhonu), **počasí ČHMÚ**, **zdraví** (WHOOP + Apple Watch), **zápasy klubu** z fotbal.cz
a hotové **reely** s popisky pro Instagram a **auto** (náklady a tankování z tabulky Google, účtenky z fotky).
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
zleva** po klepnutí na jméno nahoře – všechny sekce včetně Zdraví, Fotbalu a Reelů, dole Nastavení.

## Dnes
Každá věc jen jednou: nahoře **výstrahy ČHMÚ** (jen když nějaká platí), karty **Počasí**, **Připravenost** (WHOOP),
**Další zápas** a **Nepřečtené**, pod tím jeden seznam **Vyžaduje pozornost** (úkoly, rozhodnutí, návrhy od Clauda
i pošta seřazené podle naléhavosti), vpravo **týden jako krátký výpis**, **Fotbal** (poslední výsledek a další zápas
každého týmu, šipka na stránku Fotbal), **Doplňky dnes** (odškrtávací seznam podle režimu z Disku – zápasové jen v den
zápasu, kofein do 14:00) a **poznámka pro Clauda** s malým přehledem schránky a odpověďmi Clauda. Po návratu do aplikace
okno **Co je nového** (hoří, nová pošta, odpovědi Clauda, nové výstrahy).

## Schránka
Poznámky z iPhonu (zkratka „Pro Clauda“) i z aplikace; Claude je zpracovává každou půlhodinu (skill `asistent-schranka`).
U položky: **Dopsat** (i k vyřízené – vrátí se ke zpracování), **Nadpis**, **Téma** (práce, osobní, fotbal, zdraví,
domov, nákup – filtr nahoře), **Smazat** (koš na Disku, jde vrátit). Diktát typu „pozvi Petra na schůzku v úterý
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
Ve vlákně je **nejnovější zpráva nahoře**. **Štítky Gmailu** jsou u konverzací a nahoře jde vybrat štítek (i archivované
konverzace). **Podpis** (osobní / pracovní) se vloží do psaní; v poli Komu i u hostů události **našeptává** lidi,
kterým jsi psal. Hledání v celé poště rozumí českým filtrům (`od:`, `předmět:`, `má:přílohu`, `po:1.10.2026`…).
Klávesy na PC: `j`/`k`, `e` hotovo, `h` připomenout, `r` odpovědět, `a` všem, `f` přeposlat, `c` nový, `/` hledat, `1`–`6` sekce.

**Návrhy odpovědí od Clauda:** motor zapíše konverzace, které čekají na odpověď (hoří, čeká na tebe, otázka), do
`CLAUDE_SCHRANKA/POSTA_K_ODPOVEDI.json` (jen při změně, nejvýš 15). Naplánovaná úloha „Návrhy odpovědí“ (skill
`asistent-posta-odpovedi`, každou hodinu 7–21 h) k nim napíše návrh do `CLAUDE_SCHRANKA/ODPOVEDI/<id>.json`. V seznamu
je štítek **Návrh odpovědi**, v konverzaci karta **Použít a upravit** (psaní s textem a podpisem) / **Zahodit**. Odesílá
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
Místo: vlastnost skriptu `POCASI` (JSON, např. `{"misto":"Hodonín","orp":{"6206":"Hodonín"},"stanice":[],"kraj":"RPJM"}`);
bez ní Veselí nad Moravou.

**Podle polohy** (Nastavení → Počasí, na každém zařízení zvlášť): aplikace pošle polohu zaokrouhlenou na 0,01° (~1 km),
motor z ní přes RÚIAN (ČÚZK) zjistí ORP a obec, vezme výstrahy pro ten ORP, předpověď kraje a dvě nejbližší vodoměrné
stanice s povodňovými stupni (místa si pamatuje ve `POCASI_MISTA`). Teplotu teď a příštích 12 hodin bere telefon přímo
z **Open-Meteo** (model ČHMÚ ALADIN, bez klíče). Ranní upozornění použijí poslední polohu (nejvýš den starou); po vypnutí
se zapomene.

## Zdraví (WHOOP + Apple Watch)
- **WHOOP** (API v2, OAuth): vlastní aplikace na developer-dashboard.whoop.com (Sandbox, jen pro sebe; Privacy Policy URL
  `https://mk-asistent.github.io/soukromi.html`, Redirect URL = adresa `/exec` motoru) → vlastnosti skriptu
  `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI` → v aplikaci Zdraví → **Propojit**. Tokeny spravuje motor.
- **Apple Watch:** zkratka v iPhonu „Zdraví do Asistenta“ (spouští ji otevření aplikace WHOOP – zamčený iPhone data Zdraví
  nevydá) pošle denní hodnoty za 7 dní (`akce: zdraviApple`, vlastní klíč `ZDRAVI_KLIC` jen pro zápis – ukáže ho
  Nastavení → Zdraví). Postup krok za krokem je přímo v aplikaci.
- Data po měsících v `CLAUDE_SCHRANKA/ZDRAVI/RRRR-MM.json` (soukromý Disk, nikdy do gitu). Trénink se spáruje s událostí
  v kalendáři (zápas, trénink) a čísla z WHOOP jsou i v detailu zápasu.
- **Váha:** ruční zápis v kartě Váha na stránce Zdraví (Enter nebo Zapsat) nebo na telefonu přes „+“ → Váha. Motor
  (akce `vaha`) ke každému zápisu uloží čas zápisu → `CLAUDE_SCHRANKA/ZDRAVI/VAHA.json`; karta ukáže poslední váhu
  s časem, rozdíl proti minulému vážení, čáru posledních 30 zápisů a 6 posledních zápisů (překlep jde smazat).
- **Doplňky:** režim v `CLAUDE_SCHRANKA/ZDRAVI_REZIM.json` (položky s časem dne, `jen`: trenink / zapas / zatez,
  `treninkDny`, `zapasTymy`, `kofeinDo`) – motor ho posílá se Zdravím, aplikace z něj skládá Doplňky dnes; odškrtnutí
  se pamatuje v zařízení. Skutečný režim je jen na Disku (zdravotní údaje do repa nepatří).
- **Upozornění (nepovinné):** v editoru spustit `nastavUpozorneni` (téma pro aplikaci ntfy) a přidat spouštěč
  `kazdouHodinu` (hodinový) → ráno souhrn a připravenost, oranžové a vyšší výstrahy ČHMÚ, hoří v poště (jen počty)
  a v neděli 19–21 h **přehled příštího týdne** (počty událostí po dnech, zápasy týmů, úkoly s termínem, předpověď) –
  přes ntfy jdou jen počty a časy, žádné názvy událostí ani texty.

## Instagram – naplánované reely
Na stránce Reely jde reel **naplánovat na Instagram** (datum a čas, výchozí nejbližší 18:00). Motor ho v ten čas zveřejní
sám na klubovém účtu přes Instagram API (Meta aplikace „Asistent FK Vnorovy“ ve vývojovém režimu, účet je v ní tester):
- klíč `IG_TOKEN` ve Vlastnostech skriptu (vloží Michal, platí 60 dní, motor ho jednou týdně obnoví), plán `REELY_PLAN`;
- spouštěč **`instagramKazdych10Min`** (Spouštěče → Minutový časovač → Každých 10 minut) – jeden reel za běh;
- Instagram si video stahuje z adresy → video na Disku má jen po dobu stahování tajný odkaz (Michal souhlasil 5. 10.),
  hned potom se sdílení vypne; popisek je přesně ten z `popisky\*.txt`;
- po vložení klíče jednou spustit `overInstagram` (vypíše účet).

## Auto (náklady a tankování)
Stránka Auto čte Michalovu tabulku Google (listy **Náklady**, **Tankování**, **Přehled**) – tabulka zůstává hlavní a je i záloha.
- Přehled: najeto od koupě, spotřeba (litry mezi tankováními se známým stavem km), nafta na 1 km, provoz bez koupě,
  cena nafty v čase, výdaje po měsících a kategoriích, kdo co zaplatil (z Přehledu), servis podle listu Péče o auto.
- Zápis: **Tankování** (částka, cena za litr → litry vzorcem jako v tabulce, stav km, stanice) a **Výdaj** (kategorie
  z tabulky) jdou do prvního volného řádku pod posledním zápisem; poslední zápis jde smazat (překlep).
- **Stav z auta (MyŠkoda)**: domácí PC jednou denně (úloha Windows „Asistent - MySkoda“, 3:30) zapíše
  `CLAUDE_SCHRANKA/AUTO/myskoda.json` – tachometr, nádrž, dojezd, servis (bez polohy a VIN); nástroj `NASTROJE\asistent\myskoda`.
- **Účtenka**: vyfotit → fotka do `CLAUDE_SCHRANKA/AUTO/uctenky`, text přes OCR Disku → předvyplněný zápis; v tabulce je
  pak u poznámky odkaz „účtenka“ na fotku. Bez potvrzení se nic nezapíše.
- Tabulka se propojí odkazem na stránce Auto (vlastnost `AUTO_TABULKA`). Motor k tomu potřebuje oprávnění k Tabulkám
  a službu Drive API – obojí je v `apps-script/appsscript.json`; po jeho vložení jednou spustit **`povolitTabulky`**.

## Nasazení motoru

1. <https://script.google.com> → projekt motoru → `Kód.gs` nahradit obsahem `apps-script/Kod.gs`.
2. ⚙ Nastavení projektu → **Zobrazit soubor manifestu** → `appsscript.json` = obsah `apps-script/appsscript.json`
   (když přibude oprávnění – naposledy Tabulky a služba Drive API pro auto –, spustit jednou `povolitTabulky` a povolit).
3. Uložit; u nového projektu spustit **`nastavApi`** → povolit přístup → z protokolu zkopírovat **klíč** (nikam ho neposílat).
4. **Nasadit → Spravovat nasazení → tužka** → Webová aplikace, Spustit jako **Já**, Kdo má přístup **Kdokoli** →
   Verze **Nová verze** → Nasadit. Adresa (`…/exec`) zůstane stejná.
5. Kontrola: adresa v anonymním okně napíše „Asistent – motor běží.“; aplikace v Nastavení → Připojení ukáže verzi motoru.

Aplikace pozná starší motor (bez seznamu akcí) a místo nových funkcí ukáže návod na Novou verzi.

Vlastnosti skriptu (⚙ → Vlastnosti skriptu) – všechny nepovinné kromě klíče, který vytvoří `nastavApi`:

| Vlastnost | K čemu |
|---|---|
| `API_KLIC` | klíč aplikace (heslo k poště) – vytváří `nastavApi`, nový `novyKlic` |
| `PRACOVNI_ADRESA`, `PODPISY` | pracovní pošta a podpisy (nastavuje aplikace) |
| `POCASI` | jiné místo pro počasí (výchozí Veselí nad Moravou) |
| `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI` | propojení s WHOOP (zadá Michal sám) |
| `ZDRAVI_KLIC` | klíč zkratky Zdraví (vytvoří aplikace v Nastavení → Zdraví) |
| `NTFY_TEMA` | upozornění do iPhonu (vytvoří `nastavUpozorneni`) |
| `NAVRHY_ODPOVEDI` | návrhy odpovědí: obe / osobni / vypnuto (nastavuje aplikace) |
| `DOCHAZKA_URL`, `DOCHAZKA_WEB` | odkud číst docházku dorostu (výchozí: odvodí se z webu dorostu) |
| `POCASI_MISTA`, `POCASI_POLOHA` | místa podle polohy a poslední poloha pro upozornění (spravuje motor) |
| `REELY_STAV` | které reely už jsou na Instagramu (nastavuje aplikace) |
| `AUTO_TABULKA` | ID tabulky Google s náklady auta (nastaví aplikace odkazem na stránce Auto) |
| `IG_TOKEN`, `IG_UCET`, `IG_TOKEN_OBNOVA`, `REELY_PLAN` | Instagram: klíč (vloží Michal, motor obnovuje), účet, plán zveřejnění reelů |
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
node apps-script/test/motor.test.js    # motor s napodobenými službami Googlu, ČHMÚ, WHOOP
cd testy && npm i && npx playwright install chromium && node test_aplikace.js   # telefon, iPad, PC, tmavý režim
JEN=telefon node test_aplikace.js      # jen testy, jejichž název obsahuje „telefon“
node firebase/functions/test.js        # server: obnova kopií z napodobeného motoru
```
Testy aplikace běží i s účtem – Firebase je v nich napodobený (knihovny přes `page.route`, data v testu), skutečný
projekt se nevolá.
