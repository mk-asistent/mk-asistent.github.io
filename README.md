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

- **iPhone / iPad:** Safari → adresa aplikace → Sdílet → **Přidat na plochu** (nechat zapnuté *Otevřít jako webovou
  aplikaci*) → v aplikaci vložit adresu motoru a klíč.
- **PC:** Chrome nebo Edge → v adresním řádku **Nainstalovat aplikaci**.
- Bez motoru jde aplikaci vyzkoušet s ukázkovými daty („Jen vyzkoušet“ na úvodní obrazovce).

## Kalendář z iPhonu
V iPhonu: Kalendář → Kalendáře → ⓘ u kalendáře → **Veřejný kalendář** → Sdílet odkaz → Kopírovat.
Odkaz vložit v aplikaci (Nastavení → Kalendáře). Kdo odkaz zná, kalendář přečte – zůstává jen v motoru,
do aplikace se nevrací. Motor rozbaluje i opakované události (týdně, poslední pátek v měsíci, výjimky, přesuny).

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
