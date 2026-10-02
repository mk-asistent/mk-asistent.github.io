# Asistent

Osobní přehled v jedné aplikaci: **schránka poznámek pro Clauda**, **pošta** (osobní a pracovní účet)
a **kalendář** (Google + kalendáře z iPhonu). Webová aplikace (PWA) – na iPhonu, iPadu i PC se přidá
na plochu a otevírá se jako samostatná aplikace, bez lišty prohlížeče.

## Z čeho se skládá

| Část | Co |
|---|---|
| `index.html`, `app.css`, `js/` | aplikace – statické soubory na GitHub Pages, žádné sestavování ani knihovny |
| `apps-script/Kod.gs` | **motor** v Google Apps Scriptu: čte Gmail, Kalendář Google, kalendáře z iPhonu (soukromý odkaz `.ics`), schránku na Disku; odesílá odpovědi |
| `apps-script/appsscript.json` | manifest motoru – časové pásmo Praha a jen nutná oprávnění (kalendář jen pro čtení) |
| `sw.js`, `manifest.webmanifest`, `ikony/` | instalace na plochu a start bez sítě (vždy se načte živá verze, když síť je) |
| `apps-script/test/`, `testy/` | testy motoru (Node) a aplikace v prohlížeči (Playwright) |

Aplikace mluví s motorem přes `POST` s klíčem. **Adresa motoru a klíč jsou jen v zařízení** (zadají se
jednou v aplikaci) – nikdy v tomhle repozitáři.

Vzhled: styl „Fixtrack“ (skill `osobni-vzhled`) – postranní panel, hledání `Ctrl K` / `⌘ K`, přehled Dnes s čísly a grafy.

## Pošta jako případy
Nápad převzatý z poštovního klienta [Mailer](https://www.fastmailer.one/) (pravidla jsou vlastní): každá konverzace
v Doručené poště má stav, který motor určí hned a bez AI:

| Stav | Kdy |
|---|---|
| **Hoří** | výslovná naléhavost („urgentní“, „ihned“), nahlášený problém („nefunguje“, „výpadek“), termín do 48 hodin („do zítra“, „do pátku“ ve čtvrtek, „do 5. 10.“) |
| **Čeká na tebe** | někdo po tobě něco chce („prosím“, „pošlete“, „k připomínkám“…), nebo osobní zpráva bez jasného obsahu |
| **Otázka** | ptá se, ale nic nežádá |
| **Čekáš na ně** | poslední jsi psal ty (ne krátké „díky“, ne hromadně, ne na automatické adresy) |
| **Řeší se** | živá konverzace, ve které se od tebe teď nic nečeká |
| **Informace** | oznámení, automatické zprávy, kategorie Aktualizace; konverzace uzavřená tvým „díky“ |

**Hotovo** = archiv (konverzace se vrátí s novou zprávou), **Připomenout** = úkol s termínem do schránky (s odkazem
do Gmailu), **Spam**. Hledání v celé poště rozumí i českým filtrům (`od:`, `komu:`, `předmět:`, `má:přílohu`,
`je:nepřečtené`, `po:1.10.2026`, `před:`). Klávesy na PC: `j`/`k` další a předchozí, `e` hotovo, `h` připomenout,
`r` odpovědět, `a` všem, `f` přeposlat, `c` nový e-mail, `/` hledat, `1`–`4` sekce.

## Nasazení motoru (jednou)

1. <https://script.google.com> → projekt motoru → `Kód.gs` nahradit obsahem `apps-script/Kod.gs`
   (soubor `Index` ze staré verze aplikace smazat).
2. ⚙ Nastavení projektu → **Zobrazit soubor manifestu** → `appsscript.json` nahradit obsahem `apps-script/appsscript.json`.
3. Uložit, vybrat funkci **`nastavApi`** → **▶ Spustit** → povolit přístup. Z protokolu zkopírovat **klíč** – nikam ho neposílat.
4. **Nasadit → Spravovat nasazení → tužka** (nebo Nové nasazení u nového projektu) → Webová aplikace,
   Spustit jako **Já**, Kdo má přístup **Kdokoli** → Verze **Nová verze** → Nasadit. Adresa končí `/exec`.
5. Kontrola: adresa v anonymním okně napíše „Asistent – motor běží.“

Po každé úpravě motoru znovu krok 4 (Nová verze) – adresa zůstane stejná.

## Instalace aplikace

Adresa aplikace: <https://mk-asistent.github.io> (organizace `mk-asistent`, vlastní adresa kvůli oddělení dat).

- **iPhone / iPad:** Safari → adresa aplikace → Sdílet → **Přidat na plochu** (nechat zapnuté *Otevřít jako webovou
  aplikaci*) → v aplikaci vložit adresu motoru a klíč. Jednodušeji: na PC v Nastavení → Připojení → **Připojit další
  zařízení** zkopírovat „kód pro připojení“ (adresa i klíč v jednom) a v telefonu ho vložit do pole Adresa.
- **PC:** Chrome nebo Edge → v adresním řádku **Nainstalovat aplikaci**.
- Bez motoru jde aplikaci vyzkoušet s ukázkovými daty („Jen vyzkoušet“ na úvodní obrazovce).

## Kalendář
- **Čtení:** všechny zobrazené kalendáře Google + kalendáře z iPhonu (iCloud) přes soukromý odkaz:
  v iPhonu Kalendář → Kalendáře → ⓘ u kalendáře → **Veřejný kalendář** → Sdílet odkaz → Kopírovat → vložit v aplikaci
  (Nastavení → Kalendáře). Kdo odkaz zná, kalendář přečte – zůstává jen v motoru, do aplikace se nevrací.
  Motor rozbaluje i opakované události (týdně, poslední pátek v měsíci, výjimky, přesuny).
- **Zápis:** nová událost (tlačítko, „+ Přidat“ u dne, klepnutí do volné hodiny v týdnu, klávesa `n`), úprava, smazání,
  opakování každý týden, připomenutí. Zapisuje se jen do **vlastních kalendářů Google** – do iCloudu z Apps Scriptu
  zapisovat nejde. V iPhonu se kalendáře Google ukážou vedle iCloudu po přidání účtu Google
  (Nastavení → Aplikace → Kalendář → Účty kalendářů → Přidat účet → Google).
- **Zápasy:** šablona Zápas (tým, soupeř, doma/venku, výkop, sraz → „⚽ Vnorovy – Kyjov (dorost)“, připomenutí den
  a 2 h předem) do kalendáře „Zápasy“, který se založí sám. **Načíst rozpis** stáhne rozpis dorostu z webu dorostu
  (`rozpis-dorost.js`) a zápasy přidá; opakovaný import jen upraví přeložené, nic nezdvojí ani nesmaže
  (id zápasu je ve štítku události). Další rozpisy: pole `ROZPISY` v `js/udalost.js`.

## Pracovní pošta
Motor čte jen Gmail. Pracovní schránka se do něj dostane **přeposíláním kopií** od poskytovatele; odpovídá se z ní
přes Gmail → Nastavení → Účty → **Odesílat poštu jako**. V aplikaci se pak v Nastavení → Pošta zadá pracovní adresa
a aplikace ji oddělí („Osobní“ / „Pracovní“) a odpovídá vždy z adresy, na kterou zpráva přišla.
Bez přeposílání může pracovní poštu (jen souhrny) dodávat skript na PC do `CLAUDE_SCHRANKA/POSTA_FIREMNI.json`.

## Bezpečnost
- **Klíč je heslo k poště.** Při ztrátě zařízení: v editoru motoru spustit `novyKlic` a nový klíč vložit do ostatních zařízení.
- Aplikace má **vlastní adresu** (samostatná organizace na GitHubu) – jiné stránky k jejím uloženým datům nemají přístup.
- HTML e-maily běží v rámečku **bez skriptů**; obrázky z webu (sledovací pixely) se načtou až na klepnutí „Zobrazit“.
- Repozitář je veřejný: žádné adresy motoru, klíče, odkazy na kalendáře ani osobní údaje. Ukázková data jsou vymyšlená.

## Testy
```
node apps-script/test/ics.test.js      # kalendář .ics: opakování, zóny, výjimky
node apps-script/test/motor.test.js    # motor s napodobenými službami Googlu
cd testy && npm i && npx playwright install chromium && node test_aplikace.js   # telefon, iPad, PC, tmavý režim
```
