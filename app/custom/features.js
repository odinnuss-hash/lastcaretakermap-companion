/* Last Caretaker Map - neue Funktionen
 * Dashboard, Filter & Legende, Mini-Karte, Tastenkuerzel, Rueckgaengig, Notiz-Symbole, Kopieren, Export */
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
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /* ---------------------------------------------------------------- Daten */
  var TYPE_DE = {
    Hanger: 'Hangar', Cave: 'Höhle', Habitat: 'Habitat', RefuelOutpost: 'Treibstoff', SeedVault: 'Seed Vault',
    NDNS: 'NDNS', OilRig: 'Ölbohrinsel', Maze: 'Labyrinth', NavBeacon: 'Navigationsbake', Rocket: 'Rakete',
    RockySpire: 'Rockyspire', Ruin: 'Ruine', Lazarus: 'Lazarus', HeliosReserve: 'Helios Reserve',
    StarChild: 'Star Child', RollerFactory: 'Roller-Fabrik', SharkBay: 'Shark Bay', GyroPlatform: 'Gyro-Plattform',
    Silo: 'Silo', StatueSpire: 'Statue Spire', Eden: 'Eden', Lab: 'Labor', Aron: 'Aron'
  };
  var CAT_DE = {
    locations: 'Orte', hiddenLocations: 'Versteckte Orte', lastListenerLocations: 'Last-Listener-Orte', caves: 'Höhlen'
  };
  var STATE_DE = { 'not-visited': 'Offen', 'visited': 'Besucht', 'cleared': 'Erledigt' };

  function typeName(t) {
    if (TYPE_DE[t]) return TYPE_DE[t];
    return String(t || 'Sonstige').replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  function catName(c) { return CAT_DE[c] || c; }

  var DATA = { ready: false, locations: [], types: {}, byId: {}, byName: {}, iconTypes: {} };

  function stateOf(id) { return lsGet('location-visit-' + id) || 'not-visited'; }
  function noteOf(id) { return (lsGet('location-notes-' + id) || '').trim(); }
  function doneAtOf(id) { var v = parseInt(lsGet('lcm-done-at-' + id) || '0', 10); return v || 0; }

  function loadData() {
    return fetch('/api/locations').then(function (r) { return r.json(); }).then(function (j) {
      DATA.locations = j.locations || [];
      DATA.types = j.types || {};
      DATA.byId = {}; DATA.byName = {}; DATA.iconTypes = {};
      DATA.locations.forEach(function (l) {
        DATA.byId[l.id] = l;
        (DATA.byName[l.name] = DATA.byName[l.name] || []).push(l);
      });
      Object.keys(DATA.types).forEach(function (t) {
        var f = DATA.types[t];
        (DATA.iconTypes[f] = DATA.iconTypes[f] || []).push(t);
      });
      DATA.ready = DATA.locations.length > 0;
    }).catch(function () { DATA.ready = false; });
  }

  function computeStats() {
    var s = { total: 0, cleared: 0, visited: 0, open: 0, notes: 0, byCat: {}, byType: {} };
    DATA.locations.forEach(function (l) {
      var st = stateOf(l.id);
      s.total++;
      if (st === 'cleared') s.cleared++; else if (st === 'visited') s.visited++; else s.open++;
      if (noteOf(l.id)) s.notes++;
      var c = s.byCat[l.cat] = s.byCat[l.cat] || { total: 0, done: 0 };
      c.total++; if (st === 'cleared') c.done++;
      var t = s.byType[l.type] = s.byType[l.type] || { total: 0, done: 0 };
      t.total++; if (st === 'cleared') t.done++;
    });
    s.pct = s.total ? Math.round(100 * s.cleared / s.total) : 0;
    return s;
  }

  /* ---------------------------------------------------------------- Kleine Helfer */
  function ringSvg(pct, size, sw, big, sub) {
    var r = (size - sw) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100), m = size / 2;
    var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" class="ring" aria-hidden="true">' +
      '<circle cx="' + m + '" cy="' + m + '" r="' + r + '" fill="none" stroke="#16241f" stroke-width="' + sw + '"/>' +
      '<circle cx="' + m + '" cy="' + m + '" r="' + r + '" fill="none" stroke="#ffd400" stroke-width="' + sw + '" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" transform="rotate(-90 ' + m + ' ' + m + ')"/>';
    if (big != null) {
      svg += '<text x="' + m + '" y="' + (sub ? m + 2 : m + size * 0.07) + '" text-anchor="middle" fill="#ffd400" font-family="Cascadia Mono, Consolas, monospace" font-weight="700" font-size="' + (size * 0.22) + '">' + big + '</text>';
      if (sub) svg += '<text x="' + m + '" y="' + (m + size * 0.16) + '" text-anchor="middle" fill="#7e9c8f" font-family="Cascadia Mono, Consolas, monospace" font-size="' + (size * 0.075) + '" letter-spacing="1.5">' + sub + '</text>';
    }
    return svg + '</svg>';
  }

  function ago(ts) {
    var d = Date.now() - ts, m = Math.round(d / 60000);
    if (m < 1) return 'gerade eben';
    if (m < 60) return 'vor ' + m + ' Min.';
    var h = Math.round(m / 60);
    if (h < 24) return 'vor ' + h + ' Std.';
    var days = Math.round(h / 24);
    return days === 1 ? 'gestern' : 'vor ' + days + ' Tagen';
  }

  function iconFileOf(node) {
    var m = (node.getAttribute('style') || '').match(/images\/([^'")]+)/);
    return m ? m[1] : '';
  }

  /* ---------------------------------------------------------------- Hinweise (Toast) */
  var toastBox;
  function toast(html, opts) {
    opts = opts || {};
    if (!toastBox) { toastBox = el('div', { id: 'lcm-toasts' }); document.body.appendChild(toastBox); }
    while (toastBox.children.length >= 3) toastBox.removeChild(toastBox.firstChild);
    var t = el('div', { class: 'lcm-toast' + (opts.done ? ' done' : '') });
    t.innerHTML = '<span>' + html + '</span>';
    if (opts.action) {
      var b = el('button', { type: 'button' }, esc(opts.action.label));
      b.addEventListener('click', function () { opts.action.fn(); if (t.parentNode) t.parentNode.removeChild(t); });
      t.appendChild(b);
    }
    toastBox.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, opts.ms || 5500);
  }

  /* ---------------------------------------------------------------- Fenster (Modal) */
  function makeModal(id, title) {
    var root = el('div', { class: 'lcm-modal', id: id });
    root.innerHTML = '<div class="lcm-dash-card"><div class="lcm-dash-head"><h3>' + esc(title) + '</h3>' +
      '<button type="button" class="close-button" title="Schließen">✕</button></div><div class="lcm-dash-body"></div></div>';
    document.body.appendChild(root);
    var api = {
      root: root, body: $('.lcm-dash-body', root),
      open: function () { root.classList.add('open'); },
      close: function () { root.classList.remove('open'); },
      isOpen: function () { return root.classList.contains('open'); }
    };
    $('.close-button', root).addEventListener('click', api.close);
    root.addEventListener('mousedown', function (e) { if (e.target === root) api.close(); });
    return api;
  }

  /* ---------------------------------------------------------------- Position anfahren */
  function goTo(id) {
    var l = DATA.byId[id];
    if (!l || !window.map) return;
    var row = document.getElementById('location-' + id);
    if (row) { row.click(); return; }
    window.map.setView([-l.y, l.x], Math.max(window.map.getZoom(), 2));
  }

  /* ---------------------------------------------------------------- HUD (Kopfzeile) */
  var hud;
  function buildHud() {
    var header = $('header');
    if (!header || $('#lcm-hud')) return;
    hud = el('div', { id: 'lcm-hud' });
    hud.innerHTML =
      '<div class="hud-stat"><div class="hud-ring" id="hud-ring"></div>' +
      '<div class="hud-text"><div class="hud-big" id="hud-big">0 / 0</div><div class="hud-small">erledigt</div></div></div>' +
      '<button type="button" class="lcm-hudbtn" id="hud-dash" title="Statistik anzeigen (D)">Dashboard<kbd>D</kbd></button>' +
      '<button type="button" class="lcm-hudbtn" id="hud-filter" title="Filter & Legende (F)">Filter<kbd>F</kbd></button>' +
      '<button type="button" class="lcm-hudbtn" id="hud-humans" title="Menschen &amp; Berufe">Menschen</button>' +
      '<button type="button" class="lcm-hudbtn" id="hud-calc" title="Wachstumsrechner (R)">Rechner<kbd>R</kbd></button>' +
      '<button type="button" class="lcm-hudbtn" id="hud-council" title="Rat der Menschheit / Ausschüsse (C)">Rat<kbd>C</kbd></button>' +
      '<button type="button" class="lcm-hudbtn" id="hud-quests" title="Missionen">Missionen</button>' +
      '<button type="button" class="lcm-hudbtn" id="hud-savegame" title="Spielstand einlesen (S)">Spielstand<kbd>S</kbd></button>' +
      '<button type="button" class="lcm-hudbtn" id="hud-ach" title="Erfolge">Erfolge</button>' +
      '<button type="button" class="lcm-hudbtn" id="hud-help" title="Tastenkürzel (?)">?</button>';
    var h1 = $('h1', header);
    if (h1 && h1.nextSibling) header.insertBefore(hud, h1.nextSibling); else header.appendChild(hud);
    $('#hud-dash').addEventListener('click', toggleDash);
    $('#hud-filter').addEventListener('click', toggleLegend);
    $('#hud-humans').addEventListener('click', toggleHumans);
    $('#hud-calc').addEventListener('click', toggleCalc);
    $('#hud-council').addEventListener('click', toggleCouncil);
    $('#hud-quests').addEventListener('click', toggleQuests);
    $('#hud-savegame').addEventListener('click', toggleSavegame);
    $('#hud-ach').addEventListener('click', toggleAchievements);
    $('#hud-help').addEventListener('click', showHelp);
  }
  function updateHud(s) {
    var r = $('#hud-ring'), b = $('#hud-big');
    if (r) r.innerHTML = ringSvg(s.pct, 46, 5, null);
    if (b) b.textContent = s.cleared + ' / ' + s.total + '  ·  ' + s.pct + '%';
  }

  /* ---------------------------------------------------------------- Dashboard */
  var dash;
  function toggleDash() {
    if (!dash) dash = makeModal('lcm-dash', 'Dashboard');
    if (dash.isOpen()) dash.close(); else { renderDash(); dash.open(); }
  }
  function renderDash() {
    if (!dash || !DATA.ready) return;
    var s = computeStats();
    var typeRows = Object.keys(s.byType).sort(function (a, b) { return s.byType[b].total - s.byType[a].total; }).map(function (t) {
      var v = s.byType[t], file = DATA.types[t], pct = v.total ? 100 * v.done / v.total : 0;
      return '<div class="lcm-row' + (v.done === v.total ? ' full' : '') + '"><span class="ico" style="--m:url(\'/images/' + esc(file || '') + '\')"></span>' +
        '<span class="nm" title="' + esc(typeName(t)) + '">' + esc(typeName(t)) + '</span>' +
        '<span class="bar"><i style="width:' + pct + '%"></i></span><span class="ct">' + v.done + ' / ' + v.total + '</span></div>';
    }).join('');
    var catRows = Object.keys(s.byCat).map(function (c) {
      var v = s.byCat[c], pct = v.total ? 100 * v.done / v.total : 0;
      return '<div class="lcm-row cat' + (v.done === v.total ? ' full' : '') + '"><span class="nm">' + esc(catName(c)) + '</span>' +
        '<span class="bar"><i style="width:' + pct + '%"></i></span><span class="ct">' + v.done + ' / ' + v.total + '</span></div>';
    }).join('');
    var recent = DATA.locations.filter(function (l) { return stateOf(l.id) === 'cleared' && doneAtOf(l.id); })
      .sort(function (a, b) { return doneAtOf(b.id) - doneAtOf(a.id); }).slice(0, 40);
    var recentHtml = recent.length ?
      '<div class="lcm-recent-wrap"><table class="lcm-recent-table"><thead><tr><th>Ort</th><th>Bereich</th><th>Zeit</th></tr></thead><tbody>' +
      recent.map(function (l) {
        return '<tr data-id="' + esc(l.id) + '"><td>' + esc(l.name) + '</td><td>' + esc(catName(l.cat)) + '</td><td>' + ago(doneAtOf(l.id)) + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<div class="lcm-empty">Noch nichts erledigt (seit Einführung dieser Anzeige).</div>';

    dash.body.innerHTML =
      '<div class="lcm-dash-left"><div class="lcm-dash-ring">' + ringSvg(s.pct, 190, 14, s.pct + '%', 'ERLEDIGT') + '</div>' +
      '<div class="lcm-kpis">' +
      '<div class="lcm-kpi done"><b>' + s.cleared + '</b><span>Erledigt</span></div>' +
      '<div class="lcm-kpi"><b>' + s.visited + '</b><span>Besucht</span></div>' +
      '<div class="lcm-kpi"><b>' + s.open + '</b><span>Offen</span></div>' +
      '<div class="lcm-kpi"><b>' + s.notes + '</b><span>Notizen</span></div></div>' +
      '<div class="lcm-dash-actions"><button type="button" class="lcm-hudbtn" id="dash-csv">CSV</button>' +
      '<button type="button" class="lcm-hudbtn" id="dash-txt">Text</button></div></div>' +
      '<div class="lcm-dash-right"><section><h4>Nach Bereich</h4>' + catRows + '</section>' +
      '<section><h4>Zuletzt erledigt</h4>' + recentHtml + '</section>' +
      '<section><h4>Nach Ortstyp</h4>' + typeRows + '</section></div>';

    $('#dash-csv', dash.body).addEventListener('click', exportCsv);
    $('#dash-txt', dash.body).addEventListener('click', exportText);
    $$('.lcm-recent-table tbody tr', dash.body).forEach(function (tr) {
      tr.addEventListener('click', function () { dash.close(); goTo(tr.getAttribute('data-id')); });
    });
  }

  /* ---------------------------------------------------------------- Menschen (Zucht-Referenz vom Wiki) */
  var humansModal, humansData = null;
  function loadHumansData() {
    if (humansData) return Promise.resolve(humansData);
    return fetch('/custom/data-humans.json').then(function (r) { return r.json(); }).then(function (j) { humansData = j; return j; });
  }
  function toggleHumans() {
    if (!humansModal) humansModal = makeModal('lcm-humans', 'Menschen');
    if (humansModal.isOpen()) { humansModal.close(); return; }
    humansModal.body.innerHTML = '<div class="lcm-empty">Lädt …</div>';
    humansModal.open();
    loadHumansData().then(renderHumans).catch(function () {
      humansModal.body.innerHTML = '<div class="lcm-empty">Daten konnten nicht geladen werden.</div>';
    });
  }
  function ul(items) { return '<ul class="lcm-plain-list">' + items.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'; }
  function renderHumans(d) {
    if (!humansModal) return;
    var html = '<div class="lcm-humans">';
    html += '<p class="lcm-lead">' + esc(d.intro_de) + '</p>';
    html += '<h4>Beschaffung</h4>' + ul(d.obtaining_de);
    html += '<h4>Zeitlimit &amp; Transport</h4>' + ul(d.timeLimit_de);
    html += '<h4>' + esc(d.growingRequirements_de.title) + '</h4><p>' + d.growingRequirements_de.needs.map(esc).join(' &middot; ') + '</p>';
    html += '<p><strong>' + esc(d.growingRequirements_de.minimums_title) + ':</strong> ' +
      d.growingRequirements_de.minimums.map(function (m) { return esc(m.label) + ' ' + esc(m.value); }).join(' &middot; ') + '</p>';
    html += '<h4>' + esc(d.resourceCosts_de.title) + '</h4>' + ul(d.resourceCosts_de.items);
    html += '<h4>Wachstumsmechanik</h4>' + ul(d.mechanics_de);
    html += '<h4>Berufe nach Kategorie</h4><p class="lcm-hint">Werte sind die Mindest-Attribute, ab denen der jeweilige Beruf möglich wird (je höher, desto seltener/besser).</p>';
    d.categories.forEach(function (cat) {
      html += '<div class="lcm-human-cat"><h5>' + esc(cat.name_de) + '</h5><div class="lcm-table-wrap"><table class="lcm-human-table"><thead><tr><th>Beruf</th>' +
        cat.attrs.map(function (a) { return '<th>' + esc(d.attrNames_de[a] || a) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        cat.jobs.map(function (j) {
          return '<tr><td>' + esc(j.de) + '<span class="lcm-human-en">' + esc(j.en) + '</span></td>' +
            j.values.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></div>';
    });
    html += '<h4>Nach dem Wachstum</h4><p>' + esc(d.afterGrowth_de) + '</p><p>' + esc(d.byproducts_de) + '</p>';
    html += '<h4>R&uuml;ckkehr zur Menschheit</h4>' + ul(d.rejoining_de);
    html += '</div>';
    humansModal.body.innerHTML = html;
  }

  /* ---------------------------------------------------------------- Rat der Menschheit (Ausschuss-Referenz) */
  // Bildet die 10 Ausschuesse aus dem In-Game-Menue "AUSSCHUESSE" nach (Name, Ebene, Mindestalter,
  // Beschreibungstext, die 4 benoetigten Berufe) - Daten in data-council.json, per Hand aus den
  // Screenshots des Nutzers transkribiert. Die Icons sind eigene, einfache Liniengrafiken und keine
  // Kopien der Spielgrafik. "Bereits gezuechtet" je Mitglied nutzt dieselbe Zaehlung (calcGrownCount)
  // wie der Wachstumsrechner, damit hier echter Spielfortschritt sichtbar wird statt einer reinen
  // Referenztabelle. Ueber den Knopf in der Detailkarte laesst sich der Rechner direkt mit einem
  // Filter auf genau die 4 Berufe dieses Ausschusses oeffnen (siehe calcFilterState "council").
  var councilModal, councilData = null, councilExpandedId = null;
  function loadCouncilData() {
    if (councilData) return Promise.resolve(councilData);
    return fetch('/custom/data-council.json').then(function (r) { return r.json(); }).then(function (j) { councilData = j; return j; });
  }
  var COUNCIL_ICONS = {
    wrench: '<circle cx="10" cy="10" r="5"/><line x1="13.6" y1="13.6" x2="23" y2="23"/><rect x="20.5" y="20.5" width="6" height="6" rx="1.2" transform="rotate(45 23.5 23.5)"/>',
    habitat: '<path d="M6 24V15A10 10 0 0 1 26 15V24"/><line x1="3" y1="24" x2="29" y2="24"/><line x1="16" y1="9" x2="16" y2="5"/>',
    transit: '<path d="M8 11A9 9 0 1 1 7 21"/><path d="M11 8 6 11 9 16"/>',
    power: '<path d="M17 3 8 18h7l-2 11 11-16h-7z"/>',
    cognition: '<circle cx="16" cy="7" r="2.4"/><circle cx="7" cy="20" r="2.4"/><circle cx="25" cy="20" r="2.4"/><circle cx="16" cy="26" r="1.8"/><line x1="16" y1="9.4" x2="7.9" y2="17.8"/><line x1="16" y1="9.4" x2="24.1" y2="17.8"/><line x1="8.6" y1="22" x2="15" y2="25.2"/><line x1="23.4" y1="22" x2="17" y2="25.2"/>',
    culture: '<path d="M4 9C9 6 13 7 16 10 19 7 23 6 28 9V24C23 21 19 22 16 25 13 22 9 21 4 24Z"/><line x1="16" y1="10" x2="16" y2="25"/>',
    administration: '<line x1="16" y1="4" x2="16" y2="25"/><line x1="6" y1="9" x2="26" y2="9"/><path d="M6 9 2 17A4.5 4.5 0 0 0 10 17Z"/><path d="M26 9 22 17A4.5 4.5 0 0 0 30 17Z"/><line x1="10" y1="27" x2="22" y2="27"/>',
    deepsystems: '<polygon points="16,4 26,10 26,22 16,28 6,22 6,10"/><circle cx="16" cy="16" r="4.5"/>',
    meaning: '<circle cx="16" cy="16" r="11"/><polygon points="16,7 18.2,13.8 25,16 18.2,18.2 16,25 13.8,18.2 7,16 13.8,13.8"/>',
    field: '<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="5.5"/><line x1="16" y1="16" x2="23.5" y2="8.5"/>'
  };
  function councilIconSvg(key) {
    return '<svg viewBox="0 0 32 32" class="lcm-council-icon-svg" aria-hidden="true">' + (COUNCIL_ICONS[key] || COUNCIL_ICONS.field) + '</svg>';
  }
  function toggleCouncil() {
    if (!councilModal) councilModal = makeModal('lcm-council', 'Rat der Menschheit');
    if (councilModal.isOpen()) { councilModal.close(); return; }
    councilModal.body.innerHTML = '<div class="lcm-empty">Lädt …</div>';
    councilModal.open();
    loadCouncilData().then(renderCouncil).catch(function () {
      councilModal.body.innerHTML = '<div class="lcm-empty">Daten konnten nicht geladen werden.</div>';
    });
  }
  // Beruf im Rechner ueber name_de finden, um "bereits gezuechtet" korrekt zuzuordnen - erfordert,
  // dass der Rechner seine Daten (inkl. lcm-calc-grown) schon mal geladen hat; ist er noch nie
  // geoeffnet worden, zeigen die Mitglieder einfach "offen" (nichts falsch Angezeigtes, nur noch kein
  // Fortschritt bekannt).
  function councilMemberStatus(name) {
    if (!calcData) return null;
    var h = calcData.humans.list.filter(function (x) { return x.name_de === name; })[0];
    if (!h) return null;
    return { id: h.id, grown: calcGrownCount(h.id) };
  }
  function councilCardHtml(c, expanded) {
    var filledCount = 0;
    var membersHtml = c.members.map(function (name) {
      var st = councilMemberStatus(name);
      var grown = st ? st.grown : 0;
      if (grown) filledCount++;
      return '<div class="lcm-council-member' + (grown ? ' done' : '') + '">' +
        '<span class="lcm-council-member-nm">' + esc(name) + '</span>' +
        '<span class="lcm-council-member-ct">' + (grown ? '&#10004; ' + grown + '&times; gez&uuml;chtet' : 'noch offen') + '</span>' +
        '</div>';
    }).join('');
    return '<div class="lcm-council-card' + (expanded ? ' open' : '') + (filledCount === 4 ? ' full' : '') + '" data-cid="' + esc(c.id) + '">' +
      '<div class="lcm-council-card-head">' +
      '<div class="lcm-council-icon">' + councilIconSvg(c.icon) + '</div>' +
      '<div><div class="lcm-council-nm">' + esc(c.name_de) + '</div>' +
      '<div class="lcm-council-meta">Ebene ' + c.tier + ' &middot; ab ' + c.minAge + ' Jahren &middot; ' + filledCount + ' / 4 besetzt</div></div>' +
      '</div>' +
      (expanded ?
        '<div class="lcm-council-card-body">' +
        '<p>' + esc(c.description_de) + '</p>' +
        '<div class="lcm-quest-sub">Ben&ouml;tigte Berufe</div>' +
        '<div class="lcm-council-members">' + membersHtml + '</div>' +
        '<button type="button" class="lcm-mini-btn" data-council-calc="' + esc(c.id) + '">Im Rechner nur diese Berufe anzeigen</button>' +
        '</div>'
        : '') +
      '</div>';
  }
  function renderCouncil() {
    if (!councilModal) return;
    var d = councilData;
    councilModal.body.innerHTML = '<div class="lcm-council">' +
      '<p class="lcm-lead">' + esc(d.intro_de) + '</p>' +
      '<div class="lcm-council-grid">' +
      d.list.map(function (c) { return councilCardHtml(c, c.id === councilExpandedId); }).join('') +
      '</div></div>';
    wireCouncil();
  }
  function wireCouncil() {
    var body = councilModal.body;
    $$('.lcm-council-card-head', body).forEach(function (hd) {
      hd.addEventListener('click', function () {
        var id = hd.closest('.lcm-council-card').getAttribute('data-cid');
        councilExpandedId = councilExpandedId === id ? null : id;
        renderCouncil();
      });
    });
    $$('[data-council-calc]', body).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        lsSet('lcm-calc-f-council', b.getAttribute('data-council-calc'));
        councilModal.close();
        toggleCalc();
      });
    });
  }

  /* ---------------------------------------------------------------- Wachstumsrechner (Menschen zuechten) */
  // Datenbasis (Erinnerungen/Memories, Nahrung/Food, Berufe/HumanType inkl. Attributwerte) stammt aus dem
  // "Human Growth Calculator" der Fan-Seite thelastcaretaker-tools.com, ins Deutsche uebersetzt und
  // aufbereitet in data-calc-memories.json / data-calc-food.json / data-calc-humans.json. Aufbau und
  // Bedienung (Mengen + Prozent-Slider je Ressourcenpool, Live-Gesamtwerte, filterbare/sortierbare
  // Berufs-Karten, "Zuechten"-Knopf mit Ressourcenabzug) lehnt sich bewusst an die Vorlage-Seite an.
  // Jeder Beruf verlangt zusaetzlich zu seinen Kern-Eigenschaften immer die Basiswerte 20 Gewicht,
  // 30 Groesse, 10 Lebenserwartung (bereits in data-calc-humans.json eingerechnet).
  // Die genaue interne Zuteil-Formel der Vorlage-Seite ("minimiert Verschnitt") ist nicht offengelegt;
  // hier wird beim Zuechten ein eigener, nachvollziehbarer Greedy-Algorithmus verwendet: je Eigenschaft
  // werden zuerst die Items eingesetzt, die am staerksten auf genau diese Eigenschaft spezialisiert sind
  // (wenig Streuverlust auf andere Werte), bis der Bedarf gedeckt ist.
  var calcModal, calcData = null, calcExpandedId = null;
  // Das Einlesen des Spielstands (.sav) hat eine eigene Rubrik bekommen (siehe weiter unten,
  // "Spielstand"-Fenster) - von hier aus nur noch ein Knopf, der dorthin verlinkt.
  var CALC_MEM_ATTRS = ['Logic', 'Focus', 'Discipline', 'Creativity', 'Communication', 'Empathy', 'Leadership', 'Wisdom', 'Patience', 'Adaptability'];
  var CALC_FOOD_ATTRS = ['Strength', 'Height', 'Weight', 'Intellect', 'Life_Expectancy'];
  // Kurzform je Eigenschaft fuer die kompakte Anzeige direkt an jedem Gegenstand (Bestandsliste).
  // Werte je Gegenstand stammen aus data-calc-memories.json / data-calc-food.json und wurden gegen die
  // offiziellen Wiki-Tabellen (thelastcaretaker.wiki.gg/wiki/Food bzw. .../Memories) gegengeprueft - stimmen
  // ueberein.
  var CALC_ATTR_ABBR = {
    Logic: 'LOG', Focus: 'FOK', Discipline: 'DIS', Creativity: 'KRE', Communication: 'KOM',
    Empathy: 'EMP', Leadership: 'FÜH', Wisdom: 'WEI', Patience: 'GED', Adaptability: 'ANP',
    Strength: 'STÄ', Height: 'GRÖ', Weight: 'GEW', Intellect: 'INT', Life_Expectancy: 'LEB'
  };
  function calcAttrChipsHtml(attrs) {
    return Object.keys(attrs || {}).filter(function (a) { return attrs[a]; }).map(function (a) {
      return '<span class="lcm-calc-chip">' + esc(CALC_ATTR_ABBR[a] || a) + ' +' + attrs[a] + '</span>';
    }).join('');
  }
  // Alle Gegenstaende (Memory oder Food), die ueberhaupt zu einer Eigenschaft beitragen.
  function calcItemsForAttr(attr) {
    var out = [];
    calcData.memories.forEach(function (m) { if (m.attrs[attr]) out.push({ kind: 'mem', item: m }); });
    calcData.food.forEach(function (f) { if (f.attrs[attr]) out.push({ kind: 'food', item: f }); });
    return out;
  }
  // Wie stark ist dieser Gegenstand auf genau diese Eigenschaft spezialisiert (0..1) - hoeher = weniger
  // Streuverlust auf andere Eigenschaften beim Einsatz. Grundlage fuer Empfehlung und Zuteilung.
  function calcSpecScore(item, attr) {
    var v = item.attrs[attr] || 0;
    var sum = Object.keys(item.attrs).reduce(function (s, k) { return s + item.attrs[k]; }, 0) || 1;
    return v / sum;
  }
  function calcBestItemsFor(attr, limit) {
    var list = calcItemsForAttr(attr).slice().sort(function (a, b) {
      var sa = calcSpecScore(a.item, attr), sb = calcSpecScore(b.item, attr);
      if (sb !== sa) return sb - sa;
      return b.item.attrs[attr] - a.item.attrs[attr];
    });
    return list.slice(0, limit || 4);
  }

  function loadCalcData() {
    if (calcData) return Promise.resolve(calcData);
    return Promise.all([
      fetch('/custom/data-calc-memories.json').then(function (r) { return r.json(); }),
      fetch('/custom/data-calc-food.json').then(function (r) { return r.json(); }),
      fetch('/custom/data-calc-humans.json').then(function (r) { return r.json(); }),
      fetch('/custom/data-council.json').then(function (r) { return r.json(); })
    ]).then(function (r) {
      calcData = { memories: r[0], food: r[1], humans: r[2], council: r[3] };
      return calcData;
    });
  }

  function calcQtyKey(kind, id) { return 'lcm-calc-qty-' + kind + '-' + id; }
  function calcQty(kind, id) { var v = parseInt(lsGet(calcQtyKey(kind, id)) || '0', 10); return isFinite(v) && v > 0 ? v : 0; }
  function setCalcQty(kind, id, v) {
    v = Math.max(0, Math.min(999999, Math.round(v) || 0));
    if (v) lsSet(calcQtyKey(kind, id), String(v)); else try { localStorage.removeItem(calcQtyKey(kind, id)); } catch (e) {}
  }
  function calcPctKey(kind) { return 'lcm-calc-pct-' + kind; }
  function calcPct(kind) { var v = parseInt(lsGet(calcPctKey(kind)) || '100', 10); return isFinite(v) ? Math.max(0, Math.min(100, v)) : 100; }
  function setCalcPct(kind, v) { lsSet(calcPctKey(kind), String(Math.max(0, Math.min(100, Math.round(v))))); }
  function calcAvail(kind, id) { return Math.floor(calcQty(kind, id) * calcPct(kind) / 100); }

  function calcGrownList() { try { return JSON.parse(lsGet('lcm-calc-grown') || '[]'); } catch (e) { return []; } }
  function calcGrownCount(profId) { return calcGrownList().filter(function (g) { return g.id === profId; }).length; }
  // snapshot: eingefrorener Stand der Infokarte zum Zeitpunkt der Bestaetigung (Werte + verbrauchte
  // Materialien) - so bleibt in "Bereits gezuechtet" sichtbar, was damals genau verwendet wurde,
  // auch wenn sich der Bestand danach aendert. Aeltere Eintraege (vor diesem Update) haben keinen.
  function addGrown(profId, snapshot) {
    var list = calcGrownList();
    list.push({ id: profId, at: Date.now(), snapshot: snapshot || null });
    lsSet('lcm-calc-grown', JSON.stringify(list));
  }
  // Schreibt die verbrauchten Materialien eines Eintrags wieder dem Bestand gut (fuer "Entfernen"
  // bei Verklicken). snapshot.materials hat ab diesem Update kind+id je Material; aeltere
  // Eintraege (vor diesem Update) haben nur name_de - dafuer wird der Gegenstand ueber beide Pools
  // per Namen gesucht (bestmoegliche Zuordnung statt Rueckbuchung zu verweigern).
  function calcGrownRefund(entry) {
    var s = entry.snapshot;
    if (!s || !s.materials || !s.materials.length) return 0;
    var refunded = 0;
    s.materials.forEach(function (m) {
      var kind = m.kind, id = m.id;
      if (!kind || !id) {
        var found = calcData.memories.filter(function (it) { return calcItemName(it) === m.name_de; })[0];
        if (found) { kind = 'mem'; id = found.id; }
        else {
          found = calcData.food.filter(function (it) { return calcItemName(it) === m.name_de; })[0];
          if (found) { kind = 'food'; id = found.id; }
        }
      }
      if (kind && id) { setCalcQty(kind, id, calcQty(kind, id) + m.qty); refunded++; }
    });
    return refunded;
  }
  // Entfernt einen Eintrag aus "Bereits gezuechtet" wieder - z.B. bei Verklicken. "at" (Zeitstempel
  // beim Anlegen) dient als eindeutiger Schluessel statt eines Listenindex, da die Anzeige die
  // Liste umgekehrt (neueste zuerst) zeigt. Fragt vorher nach und bucht ggf. bekannte Materialien
  // zurueck (nicht bei aus dem Spielstand ergaenzten Eintraegen, da dort keine echten eigenen
  // Materialien verbraucht wurden - siehe svAddMissingGrown()).
  function removeGrown(at) {
    var list = calcGrownList();
    var idx = list.findIndex(function (g) { return g.at === at; });
    if (idx === -1) return;
    var entry = list[idx];
    var h = calcData.humans.list.filter(function (x) { return x.id === entry.id; })[0];
    var name = (entry.snapshot && entry.snapshot.name_de) || (h ? h.name_de : entry.id);
    var canRefund = entry.snapshot && !entry.snapshot.fromSavegame && entry.snapshot.materials && entry.snapshot.materials.length;
    var msg = '"' + name + '" aus "Bereits gezüchtet" entfernen?' +
      (canRefund ? '\n\nDie damals dafür verbrauchten Materialien werden dabei wieder gutgeschrieben.' : '');
    if (!window.confirm(msg)) return;
    var refunded = canRefund ? calcGrownRefund(entry) : 0;
    list.splice(idx, 1);
    lsSet('lcm-calc-grown', JSON.stringify(list));
    toast('Entfernt' + (refunded ? ', Materialien gutgeschrieben.' : '.'), { done: true });
    renderCalc();
  }
  // Anzeige-Modus der Infokarte: "manual" = Materialliste aus dem eingetragenen eigenen Bestand
  // (bisheriges Verhalten), "optimal" = ignoriert den Bestand komplett und zeigt die theoretisch
  // beste Materialwahl + deren Auswirkung auf die Werte - als Einkaufsliste fuers Spiel gedacht.
  function calcViewMode() { return lsGet('lcm-calc-viewmode') === 'optimal' ? 'optimal' : 'manual'; }
  function setCalcViewMode(m) { lsSet('lcm-calc-viewmode', m === 'optimal' ? 'optimal' : 'manual'); }

  function calcTotals() {
    var t = {};
    CALC_MEM_ATTRS.concat(CALC_FOOD_ATTRS).forEach(function (a) { t[a] = 0; });
    calcData.memories.forEach(function (m) {
      var n = calcAvail('mem', m.id);
      if (!n) return;
      Object.keys(m.attrs || {}).forEach(function (a) { t[a] = (t[a] || 0) + m.attrs[a] * n; });
    });
    calcData.food.forEach(function (f) {
      var n = calcAvail('food', f.id);
      if (!n) return;
      Object.keys(f.attrs || {}).forEach(function (a) { t[a] = (t[a] || 0) + f.attrs[a] * n; });
    });
    return t;
  }
  function humanNeedSum(h) { return Object.keys(h.req).reduce(function (s, a) { return s + h.req[a]; }, 0); }
  function humanGrowable(h, totals) { return Object.keys(h.req).every(function (a) { return (totals[a] || 0) >= h.req[a]; }); }

  function calcFilterState() {
    return {
      tier: lsGet('lcm-calc-f-tier') || 'all',
      cat: lsGet('lcm-calc-f-cat') || 'all',
      council: lsGet('lcm-calc-f-council') || 'all',
      onlyGrowable: lsGet('lcm-calc-f-growable') === '1',
      hideGrown: lsGet('lcm-calc-f-hidegrown') === '1',
      sortNeed: lsGet('lcm-calc-f-sort') === '1'
    };
  }
  function calcFilteredSortedHumans(totals) {
    var f = calcFilterState();
    // "Ausschuss"-Filter: je gewaehltem Templat aus data-council.json nur dessen 4 Berufe anzeigen
    // (Namensabgleich ueber name_de, s. Doku bei data-calc-humans.json - beide Listen sind bewusst
    // deckungsgleich gehalten).
    var councilMembers = null;
    if (f.council !== 'all' && calcData.council) {
      var cc = calcData.council.list.filter(function (x) { return x.id === f.council; })[0];
      councilMembers = cc ? cc.members : [];
    }
    var list = calcData.humans.list.filter(function (h) {
      if (f.tier !== 'all' && String(h.tier) !== f.tier) return false;
      if (f.cat !== 'all' && h.category !== f.cat) return false;
      if (councilMembers && councilMembers.indexOf(h.name_de) === -1) return false;
      if (f.onlyGrowable && !humanGrowable(h, totals)) return false;
      if (f.hideGrown && calcGrownCount(h.id) > 0) return false;
      return true;
    });
    if (f.sortNeed) list = list.slice().sort(function (a, b) { return humanNeedSum(a) - humanNeedSum(b); });
    else list = list.slice().sort(function (a, b) { return a.tier - b.tier || a.name_de.localeCompare(b.name_de); });
    return list;
  }

  function toggleCalc() {
    if (!calcModal) calcModal = makeModal('lcm-calc', 'Wachstumsrechner');
    if (calcModal.isOpen()) { calcModal.close(); return; }
    calcModal.body.innerHTML = '<div class="lcm-empty">Lädt …</div>';
    calcModal.open();
    loadCalcData().then(renderCalc).catch(function () {
      calcModal.body.innerHTML = '<div class="lcm-empty">Daten konnten nicht geladen werden.</div>';
    });
  }

  function calcItemName(item) { return item.name_de || item.name; }
  function calcItemRowHtml(kind, item) {
    var q = calcQty(kind, item.id);
    return '<div class="lcm-calc-item" data-kind="' + kind + '" data-id="' + esc(item.id) + '" title="' + esc(item.description_de || '') + '">' +
      '<div class="lcm-calc-item-main"><span class="lcm-calc-item-nm">' + esc(calcItemName(item)) + '</span>' +
      '<input type="number" min="0" step="1" inputmode="numeric" class="lcm-calc-item-qty" value="' + (q || '') + '" placeholder="0"></div>' +
      '<div class="lcm-calc-item-chips">' + calcAttrChipsHtml(item.attrs) + '</div>' +
      '</div>';
  }
  function calcPoolHtml(kind, title, items) {
    var owned = items.filter(function (it) { return calcQty(kind, it.id) > 0; }).length;
    return '<div class="lcm-calc-pool" data-poolkind="' + kind + '">' +
      '<div class="lcm-calc-pool-head"><h4>' + esc(title) + ' <span class="lcm-calc-pool-ct">(' + owned + ')</span></h4></div>' +
      '<div class="lcm-calc-pct-row"><span>Nutzbarer Anteil vom Bestand</span>' +
      '<input type="range" class="lcm-calc-pct" min="0" max="100" step="5" value="' + calcPct(kind) + '">' +
      '<span class="lcm-calc-pct-val">' + calcPct(kind) + '%</span></div>' +
      '<p class="lcm-hint">Legt fest, wie viel Prozent des jeweiligen Bestands du f&uuml;r Rezepte einsetzen willst &ndash; so wird nicht versehentlich eine Ressource komplett f&uuml;r einen einzigen Menschen verbraucht.</p>' +
      '<div class="lcm-calc-items">' + items.map(function (it) { return calcItemRowHtml(kind, it); }).join('') + '</div>' +
      '</div>';
  }
  function calcTotalsHtml(totals) {
    var d = calcData.humans.attrNames_de;
    function row(a) {
      var v = totals[a] || 0;
      return '<div class="lcm-calc-attr' + (v ? '' : ' zero') + '"><span>' + esc(d[a] || a) + '</span><b>' + v + '</b></div>';
    }
    return '<div class="lcm-calc-totals"><h4>Gesamtwerte (nutzbar)</h4>' +
      '<div class="lcm-calc-attr-grp"><div class="lcm-calc-attr-grp-title">Erinnerungen</div>' +
      CALC_MEM_ATTRS.map(row).join('') + '</div>' +
      '<div class="lcm-calc-attr-grp"><div class="lcm-calc-attr-grp-title">Nahrung</div>' +
      CALC_FOOD_ATTRS.map(row).join('') + '</div></div>';
  }
  function calcRecommendRowHtml(attr, c) {
    var owned = calcQty(c.kind, c.item.id);
    return '<div class="lcm-calc-rec-item">' +
      '<span class="lcm-calc-rec-nm">' + esc(calcItemName(c.item)) + '</span>' +
      '<span class="lcm-calc-rec-val">+' + c.item.attrs[attr] + '</span>' +
      '<span class="lcm-calc-rec-owned" data-kind="' + c.kind + '" data-id="' + esc(c.item.id) + '">Bestand: ' + owned + '</span>' +
      '<div class="lcm-calc-rec-btns">' +
      '<button type="button" class="lcm-mini-btn lcm-calc-rec-sub"' + (owned ? '' : ' disabled') + ' data-kind="' + c.kind + '" data-id="' + esc(c.item.id) + '">&minus;1</button>' +
      '<button type="button" class="lcm-mini-btn lcm-calc-rec-add" data-kind="' + c.kind + '" data-id="' + esc(c.item.id) + '">+1</button>' +
      '</div></div>';
  }
  // Simuliert dieselbe Zuteilung wie beim Zuechten (calcSpecScore-Reihenfolge je Eigenschaft),
  // aber nur als Vorschau - es wird nichts vom Bestand abgezogen. Liefert zurueck, welche
  // Gegenstaende in welcher Menge aus dem eingetragenen Bestand optimal genutzt wuerden, sowie
  // je Eigenschaft, was trotz vollem Bestand noch fehlt (shortfall).
  function calcAllocate(h) {
    var avail = {};
    calcData.memories.forEach(function (m) { avail['mem:' + m.id] = calcAvail('mem', m.id); });
    calcData.food.forEach(function (f) { avail['food:' + f.id] = calcAvail('food', f.id); });
    var attrs = Object.keys(h.req).slice().sort(function (a, b) { return h.req[b] - h.req[a]; });
    var consumed = {}, shortfall = {};
    attrs.forEach(function (attr) {
      var need = h.req[attr], got = 0;
      var cands = calcItemsForAttr(attr).filter(function (c) { return avail[c.kind + ':' + c.item.id] > 0; });
      cands.sort(function (a, b) {
        var sa = calcSpecScore(a.item, attr), sb = calcSpecScore(b.item, attr);
        return sb !== sa ? sb - sa : b.item.attrs[attr] - a.item.attrs[attr];
      });
      cands.forEach(function (c) {
        if (got >= need) return;
        var key = c.kind + ':' + c.item.id, per = c.item.attrs[attr], have = avail[key];
        var use = Math.min(have, Math.ceil((need - got) / per));
        if (use <= 0) return;
        avail[key] -= use;
        consumed[key] = (consumed[key] || 0) + use;
        got += use * per;
      });
      if (got < need) shortfall[attr] = need - got;
    });
    return { consumed: consumed, shortfall: shortfall };
  }
  // Wie calcAllocate, aber OHNE Ruecksicht auf den eingetragenen eigenen Bestand (unbegrenzt
  // verfuegbar gedacht) - liefert die theoretisch beste/optimale Materialwahl fuer diesen Beruf:
  // je Eigenschaft wird der am staerksten darauf spezialisierte Gegenstand gewaehlt (wenig
  // Streuverlust), Streuwirkung auf andere Eigenschaften wird mitgerechnet (kann deren Bedarf schon
  // mit abdecken). Gedacht als Einkaufsliste, die man im Spiel 1:1 in die Zuchtkammer legt.
  function calcAllocateOptimal(h) {
    var attrs = Object.keys(h.req).slice().sort(function (a, b) {
      var am = h.mandatory.indexOf(a) >= 0, bm = h.mandatory.indexOf(b) >= 0;
      if (am !== bm) return am ? -1 : 1;
      return h.req[b] - h.req[a];
    });
    var consumed = {}, achieved = {};
    attrs.forEach(function (attr) {
      var need = h.req[attr], got = achieved[attr] || 0;
      if (got >= need) return;
      var best = calcBestItemsFor(attr, 1);
      if (!best.length) return;
      var c = best[0], key = c.kind + ':' + c.item.id, per = c.item.attrs[attr];
      var use = Math.ceil((need - got) / per);
      consumed[key] = (consumed[key] || 0) + use;
      Object.keys(c.item.attrs).forEach(function (a2) {
        achieved[a2] = (achieved[a2] || 0) + c.item.attrs[a2] * use;
      });
    });
    return { consumed: consumed, achieved: achieved };
  }
  function calcMaterialsListHtml(rows) {
    return rows.length
      ? '<div class="lcm-calc-mats-list">' + rows.map(function (r) {
          return '<div class="lcm-calc-mats-item"><span>' + esc(calcItemName(r.item)) + '</span><b>' + r.qty + '&times;</b></div>';
        }).join('') + '</div>'
      : '<p class="lcm-hint">Keine passenden Materialien gefunden.</p>';
  }
  function calcConsumedRows(consumed) {
    return Object.keys(consumed).map(function (key) {
      var parts = key.split(':'), kind = parts[0], iid = parts[1];
      var item = (kind === 'mem' ? calcData.memories : calcData.food).filter(function (it) { return it.id === iid; })[0];
      return item ? { kind: kind, item: item, qty: consumed[key] } : null;
    }).filter(Boolean).sort(function (a, b) { return b.qty - a.qty; });
  }
  function calcOptimalHtml(h) {
    var opt = calcAllocateOptimal(h);
    var rows = Object.keys(h.req).map(function (a) {
      var need = h.req[a], have = Math.round((opt.achieved[a] || 0) * 100) / 100, man = h.mandatory.indexOf(a) >= 0;
      return '<tr class="' + (have >= need ? 'met' : '') + (man ? ' mand' : '') + '">' +
        '<td>' + esc(calcData.humans.attrNames_de[a] || a) + '</td><td>' + need + '</td><td>' + have + '</td></tr>';
    }).join('');
    var mats = calcConsumedRows(opt.consumed);
    return '<div class="lcm-calc-opt">' +
      '<div class="lcm-quest-sub">Optimale Materialien &ndash; Auswirkung auf die Werte</div>' +
      '<table class="lcm-calc-opt-table"><thead><tr><th>Eigenschaft</th><th>Ben&ouml;tigt</th><th>Erreicht</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="lcm-hint">Zeigt die theoretisch beste Materialwahl unabh&auml;ngig von deinem eingetragenen Bestand &ndash; als Einkaufsliste f&uuml;r die Zuchtkammer im Spiel. Die tats&auml;chlich verbrauchten Ressourcen beim Klick auf &bdquo;Z&uuml;chten&ldquo; richten sich weiterhin nach deinem echten Bestand (Reiter &bdquo;Manuell&ldquo;).</p>' +
      '<div class="lcm-quest-sub" style="margin-top:10px;">Materialien f&uuml;r die Zuchtkammer</div>' +
      calcMaterialsListHtml(mats) +
      '</div>';
  }
  function calcMaterialsHtml(h) {
    var alloc = calcAllocate(h);
    var rows = calcConsumedRows(alloc.consumed);
    var html = '<div class="lcm-calc-mats"><div class="lcm-quest-sub">Materialliste &ndash; optimale Auswahl aus deinem Bestand</div>';
    html += rows.length ? calcMaterialsListHtml(rows) : '<p class="lcm-hint">Noch keine passenden Materialien im eingetragenen Bestand.</p>';
    var short = Object.keys(alloc.shortfall);
    if (short.length) {
      short.sort(function (a, b) { return (h.mandatory.indexOf(b) >= 0) - (h.mandatory.indexOf(a) >= 0); });
      html += '<div class="lcm-quest-sub" style="margin-top:10px;">Fehlt noch &ndash; am besten geeignet</div>' +
        short.map(function (a) {
          var best = calcBestItemsFor(a, 3);
          if (!best.length) return '';
          return '<div class="lcm-calc-rec-attr"><b>' + esc(calcData.humans.attrNames_de[a] || a) +
            '</b><span class="lcm-hint" style="display:inline;margin:0 0 0 6px;">noch ' + alloc.shortfall[a] + ' n&ouml;tig</span>' +
            '<div class="lcm-calc-rec-list">' + best.map(function (c) { return calcRecommendRowHtml(a, c); }).join('') + '</div></div>';
        }).join('');
    }
    html += '</div>';
    return html;
  }
  function calcHumanCardHtml(h, totals, expanded) {
    var grownN = calcGrownCount(h.id);
    var ok = humanGrowable(h, totals);
    var rows = Object.keys(h.req).map(function (a) {
      var have = totals[a] || 0, need = h.req[a], man = h.mandatory.indexOf(a) >= 0;
      return '<div class="lcm-calc-req' + (have >= need ? ' met' : '') + (man ? ' mand' : '') + '">' +
        '<span>' + esc(calcData.humans.attrNames_de[a] || a) + '</span><b>' + have + ' / ' + need + '</b></div>';
    }).join('');
    return '<div class="lcm-calc-human' + (ok ? ' ok' : '') + (expanded ? ' open' : '') + '" data-hid="' + esc(h.id) + '">' +
      '<div class="lcm-calc-human-head">' +
      '<div class="lcm-calc-human-nm">' + esc(h.name_de) + '<span class="lcm-human-en">' + esc(h.name_en) + '</span></div>' +
      '<div class="lcm-calc-human-meta">' + esc(h.category_de) + ' &middot; Stufe ' + h.tier + (grownN ? ' &middot; ' + grownN + '&times; gez&uuml;chtet' : '') + '</div>' +
      '</div>' +
      (expanded ? (function () {
        var mode = calcViewMode();
        return '<div class="lcm-calc-human-body">' +
          '<div class="lcm-calc-viewtoggle">' +
          '<button type="button" class="lcm-calc-vt-btn' + (mode === 'manual' ? ' active' : '') + '" data-mode="manual">Manuell (mein Bestand)</button>' +
          '<button type="button" class="lcm-calc-vt-btn' + (mode === 'optimal' ? ' active' : '') + '" data-mode="optimal">Nur optimale Materialien</button>' +
          '</div>' +
          (mode === 'manual'
            ? '<div class="lcm-calc-req-list">' + rows + '</div>' + calcMaterialsHtml(h)
            : calcOptimalHtml(h)) +
          '<button type="button" class="lcm-hudbtn lcm-calc-grow-btn" data-hid="' + esc(h.id) + '"' + (ok ? '' : ' disabled') + '>Z&uuml;chten</button>' +
          (ok ? '' : '<p class="lcm-hint">Es fehlen noch Ressourcen f&uuml;r mindestens eine Eigenschaft in deinem eingetragenen Bestand (gelb markiert = f&uuml;r diesen Beruf zwingend).</p>') +
          '</div>';
      })() : '') +
      '</div>';
  }
  function calcDateTimeDe(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  // Read-only Karte fuer einen bereits abgeschlossenen Zuchtvorgang - zeigt den eingefrorenen Stand
  // (Werte + verbrauchte Materialien) von damals, nicht die aktuellen Live-Werte.
  function calcGrownDeleteBtnHtml(entry) {
    return '<button type="button" class="lcm-mini-btn lcm-calc-grown-del" data-at="' + entry.at + '" title="Entfernen (z.B. bei Verklicken)">&times; Entfernen</button>';
  }
  function calcGrownCardHtml(entry) {
    var when = calcDateTimeDe(entry.at);
    var s = entry.snapshot;
    if (!s) {
      var h = calcData.humans.list.filter(function (x) { return x.id === entry.id; })[0];
      return '<div class="lcm-calc-human lcm-calc-grown-card ok"><div class="lcm-calc-human-head">' +
        '<div class="lcm-calc-human-nm">' + esc(h ? h.name_de : entry.id) + '</div>' +
        '<div class="lcm-calc-human-meta">gez&uuml;chtet am ' + when + '</div>' +
        calcGrownDeleteBtnHtml(entry) +
        '</div>' +
        '<div class="lcm-calc-human-body"><p class="lcm-hint">Details zu diesem fr&uuml;heren Zuchtvorgang liegen nicht vor (erfasst vor diesem Update).</p></div></div>';
    }
    var rows = s.req.map(function (r) {
      return '<div class="lcm-calc-req' + (r.have >= r.need ? ' met' : '') + (r.mandatory ? ' mand' : '') + '">' +
        '<span>' + esc(calcData.humans.attrNames_de[r.attr] || r.attr) + '</span><b>' + r.have + ' / ' + r.need + '</b></div>';
    }).join('');
    var mats = s.materials.length
      ? '<div class="lcm-calc-mats-list">' + s.materials.map(function (m) {
          return '<div class="lcm-calc-mats-item"><span>' + esc(m.name_de) + '</span><b>' + m.qty + '&times;</b></div>';
        }).join('') + '</div>'
      : (s.fromSavegame
        ? '<p class="lcm-hint">Aus dem Spielstand erg&auml;nzt &ndash; welche Materialien dort tats&auml;chlich verbraucht wurden, kennt die App nicht.</p>'
        : '<p class="lcm-hint">Keine Materialien verbraucht.</p>');
    return '<div class="lcm-calc-human lcm-calc-grown-card ok">' +
      '<div class="lcm-calc-human-head">' +
      '<div class="lcm-calc-human-nm">' + esc(s.name_de) + '<span class="lcm-human-en">' + esc(s.name_en) + '</span></div>' +
      '<div class="lcm-calc-human-meta">' + esc(s.category_de) + ' &middot; Stufe ' + s.tier + ' &middot; gez&uuml;chtet am ' + when +
      (s.fromSavegame ? ' <span class="lcm-calc-grown-sv-tag">aus Spielstand</span>' : '') + '</div>' +
      calcGrownDeleteBtnHtml(entry) +
      '</div>' +
      '<div class="lcm-calc-human-body">' +
      '<div class="lcm-calc-req-list">' + rows + '</div>' +
      '<div class="lcm-calc-mats"><div class="lcm-quest-sub">Verwendete Materialien</div>' + mats + '</div>' +
      '</div></div>';
  }
  function calcFilterBarHtml() {
    var f = calcFilterState(), cats = calcData.humans.categories_de;
    var catOpts = '<option value="all">Alle Kategorien</option>' + Object.keys(cats).map(function (c) {
      return '<option value="' + esc(c) + '"' + (f.cat === c ? ' selected' : '') + '>' + esc(cats[c]) + '</option>';
    }).join('');
    var tierOpts = ['all', '1', '2', '3', '4'].map(function (t) {
      return '<option value="' + t + '"' + (f.tier === t ? ' selected' : '') + '>' + (t === 'all' ? 'Alle Stufen' : 'Stufe ' + t) + '</option>';
    }).join('');
    var councilOpts = '<option value="all">Alle Ausschüsse</option>' + (calcData.council ? calcData.council.list.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (f.council === c.id ? ' selected' : '') + '>' + esc(c.name_de) + '</option>';
    }).join('') : '');
    return '<div class="lcm-calc-filters">' +
      '<select id="calc-f-tier">' + tierOpts + '</select>' +
      '<select id="calc-f-cat">' + catOpts + '</select>' +
      '<select id="calc-f-council" title="Nur die 4 Berufe eines Ausschusses aus dem Rat der Menschheit anzeigen">' + councilOpts + '</select>' +
      '<label class="lcm-switch"><input type="checkbox" id="calc-f-growable"' + (f.onlyGrowable ? ' checked' : '') + '><span>Nur z&uuml;chtbare anzeigen</span></label>' +
      '<label class="lcm-switch"><input type="checkbox" id="calc-f-hidegrown"' + (f.hideGrown ? ' checked' : '') + '><span>Bereits gez&uuml;chtete ausblenden</span></label>' +
      '<label class="lcm-switch"><input type="checkbox" id="calc-f-sort"' + (f.sortNeed ? ' checked' : '') + '><span>Nach wenigstem Ressourcenbedarf sortieren</span></label>' +
      '</div>';
  }
  /* ---------------------------------------------------------------- Spielstand (.sav einlesen, eigene Rubrik) */
  // Eigenes Fenster (statt wie fr&uuml;her ein kleiner Bereich im Rechner): liest den Spielstand
  // serverseitig (server.mjs, /api/savegame/*) und zeigt Metadaten, eine Kompatibilit&auml;tswarnung,
  // die gefundenen Mengen als Bildkarten (Bildquelle: dieselben Wiki-Bilder wie im Rechner) und den
  // Missionsstatus an. "unmapped" sind Gegenst&auml;nde, die gefunden, aber (noch) keinem Eintrag
  // zugeordnet werden konnten - die bleiben unangetastet. Das eigentliche &Uuml;bernehmen in den
  // Rechner fragt immer erst per Best&auml;tigungsdialog nach, da vorhandene Mengen ersetzt (nicht
  // addiert) werden.
  var svModal, svState = { step: 'list', files: null, base: '', loading: false, error: '', preview: null };
  function toggleSavegame() {
    if (!svModal) svModal = makeModal('lcm-sv', 'Spielstand');
    if (svModal.isOpen()) { svModal.close(); return; }
    svState = { step: 'list', files: null, base: '', loading: true, error: '', preview: null };
    svModal.open();
    renderSavegame();
    loadCalcData().then(function () {
      return fetch('/api/savegame/list').then(function (r) { return r.json(); });
    }).then(function (j) {
      svState.loading = false;
      svState.files = j.files || [];
      svState.base = j.base || '';
      renderSavegame();
    }).catch(function () {
      svState.loading = false;
      svState.error = 'Spielstand-Liste konnte nicht geladen werden.';
      renderSavegame();
    });
  }
  function svReadFile(f) {
    svState.loading = true;
    renderSavegame();
    fetch('/api/savegame/read?path=' + encodeURIComponent(f.path)).then(function (r) {
      if (!r.ok) throw new Error('Fehler beim Einlesen');
      return r.json();
    }).then(function (j) {
      svState.loading = false;
      svState.preview = j;
      svState.step = 'preview';
      renderSavegame();
    }).catch(function () {
      svState.loading = false;
      svState.error = 'Spielstand konnte nicht gelesen/entpackt werden.';
      renderSavegame();
    });
  }
  function svGameTypeDe(t) {
    if (!t) return '';
    var s = String(t).replace(/^EVoygeSaveGameGameType::/, '');
    return s === 'Full' ? 'Vollversion' : s;
  }
  function svMetaHtml(meta) {
    if (!meta) return '';
    var rows = [];
    if (meta.slotName) rows.push(['Speicherstand', meta.slotName]);
    if (meta.gameBuild) rows.push(['Spiel-Build', String(meta.gameBuild)]);
    if (meta.gameType) rows.push(['Modus', svGameTypeDe(meta.gameType)]);
    if (!rows.length) return '';
    return '<div class="lcm-sv-meta">' + rows.map(function (r) {
      return '<div class="lcm-sv-meta-row"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>';
    }).join('') + '</div>';
  }
  function svCompatHtml(compat) {
    if (!compat) return '';
    if (compat.matches === true) {
      return '<div class="lcm-sv-compat ok">&#10003; Spielversion entspricht dem zuletzt gepr&uuml;ften Stand (Build ' + compat.testedBuild + ') &ndash; die ausgelesenen Werte sollten stimmen.</div>';
    }
    if (compat.matches === false) {
      return '<div class="lcm-sv-compat warn">&#9888; Dein Spielstand stammt von Build ' + esc(compat.savegameBuild) +
        ', zuletzt gegengepr&uuml;ft wurde das Einlesen mit Build ' + compat.testedBuild + '. Ein Spiel-Update kann das Speicherformat ver&auml;ndert haben &ndash; die Werte unten bitte grob gegen dein Inventar pr&uuml;fen.</div>';
    }
    return '<div class="lcm-sv-compat warn">&#9888; Spiel-Version im Spielstand konnte nicht ermittelt werden &ndash; ungepr&uuml;ft.</div>';
  }
  function svItemCardHtml(item, qty) {
    var img = item.image ? '<img src="' + esc(item.image) + '" alt="" loading="lazy">' : '<div class="lcm-sv-card-noimg">?</div>';
    return '<div class="lcm-sv-card" title="' + esc(item.description_de || '') + '">' + img +
      '<div class="lcm-sv-card-nm">' + esc(calcItemName(item)) + '</div>' +
      '<div class="lcm-sv-card-qty">&times;' + qty + '</div></div>';
  }
  function svItemCardsHtml(title, values, items) {
    var ids = Object.keys(values || {}).filter(function (id) { return values[id] > 0; });
    if (!ids.length) return '';
    ids.sort(function (a, b) { return values[b] - values[a]; });
    var cards = ids.map(function (id) {
      var item = items.filter(function (it) { return it.id === id; })[0];
      return item ? svItemCardHtml(item, values[id]) : '';
    }).join('');
    return '<div class="lcm-quest-sub" style="margin-top:12px;">' + esc(title) + ' (' + ids.length + ')</div>' +
      '<div class="lcm-sv-cards">' + cards + '</div>';
  }
  function svUnmappedHtml(unmapped) {
    if (!unmapped || !unmapped.length) return '';
    return '<div class="lcm-quest-sub" style="margin-top:12px;">Gefunden, aber nicht automatisch zuordenbar (bitte bei Bedarf manuell im Rechner eintragen)</div>' +
      '<div class="lcm-calc-import-unmapped">' + unmapped.map(function (u) {
        return '<span class="lcm-calc-chip" title="' + esc(u.assetName) + '">' + esc(u.assetName.replace(/^DA_(Food_|Memory_|Cartridge_Mod_)/, '')) + ' &times;' + u.qty + '</span>';
      }).join('') + '</div>';
  }
  var SV_QUEST_STATUS_DE = {
    'FVoyageQuestStatus::Completed': 'Abgeschlossen',
    'FVoyageQuestStatus::InProgress': 'In Arbeit',
    'FVoyageQuestStatus::NotStarted': 'Nicht begonnen'
  };
  function svQuestStatusDe(s) { return SV_QUEST_STATUS_DE[s] || (s ? String(s).replace(/^FVoyageQuestStatus::/, '') : 'Unbekannt'); }
  function svQuestOrder(s) { return s === 'FVoyageQuestStatus::Completed' ? 0 : (s === 'FVoyageQuestStatus::InProgress' ? 1 : 2); }
  function svQuestsHtml(quests) {
    if (!quests || !quests.length) return '';
    var completed = quests.filter(function (q) { return q.status === 'FVoyageQuestStatus::Completed'; });
    var inProgress = quests.filter(function (q) { return q.status === 'FVoyageQuestStatus::InProgress'; });
    var matched = quests.filter(function (q) { return q.questId; });
    var newlyDone = completed.filter(function (q) { return q.questId && !questDone(q.questId); });
    var rows = quests.slice().sort(function (a, b) { return svQuestOrder(a.status) - svQuestOrder(b.status); }).map(function (q) {
      var cls = q.status === 'FVoyageQuestStatus::Completed' ? 'done' : (q.status === 'FVoyageQuestStatus::InProgress' ? 'progress' : '');
      var name = q.de || q.assetName.replace(/^DA_Quest_/, '');
      return '<div class="lcm-sv-quest-row ' + cls + '"><span>' + esc(name) +
        (q.questId ? '' : ' <i class="lcm-sv-quest-unk">(intern: ' + esc(q.assetName) + ', nicht automatisch zuordenbar)</i>') +
        '</span><b>' + esc(svQuestStatusDe(q.status)) + '</b></div>';
    }).join('');
    return '<div class="lcm-quest-sub" style="margin-top:12px;">Missionen im Spielstand &ndash; ' + completed.length + ' abgeschlossen, ' +
      inProgress.length + ' in Arbeit (' + matched.length + ' / ' + quests.length + ' intern zugeordnet)</div>' +
      '<div class="lcm-sv-quests">' + rows + '</div>' +
      (newlyDone.length ? '<p class="lcm-hint">' + newlyDone.length + ' abgeschlossene Mission(en) sind im Missionen-Fenster hier in der App noch nicht als erledigt markiert &ndash; beim &Uuml;bernehmen unten wird das mit &uuml;bernommen.</p>' : '');
  }
  // Zaehlt, wie viele im Spielstand gefundene gezuechtete Menschen je Beruf mehr sind als
  // aktuell in "Bereits gezuechtet" erfasst - rein additiv (nie ein Grund, App-eigene Eintraege
  // zu entfernen: die Spielstand-Liste koennte theoretisch auch nur einen Teil der Historie
  // enthalten). Macht "Im Rechner uebernehmen" idempotent: ein zweites Mal ohne neue Zucht im
  // Spiel ergibt ueberall 0 fehlende.
  function svGrownMissingCount(p) {
    var byProf = {};
    (p.grown || []).forEach(function (g) { if (g.professionId) byProf[g.professionId] = (byProf[g.professionId] || 0) + 1; });
    var missing = {}, total = 0;
    Object.keys(byProf).forEach(function (pid) {
      var diff = byProf[pid] - calcGrownCount(pid);
      if (diff > 0) { missing[pid] = diff; total += diff; }
    });
    return { missing: missing, total: total };
  }
  function svGrownHtml(grown) {
    if (!grown || !grown.length) return '';
    var byProf = {};
    grown.forEach(function (g) {
      var key = g.professionId || ('?' + g.professionAsset);
      if (!byProf[key]) byProf[key] = { nameDe: g.nameDe || (g.professionAsset || 'unbekannter Beruf'), delivered: 0, success: 0 };
      if (g.status === 'EVoyageResultType::Delivered') byProf[key].delivered++; else byProf[key].success++;
    });
    var rows = Object.keys(byProf).sort(function (a, b) { return byProf[b].delivered + byProf[b].success - (byProf[a].delivered + byProf[a].success); }).map(function (k) {
      var b = byProf[k], total = b.delivered + b.success, parts = [];
      if (b.delivered) parts.push(b.delivered + ' geliefert');
      if (b.success) parts.push(b.success + ' noch nicht abgeholt');
      return '<div class="lcm-sv-quest-row"><span>' + esc(b.nameDe) + '</span><b>' + total + '&times; (' + parts.join(', ') + ')</b></div>';
    }).join('');
    var unmatchedN = grown.filter(function (g) { return !g.professionId; }).length;
    return '<div class="lcm-quest-sub" style="margin-top:12px;">Gez&uuml;chtete Menschen im Spielstand (' + grown.length + ' insgesamt seit Spielbeginn)</div>' +
      '<div class="lcm-sv-quests">' + rows + '</div>' +
      (unmatchedN ? '<p class="lcm-hint">' + unmatchedN + ' Eintrag/Eintr&auml;ge mit unbekanntem Beruf (vermutlich neuerer Spielinhalt).</p>' : '');
  }
  function svSectionHtml() {
    if (svState.loading) return '<div class="lcm-empty">L&auml;dt &hellip;</div>';
    if (svState.error) return '<p class="lcm-hint">' + esc(svState.error) + '</p>';
    if (svState.step === 'preview' && svState.preview) {
      var p = svState.preview;
      return svCompatHtml(p.compat) + svMetaHtml(p.meta) +
        '<p class="lcm-hint">Ausgelesen wird die Gesamtmenge im ganzen Spielstand (Spielerinventar + Schiffslager + alle Kisten zusammen), nicht nur das mitgef&uuml;hrte Inventar.</p>' +
        svItemCardsHtml('Erinnerungen (Memories)', p.memory, calcData.memories) +
        svItemCardsHtml('Nahrung (Food)', p.food, calcData.food) +
        svUnmappedHtml(p.unmapped) +
        svQuestsHtml(p.quests) +
        svGrownHtml(p.grown) +
        '<div class="lcm-calc-import-actions" style="margin-top:14px;">' +
        '<button type="button" class="lcm-mini-btn primary" id="sv-apply">Im Rechner &uuml;bernehmen</button>' +
        '<button type="button" class="lcm-mini-btn" id="sv-back">Zur&uuml;ck</button></div>';
    }
    if (!svState.files || !svState.files.length) {
      return '<p class="lcm-hint">Kein Spielstand gefunden' + (svState.base ? ' (gesucht in: ' + esc(svState.base) + ')' : '') + '.</p>';
    }
    return '<div class="lcm-calc-import-actions">' +
      '<select id="sv-select">' + svState.files.map(function (f, i) {
        return '<option value="' + i + '"' + (i === 0 ? ' selected' : '') + '>' + esc(f.name) +
          ' &ndash; ' + esc(new Date(f.mtimeMs).toLocaleString('de-DE')) + '</option>';
      }).join('') + '</select>' +
      '<button type="button" class="lcm-mini-btn primary" id="sv-read">Einlesen</button></div>';
  }
  function renderSavegame() {
    if (!svModal) return;
    svModal.body.innerHTML = '<div class="lcm-sv">' +
      '<p class="lcm-lead">Liest deinen Spielstand (.sav) direkt aus dem Steam-Speicherordner und zeigt Erinnerungen, Nahrung, nicht zuordenbare Funde und den Missionsstatus an &ndash; unabh&auml;ngig vom Rechner, der nur deine manuell eingetragenen Mengen kennt.</p>' +
      svSectionHtml() +
      '</div>';
    wireSavegame();
  }
  function svApply() {
    var p = svState.preview;
    if (!p) return;
    var memIds = Object.keys(p.memory || {}), foodIds = Object.keys(p.food || {});
    var hasExisting = memIds.some(function (id) { return calcQty('mem', id) > 0; }) || foodIds.some(function (id) { return calcQty('food', id) > 0; });
    var completed = (p.quests || []).filter(function (q) { return q.status === 'FVoyageQuestStatus::Completed' && q.questId; });
    var newlyDone = completed.filter(function (q) { return !questDone(q.questId); });
    var grownInfo = svGrownMissingCount(p);
    var msg = 'Werte aus dem Spielstand in den Rechner &uuml;bernehmen?\n\n' +
      memIds.length + ' Erinnerungs- und ' + foodIds.length + ' Nahrungs-Eintr&auml;ge werden gesetzt' +
      (hasExisting ? ' (deine bisherigen Mengen im Rechner werden dabei ersetzt, nicht addiert)' : ', dein Rechner-Bestand ist bisher noch leer') + '.' +
      (newlyDone.length ? '\n' + newlyDone.length + ' Mission(en) werden zus&auml;tzlich im Missionen-Fenster als erledigt markiert.' : '') +
      (grownInfo.total ? '\n' + grownInfo.total + ' im Spielstand gezüchtete(r) Mensch(en) fehlen noch in "Bereits gezüchtet" und werden ergänzt (nur hinzugefügt, nichts wird entfernt; keine Materialien werden dabei abgezogen, die wurden im Spiel bereits verbraucht).' : '');
    if (!window.confirm(msg)) return;
    memIds.forEach(function (id) { setCalcQty('mem', id, p.memory[id]); });
    foodIds.forEach(function (id) { setCalcQty('food', id, p.food[id]); });
    newlyDone.forEach(function (q) { setQuestDone(q.questId, true); });
    if (grownInfo.total) {
      var nowBase = Date.now(), addedCount = 0;
      Object.keys(grownInfo.missing).forEach(function (pid) {
        var h = calcData.humans.list.filter(function (x) { return x.id === pid; })[0];
        if (!h) return;
        for (var i = 0; i < grownInfo.missing[pid]; i++) {
          var list = calcGrownList();
          list.push({
            id: pid,
            at: nowBase + addedCount, // je 1ms versetzt, bleibt so innerhalb dieser Schleife eindeutig
            snapshot: {
              name_de: h.name_de, name_en: h.name_en, category_de: h.category_de, tier: h.tier,
              req: Object.keys(h.req).map(function (a) { return { attr: a, need: h.req[a], have: h.req[a], mandatory: h.mandatory.indexOf(a) >= 0 }; }),
              materials: [],
              fromSavegame: true
            }
          });
          lsSet('lcm-calc-grown', JSON.stringify(list));
          addedCount++;
        }
      });
    }
    toast('Spielstand &uuml;bernommen: ' + (memIds.length + foodIds.length) + ' Mengen gesetzt' +
      (newlyDone.length ? ', ' + newlyDone.length + ' Mission(en) erledigt' : '') +
      (grownInfo.total ? ', ' + grownInfo.total + ' Mensch(en) ergänzt' : '') + '.', { done: true });
    refreshLocationQuestRows();
    if (calcModal && calcModal.isOpen()) renderCalc();
    if (questsModal && questsModal.isOpen()) loadQuestsData().then(renderQuests);
  }
  function wireSavegame() {
    var body = svModal.body;
    var readBtn = $('#sv-read', body);
    if (readBtn) readBtn.addEventListener('click', function () {
      var sel = $('#sv-select', body);
      var idx = sel ? parseInt(sel.value, 10) : 0;
      var f = svState.files && svState.files[idx];
      if (f) svReadFile(f);
    });
    var backBtn = $('#sv-back', body);
    if (backBtn) backBtn.addEventListener('click', function () {
      svState.step = 'list';
      svState.preview = null;
      renderSavegame();
    });
    var applyBtn = $('#sv-apply', body);
    if (applyBtn) applyBtn.addEventListener('click', svApply);
  }
  function renderCalc() {
    if (!calcModal) return;
    var totals = calcTotals();
    var humans = calcFilteredSortedHumans(totals);
    var growableCount = calcData.humans.list.filter(function (h) { return humanGrowable(h, totals); }).length;
    calcModal.body.innerHTML = '<div class="lcm-calc">' +
      '<p class="lcm-lead">Trage ein, wie viele Erinnerungen (Memories) und wie viel Nahrung (Food) du im Inventar hast. Der Rechner zeigt live, welche der 40 Berufe du damit z&uuml;chten kannst. Datenbasis: der Human Growth Calculator von thelastcaretaker-tools.com.</p>' +
      '<div class="lcm-calc-actions"><button type="button" class="lcm-mini-btn" id="calc-clear">Alle Mengen leeren</button>' +
      '<button type="button" class="lcm-mini-btn" id="calc-goto-savegame" title="Mengen direkt aus deinem Spielstand einlesen">&#128190; Spielstand einlesen &hellip;</button>' +
      '<span class="lcm-hint">' + growableCount + ' / ' + calcData.humans.list.length + ' Berufe aktuell z&uuml;chtbar</span></div>' +
      '<div class="lcm-calc-pools">' +
      calcPoolHtml('mem', 'Erinnerungen (Memories)', calcData.memories) +
      calcPoolHtml('food', 'Nahrung (Food)', calcData.food) +
      '</div>' +
      '<div id="calc-totals">' + calcTotalsHtml(totals) + '</div>' +
      calcFilterBarHtml() +
      '<div class="lcm-calc-human-grid" id="calc-human-grid">' +
      humans.map(function (h) { return calcHumanCardHtml(h, totals, h.id === calcExpandedId); }).join('') +
      '</div>' +
      calcGrownSectionHtml() +
      '</div>';
    wireCalc();
  }
  // "Bereits gezuechtet": eigener Bereich mit der eingefrorenen Infokarte jedes Zuchtvorgangs
  // (neueste zuerst) - unabhaengig von der Berufsauswahl oben, die nach jedem "Zuechten" wieder
  // zurueckgesetzt wird, sodass derselbe Beruf beliebig oft erneut gezuechtet werden kann.
  function calcGrownSectionHtml() {
    var list = calcGrownList().slice().reverse();
    if (!list.length) return '';
    return '<div class="lcm-calc-grown-section"><h4>Bereits gez&uuml;chtet (' + list.length + ')</h4>' +
      '<div class="lcm-calc-grown-grid">' + list.map(calcGrownCardHtml).join('') + '</div></div>';
  }
  function wireCalcHumanGrid(root) {
    $$('.lcm-calc-human-head', root).forEach(function (hd) {
      hd.addEventListener('click', function () {
        var id = hd.closest('.lcm-calc-human').getAttribute('data-hid');
        calcExpandedId = calcExpandedId === id ? null : id;
        updateCalcLive();
      });
    });
    $$('.lcm-calc-grow-btn', root).forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); growHuman(b.getAttribute('data-hid')); });
    });
    function bumpRecQty(kind, id, delta) {
      setCalcQty(kind, id, calcQty(kind, id) + delta);
      var newQty = calcQty(kind, id);
      var inp = calcModal.body.querySelector('.lcm-calc-item[data-kind="' + kind + '"][data-id="' + id + '"] .lcm-calc-item-qty');
      if (inp) inp.value = newQty;
      var ct = $('[data-poolkind="' + kind + '"] .lcm-calc-pool-ct', calcModal.body);
      if (ct) {
        var items = kind === 'mem' ? calcData.memories : calcData.food;
        ct.textContent = '(' + items.filter(function (it) { return calcQty(kind, it.id) > 0; }).length + ')';
      }
      // Karte/Materialliste/"Fehlt noch" werden per updateCalcLive() ohnehin neu gerendert,
      // dort wird "Bestand: n" und der deaktivierte -1-Knopf bei 0 automatisch mit-aktualisiert.
      updateCalcLive();
    }
    $$('.lcm-calc-rec-add', root).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        bumpRecQty(b.getAttribute('data-kind'), b.getAttribute('data-id'), 1);
      });
    });
    $$('.lcm-calc-rec-sub', root).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        bumpRecQty(b.getAttribute('data-kind'), b.getAttribute('data-id'), -1);
      });
    });
    $$('.lcm-calc-vt-btn', root).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        setCalcViewMode(b.getAttribute('data-mode'));
        updateCalcLive();
      });
    });
  }
  function wireCalc() {
    var body = calcModal.body;
    var qtyDebounced = debounce(updateCalcLive, 150);
    $$('.lcm-calc-item-qty', body).forEach(function (inp) {
      inp.addEventListener('input', function () {
        var row = inp.closest('.lcm-calc-item');
        setCalcQty(row.getAttribute('data-kind'), row.getAttribute('data-id'), parseInt(inp.value, 10) || 0);
        qtyDebounced();
      });
    });
    $$('.lcm-calc-pct', body).forEach(function (rng) {
      rng.addEventListener('input', function () {
        var kind = rng.closest('.lcm-calc-pool').getAttribute('data-poolkind');
        setCalcPct(kind, parseInt(rng.value, 10));
        var lbl = rng.parentNode.querySelector('.lcm-calc-pct-val');
        if (lbl) lbl.textContent = calcPct(kind) + '%';
        qtyDebounced();
      });
    });
    ['tier', 'cat', 'council', 'growable', 'hidegrown', 'sort'].forEach(function (k) {
      var e = $('#calc-f-' + k, body);
      if (!e) return;
      e.addEventListener('change', function () {
        var key = 'lcm-calc-f-' + k;
        lsSet(key, e.type === 'checkbox' ? (e.checked ? '1' : '0') : e.value);
        updateCalcLive();
      });
    });
    $$('.lcm-calc-grown-del', body).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        removeGrown(parseFloat(b.getAttribute('data-at')));
      });
    });
    var clearBtn = $('#calc-clear', body);
    if (clearBtn) clearBtn.addEventListener('click', function () {
      calcData.memories.forEach(function (m) { setCalcQty('mem', m.id, 0); });
      calcData.food.forEach(function (fo) { setCalcQty('food', fo.id, 0); });
      renderCalc();
      toast('Alle Mengen geleert.');
    });
    wireCalcHumanGrid(body);
    var gotoSvBtn = $('#calc-goto-savegame', body);
    if (gotoSvBtn) gotoSvBtn.addEventListener('click', toggleSavegame);
  }
  function updateCalcLive() {
    if (!calcModal || !calcModal.isOpen()) return;
    var totals = calcTotals();
    var tEl = $('#calc-totals', calcModal.body);
    if (tEl) tEl.innerHTML = calcTotalsHtml(totals);
    var gEl = $('#calc-human-grid', calcModal.body);
    if (gEl) {
      var humans = calcFilteredSortedHumans(totals);
      gEl.innerHTML = humans.map(function (h) { return calcHumanCardHtml(h, totals, h.id === calcExpandedId); }).join('');
      wireCalcHumanGrid(gEl);
    }
    var growableCount = calcData.humans.list.filter(function (h) { return humanGrowable(h, totals); }).length;
    var hintEl = $('.lcm-calc-actions .lcm-hint', calcModal.body);
    if (hintEl) hintEl.textContent = growableCount + ' / ' + calcData.humans.list.length + ' Berufe aktuell züchtbar';
    ['mem', 'food'].forEach(function (kind) {
      var ct = $('[data-poolkind="' + kind + '"] .lcm-calc-pool-ct', calcModal.body);
      var items = kind === 'mem' ? calcData.memories : calcData.food;
      if (ct) ct.textContent = '(' + items.filter(function (it) { return calcQty(kind, it.id) > 0; }).length + ')';
    });
  }
  function growHuman(id) {
    var h = calcData.humans.list.filter(function (x) { return x.id === id; })[0];
    if (!h) return;
    var totals = calcTotals();
    if (!humanGrowable(h, totals)) { toast('Nicht genug Ressourcen zum Z&uuml;chten.'); return; }
    // Gleiche Zuteilung wie die Materialliste-Vorschau (calcAllocate), hier wird sie tatsaechlich angewendet.
    var alloc = calcAllocate(h);
    // Snapshot der Infokarte zum Zeitpunkt der Bestaetigung (vor dem Abzug vom Bestand einfrieren),
    // damit "Bereits gezuechtet" spaeter zeigt, was damals wirklich verwendet wurde/erreicht war.
    var snapshot = {
      name_de: h.name_de, name_en: h.name_en, category_de: h.category_de, tier: h.tier,
      req: Object.keys(h.req).map(function (a) {
        return { attr: a, need: h.req[a], have: totals[a] || 0, mandatory: h.mandatory.indexOf(a) >= 0 };
      }),
      materials: calcConsumedRows(alloc.consumed).map(function (r) {
        return { kind: r.kind, id: r.item.id, name_de: calcItemName(r.item), qty: r.qty };
      })
    };
    Object.keys(alloc.consumed).forEach(function (key) {
      var parts = key.split(':'), kind = parts[0], id2 = parts[1];
      setCalcQty(kind, id2, Math.max(0, calcQty(kind, id2) - alloc.consumed[key]));
    });
    addGrown(h.id, snapshot);
    calcExpandedId = null;
    toast('<b>' + esc(h.name_de) + '</b> gez&uuml;chtet! Ressourcen wurden abgezogen.', { done: true });
    renderCalc();
  }

  /* ---------------------------------------------------------------- Missionen (Quests vom Wiki, auf Deutsch) */
  var questsModal, questsData = null, questsByLoc = null;
  function questDoneKey(id) { return 'lcm-quest-done-' + id; }
  function questDone(id) { return lsGet(questDoneKey(id)) === '1'; }
  function setQuestDone(id, on) { lsSet(questDoneKey(id), on ? '1' : '0'); }
  function loadQuestsData() {
    if (questsData) return Promise.resolve(questsData);
    return fetch('/custom/data-quests.json').then(function (r) { return r.json(); }).then(function (j) {
      questsData = j;
      questsByLoc = {};
      j.forEach(function (q) { (q.locations || []).forEach(function (locName) { (questsByLoc[locName] = questsByLoc[locName] || []).push(q); }); });
      return j;
    });
  }
  function toggleQuests() {
    if (!questsModal) questsModal = makeModal('lcm-quests', 'Missionen');
    if (questsModal.isOpen()) { questsModal.close(); return; }
    questsModal.body.innerHTML = '<div class="lcm-empty">Lädt …</div>';
    questsModal.open();
    Promise.all([loadQuestsData(), loadWalkData().catch(function () { return {}; })]).then(function (r) {
      renderQuests(r[0]);
    }).catch(function () {
      questsModal.body.innerHTML = '<div class="lcm-empty">Daten konnten nicht geladen werden.</div>';
    });
  }
  function goToLocationName(name) {
    var arr = DATA.byName[name];
    if (!arr || !arr.length) return;
    if (questsModal) questsModal.close();
    goTo(arr[0].id);
  }
  function questCardHtml(q) {
    var done = questDone(q.id);
    var head = '<div class="lcm-quest-card' + (done ? ' done' : '') + (q.stub ? ' stub' : '') + '" data-qid="' + esc(q.id) + '">' +
      '<div class="lcm-quest-head"><h5>' + esc(q.de) + '<span class="lcm-human-en">' + esc(q.en) + '</span></h5>' +
      '<button type="button" class="lcm-quest-toggle" data-qid="' + esc(q.id) + '">' + (done ? '&#10004; Erledigt' : 'Offen') + '</button></div>';
    var meta = [];
    if (q.experience != null) meta.push('+' + q.experience + ' Erfahrung');
    if (q.points) meta.push('+' + q.points + ' Enhancer-Punkte');
    if (meta.length) head += '<div class="lcm-quest-meta">' + meta.join(' &middot; ') + '</div>';
    var body = '';
    if (q.stub) {
      body += '<p class="lcm-hint">' + esc(q.description_de || 'Auf dem Wiki noch nicht beschrieben (Stub).') + '</p>';
    } else {
      if (q.initiated_de) body += '<p><strong>Start:</strong> ' + esc(q.initiated_de) + '</p>';
      if (q.description_de) body += '<p>' + esc(q.description_de).replace(/\n\n/g, '</p><p>') + '</p>';
      if (q.tasks_de && q.tasks_de.length) body += '<div class="lcm-quest-sub">Aufgaben</div>' + ul(q.tasks_de);
      if (q.guide_de && q.guide_de.length) body += '<div class="lcm-quest-sub">Tipp</div>' + ul(q.guide_de);
      if (q.rewards_de && q.rewards_de.length) body += '<div class="lcm-quest-sub">Belohnung</div>' + ul(q.rewards_de);
    }
    if (q.locations && q.locations.length) {
      body += '<div class="lcm-quest-sub">Ort' + (q.locations.length > 1 ? 'e' : '') + '</div><div class="lcm-quest-locs">' +
        q.locations.map(function (n) { return '<button type="button" class="lcm-mini-btn" data-goloc="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>';
    }
    if (walkData && walkData[q.id]) {
      body += '<div class="lcm-quest-sub">Walkthrough</div>' +
        '<button type="button" class="lcm-mini-btn lcm-walk-btn" data-qid="' + esc(q.id) + '">&#128214; Walkthrough anzeigen (Deutsch)</button>';
    }
    return head + '<div class="lcm-quest-body">' + body + '</div></div>';
  }
  function renderQuests(list) {
    if (!questsModal) return;
    var real = list.filter(function (q) { return !q.stub; });
    var doneCount = list.filter(function (q) { return questDone(q.id); }).length;
    // Offene Missionen zuerst, Erledigte rutschen ans Ende - bessere &Uuml;bersicht.
    // Reihenfolge innerhalb jeder der beiden Gruppen bleibt wie gewohnt (Story-Reihenfolge).
    var open = list.filter(function (q) { return !questDone(q.id); });
    var doneList = list.filter(function (q) { return questDone(q.id); });
    var cardsHtml = open.map(questCardHtml).join('');
    if (doneList.length) {
      cardsHtml += '<div class="lcm-quest-divider">Erledigt (' + doneList.length + ')</div>' + doneList.map(questCardHtml).join('');
    }
    var html = '<div class="lcm-quests">' +
      '<p class="lcm-lead">Missionen der Story, aus dem offiziellen Wiki &uuml;bersetzt. ' + real.length + ' von ' + list.length +
      ' haben dort bereits einen ausf&uuml;hrlichen Artikel, der Rest ist auf dem Wiki selbst noch leer (Stub) und nur als Platzhalter gelistet. ' +
      'Der Erledigt-Status hier ist unabh&auml;ngig vom Status der Orte.</p>' +
      '<p class="lcm-hint">' + doneCount + ' / ' + list.length + ' als erledigt markiert.</p>' +
      '<div class="lcm-quest-list">' + cardsHtml + '</div></div>';
    questsModal.body.innerHTML = html;
    $$('.lcm-quest-toggle', questsModal.body).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-qid'), on = !questDone(id);
        setQuestDone(id, on);
        // Neu rendern statt nur die Karte umzuschalten, damit die Mission sofort in die
        // passende Gruppe (offen/erledigt) rutscht. Scroll-Position bleibt dabei erhalten.
        var scrollTop = questsModal.body.scrollTop;
        renderQuests(list);
        questsModal.body.scrollTop = scrollTop;
        refreshLocationQuestRows();
      });
    });
    $$('[data-goloc]', questsModal.body).forEach(function (b) {
      b.addEventListener('click', function () { goToLocationName(b.getAttribute('data-goloc')); });
    });
    $$('.lcm-walk-btn', questsModal.body).forEach(function (b) {
      b.addEventListener('click', function () { showWalkthrough(b.getAttribute('data-qid')); });
    });
  }

  /* Kleine Missions-Zeile im Orts-Popup, wenn dieser Ort zu einer Mission gehört */
  function refreshLocationQuestRows() {
    $$('.lcm-loc-quest').forEach(function (row) {
      var id = row.getAttribute('data-qid'), b = $('.lcm-quest-toggle', row);
      if (!b) return;
      var on = questDone(id);
      row.classList.toggle('done', on);
      b.innerHTML = on ? '&#10004; Erledigt' : 'Als erledigt markieren';
    });
  }
  function enhanceLocationQuest() {
    if (!questsByLoc) return;
    $$('.leaflet-popup .popup-content').forEach(function (pc) {
      if ($('.lcm-loc-quest', pc)) return;
      var locid = $('.locid', pc);
      if (!locid) return;
      var m = locid.textContent.match(/id:\s*([^)\s]+)/);
      var l = m ? DATA.byId[m[1]] : null;
      if (!l || !l.name) return;
      var qs = questsByLoc[l.name];
      if (!qs || !qs.length) return;
      var box = document.createElement('div');
      box.className = 'lcm-loc-quests';
      qs.forEach(function (q) {
        var on = questDone(q.id);
        var row = el('div', { class: 'lcm-loc-quest' + (on ? ' done' : ''), 'data-qid': q.id });
        row.innerHTML = '<span class="lcm-loc-quest-nm">Mission: ' + esc(q.de) + '</span>' +
          '<button type="button" class="lcm-mini-btn lcm-quest-toggle" data-qid="' + esc(q.id) + '">' + (on ? '&#10004; Erledigt' : 'Als erledigt markieren') + '</button>';
        box.appendChild(row);
      });
      var anchor = locid.closest('p') || locid;
      anchor.parentNode.insertBefore(box, anchor);
      box.addEventListener('click', function (e) {
        var b = e.target.closest('.lcm-quest-toggle'); if (!b) return;
        var id = b.getAttribute('data-qid'), on = !questDone(id);
        setQuestDone(id, on);
        refreshLocationQuestRows();
      });
    });
  }

  /* ---------------------------------------------------------------- Walkthrough (Missions-Anleitung, von Neoseeker, auf Deutsch) */
  // Die deutschen Walkthrough-Texte (uebersetzt von neoseeker.com/the-last-caretaker/walkthrough)
  // liegen fest in /custom/data-walkthroughs.json, je Mission ein Eintrag mit einem oder mehreren
  // Abschnitten (Ueberschrift, Absaetze, Bilder). Nicht jede der 44 Missionen hat dort einen
  // eigenen Walkthrough-Artikel; fehlt einer, wird kein Knopf angezeigt bzw. ein Hinweis gezeigt.
  var walkModal, walkData = null;
  function loadWalkData() {
    if (walkData) return Promise.resolve(walkData);
    return fetch('/custom/data-walkthroughs.json').then(function (r) { return r.json(); }).then(function (j) { walkData = j; return j; });
  }
  function walkSectionHtml(s) {
    var imgs = (s.images || []).map(function (u) { return '<img src="' + esc(u) + '" alt="" loading="lazy">'; }).join('');
    var paras = (s.paragraphs || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    return '<div class="lcm-walk-section"><h4>' + esc(s.heading) + '</h4>' +
      (imgs ? '<div class="lcm-walk-imgs">' + imgs + '</div>' : '') + paras + '</div>';
  }
  function showWalkthrough(qid) {
    var q = questsData && questsData.filter(function (x) { return x.id === qid; })[0];
    var w = walkData && walkData[qid];
    if (!walkModal) walkModal = makeModal('lcm-walk', 'Walkthrough');
    var h3 = $('h3', walkModal.root);
    if (h3) h3.textContent = 'Walkthrough' + (q ? ': ' + q.de : '');
    if (!w || !w.sections || !w.sections.length) {
      walkModal.body.innerHTML = '<div class="lcm-empty">Für diese Mission liegt noch kein Walkthrough vor.</div>';
      walkModal.open();
      return;
    }
    var urls = Array.isArray(w.sourceUrl) ? w.sourceUrl : [w.sourceUrl];
    var srcLinks = urls.map(function (u, i) {
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener">Neoseeker' + (urls.length > 1 ? ' (' + (i + 1) + ')' : '') + '</a>';
    }).join(', ');
    walkModal.body.innerHTML = '<div class="lcm-walk">' + w.sections.map(walkSectionHtml).join('') +
      '<p class="lcm-walk-src">Quelle: ' + srcLinks + ' &ndash; ins Deutsche &uuml;bersetzt.</p></div>';
    walkModal.open();
  }

  /* ---------------------------------------------------------------- Erfolge (Achievements, von Neoseeker, auf Deutsch) */
  var achModal, achData = null;
  function loadAchData() {
    if (achData) return Promise.resolve(achData);
    return fetch('/custom/data-achievements.json').then(function (r) { return r.json(); }).then(function (j) { achData = j; return j; });
  }
  function achDoneKey(i) { return 'lcm-ach-done-' + i; }
  function achDone(i) { return lsGet(achDoneKey(i)) === '1'; }
  function setAchDone(i, on) { lsSet(achDoneKey(i), on ? '1' : '0'); }
  function toggleAchievements() {
    if (!achModal) achModal = makeModal('lcm-ach', 'Erfolge');
    if (achModal.isOpen()) { achModal.close(); return; }
    achModal.body.innerHTML = '<div class="lcm-empty">Lädt …</div>';
    achModal.open();
    loadAchData().then(renderAchievements).catch(function () {
      achModal.body.innerHTML = '<div class="lcm-empty">Daten konnten nicht geladen werden.</div>';
    });
  }
  function renderAchievements(d) {
    if (!achModal) return;
    var idx = 0, total = 0, doneCount = 0;
    var body = '';
    d.categories.forEach(function (cat) {
      body += '<h4>' + esc(cat.name_de) + '</h4><div class="lcm-ach-list">';
      cat.items.forEach(function (it) {
        var i = idx++; total++;
        var on = achDone(i);
        if (on) doneCount++;
        body += '<div class="lcm-ach-card' + (on ? ' done' : '') + '" data-ai="' + i + '">' +
          '<div class="lcm-quest-head"><h5>' + esc(it.name_de) + '<span class="lcm-human-en">' + esc(it.name_en) + '</span></h5>' +
          '<button type="button" class="lcm-quest-toggle lcm-ach-toggle" data-ai="' + i + '">' + (on ? '&#10004; Erledigt' : 'Offen') + '</button></div>' +
          '<p>' + esc(it.desc_de) + '</p></div>';
      });
      body += '</div>';
    });
    var html = '<div class="lcm-ach">' +
      '<p class="lcm-lead">' + esc(d.intro_de) + '</p>' +
      '<p class="lcm-hint">' + doneCount + ' / ' + total + ' als erledigt markiert.</p>' + body + '</div>';
    achModal.body.innerHTML = html;
    $$('.lcm-ach-toggle', achModal.body).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = b.getAttribute('data-ai'), on = !achDone(i);
        setAchDone(i, on);
        var card = b.closest('.lcm-ach-card');
        if (card) card.classList.toggle('done', on);
        b.innerHTML = on ? '&#10004; Erledigt' : 'Offen';
      });
    });
  }

  /* ---------------------------------------------------------------- Filter & Legende + Kartenfilter */
  var legend;
  function hiddenTypes() {
    try { var a = JSON.parse(lsGet('lcm-hidden-types') || '[]'); var o = {}; a.forEach(function (t) { o[t] = 1; }); return o; }
    catch (e) { return {}; }
  }
  function saveHidden(o) { lsSet('lcm-hidden-types', JSON.stringify(Object.keys(o))); }
  function hideDone() { return lsGet('lcm-hide-done') === '1'; }
  function listMode() { var m = lsGet('lcm-filter'); return m === 'open' || m === 'done' ? m : 'all'; }
  // Soll ein Ort (Status st) wegen der Filter ausgeblendet werden?
  function hiddenByState(st, mode, hd) {
    var cleared = st === 'cleared';
    return (hd && cleared) || (mode === 'open' && cleared) || (mode === 'done' && !cleared);
  }

  function iconColor(file) {
    var n = $$('.marker-icon-inner').filter(function (e) { return iconFileOf(e) === file; })[0];
    return n && n.style.backgroundColor ? n.style.backgroundColor : '#00e08a';
  }

  function buildLegend() {
    var map = $('#map');
    if (!map || $('#lcm-legend')) return;
    legend = el('div', { id: 'lcm-legend' });
    legend.innerHTML =
      '<div class="lcm-leg-head"><span>Filter &amp; Legende</span><button type="button" title="Schließen">✕</button></div>' +
      '<div class="lcm-leg-body">' +
      '<label class="lcm-switch"><input type="checkbox" id="leg-hidedone"><span>Erledigte auf der Karte ausblenden</span></label>' +
      '<label class="lcm-switch"><input type="checkbox" id="leg-mini"><span>Mini-Karte anzeigen <kbd style="opacity:.6">M</kbd></span></label>' +
      '<label class="lcm-switch"><input type="checkbox" id="leg-gravesmap"><span>Gr&auml;ber-Karte als Hintergrund</span></label>' +
      '<label class="lcm-slider-row" id="leg-gravesmap-op-row"><span>Deckkraft</span><input type="range" id="leg-gravesmap-op" min="0.1" max="1" step="0.05"></label>' +
      '<label class="lcm-switch"><input type="checkbox" id="leg-wikiinfo"><span>Wiki-Infos im Ortsfenster laden</span></label>' +
      '<label class="lcm-switch"><input type="checkbox" id="leg-questmarkers"><span>Missions-Orte auf der Karte markieren</span></label>' +
      '<div class="lcm-leg-tools"><button type="button" class="lcm-mini-btn" id="leg-all">Alle zeigen</button>' +
      '<button type="button" class="lcm-mini-btn" id="leg-none">Alle ausblenden</button></div>' +
      '<div class="lcm-chips" id="leg-chips"></div></div>';
    map.appendChild(legend);
    $('.lcm-leg-head button', legend).addEventListener('click', toggleLegend);
    $('#leg-hidedone').checked = hideDone();
    $('#leg-hidedone').addEventListener('change', function () { lsSet('lcm-hide-done', this.checked ? '1' : '0'); applyMapFilter(); });
    $('#leg-mini').checked = miniOn();
    $('#leg-mini').addEventListener('change', function () { setMini(this.checked); });
    $('#leg-gravesmap').checked = gravesOn();
    $('#leg-gravesmap').addEventListener('change', function () { setGravesOn(this.checked); });
    $('#leg-gravesmap-op').value = gravesOpacity();
    $('#leg-gravesmap-op').addEventListener('input', function () { setGravesOpacity(parseFloat(this.value)); });
    $('#leg-wikiinfo').checked = wikiInfoOn();
    $('#leg-wikiinfo').addEventListener('change', function () { setWikiInfoOn(this.checked); });
    $('#leg-questmarkers').checked = questMarkerOn();
    $('#leg-questmarkers').addEventListener('change', function () { setQuestMarkerOn(this.checked); });
    $('#leg-all').addEventListener('click', function () { saveHidden({}); renderChips(); applyMapFilter(); });
    $('#leg-none').addEventListener('click', function () {
      var o = {}; Object.keys(computeStats().byType).forEach(function (t) { o[t] = 1; }); saveHidden(o); renderChips(); applyMapFilter();
    });
    if (lsGet('lcm-legend-open') === '1') { legend.classList.add('open'); $('#hud-filter') && $('#hud-filter').classList.add('on'); }
    renderChips();
  }
  function renderChips() {
    var box = $('#leg-chips'); if (!box || !DATA.ready) return;
    var s = computeStats(), hid = hiddenTypes();
    box.innerHTML = '';
    Object.keys(s.byType).sort(function (a, b) { return s.byType[b].total - s.byType[a].total; }).forEach(function (t) {
      var v = s.byType[t], file = DATA.types[t] || '';
      var b = el('button', { type: 'button', class: 'lcm-chip' + (hid[t] ? ' off' : ''), 'data-type': t, title: typeName(t) + ' – ' + v.done + ' von ' + v.total + ' erledigt' });
      b.style.setProperty('--m', "url('/images/" + file + "')");
      b.style.setProperty('--chip', iconColor(file));
      b.innerHTML = '<span class="ico"></span><span class="nm">' + esc(typeName(t)) + '</span><span class="ct">' + v.done + '/' + v.total + '</span>';
      b.addEventListener('click', function () {
        var o = hiddenTypes(); if (o[t]) delete o[t]; else o[t] = 1;
        saveHidden(o); b.classList.toggle('off', !!o[t]); applyMapFilter();
      });
      box.appendChild(b);
    });
  }
  function toggleLegend() {
    if (!legend) return;
    var open = legend.classList.toggle('open');
    lsSet('lcm-legend-open', open ? '1' : '0');
    var b = $('#hud-filter'); if (b) b.classList.toggle('on', open);
    if (open) renderChips();
  }

  /* ---------------------------------------------------------------- Graeber-Karte (Hintergrund-Overlay) */
  // Grobe Ausrichtung der eingescannten Spiel-Karte ("Graeberkarte") auf das Koordinatensystem der App.
  // Die Original-Zeichnung ist ein stilisiertes Diagramm (keine massstabsgetreue Projektion), daher ist
  // dies eine bestmoegliche, verzerrungsfreie Ausrichtung (Drehung + Skalierung + Verschiebung), keine
  // pixelgenaue Deckung. Grenzen als [Norden, Sueden, Westen, Osten] in Leaflet-Koordinaten (CRS.Simple).
  var GRAVES_MAP = { north: 95.7, south: -68.7, west: -24.7, east: 151.7, url: '/custom/graves_map.png' };
  var gravesImg = null;

  function gravesOn() { var v = lsGet('lcm-gravesmap'); return v === null ? true : v === '1'; }
  function gravesOpacity() { var v = parseFloat(lsGet('lcm-gravesmap-op')); return isFinite(v) ? v : 0.6; }

  function positionGravesImg() {
    if (!gravesImg || !window.map) return;
    var tl = window.map.latLngToLayerPoint([GRAVES_MAP.north, GRAVES_MAP.west]);
    var br = window.map.latLngToLayerPoint([GRAVES_MAP.south, GRAVES_MAP.east]);
    gravesImg.style.left = tl.x + 'px';
    gravesImg.style.top = tl.y + 'px';
    gravesImg.style.width = (br.x - tl.x) + 'px';
    gravesImg.style.height = (br.y - tl.y) + 'px';
  }

  function buildGravesMap() {
    if (!window.map || gravesImg) return;
    var pane = window.map.getPane('overlayPane');
    if (!pane) return;
    gravesImg = document.createElement('img');
    gravesImg.src = GRAVES_MAP.url;
    gravesImg.alt = '';
    gravesImg.className = 'lcm-graves-map';
    gravesImg.style.position = 'absolute';
    gravesImg.style.pointerEvents = 'none';
    gravesImg.style.opacity = String(gravesOpacity());
    gravesImg.style.display = gravesOn() ? '' : 'none';
    pane.appendChild(gravesImg);
    positionGravesImg();
    window.map.on('move zoom viewreset resize', positionGravesImg);
  }

  function setGravesOn(on) {
    lsSet('lcm-gravesmap', on ? '1' : '0');
    if (gravesImg) gravesImg.style.display = on ? '' : 'none';
  }

  function setGravesOpacity(v) {
    lsSet('lcm-gravesmap-op', String(v));
    if (gravesImg) gravesImg.style.opacity = String(v);
  }

  function applyMapFilter() {
    if (!DATA.ready) return;
    var hid = hiddenTypes(), hd = hideDone(), mode = listMode();
    $$('.leaflet-marker-pane .leaflet-marker-icon').forEach(function (m) {
      var off = false, inner = $('.marker-icon-inner', m);
      if (inner) {
        var types = DATA.iconTypes[iconFileOf(inner)] || [];
        if (types.length && types.every(function (t) { return hid[t]; })) off = true;
        var ov = $('.visit-overlay', m), st = ov ? (ov.getAttribute('data-state') || 'not-visited') : 'not-visited';
        if (hiddenByState(st, mode, hd)) off = true;
      } else {
        var lt = $('.marker-label-text', m);
        if (lt) {
          var locs = DATA.byName[lt.textContent] || [];
          if (locs.length && locs.every(function (l) { return hid[l.type] || hiddenByState(stateOf(l.id), mode, hd); })) off = true;
        }
      }
      m.classList.toggle('lcm-off', off);
    });
    enhanceMissionMarkers();
    drawMini();
  }

  /* ---------------------------------------------------------------- Missions-Markierung auf der Karte */
  // Die Marker-Icons selbst tragen im DOM keine Orts-ID (nur Popup-Inhalt oder Beschriftungs-Marker
  // haben Name/ID). Um trotzdem gezielt die Icon-Marker von Orten mit Mission zu markieren, wird die
  // erwartete Bildschirmposition jedes Missions-Ortes ueber die Kartenprojektion berechnet und mit der
  // tatsaechlichen Position (aus dem CSS-Transform des Marker-Icons) abgeglichen.
  function questMarkerOn() { var v = lsGet('lcm-questmarkers'); return v === null ? true : v === '1'; }
  function setQuestMarkerOn(on) {
    lsSet('lcm-questmarkers', on ? '1' : '0');
    if (!on) $$('.lcm-mission-badge').forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    else enhanceMissionMarkers();
  }
  function enhanceMissionMarkers() {
    $$('.lcm-mission-badge').forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    if (!questMarkerOn() || !questsByLoc || !window.map || !DATA.ready) return;
    var byPos = {};
    Object.keys(questsByLoc).forEach(function (name) {
      (DATA.byName[name] || []).forEach(function (l) {
        var p = window.map.latLngToLayerPoint([-l.y, l.x]);
        byPos[Math.round(p.x) + ',' + Math.round(p.y)] = true;
      });
    });
    if (!Object.keys(byPos).length) return;
    $$('.leaflet-marker-pane .leaflet-marker-icon').forEach(function (m) {
      var inner = $('.marker-icon-inner', m);
      if (!inner) return;
      var tf = m.style.transform || '';
      var mm = tf.match(/translate3d\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px/);
      if (!mm) return;
      var key = Math.round(parseFloat(mm[1])) + ',' + Math.round(parseFloat(mm[2]));
      if (byPos[key]) m.appendChild(el('div', { class: 'lcm-mission-badge', title: 'Diesem Ort ist eine Mission zugeordnet' }));
    });
  }

  /* ---------------------------------------------------------------- Mini-Karte */
  var mini, miniCanvas, miniGeo = null;
  function miniOn() { return lsGet('lcm-mini') !== '0'; }
  function setMini(on) {
    lsSet('lcm-mini', on ? '1' : '0');
    if (mini) mini.classList.toggle('open', on);
    var cb = $('#leg-mini'); if (cb) cb.checked = on;
    if (on) drawMini();
  }
  function buildMini() {
    var map = $('#map');
    if (!map || $('#lcm-mini') || !window.map) return;
    mini = el('div', { id: 'lcm-mini' }, '<canvas></canvas><span class="lbl">Übersicht</span>');
    map.appendChild(mini);
    miniCanvas = $('canvas', mini);
    if (miniOn()) mini.classList.add('open');
    var dragging = false;
    function pan(ev) {
      if (!miniGeo) return;
      var r = miniCanvas.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width * miniGeo.W, y = (ev.clientY - r.top) / r.height * miniGeo.H;
      var lon = miniGeo.minLon + (x - miniGeo.ox) / miniGeo.s;
      var lat = miniGeo.maxLat - (y - miniGeo.oy) / miniGeo.s;
      window.map.setView([lat, lon], window.map.getZoom(), { animate: false });
    }
    miniCanvas.addEventListener('mousedown', function (e) { dragging = true; pan(e); e.preventDefault(); e.stopPropagation(); });
    window.addEventListener('mousemove', function (e) { if (dragging) pan(e); });
    window.addEventListener('mouseup', function () { dragging = false; });
    ['click', 'dblclick', 'wheel'].forEach(function (n) { mini.addEventListener(n, function (e) { e.stopPropagation(); }); });
    var raf = 0;
    window.map.on('move zoom resize', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; drawMini(); }); });
    drawMini();
  }
  function drawMini() {
    if (!miniCanvas || !DATA.ready || !mini.classList.contains('open')) return;
    var dpr = window.devicePixelRatio || 1;
    var W = Math.round(miniCanvas.clientWidth * dpr), H = Math.round(miniCanvas.clientHeight * dpr);
    if (!W || !H) return;
    if (miniCanvas.width !== W || miniCanvas.height !== H) { miniCanvas.width = W; miniCanvas.height = H; }
    var ctx = miniCanvas.getContext('2d');
    var minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    DATA.locations.forEach(function (l) {
      var lon = l.x, lat = -l.y;
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    });
    var pad = 14 * dpr, dLon = Math.max(1, maxLon - minLon), dLat = Math.max(1, maxLat - minLat);
    var s = Math.min((W - 2 * pad) / dLon, (H - 2 * pad) / dLat);
    var ox = (W - dLon * s) / 2, oy = (H - dLat * s) / 2;
    miniGeo = { W: W, H: H, s: s, ox: ox, oy: oy, minLon: minLon, maxLat: maxLat };
    function px(lon) { return ox + (lon - minLon) * s; }
    function py(lat) { return oy + (maxLat - lat) * s; }

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,224,138,0.10)'; ctx.lineWidth = 1;
    for (var gx = ox; gx < W; gx += 32 * dpr) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = oy; gy < H; gy += 32 * dpr) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    var hid = hiddenTypes(), hd = hideDone(), mode = listMode();
    DATA.locations.forEach(function (l) {
      var st = stateOf(l.id);
      if (hid[l.type] || hiddenByState(st, mode, hd)) return;
      ctx.fillStyle = st === 'cleared' ? '#ffd400' : st === 'visited' ? '#e8f1ee' : '#00a862';
      var r = (st === 'cleared' ? 2.6 : 2) * dpr;
      ctx.beginPath(); ctx.arc(px(l.x), py(-l.y), r, 0, 6.2832); ctx.fill();
    });

    if (window.map && window.map.getBounds) {
      var b = window.map.getBounds();
      var x1 = px(b.getWest()), x2 = px(b.getEast()), y1 = py(b.getNorth()), y2 = py(b.getSouth());
      ctx.strokeStyle = '#00e08a'; ctx.lineWidth = 1.5 * dpr; ctx.fillStyle = 'rgba(0,224,138,0.08)';
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1); ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    }
  }

  /* ---------------------------------------------------------------- Status per Tastatur, Rueckgaengig */
  function popupId() {
    var n = $('.leaflet-popup .locid');
    if (!n) return null;
    var m = n.textContent.match(/id:\s*([^)\s]+)/);
    return m ? m[1] : null;
  }
  function setPopupState(target) {
    var b = $('.leaflet-popup .lcm-status-btn[data-target="' + target + '"]');
    if (b) { b.click(); return true; }
    return false;
  }

  var undoStack = [], pending = [], pendTimer = null;
  function flushPending() {
    var p = pending; pending = []; pendTimer = null;
    // mehrere Klicks auf denselben Ort (offen -> besucht -> erledigt) zu einer Aenderung zusammenfassen
    var merged = {};
    p.forEach(function (x) { if (merged[x.id]) merged[x.id].to = x.to; else merged[x.id] = { id: x.id, from: x.from, to: x.to }; });
    var ids = Object.keys(merged).filter(function (i) { return merged[i].from !== merged[i].to; });
    if (ids.length !== 1) return; // Sammelaktionen (Reset, Import) ohne Hinweis
    var c = merged[ids[0]], l = DATA.byId[c.id];
    undoStack.push(c); if (undoStack.length > 30) undoStack.shift();
    toast('<b>' + esc(l ? l.name : c.id) + '</b> → ' + STATE_DE[c.to], {
      done: c.to === 'cleared', action: { label: 'Rückgängig', fn: undo }
    });
  }
  function undo() {
    var c = undoStack.pop();
    if (!c) { toast('Nichts zum Rückgängigmachen.'); return; }
    if (popupId() === c.id && setPopupState(c.from)) return;
    var row = document.getElementById('location-' + c.id);
    if (row) { row.click(); setTimeout(function () { if (!setPopupState(c.from)) fallback(); }, 60); return; }
    fallback();
    function fallback() {
      if (c.from === 'not-visited') try { localStorage.removeItem('location-visit-' + c.id); } catch (e) {}
      else lsSet('location-visit-' + c.id, c.from);
      (window.__lcmFlush ? window.__lcmFlush() : Promise.resolve()).then(function () { location.reload(); });
    }
  }

  var refreshSoon = debounce(refreshAll, 90);
  var notesSoon = debounce(markNotes, 60);

  window.__lcmOnStorage = function (kind, k, v, old) {
    if (kind === 'clear') { refreshSoon(); return; }
    if (!k) return;
    if (k.indexOf('location-visit-') === 0) {
      var id = k.slice('location-visit-'.length);
      var nv = kind === 'set' ? v : 'not-visited', ov = old || 'not-visited';
      if (nv === ov) return;
      if (nv === 'cleared') { if (!lsGet('lcm-done-at-' + id)) lsSet('lcm-done-at-' + id, String(Date.now())); }
      else { try { localStorage.removeItem('lcm-done-at-' + id); } catch (e) {} }
      pending.push({ id: id, from: ov, to: nv });
      clearTimeout(pendTimer); pendTimer = setTimeout(flushPending, 200);
      refreshSoon();
    } else if (k.indexOf('location-notes-') === 0) {
      notesSoon(); refreshSoon();
    }
  };

  /* ---------------------------------------------------------------- Notiz-Symbole in der Liste */
  function markNotes() {
    $$('#location-list .location-item').forEach(function (row) {
      var id = row.id.replace(/^location-/, '');
      row.classList.toggle('lcm-has-note', !!noteOf(id));
    });
  }

  /* ---------------------------------------------------------------- Popup-Zusatz (Kopieren) */
  function copyText(text, msg) {
    function done() { toast(msg || 'Kopiert.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var t = el('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Kopieren nicht möglich.'); }
      document.body.removeChild(t);
    }
  }
  function enhancePopupActions() {
    $$('.leaflet-popup .popup-content').forEach(function (pc) {
      if ($('.lcm-popup-actions', pc)) return;
      var locid = $('.locid', pc);
      if (!locid) return;
      var m = locid.textContent.match(/id:\s*([^)\s]+)/);
      var l = m ? DATA.byId[m[1]] : null;
      var bar = el('div', { class: 'lcm-popup-actions' },
        '<button type="button" class="lcm-mini-btn" data-a="name">Name kopieren</button>' +
        '<button type="button" class="lcm-mini-btn" data-a="pos">Koordinaten kopieren</button>');
      var anchor = locid.closest('p') || locid;
      anchor.parentNode.insertBefore(bar, anchor);
      bar.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var name = l ? l.name : ($('h3', pc) ? $('h3', pc).textContent : '');
        var pos = l ? (l.x + ' : ' + l.y) : '';
        if (!pos) { var pm = pc.textContent.match(/(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)/); pos = pm ? pm[0] : ''; }
        if (b.getAttribute('data-a') === 'name') copyText(name, 'Name kopiert: ' + name);
        else copyText(name + ' (' + pos + ')', 'Koordinaten kopiert: ' + pos);
      });
    });
  }

  /* ---------------------------------------------------------------- Wiki-Infos im Popup */
  // Die deutschen Wiki-Infos (Text + Bild, aus dem offiziellen Wiki uebersetzt) liegen fest in
  // /custom/data-locations-wiki.json und werden einmal geladen - kein Warten beim Anklicken
  // eines Ortes, kein Internet noetig. Wurde ueber "Nach Wiki-Updates suchen" (Einstellungen)
  // eine neue/geaenderte Fassung uebernommen, liefert der Server sie (unuebersetzt, Englisch)
  // zusaetzlich unter /api/wiki-overrides; sie ersetzt dann die deutsche Fassung fuer den
  // betroffenen Ort und ist entsprechend gekennzeichnet.
  var wikiLocData = null, wikiOverridesData = null;
  function loadWikiLocData() {
    if (wikiLocData) return Promise.resolve(wikiLocData);
    return Promise.all([
      fetch('/custom/data-locations-wiki.json').then(function (r) { return r.json(); }).catch(function () { return {}; }),
      fetch('/api/wiki-overrides').then(function (r) { return r.json(); }).catch(function () { return {}; })
    ]).then(function (r) {
      wikiLocData = r[0] || {};
      wikiOverridesData = r[1] || {};
      return wikiLocData;
    });
  }
  function wikiUl(items) { return '<ul class="lcm-wiki-list">' + items.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'; }
  function wikiInfoFor(name) {
    var ov = wikiOverridesData && wikiOverridesData[name];
    if (ov && ov.ok) return { ok: true, url: ov.url, image: ov.image, html: ov.html, lang: 'en' };
    var d = wikiLocData && wikiLocData[name];
    if (!d) return null;
    var html = d.intro_de ? '<p>' + esc(d.intro_de) + '</p>' : '';
    (d.sections || []).forEach(function (s) {
      html += '<h4>' + esc(s.header_de) + '</h4>';
      if (s.type === 'list') html += wikiUl(s.items || []);
      else html += '<p>' + esc(s.text || '').replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
    });
    return { ok: true, url: d.url, image: d.image, html: html, lang: 'de' };
  }
  function wikiInfoOn() { var v = lsGet('lcm-wikiinfo'); return v === null ? true : v === '1'; }
  function setWikiInfoOn(on) {
    lsSet('lcm-wikiinfo', on ? '1' : '0');
    if (!on) $$('.lcm-wiki').forEach(function (n) { n.parentNode.removeChild(n); });
    else enhanceWikiInfo();
  }
  function refitPopupSoon() {
    // Nach Groessenaenderung des Popups (Bild/Text nachgeladen) die automatische
    // Kartenverschiebung aus init()/refit() erneut anstossen.
    var pop = $('.leaflet-popup');
    if (pop) pop.removeAttribute('data-lcm-fit');
  }
  function renderWikiInfo(box, info) {
    if (!box.isConnected) return;
    refitPopupSoon();
    if (!info || !info.ok) {
      box.parentNode.removeChild(box);
      return;
    }
    var html = '';
    if (info.lang === 'en') html += '<div class="lcm-wiki-lang">Wiki-Update &ndash; noch nicht ins Deutsche &uuml;bersetzt</div>';
    if (info.image) html += '<img class="lcm-wiki-img" src="' + esc(info.image) + '" alt="" loading="lazy">';
    html += '<div class="lcm-wiki-body">' + (info.html || '<p>Keine weiteren Infos auf dem Wiki.</p>') + '</div>';
    html += '<a class="lcm-wiki-link" href="' + esc(info.url) + '" target="_blank" rel="noopener">Ganzer Wiki-Artikel &rarr;</a>';
    box.innerHTML = html;
  }
  function enhanceWikiInfo() {
    if (!wikiInfoOn() || !wikiLocData) return;
    $$('.leaflet-popup .popup-content').forEach(function (pc) {
      if ($('.lcm-wiki', pc)) return;
      var locid = $('.locid', pc);
      if (!locid) return;
      var m = locid.textContent.match(/id:\s*([^)\s]+)/);
      var l = m ? DATA.byId[m[1]] : null;
      if (!l || !l.name) return;
      var info = wikiInfoFor(l.name);
      if (!info) return;
      var box = el('div', { class: 'lcm-wiki' });
      var anchor = locid.closest('p') || locid;
      anchor.parentNode.insertBefore(box, anchor);
      renderWikiInfo(box, info);
    });
  }

  /* ---------------------------------------------------------------- Export */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
  }
  function stamp() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function csvCell(v) { v = v == null ? '' : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportCsv() {
    if (!DATA.ready) { toast('Daten noch nicht geladen.'); return; }
    var head = ['ID', 'Name', 'Bereich', 'Typ', 'Status', 'Erledigt am', 'X', 'Y', 'Notiz'];
    var rows = DATA.locations.map(function (l) {
      var t = doneAtOf(l.id);
      return [l.id, l.name, catName(l.cat), typeName(l.type), STATE_DE[stateOf(l.id)], t ? new Date(t).toLocaleString('de-DE') : '', l.x, l.y, noteOf(l.id)];
    });
    var csv = '﻿' + [head].concat(rows).map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
    download('LastCaretaker_Fortschritt_' + stamp() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('CSV exportiert (' + rows.length + ' Orte).');
  }
  function exportText() {
    if (!DATA.ready) { toast('Daten noch nicht geladen.'); return; }
    var s = computeStats(), out = [];
    out.push('THE LAST CARETAKER MAP – Fortschritt vom ' + new Date().toLocaleDateString('de-DE'));
    out.push('Erledigt: ' + s.cleared + ' von ' + s.total + ' (' + s.pct + ' %) · Besucht: ' + s.visited + ' · Offen: ' + s.open);
    out.push('');
    Object.keys(CAT_DE).concat(Object.keys(s.byCat).filter(function (c) { return !CAT_DE[c]; })).forEach(function (c) {
      if (!s.byCat[c]) return;
      out.push('== ' + catName(c) + ' (' + s.byCat[c].done + '/' + s.byCat[c].total + ') ==');
      DATA.locations.filter(function (l) { return l.cat === c; }).forEach(function (l) {
        var st = stateOf(l.id), n = noteOf(l.id);
        out.push((st === 'cleared' ? '[x] ' : st === 'visited' ? '[~] ' : '[ ] ') + l.name + '  (' + l.x + ' : ' + l.y + ')' + (n ? '  – ' + n.replace(/\s+/g, ' ') : ''));
      });
      out.push('');
    });
    out.push('[x] erledigt   [~] besucht   [ ] offen');
    download('LastCaretaker_Fortschritt_' + stamp() + '.txt', '﻿' + out.join('\r\n'), 'text/plain;charset=utf-8');
    toast('Text exportiert.');
  }

  function buildSettingsExport() {
    var body = $('#settings-popup .settings-body');
    if (!body || $('#lcm-export')) return;
    var p = el('div', { class: 'setting-item', id: 'lcm-export' });
    p.innerHTML = '<h4 class="color-section-title">Export &amp; Kurzbefehle</h4>' +
      '<div style="display:flex; gap:8px;">' +
      '<button type="button" class="setting-button lcm-export-btn" id="lcm-x-csv" style="flex:1">Fortschritt als CSV</button>' +
      '<button type="button" class="setting-button lcm-export-btn" id="lcm-x-txt" style="flex:1">Als Textliste</button></div>' +
      '<p class="setting-description">CSV lässt sich direkt in Excel öffnen. Die Textliste eignet sich zum Teilen oder Ausdrucken.</p>' +
      '<button type="button" class="setting-button lcm-export-btn" id="lcm-x-keys" style="margin-top:8px">Tastenkürzel anzeigen</button>';
    var anchor = $('#lcm-reset') || $('#lcm-update');
    if (anchor && anchor.nextSibling) body.insertBefore(p, anchor.nextSibling); else body.insertBefore(p, body.firstChild);
    $('#lcm-x-csv').addEventListener('click', exportCsv);
    $('#lcm-x-txt').addEventListener('click', exportText);
    $('#lcm-x-keys').addEventListener('click', function () { var c = $('#close-settings'); if (c) c.click(); showHelp(); });
  }

  /* ---------------------------------------------------------------- Tastenkuerzel */
  var help;
  function showHelp() {
    if (!help) help = makeModal('lcm-help', 'Tastenkürzel');
    help.body.style.display = 'block';
    help.body.innerHTML = '<div class="lcm-keys">' +
      '<kbd>/</kbd><span>Suche anspringen</span>' +
      '<kbd>E</kbd><span>Geöffneten Ort als erledigt markieren (nochmal: wieder offen)</span>' +
      '<kbd>V</kbd><span>Geöffneten Ort als besucht markieren</span>' +
      '<kbd>O</kbd><span>Geöffneten Ort auf offen setzen</span>' +
      '<kbd>Strg + Z</kbd><span>Letzte Statusänderung rückgängig machen</span>' +
      '<kbd>D</kbd><span>Dashboard ein-/ausblenden</span>' +
      '<kbd>F</kbd><span>Filter &amp; Legende ein-/ausblenden</span>' +
      '<kbd>M</kbd><span>Mini-Karte ein-/ausblenden</span>' +
      '<kbd>R</kbd><span>Wachstumsrechner (Menschen) ein-/ausblenden</span>' +
      '<kbd>S</kbd><span>Spielstand einlesen ein-/ausblenden</span>' +
      '<kbd>C</kbd><span>Rat der Menschheit (Ausschüsse) ein-/ausblenden</span>' +
      '<kbd>Esc</kbd><span>Fenster / Popup schließen</span>' +
      '<kbd>?</kbd><span>Diese Übersicht</span></div>';
    help.open();
  }

  function typing(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (dash && dash.isOpen()) dash.close();
      if (help && help.isOpen()) help.close();
      if (humansModal && humansModal.isOpen()) humansModal.close();
      if (calcModal && calcModal.isOpen()) calcModal.close();
      if (councilModal && councilModal.isOpen()) councilModal.close();
      if (questsModal && questsModal.isOpen()) questsModal.close();
      if (svModal && svModal.isOpen()) svModal.close();
      if (walkModal && walkModal.isOpen()) walkModal.close();
      if (achModal && achModal.isOpen()) achModal.close();
      if (typing(e.target) && e.target.id === 'location-search') e.target.blur();
      return;
    }
    if (typing(e.target)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === '/') { e.preventDefault(); var s = $('#location-search'); if (s) { s.focus(); s.select(); } }
    else if (k === '?') { e.preventDefault(); showHelp(); }
    else if (k === 'd' || k === 'D') toggleDash();
    else if (k === 'f' || k === 'F') toggleLegend();
    else if (k === 'm' || k === 'M') setMini(!miniOn());
    else if (k === 'r' || k === 'R') toggleCalc();
    else if (k === 's' || k === 'S') toggleSavegame();
    else if (k === 'c' || k === 'C') toggleCouncil();
    else if (k === 'e' || k === 'E') {
      var id = popupId();
      if (!id) { toast('Erst einen Ort öffnen (Marker oder Listeneintrag anklicken).'); return; }
      setPopupState(stateOf(id) === 'cleared' ? 'not-visited' : 'cleared');
    }
    else if (k === 'v' || k === 'V') { if (popupId()) setPopupState('visited'); }
    else if (k === 'o' || k === 'O') { if (popupId()) setPopupState('not-visited'); }
  });

  // Auswahl "Alle / Nur offene / Nur erledigte" in der Seitenleiste: wirkt auch auf die Karte + Rueckmeldung
  window.addEventListener('lcm-filter', function (ev) {
    applyMapFilter();
    if (!DATA.ready) return;
    var s = computeStats(), m = ev.detail;
    var txt = m === 'open' ? 'Nur offene Orte: ' + (s.total - s.cleared) + ' von ' + s.total
      : m === 'done' ? 'Nur erledigte Orte: ' + s.cleared + ' von ' + s.total : 'Alle Orte: ' + s.total;
    toast(txt + ' (Liste und Karte)', { ms: 3000 });
  });

  /* ---------------------------------------------------------------- Gesamt-Aktualisierung + Start */
  function refreshAll() {
    if (!DATA.ready) return;
    var s = computeStats();
    updateHud(s);
    if (dash && dash.isOpen()) renderDash();
    if (legend && legend.classList.contains('open')) renderChips();
    applyMapFilter();
    markNotes();
  }

  function init() {
    buildHud();
    buildLegend();
    buildMini();
    buildGravesMap();
    buildSettingsExport();
    refreshAll();
    loadQuestsData().then(function () { enhanceLocationQuest(); enhanceMissionMarkers(); }).catch(function () {});
    loadWikiLocData().then(enhanceWikiInfo).catch(function () {});
    if (window.map) window.map.on('move zoom viewreset resize', debounce(enhanceMissionMarkers, 50));

    var list = $('#location-list');
    if (list) new MutationObserver(function () { notesSoon(); refreshSoon(); }).observe(list, { childList: true });

    var pane = $('.leaflet-marker-pane');
    if (pane) new MutationObserver(debounce(applyMapFilter, 40)).observe(pane, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });

    var popupPane = $('.leaflet-popup-pane');
    var refit = debounce(function () {
      // Popup wurde durch die Zusatz-Bedienelemente hoeher: Karte so verschieben, dass nichts abgeschnitten wird.
      // (Bewusst kein popup.update(): das wuerde den Inhalt neu erzeugen und die Bedienelemente zerstoeren.)
      try {
        var pop = $('.leaflet-popup');
        if (!pop || pop.getAttribute('data-lcm-fit') || !window.map || !window.map._popup) return;
        var cw = $('.leaflet-popup-content-wrapper', pop).getBoundingClientRect();
        pop.setAttribute('data-lcm-fit', '1');
        window.map.panInside(window.map._popup.getLatLng(), {
          paddingTopLeft: [cw.width / 2 + 14, cw.height + 76], paddingBottomRight: [cw.width / 2 + 14, 14]
        });
      } catch (e) {}
    }, 60);
    if (popupPane) new MutationObserver(function () { enhancePopupActions(); enhanceLocationQuest(); enhanceWikiInfo(); refit(); }).observe(popupPane, { childList: true, subtree: true });

    // Einstellungen koennen spaeter erzeugt werden -> Export-Bereich nachziehen
    var tries = 0, iv = setInterval(function () {
      buildSettingsExport();
      if ($('#lcm-export') || ++tries > 20) clearInterval(iv);
    }, 300);
  }

  loadData().then(function () {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  });
})();
