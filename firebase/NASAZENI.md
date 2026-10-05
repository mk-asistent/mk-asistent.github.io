# Firebase pro Asistenta

Projekt **asistent-michal** (tarif Blaze), databáze i funkce ve Frankfurtu (**europe-west3**).

| Soubor | Co dělá |
|---|---|
| `firestore.rules` | každý přihlášený vidí jen svůj dokument `uzivatele/{uid}` (adresa motoru a klíč) a své kopie dat `uzivatele/{uid}/data/*`; kopie zapisuje jen server |
| `functions/obnova.js` | zavolá motor (dávka info + schránka + fotbal + reely, pošta, kalendář na tento a příští měsíc) – čisté funkce |
| `functions/index.js` | `obnovAsistenta` každých 10 minut 6–23 h, `obnovHned` na žádost aplikace (při otevření se starými daty, po změně) |
| `functions/test.js` | test bez sítě a bez Firebase: `node functions/test.js` |

Na server **nejde zdraví** (zdravotní data jen na Disku) **ani počasí** (motor ho počítá podle polohy telefonu).
Kopie: `data/{id} = { json, otisk, kdy, parametry }` – přepisují se, jen když se obsah změnil;
`data/_stav = { kdy, potvrzeno: { id: ms }, chyby }`. Aplikace (`js/ucet.js`) kopii nepoužije, když je starší než 30 min
nebo když po ní v zařízení proběhla změna či přímé čtení z motoru – pak čte z motoru jako dřív.

## Jednou v konzoli Firebase (Michal)
1. Authentication → Sign-in method → **Email/Password** zapnout.
2. Authentication → Users → **Add user** (svůj e-mail a dlouhé heslo, jinde nepoužité).
3. Authentication → Settings → User actions → **vypnout „Enable create (sign-up)“** – nikdo další si účet nezaloží.
4. Firestore Database → Create database → **europe-west3 (Frankfurt)**, production mode.
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
