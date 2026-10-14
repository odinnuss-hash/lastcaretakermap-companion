/* Last Caretaker Map - dauerhafte Speicherung
 *
 * Wird VOR dem Karten-Skript geladen. Die Karte speichert alles (Erledigt-Status, Notizen,
 * Einstellungen) im localStorage des Browsers. Dieses Skript spiegelt den localStorage in die
 * Datei userdata/progress.json, damit nichts verloren geht, wenn der Browser-Cache geleert wird
 * oder ein anderer Browser/Port benutzt wird. Zusaetzlich wird die zuletzt angesehene
 * Kartenposition (Zoom, Ausschnitt, gewaehlte Location) gemerkt.
 */
(function () {
  'use strict';
  var API = '/api/state';
  var ls;
  try { ls = window.localStorage; ls.length; } catch (e) { return; }

  // 1) Beim Start: gespeicherten Stand vom Server holen (synchron, damit die Karte ihn gleich sieht)
  try {
    var x = new XMLHttpRequest();
    x.open('GET', API, false);
    x.send();
    if (x.status === 200) {
      var st = JSON.parse(x.responseText);
      if (st && st.exists && st.items) {
        ls.clear();
        Object.keys(st.items).forEach(function (k) { ls.setItem(k, st.items[k]); });
      }
    }
  } catch (e) { /* Server nicht erreichbar -> normal weiterarbeiten */ }

  // Letzte Kartenposition wiederherstellen (nur wenn die Adresse keine eigene Position enthaelt)
  try {
    var view = ls.getItem('lcm-view');
    if (view && !location.hash && /^#-?[\d.]+\/-?[\d.]+\/-?[\d.]+/.test(view)) history.replaceState(null, '', view);
  } catch (e) {}

  // 2) Aenderungen zurueckschreiben
  var proto = Storage.prototype;
  var origSet = proto.setItem, origRemove = proto.removeItem, origClear = proto.clear;
  var timer = null;
  var retryDelay = 0; // 0 = kein Wiederholungs-Modus; sonst naechste Wartezeit in ms
  var MAX_RETRY_DELAY = 30000;
  window.__lcmNoFlush = false;
  var noFlushSince = 0; // Sicherheitsnetz, siehe flush()

  function snapshot() {
    var items = {};
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); items[k] = ls.getItem(k); }
    return JSON.stringify({ items: items });
  }
  function report(ok, detail, retrying) {
    try { window.dispatchEvent(new CustomEvent('lcm-saved', { detail: { ok: ok, at: Date.now(), error: detail || null, retrying: !!retrying } })); } catch (e) {}
  }
  function scheduleAt(delay) { clearTimeout(timer); timer = setTimeout(function () { flush(false); }, delay); }
  // Nach einem fehlgeschlagenen Speichern automatisch erneut versuchen (mit wachsender
  // Wartezeit). Da snapshot() immer den KOMPLETTEN aktuellen Stand sendet, holt ein
  // spaeterer erfolgreicher Versuch zwischenzeitliche Aenderungen automatisch mit ein.
  function scheduleRetry() {
    retryDelay = retryDelay ? Math.min(retryDelay * 2, MAX_RETRY_DELAY) : 1000;
    scheduleAt(retryDelay);
  }
  function flush(useBeacon) {
    clearTimeout(timer); timer = null;
    if (window.__lcmNoFlush) {
      if (!noFlushSince) noFlushSince = Date.now();
      // Sicherheitsnetz: __lcmNoFlush wird z.B. kurz vor "Sicherung wiederherstellen" gesetzt
      // und sollte durch den direkt danach folgenden Seiten-Reload gleich wieder verschwinden.
      // Bleibt es laenger als 15s haengen (Reload aus irgendeinem Grund ausgeblieben), lieber
      // automatisch wieder freigeben als fuer immer lautlos nichts mehr zu speichern.
      if (Date.now() - noFlushSince < 15000) return Promise.resolve(false);
      window.__lcmNoFlush = false;
    }
    noFlushSince = 0;
    var body = snapshot();
    try {
      if (useBeacon && navigator.sendBeacon) {
        var ok = navigator.sendBeacon(API, new Blob([body], { type: 'text/plain' }));
        // Beacon-Erfolg heisst nur "wurde zum Versand angenommen", nicht "gespeichert" -
        // beim naechsten regulaeren Laden wird trotzdem nochmal normal versucht.
        return Promise.resolve(ok);
      }
      // keepalive nur im Beacon-Fallback (Seite wird gerade geschlossen) setzen, NICHT bei jedem
      // normalen Speichern: Chrome erlaubt nur ein kleines gemeinsames Kontingent an gleichzeitig
      // offenen "keepalive"-Anfragen. War das durch mehrere schnelle Speicherversuche einmal voll,
      // schlug bisher JEDE weitere Anfrage (auch "Erneut verbinden", das denselben Code nutzt)
      // sofort mit "Failed to fetch" fehl - unabhaengig davon, ob der Server laengst wieder bereit
      // war. Das war die eigentliche Ursache fuer dauerhaft haengenbleibende Speicherung.
      return fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-LCM': '1' }, body: body, keepalive: !!useBeacon })
        .then(function (r) {
          if (r.ok) { retryDelay = 0; report(true); return true; }
          return r.text().then(function (t) {
            var msg = 'Server-Fehler (' + r.status + ')';
            try { var j = JSON.parse(t); if (j && j.error) msg = j.error; } catch (e2) {}
            report(false, msg, true);
            scheduleRetry();
            return false;
          }, function () { report(false, 'Server-Fehler (' + r.status + ')', true); scheduleRetry(); return false; });
        })
        .catch(function (e) { report(false, (e && e.message) || 'Netzwerkfehler', true); scheduleRetry(); return false; });
    } catch (e) { report(false, (e && e.message) || undefined, true); scheduleRetry(); return Promise.resolve(false); }
  }
  function schedule() { retryDelay = 0; scheduleAt(400); }

  // Erweiterungen (features.js) koennen sich hier einhaengen: window.__lcmOnStorage(art, schluessel, neu, alt)
  function notify(kind, k, v, old) {
    try { if (typeof window.__lcmOnStorage === 'function') window.__lcmOnStorage(kind, k, v, old); } catch (e) {}
  }
  proto.setItem = function (k, v) {
    var old = this === ls ? ls.getItem(k) : null;
    var r = origSet.apply(this, arguments);
    if (this === ls) { schedule(); notify('set', String(k), String(v), old); }
    return r;
  };
  proto.removeItem = function (k) {
    var old = this === ls ? ls.getItem(k) : null;
    var r = origRemove.apply(this, arguments);
    if (this === ls) { schedule(); notify('remove', String(k), null, old); }
    return r;
  };
  proto.clear = function () {
    var r = origClear.apply(this, arguments);
    if (this === ls) { schedule(); notify('clear', null, null, null); }
    return r;
  };

  window.addEventListener('pagehide', function () { if (timer) flush(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { if (timer) flush(true); return; }
    // Tab wird nach einer Weile im Hintergrund wieder aktiv: Browser drosseln/frieren Timer in
    // Hintergrund-Tabs oft ein, daher hier sofort (unabhaengig vom Timer) einen frischen Versuch
    // starten, statt auf den naechsten regulaeren Speicherzeitpunkt zu warten.
    retryDelay = 0;
    flush(false);
  });

  window.__lcmFlush = function () { return flush(false); };
  // Manuelles "Erneut verbinden" (z.B. Knopf in der Seitenleiste): Wartezeit zuruecksetzen und
  // sofort versuchen, statt auf eine laufende Backoff-Pause zu warten.
  window.__lcmReconnect = function () { retryDelay = 0; return flush(false); };
  if (ls.length) schedule();
})();
