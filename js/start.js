// Start mimo moduly (klasický skript, nic neimportuje – funguje, i když se moduly aplikace nenačtou):
// service worker, přenačtení po nové verzi a záchrana, když aplikace nenastartuje (prázdná obrazovka).
(function () {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    var mel = !!navigator.serviceWorker.controller; // první instalace = bez přenačtení
    var znovu = false;
    // rozepsaný text (pole s obsahem ve viditelné části) se přenačtením nesmaže
    var pise = function () {
      var pole = document.querySelectorAll('textarea, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([readonly])');
      for (var i = 0; i < pole.length; i++) if (pole[i].value && pole[i].getClientRects().length) return true;
      return false;
    };
    // nový service worker má celou novou verzi → načíst ji (živá verze pár vteřin po otevření)
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!mel || znovu) return;
      if (window.asistentBezi && pise()) {
        if (window.asistentNovaVerze) window.asistentNovaVerze();
        return;
      }
      znovu = true;
      location.reload();
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
  setTimeout(function () {
    if (window.asistentBezi) return;
    var a = document.getElementById('aplikace'), u = document.getElementById('uvod');
    if ((a && !a.hidden) || (u && !u.hidden)) return;
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
