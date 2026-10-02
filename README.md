# Asistent

Osobní přehled v jedné aplikaci: **schránka poznámek pro Clauda**, **pošta** (osobní a pracovní účet), **kalendář**
(Google + kalendáře z iPhonu), **počasí ČHMÚ**, **zdraví** (WHOOP + Apple Watch) a **zápasy klubu** z fotbal.cz.
Webová aplikace (PWA) – na iPhonu, iPadu i PC se přidá na plochu a otevírá se jako samostatná aplikace.

## Z čeho se skládá

| Část | Co |
|---|---|
| `index.html`, `app.css`, `js/` | aplikace – statické soubory na GitHub Pages, žádné sestavování ani knihovny |
| `apps-script/Kod.gs` | **motor** v Google Apps Scriptu: Gmail, Kalendář Google, kalendáře z iPhonu (`.ics`), schránka na Disku, počasí ČHMÚ, WHOOP, data ze zkratky Zdraví, zápasy |
| `apps-script/appsscript.json` | manifest motoru – časové pásmo Praha a nutná oprávnění |
| `sw.js`, `manifest.webmanifest`, `ikony/` | instalace na plochu a start bez sítě (vždy se načte živá verze, když síť je) |
| `soukromi.html` | zásady soukromí (WHOOP je chce při registraci aplikace) |
| `apps-script/test/`, `testy/` | testy motoru (Node, i na skutečných vzorcích ČHMÚ a fotbal.cz) a aplikace v prohlížeči (Playwright) |

Aplikace mluví s motorem přes `POST` s klíčem. **Adresa motoru a klíč jsou jen v zařízení** (zadají se jednou
v aplikaci) – nikdy v tomhle repozitáři. Vzhled: styl „Fixtrack“, na telefonu „PriorAuth“, okna „CaseDraft“
(skill `osobni-vzhled`).

## Dnes
Každá věc jen jednou: nahoře **výstrahy ČHMÚ** (jen když nějaká platí), karty **Počasí**, **Připravenost** (WHOOP),
**Další zápas** a **Nepřečtené**, pod tím jeden seznam **Vyžaduje pozornost** (úkoly, rozhodnutí, návrhy od Clauda
i pošta seřazené podle naléhavosti), vpravo **týden jako krátký výpis**, **Fotbal** (poslední výsledek a další zápas
každého týmu) a **poznámka pro Clauda** s malým přehledem schránky a odpověďmi Clauda. Po návratu do aplikace okno
**Co je nového** (hoří, nová pošta, odpovědi Clauda, nové výstrahy).

## Schránka
Poznámky z iPhonu (zkratka „Pro Clauda“) i z aplikace; Claude je zpracovává každou půlhodinu (skill `asistent-schranka`).
U položky: **Dopsat** (i k vyřízené – vrátí se ke zpracování), **Nadpis**, **Téma** (práce, osobní, fotbal, zdraví,
domov, nákup – filtr nahoře), **Smazat** (koš na Disku, jde vrátit). Diktát typu „pozvi Petra na schůzku v úterý
v deset“ nebo „napiš trenérovi, že…“ Claude převede na **návrh** – limetková karta **Založit událost** / **Napsat e-mail**
otevře předvyplněný formulář; nic se neodešle, dokud ho Michal neuloží / neodešle.

**Rychlý zápis** (bez čekání na Clauda): když poznámka v poli zní jako schůzka nebo zpráva – „schůzka s Petrem zítra
v 10 na 2 hodiny“, „pozvi Janu na poradu ve středu v půl deváté“, „napiš Petrovi, že v úterý nepřijdu“ – pod polem se
hned nabídne **Do kalendáře** / **Napsat e-mail** (`js/rozbor.js`, čeština bez AI, nic neodesílá). Po uložení události
nebo odeslání e-mailu se poznámka smaže; **Uložit** ji pořád pošle do schránky.

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
Klávesy na PC: `j`/`k`, `e` hotovo, `h` připomenout, `r` odpovědět, `a` všem, `f` přeposlat, `c` nový, `/` hledat, `1`–`5` sekce.

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

## Počasí (ČHMÚ)
Motor čte otevřená data ČHMÚ (CC BY 4.0): výstrahy CAP pro ORP, vodní stav řeky s povodňovými stupni a textovou
předpověď kraje na dnes až 3 dny. Stahuje šetrně (ETag → 304, výpis předpovědí jednou za hodinu), přehled drží 15 minut.
Místo: vlastnost skriptu `POCASI` (JSON, např. `{"misto":"Hodonín","orp":{"6206":"Hodonín"},"stanice":[],"kraj":"RPJM"}`);
bez ní Veselí nad Moravou.

## Zdraví (WHOOP + Apple Watch)
- **WHOOP** (API v2, OAuth): vlastní aplikace na developer-dashboard.whoop.com (Sandbox, jen pro sebe; Privacy Policy URL
  `https://mk-asistent.github.io/soukromi.html`, Redirect URL = adresa `/exec` motoru) → vlastnosti skriptu
  `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI` → v aplikaci Zdraví → **Propojit**. Tokeny spravuje motor.
- **Apple Watch:** zkratka v iPhonu „Zdraví do Asistenta“ (spouští ji otevření aplikace WHOOP – zamčený iPhone data Zdraví
  nevydá) pošle denní hodnoty za 7 dní (`akce: zdraviApple`, vlastní klíč `ZDRAVI_KLIC` jen pro zápis – ukáže ho
  Nastavení → Zdraví). Postup krok za krokem je přímo v aplikaci.
- Data po měsících v `CLAUDE_SCHRANKA/ZDRAVI/RRRR-MM.json` (soukromý Disk, nikdy do gitu). Trénink se spáruje s událostí
  v kalendáři (zápas, trénink) a čísla z WHOOP jsou i v detailu zápasu.
- **Upozornění (nepovinné):** v editoru spustit `nastavUpozorneni` (téma pro aplikaci ntfy) a přidat spouštěč
  `kazdouHodinu` (hodinový) → ráno připravenost, oranžové a vyšší výstrahy ČHMÚ.

## Nasazení motoru

1. <https://script.google.com> → projekt motoru → `Kód.gs` nahradit obsahem `apps-script/Kod.gs`.
2. ⚙ Nastavení projektu → **Zobrazit soubor manifestu** → `appsscript.json` = obsah `apps-script/appsscript.json`.
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
| `FOTBAL`, `DRUHY_KALENDARU`, `ICS_KALENDARE`, `SKRYTE_KALENDARE`, … | spravuje motor sám |

## Instalace aplikace
Adresa: <https://mk-asistent.github.io> (organizace `mk-asistent`, vlastní adresa kvůli oddělení dat).
- **iPhone / iPad:** Safari → Sdílet → **Přidat na plochu** → v aplikaci vložit „kód pro připojení“ (Nastavení →
  Připojení → Připojit další zařízení na PC) nebo adresu motoru a klíč.
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
- Repozitář je veřejný: žádné adresy motoru, klíče, odkazy na kalendáře ani osobní údaje. Ukázková data jsou vymyšlená;
  testovací vzorky ČHMÚ a fotbal.cz jsou veřejná data.

## Testy
```
node apps-script/test/ics.test.js      # kalendář .ics: opakování, zóny, výjimky
node apps-script/test/motor.test.js    # motor s napodobenými službami Googlu, ČHMÚ, WHOOP
cd testy && npm i && npx playwright install chromium && node test_aplikace.js   # telefon, iPad, PC, tmavý režim
JEN=telefon node test_aplikace.js      # jen testy, jejichž název obsahuje „telefon“
```
