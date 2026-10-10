// Start mimo moduly (klasický skript, nic neimportuje – funguje, i když se moduly aplikace nenačtou):
// okamžitý snímek poslední stránky, service worker, přenačtení po nové verzi a záchrana, když aplikace nenastartuje.
(function () {
  if (window.performance && performance.mark) performance.mark('asistent-start-js');

  // Okamžitý snímek (Michal 9. 10.: „co nejrychlejší práce na stránce“): stránka, jak vypadala při posledním odchodu
  // z aplikace (js/app.js ulozSnimek), se ukáže hned po načtení HTML – ještě než se stáhnou a spustí moduly aplikace
  // (na telefonu stovky ms). Aplikace ji pak smaže a vykreslí znovu s aktuálními daty (app.js start → zrusSnimek).
  // Jen ze stejného dne, pro stejnou stránku a stejné rozložení (telefon / iPad / PC) a jen v připojeném zařízení.
  // Klepnutí do snímku nic nedělají (pointer-events v app.css), dokud aplikace nenaběhne.
  try {
    var cti = function (k) { var v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); };
    var s = cti('asistent.data.snimek'), p = cti('asistent.pripojeni');
    var pohled = cti('asistent.pohled') || 'dnes';
    var d = new Date();
    var den = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    var rozlozeni = matchMedia('(max-width: 759px)').matches ? 'telefon' : matchMedia('(min-width: 1180px)').matches ? 'pc' : 'ipad';
    var a = document.getElementById('aplikace');
    var cil = document.getElementById('p-' + pohled);
    if (s && s.casti && p && (p.demo || (p.url && p.klic)) && !cti('asistent.bezSnimku') && s.den === den && s.pohled === pohled &&
        s.rozlozeni === rozlozeni && a && cil) {
      var html = document.documentElement;
      var motiv = cti('asistent.motiv');
      if (motiv && motiv !== 'auto') html.setAttribute('data-motiv', motiv);
      if (s.styl) html.setAttribute('style', s.styl);
      ['rail', 'horni', 'hlava', 'pruhy', 'lista'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = s.casti[id] || '';
      });
      document.getElementById('horni').className = s.horniTrida || 'horni';
      var sekce = a.querySelectorAll('[data-pohled]');
      for (var i = 0; i < sekce.length; i++) sekce[i].hidden = sekce[i] !== cil;
      cil.innerHTML = s.casti.stranka || '';
      a.className = s.trida || 'aplikace';
      html.classList.add('snimek');
      a.hidden = false;
      window.asistentSnimek = true;
      if (performance.mark) performance.mark('asistent-snimek');
    }
  } catch (e) { /* bez snímku – aplikace se vykreslí jako dřív */ }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    var mel = !!navigator.serviceWorker.controller; // první instalace = bez přenačtení
    var znovu = false;
    var otevreno = Date.now();
    var cekaNaVerzi = false;
    // otevřený panel (Nastavení, psaní, detail e-mailu…) – přenačtení by ho zavřelo a hodilo zpátky na stránku
    var panel = function () { return !!document.querySelector('#panely [data-panel]'); };
    // nová verze: snímek staré verze zahodit (a stará aplikace ho při odchodu už neuloží) – nová se vykreslí sama
    var nacti = function () {
      if (znovu) return;
      znovu = true;
      window.asistentBezSnimku = true;
      try { localStorage.removeItem('asistent.data.snimek'); } catch (e) { /* nic */ }
      location.reload();
    };
    // rozepsaný text (pole s obsahem ve viditelné části) se přenačtením nesmaže
    var pise = function () {
      var pole = document.querySelectorAll('textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([readonly])');
      for (var i = 0; i < pole.length; i++) if (pole[i].value && pole[i].getClientRects().length) return true;
      return false;
    };
    // rozdělaná práce, kterou přenačtení nesmí přerušit – moduly přidávají funkce do window.asistentPrace (js/auto.js: otevřený
    // výběr fotky účtenky a nahrávání; iPhone pod fotoaparátem stránku „skryje“ a čekající nová verze by se načetla i s
    // rozdělaným výběrem – fotka by se ztratila, 10. 10.)
    var prace = function () {
      var p = window.asistentPrace || [];
      for (var i = 0; i < p.length; i++) { try { if (p[i]()) return true; } catch (e) { /* další */ } }
      return false;
    };
    // nový service worker má celou novou verzi → načíst ji: hned jen když aplikaci nikdo nevidí, nebo pár vteřin po
    // otevření (nic rozdělaného); jinak až půjde do pozadí – ne uprostřed Nastavení nebo psaní (Michal 5. 10.)
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!mel || znovu) return;
      if (!prace() && (document.visibilityState === 'hidden' || (Date.now() - otevreno < 8000 && !pise() && !panel()))) { nacti(); return; }
      cekaNaVerzi = true;
      if (window.asistentNovaVerze) window.asistentNovaVerze();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && cekaNaVerzi && !pise() && !prace()) nacti();
      if (document.visibilityState === 'visible') otevreno = Date.now(); // návrat z pozadí = jako nové otevření
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (r) {
        // aplikace otevřená z pozadí (iPhone ji neotevírá znovu) → zeptat se na novou verzi
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') r.update().catch(function () { /* bez sítě */ });
        });
      }).catch(function () { /* aplikace jede i bez něj */ });
    });
  }

  // záchrana: když se do 8 s neukáže aplikace ani úvod (moduly se nenačetly), nabídnout čisté načtení ze sítě
  // (snímek není aplikace – i pod ním se záchrana nabídne)
  setTimeout(function () {
    if (window.asistentBezi) return;
    var a = document.getElementById('aplikace'), u = document.getElementById('uvod');
    if (((a && !a.hidden) || (u && !u.hidden)) && !window.asistentSnimek) return;
    var d = document.createElement('div');
    d.className = 'zachrana';
    d.innerHTML = '<p><b>Aplikace se nenačetla.</b></p><p>Nejspíš se po aktualizaci smíchaly staré a nové soubory. ' +
      'Uložená data i přihlášení zůstanou.</p><p><button type="button" class="btn btn--primary">Načíst znovu</button></p>';
    d.querySelector('button').addEventListener('click', function () {
      var hotovo = function () { location.reload(); };
      Promise.all([
        window.caches ? caches.keys().then(function (k) { return Promise.all(k.map(function (x) { return caches.delete(x); })); }) : null,
        navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(function (r) { return Promise.all(r.map(function (x) { return x.unregister(); })); }) : null
      ]).then(hotovo, hotovo);
    });
    document.body.appendChild(d);
  }, 8000);
})();
