/* Last Caretaker Map - Erweiterungen (deutsche Beschriftung, Erledigt-Status, Fortschritt, Update) */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var el = function (tag, attrs, html) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var api = function (path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-LCM': '1' }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : 'Fehler ' + r.status);
        return j;
      });
    });
  };

  /* ---------------------------------------------------------------- Server-Heartbeat */
  function beat() { fetch('/api/heartbeat', { method: 'POST', keepalive: true }).catch(function () {}); }
  beat();
  setInterval(beat, 10000);
  window.addEventListener('pagehide', function () { try { navigator.sendBeacon('/api/bye'); } catch (e) {} });

  /* ---------------------------------------------------------------- Beschriftung: Status-Texte deutsch */
  var LABELS = { 'Not Visited': 'Offen', 'Visited': 'Besucht', 'Cleared': 'Erledigt' };
  var STATES = ['not-visited', 'visited', 'cleared'];
  var STATE_TEXT = { 'not-visited': 'Offen', 'visited': 'Besucht', 'cleared': 'Erledigt' };

  function translateLabels(root) {
    $$('.visit-text', root).forEach(function (n) {
      var t = n.textContent.trim();
      if (LABELS[t]) n.textContent = LABELS[t];
    });
  }

  /* ---------------------------------------------------------------- Popup: Erledigt-Schalter */
  function enhancePopup(popupEl) {
    var content = $('.popup-content', popupEl);
    if (!content || $('.lcm-status', content)) return;
    var orig = $('.visit-status-btn', content);
    if (!orig) return;

    var box = el('div', { class: 'lcm-status' });
    box.innerHTML =
      '<div class="lcm-status-title">Status</div>' +
      '<div class="lcm-status-row">' +
      STATES.map(function (s) {
        return '<button type="button" class="lcm-status-btn" data-target="' + s + '">' +
          (s === 'cleared' ? '&#10004; ' : '') + STATE_TEXT[s] + '</button>';
      }).join('') + '</div>';
    orig.parentNode.insertBefore(box, orig);

    function current() { return orig.dataset.state || 'not-visited'; }
    function refresh() {
      $$('.lcm-status-btn', box).forEach(function (b) {
        b.classList.toggle('active', b.dataset.target === current());
      });
    }
    box.addEventListener('click', function (ev) {
      var b = ev.target.closest('.lcm-status-btn');
      if (!b) return;
      // Die Karte schaltet reihum (offen -> besucht -> erledigt). Wir klicken den
      // (ausgeblendeten) Original-Knopf so oft, bis der gewuenschte Status erreicht ist.
      var guard = 0;
      while (current() !== b.dataset.target && guard++ < 4) orig.click();
      translateLabels(content);
      refresh();
    });
    new MutationObserver(refresh).observe(orig, { attributes: true, attributeFilter: ['data-state'] });
    refresh();
  }

  /* ---------------------------------------------------------------- Fortschritt + Filter in der Seitenleiste */
  var progress, filterSel;
  function buildProgress() {
    var sidebar = $('#sidebar');
    if (!sidebar || $('#lcm-progress')) return;
    progress = el('div', { id: 'lcm-progress', class: 'lcm-progress' });
    progress.innerHTML =
      '<div class="lcm-progress-line"><span id="lcm-progress-text">Erledigt: 0 / 0</span>' +
      '<select id="lcm-filter" title="Liste filtern">' +
      '<option value="all">Alle anzeigen</option>' +
      '<option value="open">Nur offene</option>' +
      '<option value="done">Nur erledigte</option>' +
      '</select></div>' +
      '<div class="lcm-bar"><div id="lcm-bar-fill"></div></div>' +
      '<div class="lcm-saved-row">' +
      '<div class="lcm-saved" id="lcm-saved" title="Alles wird automatisch in userdata\\progress.json gespeichert">&#128190; automatisch gespeichert</div>' +
      '<button type="button" id="lcm-reconnect" class="lcm-reconnect-btn" title="Jetzt erneut versuchen, mit dem lokalen Server zu speichern">&#8635; Erneut verbinden</button>' +
      '</div>';
    var box = $('.search-box', sidebar);
    if (box) box.parentNode.insertBefore(progress, box.nextSibling);
    else sidebar.insertBefore(progress, $('#location-list'));

    var reconnectBtn = $('#lcm-reconnect');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', function () {
        reconnectBtn.disabled = true;
        reconnectBtn.textContent = 'Verbinde …';
        var done = function () {
          reconnectBtn.disabled = false;
          reconnectBtn.innerHTML = '&#8635; Erneut verbinden';
        };
        try {
          var p = window.__lcmReconnect ? window.__lcmReconnect() : Promise.resolve(false);
          Promise.resolve(p).then(done, done);
        } catch (e) { done(); }
      });
    }

    filterSel = $('#lcm-filter');
    var saved = 'all';
    try { saved = localStorage.getItem('lcm-filter') || 'all'; } catch (e) {}
    filterSel.value = saved;
    sidebar.dataset.lcmFilter = saved;
    filterSel.addEventListener('change', function () {
      sidebar.dataset.lcmFilter = filterSel.value;
      try { localStorage.setItem('lcm-filter', filterSel.value); } catch (e) {}
      updateProgress();
      try { window.dispatchEvent(new CustomEvent('lcm-filter', { detail: filterSel.value })); } catch (e) {}
    });
  }

  var progressTimer = null;
  function updateProgress() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(function () {
      var total = $$('#location-list .location-item').length;
      var done = $$('#location-list .sidebar-visit-icon[data-state="cleared"]').length;
      var t = $('#lcm-progress-text'), f = $('#lcm-bar-fill');
      if (t) t.textContent = 'Erledigt: ' + done + ' / ' + total;
      // Zaehler der Bereiche passend zum gewaehlten Filter (Alle / Nur offene / Nur erledigte)
      var sb = $('#sidebar'), mode = (sb && sb.dataset.lcmFilter) || 'all';
      $$('#location-list .location-section').forEach(function (sec) {
        var n = $$('.location-item', sec).filter(function (it) {
          var c = !!$('.sidebar-visit-icon[data-state="cleared"]', it);
          return mode === 'all' || (mode === 'done' ? c : !c);
        }).length;
        var cnt = $('.section-count', sec), txt = '(' + n + ')';
        if (cnt && cnt.textContent !== txt) cnt.textContent = txt;
      });
      if (f) f.style.width = (total ? (100 * done / total) : 0) + '%';
    }, 60);
  }

  /* ---------------------------------------------------------------- Update-Bereich in den Einstellungen */
  var updateBadge = false;
  function setBadge(on) {
    updateBadge = on;
    var b = $('#settings-button');
    if (b) b.classList.toggle('lcm-has-update', !!on);
  }

  function fmtBytes(n) {
    if (!n) return '';
    return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function fmtDate(iso) {
    if (!iso) return 'noch nie';
    try { return new Date(iso).toLocaleString('de-DE'); } catch (e) { return iso; }
  }

  function buildUpdatePanel() {
    var body = $('#settings-popup .settings-body');
    if (!body || $('#lcm-update')) return;
    var panel = el('div', { class: 'setting-item', id: 'lcm-update' });
    panel.innerHTML =
      '<h4 class="color-section-title">App &amp; Updates</h4>' +
      '<div style="display:flex; gap:8px;">' +
      '<button id="lcm-check" class="setting-button" style="background:#2196F3;border-color:#2196F3;flex:1;">Nach Updates suchen</button>' +
      '<button id="lcm-apply" class="setting-button" style="background:#4CAF50;border-color:#4CAF50;flex:1;display:none;">Update installieren</button>' +
      '</div>' +
      '<p class="setting-description" id="lcm-update-status">Vergleicht diese Kopie mit der Original-Karte von The1Killer auf GitHub.</p>' +
      '<div id="lcm-update-details"></div>' +
      '<p class="setting-description" id="lcm-update-meta"></p>' +
      '<p class="setting-description">Dein Fortschritt und deine Notizen werden automatisch in <code>userdata\\progress.json</code> gespeichert und bei Updates nie ver&auml;ndert.</p>';
    body.insertBefore(panel, body.firstChild);

    $('#lcm-check').addEventListener('click', function () { checkUpdate(false); });
    $('#lcm-apply').addEventListener('click', applyUpdate);
    api('/api/info').then(function (i) {
      $('#lcm-update-meta').textContent = 'Zuletzt aktualisiert: ' + fmtDate(i.lastUpdate) + ' · Zuletzt gesucht: ' + fmtDate(i.lastCheck);
    }).catch(function () {});
  }

  /* ---------------------------------------------------------------- Sprach- & App-Updates */
  // Eigener Abgleich NUR für app/custom (Übersetzungen/i18n.js, eigene Skripte, Datendateien)
  // gegen das Veröffentlichungs-Repository dieser Companion-App auf GitHub - unabhängig vom
  // Update-Bereich oben (der die Original-Kartendaten von The1Killer abgleicht). So lassen sich
  // z.B. die großen, bislang noch deutschen Wiki-/Rat-/Menschen-/Walkthrough-Texte in einem
  // künftigen Update auf Englisch/Französisch nachreichen, ohne dass die App neu heruntergeladen
  // werden muss (siehe README, "kommende Sprach-Updates").
  function buildAppUpdatePanel() {
    var body = $('#settings-popup .settings-body');
    if (!body || $('#lcm-app-update')) return;
    var panel = el('div', { class: 'setting-item', id: 'lcm-app-update' });
    panel.innerHTML =
      '<h4 class="color-section-title">Sprach- &amp; App-Updates</h4>' +
      '<div style="display:flex; gap:8px;">' +
      '<button id="lcm-app-check" class="setting-button" style="background:#2196F3;border-color:#2196F3;flex:1;">Nach App-Updates suchen</button>' +
      '<button id="lcm-app-apply" class="setting-button" style="background:#4CAF50;border-color:#4CAF50;flex:1;display:none;">App-Update installieren</button>' +
      '</div>' +
      '<p class="setting-description" id="lcm-app-update-status">Vergleicht die Übersetzungen, Skripte und Daten dieser Companion-App (Ordner app/custom) mit dem Veröffentlichungs-Repository auf GitHub – unabhängig von den Original-Kartendaten oben.</p>' +
      '<div id="lcm-app-update-details"></div>' +
      '<p class="setting-description" id="lcm-app-update-meta"></p>';
    var anchor = $('#lcm-update');
    body.insertBefore(panel, anchor ? anchor.nextSibling : body.firstChild);

    $('#lcm-app-check').addEventListener('click', function () { checkAppUpdate(false); });
    $('#lcm-app-apply').addEventListener('click', applyAppUpdate);
    api('/api/info').then(function (i) {
      $('#lcm-app-update-meta').textContent = 'Zuletzt aktualisiert: ' + fmtDate(i.appLastUpdate) + ' · Zuletzt gesucht: ' + fmtDate(i.appLastCheck);
    }).catch(function () {});
  }

  function showAppResult(r) {
    var st = $('#lcm-app-update-status'), det = $('#lcm-app-update-details'), ap = $('#lcm-app-apply');
    if (!st) return;
    if (r.upToDate) {
      st.textContent = '✔ Die Custom-Erweiterung ist aktuell.';
      det.innerHTML = ''; ap.style.display = 'none';
      return;
    }
    var n = r.added.length + r.changed.length + r.removed.length;
    st.textContent = 'App-Update verfügbar: ' + n + ' Datei(en)' + (r.downloadBytes ? ' (' + fmtBytes(r.downloadBytes) + ')' : '') + '.';
    var html = '';
    function list(title, arr) {
      if (!arr || !arr.length) return '';
      return '<p class="setting-description"><b>' + title + '</b></p><ul class="lcm-list">' +
        arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    }
    html += list('Neu (' + r.added.length + ')', r.added);
    html += list('Geändert (' + r.changed.length + ')', r.changed);
    html += list('Entfernt (' + r.removed.length + ')', r.removed);
    det.innerHTML = html;
    ap.style.display = ''; setBadge(true);
  }

  function checkAppUpdate(silent) {
    var st = $('#lcm-app-update-status'), btn = $('#lcm-app-check');
    if (!silent && btn) { btn.disabled = true; st.textContent = 'Suche nach App-Updates …'; }
    return api('/api/app-update/check').then(function (r) {
      try { localStorage.setItem('lcm-last-app-check', String(Date.now())); } catch (e) {}
      if (!silent || !r.upToDate) showAppResult(r);
      if (silent && !r.upToDate) setBadge(true);
      return r;
    }).catch(function (e) {
      if (!silent && st) st.textContent = 'Suche fehlgeschlagen: ' + e.message + ' (Internetverbindung prüfen)';
    }).then(function (r) {
      if (btn) btn.disabled = false;
      return r;
    });
  }

  function applyAppUpdate() {
    var st = $('#lcm-app-update-status'), ap = $('#lcm-app-apply'), ck = $('#lcm-app-check');
    if (!window.confirm('App-Update jetzt installieren?\n\nDein Fortschritt und deine Notizen bleiben erhalten. Die Karte wird danach neu geladen.')) return;
    ap.disabled = true; ck.disabled = true;
    st.textContent = 'Lade App-Update herunter … (bitte warten)';
    api('/api/app-update/apply', { method: 'POST' }).then(function (r) {
      st.textContent = '✔ App-Update installiert (' + (r.updated || 0) + ' Datei(en)). Lade neu …';
      setTimeout(function () { location.reload(); }, 1200);
    }).catch(function (e) {
      st.textContent = 'App-Update fehlgeschlagen: ' + e.message;
      ap.disabled = false; ck.disabled = false;
    });
  }

  /* ---------------------------------------------------------------- Änderungsprotokoll dieser Custom-App */
  // Rein lokales Änderungsprotokoll (siehe data-changelog.json): zeigt, was sich zuletzt in den
  // Custom-Erweiterungen geändert hat, und markiert das mit "NEU", bis es einmal angesehen wurde.
  var APP_VERSION = '2026.10.14';
  function changelogSeenVersion() { try { return localStorage.getItem('lcm-changelog-seen') || ''; } catch (e) { return ''; } }
  function setChangelogSeen(v) { try { localStorage.setItem('lcm-changelog-seen', v); } catch (e) {} }
  function buildChangelogPanel() {
    var body = $('#settings-popup .settings-body');
    if (!body || $('#lcm-changelog')) return;
    fetch('/custom/data-changelog.json').then(function (r) { return r.json(); }).then(function (list) {
      if (!list || !list.length) return;
      var isNew = changelogSeenVersion() !== APP_VERSION;
      var panel = el('div', { class: 'setting-item', id: 'lcm-changelog' });
      panel.innerHTML =
        '<h4 class="color-section-title">Änderungsprotokoll' + (isNew ? ' <span class="lcm-changelog-badge">NEU</span>' : '') + '</h4>' +
        '<p class="setting-description">Was sich in den Custom-Erweiterungen dieser App zuletzt geändert hat (aktuell: Version ' + esc(APP_VERSION) + '). Die Original-Kartendaten oben haben ihren eigenen Update-Bereich.</p>' +
        '<div class="lcm-changelog-list">' + list.map(function (v) {
          return '<div class="lcm-changelog-entry"><div class="lcm-changelog-v"><b>' + esc(v.version) + '</b><span>' + esc(v.datum || '') + '</span></div>' +
            '<div class="lcm-changelog-title">' + esc(v.titel) + '</div>' +
            '<ul class="lcm-list">' + (v.items || []).map(function (it) { return '<li>' + esc(it) + '</li>'; }).join('') + '</ul></div>';
        }).join('') + '</div>';
      var anchor = $('#lcm-update');
      body.insertBefore(panel, anchor ? anchor.nextSibling : body.firstChild);
      setChangelogSeen(APP_VERSION);
    }).catch(function () {});
  }

  function showResult(r) {
    var st = $('#lcm-update-status'), det = $('#lcm-update-details'), ap = $('#lcm-apply');
    if (!st) return;
    if (r.upToDate) {
      st.textContent = '✔ Du hast die aktuelle Version der Original-Karte.';
      det.innerHTML = ''; ap.style.display = 'none'; setBadge(false);
      return;
    }
    var n = r.added.length + r.changed.length + r.removed.length;
    st.textContent = 'Update verfügbar: ' + n + ' Datei(en)' + (r.downloadBytes ? ' (' + fmtBytes(r.downloadBytes) + ')' : '') + '.';
    var html = '';
    function list(title, arr) {
      if (!arr || !arr.length) return '';
      return '<p class="setting-description"><b>' + title + '</b></p><ul class="lcm-list">' +
        arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    }
    html += list('Neue Locations (' + (r.newLocations || []).length + ')', r.newLocations);
    html += list('Geänderte Locations (' + (r.changedLocations || []).length + ')', r.changedLocations);
    html += list('Entfernte Locations', r.removedLocations);
    if (!html) html = '<p class="setting-description">Programm-/Design-Änderungen ohne neue Locations.</p>';
    det.innerHTML = html;
    ap.style.display = ''; setBadge(true);
  }

  function checkUpdate(silent) {
    var st = $('#lcm-update-status'), btn = $('#lcm-check');
    if (!silent && btn) { btn.disabled = true; st.textContent = 'Suche nach Updates …'; }
    return api('/api/update/check').then(function (r) {
      try { localStorage.setItem('lcm-last-check', String(Date.now())); } catch (e) {}
      if (!silent || !r.upToDate) showResult(r);
      if (silent && !r.upToDate) setBadge(true);
      return r;
    }).catch(function (e) {
      if (!silent && st) st.textContent = 'Suche fehlgeschlagen: ' + e.message + ' (Internetverbindung prüfen)';
    }).then(function (r) {
      if (btn) btn.disabled = false;
      return r;
    });
  }

  function applyUpdate() {
    var st = $('#lcm-update-status'), ap = $('#lcm-apply'), ck = $('#lcm-check');
    if (!window.confirm('Update jetzt installieren?\n\nDein Fortschritt bleibt erhalten. Die Karte wird danach neu geladen.')) return;
    ap.disabled = true; ck.disabled = true;
    st.textContent = 'Lade Update herunter … (bitte warten)';
    api('/api/update/apply', { method: 'POST' }).then(function (r) {
      st.textContent = '✔ Update installiert (' + (r.updated || 0) + ' Datei(en)). Lade neu …';
      setTimeout(function () { location.reload(); }, 1200);
    }).catch(function (e) {
      st.textContent = 'Update fehlgeschlagen: ' + e.message;
      ap.disabled = false; ck.disabled = false;
    });
  }

  /* ---------------------------------------------------------------- Wiki-Update-Bereich in den Einstellungen */
  // Vergleicht die im App-Paket hinterlegten (deutschen) Wiki-Infos mit dem echten Wiki
  // (thelastcaretaker.wiki.gg) und kann geaenderte/neue Artikel uebernehmen. Uebernommene Artikel
  // sind noch unuebersetzt (Englisch), bis sie in einem kuenftigen App-Update ins Deutsche
  // uebertragen werden - das Original-Wiki bleibt davon unberuehrt.
  var lastWikiCheckResult = null;
  function buildWikiUpdatePanel() {
    var body = $('#settings-popup .settings-body');
    if (!body || $('#lcm-wiki-update')) return;
    var panel = el('div', { class: 'setting-item', id: 'lcm-wiki-update' });
    panel.innerHTML =
      '<h4 class="color-section-title">Wiki-Updates</h4>' +
      '<div style="display:flex; gap:8px;">' +
      '<button id="lcm-wiki-check" class="setting-button" style="background:#2196F3;border-color:#2196F3;flex:1;">Nach Wiki-Updates suchen</button>' +
      '<button id="lcm-wiki-apply" class="setting-button" style="background:#4CAF50;border-color:#4CAF50;flex:1;display:none;">Wiki-Updates übernehmen</button>' +
      '</div>' +
      '<p class="setting-description" id="lcm-wiki-status">Vergleicht die im Programm gespeicherten Wiki-Infos (Text &amp; Bild je Ort, auf Deutsch) mit den echten Artikeln auf thelastcaretaker.wiki.gg.</p>' +
      '<div id="lcm-wiki-details"></div>' +
      '<p class="setting-description" id="lcm-wiki-meta"></p>' +
      '<p class="setting-description">Übernommene Wiki-Änderungen werden zunächst unübersetzt (Englisch) angezeigt und im Ortsfenster entsprechend gekennzeichnet, bis sie in einem App-Update ins Deutsche übertragen wurden.</p>';
    var anchor = $('#lcm-update');
    body.insertBefore(panel, anchor ? anchor.nextSibling : body.firstChild);

    $('#lcm-wiki-check').addEventListener('click', function () { checkWikiUpdate(); });
    $('#lcm-wiki-apply').addEventListener('click', applyWikiUpdate);
    api('/api/info').then(function (i) {
      $('#lcm-wiki-meta').textContent = 'Zuletzt gesucht: ' + fmtDate(i.lastWikiCheck) + ' · Zuletzt übernommen: ' + fmtDate(i.lastWikiUpdate);
    }).catch(function () {});
  }

  function showWikiResult(r) {
    var st = $('#lcm-wiki-status'), det = $('#lcm-wiki-details'), ap = $('#lcm-wiki-apply');
    if (!st) return;
    lastWikiCheckResult = r;
    if (r.upToDate) {
      st.textContent = '✔ Alle hinterlegten Wiki-Infos sind aktuell.';
      det.innerHTML = ''; ap.style.display = 'none';
      return;
    }
    var n = (r.changed || []).length + (r.newlyAvailable || []).length;
    st.textContent = 'Wiki-Update verfügbar: ' + n + ' Ort(e).';
    var html = '';
    if (r.changed && r.changed.length) {
      html += '<p class="setting-description"><b>Geänderte Wiki-Artikel (' + r.changed.length + ')</b></p><ul class="lcm-wiki-upd-list">' +
        r.changed.map(function (x) { return '<li>' + esc(x.name) + '</li>'; }).join('') + '</ul>';
    }
    if (r.newlyAvailable && r.newlyAvailable.length) {
      html += '<p class="setting-description"><b>Neu auf dem Wiki (' + r.newlyAvailable.length + ')</b></p><ul class="lcm-wiki-upd-list">' +
        r.newlyAvailable.map(function (x) { return '<li>' + esc(x.name) + '</li>'; }).join('') + '</ul>';
    }
    det.innerHTML = html;
    ap.style.display = '';
  }

  function checkWikiUpdate() {
    var st = $('#lcm-wiki-status'), btn = $('#lcm-wiki-check');
    if (btn) { btn.disabled = true; st.textContent = 'Suche nach Wiki-Updates … (kann etwas dauern)'; }
    return api('/api/wiki-update/check').then(function (r) {
      showWikiResult(r);
      return r;
    }).catch(function (e) {
      if (st) st.textContent = 'Suche fehlgeschlagen: ' + e.message + ' (Internetverbindung prüfen)';
    }).then(function (r) {
      if (btn) btn.disabled = false;
      return r;
    });
  }

  function applyWikiUpdate() {
    var st = $('#lcm-wiki-status'), ap = $('#lcm-wiki-apply'), ck = $('#lcm-wiki-check');
    if (!lastWikiCheckResult) return;
    var items = (lastWikiCheckResult.changed || []).concat(lastWikiCheckResult.newlyAvailable || [])
      .map(function (x) { return { name: x.name, wikiTitle: x.wikiTitle }; });
    if (!items.length) return;
    if (!window.confirm('Wiki-Updates jetzt übernehmen?\n\nDie betroffenen Orte werden bis zur nächsten deutschen Übersetzung auf Englisch angezeigt.')) return;
    ap.disabled = true; ck.disabled = true;
    st.textContent = 'Lade Wiki-Artikel … (bitte warten)';
    api('/api/wiki-update/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items }) }).then(function (r) {
      var ok = r.results.filter(function (x) { return x.ok; }).length;
      st.textContent = '✔ ' + ok + ' von ' + r.results.length + ' Ort(en) übernommen. Lade neu …';
      lastWikiCheckResult = null;
      setTimeout(function () { location.reload(); }, 1200);
    }).catch(function (e) {
      st.textContent = 'Übernehmen fehlgeschlagen: ' + e.message;
      ap.disabled = false; ck.disabled = false;
    });
  }

  /* ---------------------------------------------------------------- Speicher-Anzeige, Kartenposition */
  window.addEventListener('lcm-saved', function (ev) {
    var n = $('#lcm-saved'); if (!n) return;
    var btn = $('#lcm-reconnect');
    if (ev.detail.ok) {
      n.classList.remove('bad');
      n.setAttribute('title', 'Alles wird automatisch in userdata\\progress.json gespeichert');
      n.innerHTML = '&#128190; gespeichert ' + new Date(ev.detail.at).toLocaleTimeString('de-DE');
      if (btn) btn.classList.remove('show');
    } else {
      n.classList.add('bad');
      var detail = ev.detail.error ? String(ev.detail.error) : '';
      n.setAttribute('title', 'Speichern fehlgeschlagen' + (detail ? ' (' + detail + ')' : '') +
        (ev.detail.retrying ? ' – wird automatisch erneut versucht.' : '') +
        ' Läuft start.bat noch, oder blockiert ein Virenscanner den Ordner kurz?');
      n.innerHTML = '&#9888; NICHT gespeichert' + (ev.detail.retrying ? ' &ndash; versuche erneut &hellip;' : ' &ndash; l&auml;uft start.bat noch?');
      if (btn) btn.classList.add('show');
    }
  });
  var lastHash = '';
  setInterval(function () {
    var h = location.hash;
    if (h && h !== lastHash) {
      lastHash = h;
      try { localStorage.setItem('lcm-view', h); } catch (e) {}
    }
  }, 2500);

  /* ---------------------------------------------------------------- Bereinigung / Zuruecksetzen */
  var P_VISIT = 'location-visit-', P_NOTES = 'location-notes-', P_VIS = 'marker-visible-', P_CAT = 'category-visible-';
  function keysWith(prefix) {
    var r = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(prefix) === 0) r.push(k); }
    return r;
  }
  function rstatus(msg) { var n = $('#lcm-reset-status'); if (n) n.textContent = msg; }
  function postJson(path, obj) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj || {}) });
  }
  // aktuellen Stand sichern, Aenderung ausfuehren, speichern, neu laden
  function safely(label, change, reload) {
    rstatus('Sicherung wird angelegt …');
    return window.__lcmFlush()
      .then(function () { return postJson('/api/backup', { label: label }); })
      .then(function () { return change(); })
      .then(function (msg) {
        return window.__lcmFlush().then(function () {
          if (reload) { rstatus('Fertig. Lade neu …'); setTimeout(function () { location.reload(); }, 500); }
          else { rstatus(msg || 'Fertig.'); loadBackups(); }
        });
      })
      .catch(function (e) { rstatus('Fehler: ' + e.message); });
  }

  function doResetDone() {
    var n = keysWith(P_VISIT).filter(function (k) { return localStorage.getItem(k) !== 'not-visited'; }).length;
    if (!window.confirm('Alle Status (' + n + ' Einträge: besucht/erledigt) auf "Offen" zurücksetzen?\n\nNotizen und Einstellungen bleiben erhalten. Vorher wird automatisch eine Sicherung angelegt.')) return;
    safely('vor-status-reset', function () { keysWith(P_VISIT).forEach(function (k) { localStorage.removeItem(k); }); }, true);
  }
  function doClearNotes() {
    var n = keysWith(P_NOTES).filter(function (k) { return (localStorage.getItem(k) || '').trim(); }).length;
    if (!window.confirm('Alle Notizen (' + n + ') löschen?\n\nStatus und Einstellungen bleiben erhalten. Vorher wird automatisch eine Sicherung angelegt.')) return;
    safely('vor-notizen-loeschen', function () { keysWith(P_NOTES).forEach(function (k) { localStorage.removeItem(k); }); }, true);
  }
  function doResetAll() {
    if (!window.confirm('ALLES auf Anfang zurücksetzen?\n\nErledigt-Status, Notizen und alle Einstellungen (Farben, Filter, …) werden gelöscht.\nVorher wird automatisch eine Sicherung angelegt, die du unten wiederherstellen kannst.')) return;
    if (!window.confirm('Wirklich alles löschen?')) return;
    safely('vor-komplett-reset', function () { localStorage.clear(); }, true);
  }
  function doCleanup() {
    api('/api/known-ids').then(function (r) {
      var ids = {}; (r.ids || []).forEach(function (i) { ids[i] = 1; });
      var haveIds = (r.ids || []).length > 0;
      var removed = { orphan: 0, empty: 0, def: 0 };
      function idOf(k, p) { return k.slice(p.length); }
      keysWith(P_VISIT).forEach(function (k) {
        var v = localStorage.getItem(k);
        if (haveIds && !ids[idOf(k, P_VISIT)]) { localStorage.removeItem(k); removed.orphan++; }
        else if (v === 'not-visited') { localStorage.removeItem(k); removed.def++; }
      });
      keysWith(P_NOTES).forEach(function (k) {
        var v = (localStorage.getItem(k) || '').trim();
        if (haveIds && !ids[idOf(k, P_NOTES)]) { localStorage.removeItem(k); removed.orphan++; }
        else if (!v) { localStorage.removeItem(k); removed.empty++; }
      });
      keysWith(P_VIS).forEach(function (k) {
        var v = localStorage.getItem(k);
        if (haveIds && !ids[idOf(k, P_VIS)]) { localStorage.removeItem(k); removed.orphan++; }
        else if (v === 'true') { localStorage.removeItem(k); removed.def++; }
      });
      keysWith(P_CAT).forEach(function (k) { if (localStorage.getItem(k) === 'true') { localStorage.removeItem(k); removed.def++; } });
      var total = removed.orphan + removed.empty + removed.def;
      return window.__lcmFlush().then(function () {
        rstatus(total ? 'Aufgeräumt: ' + total + ' überflüssige Einträge entfernt (' + removed.orphan + ' verwaist, ' + removed.empty + ' leere Notizen, ' + removed.def + ' Standardwerte). Dein Fortschritt ist unverändert.' : 'Nichts aufzuräumen – alles sauber.');
      });
    }).catch(function (e) { rstatus('Fehler: ' + e.message); });
  }

  function loadBackups() {
    var sel = $('#lcm-backups'); if (!sel) return;
    api('/api/backups').then(function (r) {
      var list = r.backups || [];
      sel.innerHTML = list.length ? '' : '<option value="">(noch keine Sicherungen)</option>';
      list.forEach(function (b) {
        var m = b.name.match(/_([\w-]+)\.json$/);
        var tag = m ? ' · ' + m[1].replace(/-/g, ' ') : '';
        var o = document.createElement('option');
        o.value = b.name;
        o.textContent = fmtDate(b.savedAt) + ' · ' + b.cleared + ' erledigt, ' + b.notes + ' Notizen' + tag;
        sel.appendChild(o);
      });
    }).catch(function () {});
  }
  function doRestore() {
    var sel = $('#lcm-backups');
    if (!sel || !sel.value) { rstatus('Bitte zuerst eine Sicherung auswählen.'); return; }
    if (!window.confirm('Diese Sicherung wiederherstellen?\n\n' + sel.options[sel.selectedIndex].textContent + '\n\nDer aktuelle Stand wird vorher ebenfalls gesichert.')) return;
    window.__lcmFlush().then(function () {
      window.__lcmNoFlush = true; // verhindert, dass der alte Browserstand die Sicherung wieder ueberschreibt
      // Sicherheitsnetz: falls der Reload unten (z.B. Fenster im Hintergrund gedrosselt) aus
      // irgendeinem Grund ausbleibt, nach 5s automatisch wieder freigeben statt fuer immer
      // nichts mehr zu speichern. (state-sync.js hat zusaetzlich ein eigenes 15s-Sicherheitsnetz.)
      setTimeout(function () { window.__lcmNoFlush = false; }, 5000);
      return postJson('/api/backups/restore', { name: sel.value });
    }).then(function () {
      rstatus('Wiederhergestellt. Lade neu …');
      setTimeout(function () { location.reload(); }, 500);
    }).catch(function (e) { window.__lcmNoFlush = false; rstatus('Fehler: ' + e.message); });
  }

  function buildResetPanel() {
    var body = $('#settings-popup .settings-body');
    if (!body || $('#lcm-reset')) return;
    var panel = el('div', { class: 'setting-item', id: 'lcm-reset' });
    panel.innerHTML =
      '<h4 class="color-section-title">Bereinigung &amp; Zur&uuml;cksetzen</h4>' +
      '<p class="setting-description">Vor jeder &Auml;nderung hier wird automatisch eine Sicherung angelegt.</p>' +
      '<div class="lcm-btn-col">' +
      '<button class="setting-button" id="lcm-b-clean" style="background:#607d8b;border-color:#607d8b;">Aufr&auml;umen (Datenm&uuml;ll entfernen)</button>' +
      '<button class="setting-button" id="lcm-b-done" style="background:#ef8f00;border-color:#ef8f00;">Alle Status auf &bdquo;Offen&ldquo; zur&uuml;cksetzen</button>' +
      '<button class="setting-button" id="lcm-b-notes" style="background:#ef8f00;border-color:#ef8f00;">Alle Notizen l&ouml;schen</button>' +
      '<button class="setting-button" id="lcm-b-all" style="background:#c62828;border-color:#c62828;">Alles auf Anfang</button>' +
      '</div>' +
      '<p class="setting-description" id="lcm-reset-status"></p>' +
      '<p class="setting-description"><b>Sicherung wiederherstellen</b></p>' +
      '<select id="lcm-backups" class="lcm-select"></select>' +
      '<button class="setting-button" id="lcm-b-restore" style="background:#4CAF50;border-color:#4CAF50;margin-top:6px;">Ausgew&auml;hlte Sicherung wiederherstellen</button>';
    var upd = $('#lcm-update');
    body.insertBefore(panel, upd ? upd.nextSibling : body.firstChild);
    $('#lcm-b-clean').addEventListener('click', doCleanup);
    $('#lcm-b-done').addEventListener('click', doResetDone);
    $('#lcm-b-notes').addEventListener('click', doClearNotes);
    $('#lcm-b-all').addEventListener('click', doResetAll);
    $('#lcm-b-restore').addEventListener('click', doRestore);
    var sb = $('#settings-button');
    if (sb) sb.addEventListener('click', loadBackups);
    loadBackups();
  }

  function markerModeStatus(n) { var s = $('#lcm-color-status'); if (s) s.textContent = n; }

  function applyMarkerMode(mode) {
    api('/api/locations').then(function (r) {
      var types = Object.keys(r.types || {});
      types.forEach(function (t) {
        if (mode === 'white') localStorage.setItem('marker-color-' + t, '#ffffff');
        else localStorage.removeItem('marker-color-' + t);
      });
      lsSetSafe('lcm-marker-mode', mode);
      markerModeStatus('Gespeichert. Lade neu …');
      window.__lcmFlush().then(function () { setTimeout(function () { location.reload(); }, 350); });
    }).catch(function (e) { markerModeStatus('Fehler: ' + e.message); });
  }
  function lsSetSafe(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function currentMarkerMode() { try { return localStorage.getItem('lcm-marker-mode') || 'color'; } catch (e) { return 'color'; } }

  function buildColorPanel() {
    var body = $('#settings-popup .settings-body');
    if (!body || $('#lcm-colors')) return;
    var panel = el('div', { class: 'setting-item', id: 'lcm-colors' });
    var mode = currentMarkerMode();
    panel.innerHTML =
      '<h4 class="color-section-title">Farben der Orte</h4>' +
      '<p class="setting-description">Bunt nach Ortstyp (wie bisher) oder schlicht Wei&szlig; &ndash; erledigte Orte werden in beiden F&auml;llen gelb.</p>' +
      '<div class="lcm-btn-col">' +
      '<button class="setting-button lcm-mode-btn" id="lcm-color-mode-color" style="background:' + (mode === 'color' ? '#4CAF50' : '#607d8b') + ';border-color:' + (mode === 'color' ? '#4CAF50' : '#607d8b') + ';">Farbig (wie jetzt)' + (mode === 'color' ? ' ✓' : '') + '</button>' +
      '<button class="setting-button lcm-mode-btn" id="lcm-color-mode-white" style="background:' + (mode === 'white' ? '#4CAF50' : '#607d8b') + ';border-color:' + (mode === 'white' ? '#4CAF50' : '#607d8b') + ';">Nur Wei&szlig; (Gelb bei Erledigt)' + (mode === 'white' ? ' ✓' : '') + '</button>' +
      '</div>' +
      '<p class="setting-description" id="lcm-color-status"></p>';
    var upd = $('#lcm-update');
    body.insertBefore(panel, upd ? upd.nextSibling : body.firstChild);
    $('#lcm-color-mode-color').addEventListener('click', function () { applyMarkerMode('color'); });
    $('#lcm-color-mode-white').addEventListener('click', function () { applyMarkerMode('white'); });
  }

  /* ---------------------------------------------------------------- Start */
  function init() {
    buildProgress();
    buildUpdatePanel();
    buildAppUpdatePanel();
    buildWikiUpdatePanel();
    buildResetPanel();
    buildColorPanel();
    buildChangelogPanel();
    updateProgress();

    var list = $('#location-list');
    if (list) {
      new MutationObserver(updateProgress).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    }

    // Popups (werden von Leaflet bei jedem Oeffnen neu erzeugt) und Beschriftungen
    var pane = $('.leaflet-popup-pane') || document.body;
    new MutationObserver(function () {
      $$('.leaflet-popup').forEach(enhancePopup);
      translateLabels(document);
    }).observe(document.body, { childList: true, subtree: true });

    // Automatische, stille Update-Suche (max. alle 12 Stunden)
    var last = 0;
    try { last = parseInt(localStorage.getItem('lcm-last-check') || '0', 10) || 0; } catch (e) {}
    if (Date.now() - last > 12 * 3600 * 1000) setTimeout(function () { checkUpdate(true); }, 4000);

    var lastApp = 0;
    try { lastApp = parseInt(localStorage.getItem('lcm-last-app-check') || '0', 10) || 0; } catch (e) {}
    if (Date.now() - lastApp > 12 * 3600 * 1000) setTimeout(function () { checkAppUpdate(true); }, 4500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
