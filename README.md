# Last Caretaker Map – Companion App (Deutsch)

*English: a German-language companion app for [The Last Caretaker](https://thelastcaretaker.com/) that wraps and extends The1Killer's original [Last Caretaker Map](https://github.com/the1killer/lastcaretakermap). See [Lizenz](#lizenz--credits) below for the license split.*

Eine inoffizielle, rein von Fans gebaute Begleit-App für das Spiel **[The Last Caretaker](https://thelastcaretaker.com/)** von [Channel 37](https://www.channel37.co/). Nicht mit Channel 37 oder The1Killer verbunden/affiliiert.

Diese App baut auf der wunderbaren interaktiven Karte **[Last Caretaker Map](https://the1killer.github.io/LastCaretakerMap/)** von **[The1Killer](https://github.com/the1killer)** auf (unverändert enthalten in `app/site/`, siehe Lizenz unten) und packt drumherum eine kleine, lokal laufende Windows-App mit vollständig deutscher Oberfläche und einigen Zusatzfunktionen, die über die reine Karte hinausgehen.

## Funktionsumfang

- 🗺️ Die Original-Karte (The1Killer), eingebettet mit deutschsprachiger Oberfläche, Status-Tracking (Offen/Besucht/Erledigt), Suche, Notizen und Reset/Bereinigungs-Funktion.
- 📥 Automatische Update-Funktion, die neue/geänderte Kartendaten vom Original-Projekt nachlädt – `app/site` wird dabei ersetzt, nie von Hand verändert.
- 📖 Deutsche Wiki-Texte & Bilder zu jedem Ort, fest im Programm hinterlegt (kein Internet nötig).
- 🧭 Missionen-Fenster mit allen 44 Story-Missionen auf Deutsch inkl. Walkthrough-Texten und Erledigt-Status.
- 🏆 Erfolge-Übersicht.
- 👥 "Rat der Menschheit" mit allen Ausschüssen und ihren Berufen.
- 🧮 Wachstumsrechner für die Menschenzucht (alle Berufe, Eigenschaften, Bestandsverwaltung).
- 💾 Eigene Spielstand-Rubrik: liest die echte `.sav`-Datei (selbst reverse-engineertes Format) und zeigt Erinnerungen, Nahrung, Missionsstatus und bereits gezüchtete Menschen direkt als Übersicht – inklusive Abgleich mit dem Rechner und Korrektur-Funktion bei Verklickern.
- 📊 Fortschritts-Dashboard mit Export als CSV/Text.
- 🔒 Läuft komplett lokal (eigener kleiner Node-Server, nur `127.0.0.1`), alle Daten bleiben auf dem eigenen Rechner.

Vollständiges, laufend gepflegtes Änderungsprotokoll: im Zahnrad-Menü der App selbst.

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
