/* Last Caretaker Map - deutsche Oberflaeche
 * Uebersetzt die Texte der Original-Karte zur Laufzeit (funktioniert deshalb auch nach Updates).
 * Namen und Beschreibungen der Orte sind Spieldaten und bleiben bewusst unveraendert. */
(function () {
  'use strict';

  var T = {
    // Kopfzeile
    'Cloth Map Size:': 'Stoffkarten-Größe:',
    'Rotation:': 'Drehung:',
    'Cloth Map Vertical offset:': 'Stoffkarte vertikal verschieben:',
    'Cloth Map Horizontal offset:': 'Stoffkarte horizontal verschieben:',
    // Seitenleiste
    'Locations': 'Orte',
    'Hidden Locations': 'Versteckte Orte',
    'Last Listener Locations': 'Last-Listener-Orte',
    'Caves': 'Höhlen',
    'No locations found': 'Keine Orte gefunden',
    'Search all location text': 'Gesamten Ortstext durchsuchen',
    // Einstellungen
    'Settings': 'Einstellungen',
    'Clear Local Data': 'Lokale Daten löschen',
    'Reset all preferences (Export your data first)': 'Alle Einstellungen zurücksetzen (vorher Daten exportieren)',
    'Export Data': 'Daten exportieren',
    'Import Data': 'Daten importieren',
    'Backup or restore all your preferences and notes': 'Alle Einstellungen und Notizen sichern oder wiederherstellen',
    'Show Hidden Locations': 'Versteckte Orte anzeigen',
    'Show Last Listener Locations': 'Last-Listener-Orte anzeigen',
    'Show Caves': 'Höhlen anzeigen',
    'Display primary numbers on markers': 'Primärnummern auf den Markern anzeigen',
    'Show visit status badges on map icons': 'Status-Abzeichen auf den Kartensymbolen anzeigen',
    'Displays ✔ badge on markers when visited or cleared': 'Zeigt ein ✔ auf dem Marker, wenn besucht oder erledigt',
    'Show Cloth Map Overlay': 'Stoffkarte einblenden',
    'Use Solid Color Background': 'Einfarbigen Hintergrund verwenden',
    'Replace the background map image with a solid color': 'Ersetzt das Hintergrundbild der Karte durch eine Farbe',
    'Background Color:': 'Hintergrundfarbe:',
    'Marker Colors': 'Markerfarben',
    'Customize label colors per marker type': 'Beschriftungsfarben pro Markertyp anpassen',
    'Reset to Defaults': 'Standard wiederherstellen',
    'All White': 'Alle weiß',
    '📖 Help & Documentation': '📖 Hilfe & Dokumentation (Original, englisch)',
    // Popup
    'Primary #:': 'Primärnr.:',
    'Secondary #:': 'Sekundärnr.:',
    'Coordinates:': 'Koordinaten:',
    'Notes:': 'Notizen:',
    // Attribute (placeholder / title)
    'Search locations...': 'Orte suchen ...',
    'Clear search': 'Suche leeren',
    'Toggle visibility': 'Sichtbarkeit umschalten',
    'Hide all in category': 'Alle dieser Kategorie ausblenden',
    'Show all in category': 'Alle dieser Kategorie einblenden',
    'Add your notes here...': 'Notizen hier eintragen ...'
  };

  // Markertypen (nur im Farb-Bereich der Einstellungen)
  var TYPES = {
    'Hangars': 'Hangars', 'Nav Beacons': 'Navigationsbaken', 'Rocket': 'Rakete', 'Fuel': 'Treibstoff',
    'Solar': 'Solar', 'Habitat': 'Habitat', 'Rockyspire': 'Rockyspire', 'Maze': 'Labyrinth', 'Ruin': 'Ruine',
    'NDNS': 'NDNS', 'Cave': 'Höhle', 'Seed Vault': 'Seed Vault', 'Lazarus': 'Lazarus', 'Oil Rig': 'Ölbohrinsel',
    'Shark Bay': 'Shark Bay', 'Star Child': 'Star Child', 'Roller Factory': 'Roller-Fabrik',
    'Gyro Platform': 'Gyro-Plattform', 'Silo': 'Silo'
  };

  var RX = [[/^v([\d.]+) by$/, 'v$1 von']];

  var DIALOGS = {
    'Are you sure you want to clear all local data? This will reset all visibility preferences.':
      'Wirklich alle lokalen Daten löschen? Dadurch werden alle Einstellungen zurückgesetzt.',
    'Import data? This will overwrite your current preferences.':
      'Daten importieren? Deine aktuellen Einstellungen werden überschrieben.',
    'Error exporting data. Check console for details.':
      'Fehler beim Exportieren der Daten. Details stehen in der Konsole.',
    'Error importing data. Please check the file format.':
      'Fehler beim Importieren. Bitte das Dateiformat prüfen.'
  };

  function lookup(text, inColors) {
    var m = text.match(/^(\s*)([\s\S]*?)(\s*)$/);
    var core = m[2];
    if (!core) return null;
    var out = null;
    if (inColors && TYPES.hasOwnProperty(core)) out = TYPES[core];
    else if (T.hasOwnProperty(core)) out = T[core];
    else for (var i = 0; i < RX.length; i++) if (RX[i][0].test(core)) { out = core.replace(RX[i][0], RX[i][1]); break; }
    return out == null ? null : m[1] + out + m[3];
  }

  function skipNode(el) {
    if (!el) return true;
    if (el.closest('script, style, textarea, .location-header, .marker-label, .number-marker')) return true;
    // Inhalt des Ortes (Name/Beschreibung) nicht anfassen - nur Beschriftungen
    if (el.closest('.popup-content') && !el.closest('strong, label, button')) return true;
    return false;
  }

  function translateNode(node) {
    var el = node.parentElement;
    if (skipNode(el)) return;
    var t = lookup(node.nodeValue, !!el.closest('#marker-color-settings'));
    if (t != null && t !== node.nodeValue) node.nodeValue = t;
  }

  function translateAttrs(root) {
    var list = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[aria-label]') : [];
    for (var i = 0; i < list.length; i++) {
      ['placeholder', 'title', 'aria-label'].forEach(function (a) {
        var v = list[i].getAttribute(a);
        if (v == null) return;
        var t = lookup(v, false);
        if (t != null && t !== v) list[i].setAttribute(a, t);
      });
    }
    if (root.getAttribute) {
      ['placeholder', 'title', 'aria-label'].forEach(function (a) {
        var v = root.getAttribute(a); if (v == null) return;
        var t = lookup(v, false); if (t != null && t !== v) root.setAttribute(a, t);
      });
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === 3) { translateNode(root); return; }
    if (root.nodeType !== 1) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n; while ((n = w.nextNode())) translateNode(n);
    translateAttrs(root);
  }

  // confirm()/alert() der Original-Karte
  ['confirm', 'alert'].forEach(function (fn) {
    var orig = window[fn];
    window[fn] = function (msg) {
      var m = DIALOGS.hasOwnProperty(msg) ? DIALOGS[msg] : msg;
      return orig.call(window, m);
    };
  });

  function start() {
    document.documentElement.lang = 'de';
    translateTree(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') translateNode(m.target);
        else if (m.type === 'attributes') translateAttrs(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) translateTree(m.addedNodes[j]);
      }
    }).observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['placeholder', 'title']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
