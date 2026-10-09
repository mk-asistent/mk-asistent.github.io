# Firebase pro Asistenta

Projekt **asistent-michal** (tarif Blaze): databáze Firestore **eur3** (Evropa, Belgie + Nizozemsko), funkce vedle ní
v **europe-west1** (Belgie – nejblíž databázi, nejlevnější pásmo). Webová aplikace Firebase „Asistent“ (konfigurace v `js/ucet.js`).

| Soubor | Co dělá |
|---|---|
| `firestore.rules` | každý přihlášený vidí jen svůj dokument `uzivatele/{uid}` (adresa motoru a klíč) a své kopie dat `uzivatele/{uid}/data/*`; kopie zapisuje jen server |
| `functions/obnova.js` | zavolá motor (dávka info + schránka + fotbal + reely, pošta, kalendář na tento a příští měsíc) – čisté funkce |
| `functions/index.js` | `obnovAsistenta` každých 10 minut 6–23 h, `obnovHned` na žádost aplikace (při otevření se starými daty, po změně); pracovní pošta: `obnovWedos` (10 min) a `wedos` (z aplikace) |
| `functions/wedos.js`, `functions/wedos_schranka.js` | pracovní pošta přímo z WEDOS (IMAP/SMTP) – čisté funkce a práce se schránkou (oddíl níž) |
| `functions/test.js` | test bez sítě a bez Firebase: `node functions/test.js` (spustí i `test_wedos.js` – napodobený IMAP/SMTP) |

Na server **nejde zdraví** (zdravotní data jen na Disku) **ani počasí** (motor ho počítá podle polohy telefonu).
Kopie: `data/{id} = { json, otisk, kdy, parametry }` – přepisují se, jen když se obsah změnil;
`data/_stav = { kdy, potvrzeno: { id: ms }, chyby }`. Aplikace (`js/ucet.js`) kopii nepoužije, když je starší než 30 min
nebo když po ní v zařízení proběhla změna či přímé čtení z motoru – pak čte z motoru jako dřív.

## Jednou v konzoli Firebase (Michal)
1. Authentication → Sign-in method → **Email/Password** zapnout.
2. Authentication → Users → **Add user** (svůj e-mail a dlouhé heslo, jinde nepoužité).
3. Authentication → Settings → User actions → **vypnout „Enable create (sign-up)“** – nikdo další si účet nezaloží.
4. Firestore Database → Create database → Evropa (**eur3**, vytvořeno 5. 10.), production mode.
5. Doporučeno: Google Cloud → Billing → **Budgets & alerts** (rozpočet třeba 50 Kč s upozorněním) – Blaze je placený
   tarif, provoz Asistenta se vejde do bezplatných limitů.
6. V terminálu `npx firebase-tools login` (přihlášení Googlem v prohlížeči – dělá Michal, Claude ne).

## Nasazení (Claude, po přihlášení Michala)
Z dočasné kopie – `node_modules` nepatří na Disk Google:
```bash
D="<scratchpad>/asistent-firebase"; rm -rf "$D"; mkdir -p "$D"; cp -r firebase/. "$D/"
cd "$D/functions" && npm install --no-audit --no-fund && node test.js
cd "$D" && npx -y firebase-tools deploy --only firestore:rules,functions --project asistent-michal --force
```
- `--force` odsouhlasí i úklid starých obrazů funkcí (Artifact Registry) – jinak se CLI ptá.
- První nasazení zapíná služby Googlu (Cloud Functions, Build, Run, Scheduler…) a může skončit chybou oprávnění
  Eventarc – za pár minut zopakovat.
- Webová aplikace ve Firebase: `npx firebase-tools apps:create WEB Asistent --project asistent-michal` a
  `apps:sdkconfig WEB <appId>` → veřejná konfigurace do `js/ucet.js` (`KONFIGURACE`). Není tajná – přístup hlídá
  přihlášení a pravidla.
- Kontrola: konzole → Functions → Logs; v aplikaci Nastavení → Připojení → Účet („Data ze serveru před …“, chyby).

## Pasti
- Server bere adresu motoru a klíč z účtu: po `novyKlic` v motoru se na připojeném zařízení v Nastavení **odhlásit
  a znovu přihlásit účet** (nebo „Změnit adresu nebo klíč“ – uloží se i do účtu). Do té doby server hlásí „Klíč motoru nesedí“.
- Gmail má denní limit čtení – proto 10 minut a jen přes den. Když v `_stav.chyby` naskočí „Service invoked too many
  times“, prodloužit interval (`schedule` v `functions/index.js`).
- Motor Apps Script se nemění – server volá stejné akce jako aplikace (`davka`, `posta`).

## Pracovní pošta přímo z WEDOS (IMAP + SMTP, od 9. 10. 2026)
Server se k pracovní schránce přihlašuje sám (bez přeposílání do Gmailu): `obnovWedos` každých 10 minut 6–23 h jen
STATUS Doručené a Odeslané (seznam se skládá znovu jen při změně, nebo jednou za hodinu kvůli termínům), `wedos` na
žádost aplikace: `obnov | detail | precteno (id / ids) | archivovat | smazat | vratit | odeslat | vypnout`. Servery: IMAP
`wes1-imap.wedos.net:993` a SMTP `wes1-smtp.wedos.net:465` (TLS, certifikát *.wedos.net – ověřeno 9. 10. 2026 jen DNS
a pozdravem serveru), přihlašovací jméno = celá adresa. Adresu a servery ukládá aplikace do `uzivatele/{uid}.wedos`
(`{ adresa, imap, smtp, jmeno }`; pravidla i server pustí jen `*.wedos.net`). **Heslo je jen v Secret Manageru.**

### 1. Heslo – uloží Michal sám (Claude ho nikdy nevidí)
```bash
npx -y firebase-tools functions:secrets:set WEDOS_HESLO --project asistent-michal
```
CLI se zeptá „Enter a value for WEDOS_HESLO“ → vložit heslo k pracovní schránce → Enter. Uloží se jako verze tajemství
v Google Secret Manageru projektu – ne do Firestore, repa ani logu. Nabídne-li CLI znovu nasadit funkce, které tajemství
používají, odpovědět **Yes** (nebo nasazení udělá Claude). Předtím `npx firebase-tools login` (jako u nasazení).

### 2. Nasazení (Claude) – stejný postup jako výš
- `npm install` stáhne `imapflow`, `mailparser`, `nodemailer` (pevné verze z `package.json`, starší než 2 týdny),
  `node test.js` pak běží i se skutečným rozborem e-mailů.
- Nasadí se nové funkce `obnovWedos` a `wedos` a nová pravidla (pole `wedos` v účtu, `wedosDetaily`). CLI při nasazení
  těch dvou funkcí ověří, že tajemství existuje, připojí jim ho (verze se zafixuje) a servisnímu účtu funkcí dá roli
  Secret Accessor; napoprvé zapne Secret Manager API.
- **Dokud heslo uložené není, celé nasazení funkcí skončí chybou** („Failed to validate secret…“) – nasazovat zatím jen
  `--only firestore:rules,functions:obnovAsistenta,functions:obnovHned` (heslo mají jen `obnovWedos` a `wedos`; v kódu je
  proto tajemství jménem v `secrets`, ne `defineSecret()` – s ním by firebase-tools 15 chtěl heslo při každém nasazení).
- Kontrola: aplikace Nastavení → Pošta → „Pracovní schránka přímo (WEDOS)“ (stav, poslední synchronizace, chyba);
  konzole → Functions → Logs (`wedos: heslo` = špatné heslo – text chyby ani adresy se nelogují).

### 3. V aplikaci (Michal)
Nastavení → Pošta → Pracovní schránka přímo (WEDOS): adresa (předvyplněná z pracovní pošty), jméno odesílatele,
servery (výchozí WEDOS) → **Zapnout a vyzkoušet**. Vypnout = server smaže kopii, detaily i svůj stav (heslo zůstává).

### Změna hesla
Znovu `functions:secrets:set WEDOS_HESLO` a nasadit `--only functions:obnovWedos,functions:wedos` – běžící funkce mají
verzi z posledního nasazení. Po novém nasazení server zkusí přihlášení hned (i po pauze za špatné heslo). Staré verze:
`npx -y firebase-tools functions:secrets:prune --project asistent-michal`. Úplné zrušení: v aplikaci Vypnout, smazat
funkce `obnovWedos` a `wedos`, pak `functions:secrets:destroy WEDOS_HESLO`.

### Cena
- Secret Manager: 6 aktivních verzí a 10 000 přístupů měsíčně zdarma (funkce čte tajemství jen při startu instance) → 0 Kč.
- Funkce: ~3 200 běhů měsíčně, většinou přihlášení + 2× STATUS (1–2 s, 512 MiB) → v bezplatných limitech.
- Cloud Scheduler: druhá plánovaná úloha (zdarma 3 na fakturační účet).
- Odchozí data z Belgie do WEDOS: jen příkazy IMAP a odeslané e-maily (stovky kB měsíčně); stahování pošty je příchozí
  provoz – zdarma. Firestore: pár zápisů za běh, jen při změně.

### Co server ukládá (Firestore, čte jen vlastník a server)
`data/wedos` – souhrny konverzací (odesílatel, předmět, náhled, stav) jako kopie pošty z motoru; `wedosDetaily/{id}` –
celé texty a HTML (do ~200 kB na zprávu) 10 nejnovějších konverzací a těch, které Michal otevřel; `wedosInterni/stav` –
UID zpráv, otisky adres známých lidí (ne adresy), vlastní texty posledních zpráv do 1 500 znaků (aplikace ho nečte);
`wedosOdeslano/{id}` – id odeslání na týden (opakovaný pokus e-mail nezdvojí).

### Pasti
- Špatné heslo → `chyba` v kopii (aplikace ji ukáže), další pokus po 15 min, 30 min, 1 h … nejvýš 8 h, ruční pokus
  nejdřív za 2 min (server se nebombarduje). Nové nasazení nebo změna adresy / serveru pauzu ruší.
- Kopii do Odeslaných dělá server (IMAP APPEND). Kdyby WEDOS ukládal odeslané i sám, budou tam dvakrát → v
  `wedos_schranka.js` (odesli) APPEND vypnout.
- Hotovo = archiv: složka se SPECIAL-USE \Archive, jinak „Archiv“ / „Archive“, jinak se založí „Archiv“; smazat = koš
  (\Trash). Tvoje odpovědi zůstávají v Odeslaných; seznam ukazuje jen konverzace se zprávou v Doručené (jako Gmail).
- Detaily se do jednoho dokumentu musí vejít (< 1 MiB): HTML starších zpráv se vynechá, texty se zkrátí (`zkraceno`).
- Ověřeno bez sítě: `test_wedos.js` (napodobený server) a ve scratchpadu skutečný imapflow proti místnímu IMAP serveru;
  se skutečnou schránkou WEDOS až po uložení hesla.
