# Last Caretaker Map – Companion App (Deutsch/English/Français)

*English: a companion app for [The Last Caretaker](https://thelastcaretaker.com/) that wraps and extends The1Killer's original [Last Caretaker Map](https://github.com/the1killer/lastcaretakermap). The interface is available in German, English and French (see [Sprachen](#sprachen--languages--langues) below for what's already translated and what's still coming). See [Lizenz](#lizenz--credits) below for the license split.*

Eine inoffizielle, rein von Fans gebaute Begleit-App für das Spiel **[The Last Caretaker](https://thelastcaretaker.com/)** von [Channel 37](https://www.channel37.co/). Nicht mit Channel 37 oder The1Killer verbunden/affiliiert.

Diese App baut auf der wunderbaren interaktiven Karte **[Last Caretaker Map](https://the1killer.github.io/LastCaretakerMap/)** von **[The1Killer](https://github.com/the1killer)** auf (unverändert enthalten in `app/site/`, siehe Lizenz unten) und packt drumherum eine kleine, lokal laufende Windows-App mit mehrsprachiger Oberfläche und einigen Zusatzfunktionen, die über die reine Karte hinausgehen.

## Funktionsumfang

- 🌐 Mehrsprachige Oberfläche (Deutsch/English/Français), umschaltbar über den Sprachwähler oben rechts – siehe [Sprachen](#sprachen--languages--langues) für Details.
- 🗺️ Die Original-Karte (The1Killer), eingebettet mit Status-Tracking (Offen/Besucht/Erledigt), Suche, Notizen und Reset/Bereinigungs-Funktion.
- 📥 Automatische Update-Funktion, die neue/geänderte Kartendaten vom Original-Projekt nachlädt – `app/site` wird dabei ersetzt, nie von Hand verändert.
- 📖 Deutsche Wiki-Texte & Bilder zu jedem Ort, fest im Programm hinterlegt (kein Internet nötig).
- 🧭 Missionen-Fenster mit allen 44 Story-Missionen auf Deutsch inkl. Walkthrough-Texten und Erledigt-Status.
- 🏆 Erfolge-Übersicht.
- 👥 "Rat der Menschheit" mit allen Ausschüssen und ihren Berufen.
- 🧮 Wachstumsrechner für die Menschenzucht (alle Berufe, Eigenschaften, Bestandsverwaltung).
- 💾 Eigene Spielstand-Rubrik: liest die echte `.sav`-Datei (selbst reverse-engineertes Format) und zeigt Erinnerungen, Nahrung, Missionsstatus und bereits gezüchtete Menschen direkt als Übersicht – inklusive Abgleich mit dem Rechner und Korrektur-Funktion bei Verklickern.
- 📊 Fortschritts-Dashboard mit Export als CSV/Text.
- 🔄 Eigene Update-Funktion für diese Companion-App selbst (Übersetzungen, Skripte, Daten in `app/custom`) – unabhängig von den Original-Kartendaten, siehe [Sprachen](#sprachen--languages--langues).
- 🔒 Läuft komplett lokal (eigener kleiner Node-Server, nur `127.0.0.1`), alle Daten bleiben auf dem eigenen Rechner.

Vollständiges, laufend gepflegtes Änderungsprotokoll: im Zahnrad-Menü der App selbst.

## Sprachen / Languages / Langues

Die komplette Programmoberfläche (Original-Karte + alle eigenen Fenster: Dashboard, Rat der Menschheit, Rechner, Spielstand, Missionen, Erfolge, Einstellungen, Tastenkürzel usw.) lässt sich oben rechts zwischen **Deutsch**, **English** und **Français** umschalten.

Noch nicht übersetzt und bewusst vorerst auf Deutsch belassen sind die großen, fest hinterlegten Inhaltstexte: die Wiki-Infos zu jedem Ort, die Walkthrough-Texte der Missionen, die Beschreibungstexte des Rats der Menschheit und die Zuchtinfos im Menschen-Fenster. Diese Übersetzungen sind für ein **kommendes Update** geplant.

Damit das nicht erneut ein manuelles Herunterladen der ganzen App erfordert, gibt es dafür eine eigene **"Sprach- & App-Updates"**-Rubrik in den Einstellungen: sie prüft unabhängig von den Original-Kartendaten, ob für diese Companion-App (Übersetzungen, Skripte, Daten) eine neuere Version in diesem Repository vorliegt, und installiert sie direkt, ohne dass die App neu heruntergeladen werden muss.

*English: the whole app UI can be switched between German, English and French (top-right language switcher). The large, pre-written content texts (wiki info per location, mission walkthroughs, Council of Humanity descriptions, human-breeding reference info) are intentionally still German-only for now – translating those is planned for an upcoming update, which the app's "Language & App Updates" setting can pull in later without re-downloading the whole app.*

## Installation & Start

Voraussetzung: [Node.js](https://nodejs.org/) (v18 oder neuer).

1. Dieses Repository herunterladen/klonen.
2. `start.bat` doppelklicken – installiert beim ersten Start automatisch die benötigten Abhängigkeiten und startet den lokalen Server.
3. Die App öffnet sich im Standardbrowser unter `http://localhost:37373`.

Optional: `desktop-verknuepfung.bat` legt eine Desktop-Verknüpfung mit eigenem Karten-Icon an.

Ausführliche deutsche Nutzer-Dokumentation: [`LIESMICH.txt`](LIESMICH.txt).

## Aufbau des Repositories

```
├── app/              ← die eigentliche Companion-App (dieses Projekt)
│   ├── custom/        ← deutsche Übersetzungen, eigene Funktionen, Zusatz-Daten
│   ├── server.mjs      ← lokaler Node-Server (liefert die App aus, Speicherung, Spielstand-Auslesen)
│   ├── site/           ← unveränderte, automatisch aktualisierte Kopie der Original-Karte
│   └── LICENSE          ← Lizenz für alles in app/ außer app/site/
├── public/, src/, index.html, …  ← Original-Quellcode der Last Caretaker Map (The1Killer)
└── LICENSE            ← Original-Lizenz (BSD-2-Clause, The1Killer), gilt für Repo-Root & app/site/
```

Die Original-Projektdateien im Repo-Root (und ihre gebaute Kopie in `app/site/`) stammen unverändert von The1Killer und werden nur über die eingebaute Update-Funktion aktualisiert, nie von Hand bearbeitet.

## Lizenz & Credits

Dieses Repository enthält zwei unterschiedlich lizenzierte Teile:

- **Repo-Root** (`public/`, `src/`, `index.html`, `package.json`, … sowie die daraus gebaute Kopie in `app/site/`): das Original-Projekt **Last Caretaker Map** von **[The1Killer](https://github.com/the1killer)**, unverändert übernommen, Lizenz: **BSD 2-Clause**, siehe [`LICENSE`](LICENSE). Alle Rechte am Original liegen bei The1Killer.
- **`app/`** (außer `app/site/`): die eigene Companion-App – Server, deutsche Übersetzungen, Spielstand-Auslesen, Rechner, Wiki-Texte usw. © 2026 **ODINnuss**, Lizenz: **MIT**, siehe [`app/LICENSE`](app/LICENSE).

*The Last Caretaker* ist ein Spiel von [Channel 37](https://www.channel37.co/). Diese App ist ein inoffizielles Fan-Projekt ohne jede Verbindung zu Channel 37.
