# Random Motion 16 — V3.1

**[Plugin direkt herunterladen (.amxd)](https://github.com/buennobuennobuenno-cell/my-m4l-plugin/raw/refs/heads/main/Random_Motion_16_V3_1.amxd)**

**Korrektur in V3.1:** Die breite Zahlenoberfläche aus V3 überlappte alle
Map-Buttons und Zielnamen. Zwei schmale Zahlenflächen liegen jetzt ausschließlich
in den Min/Max-Spalten. Dadurch hängt der Zugriff auf Map nicht mehr von der
Zeichen- oder Klickreihenfolge in Max ab. Als neue Instanz laden und den Titel
**V3.1** prüfen. Bestehende V3-Instanzen werden nicht automatisch ausgetauscht.

Weiterentwicklung des angehängten **Random Motion 16 v4.1**, mit 16 unabhängigen
Zuordnungen. „V3“ ist der gewünschte Name dieser neuen Codex-Iteration; sie baut
auf dem aktuellen 16-Slot-Gerät auf, nicht auf der alten 12-Slot-Version 3.0.

Zweck: Auto Pan und **Align Delay** in deinem Ableton-Live-11-Rack automatisch
variieren, um Amplitude, Zeit und Stereobild zu verändern. Das Gerät verarbeitet
selbst keine Effekte; es reicht Stereo-Audio direkt durch und steuert Parameter
der bereits im Set vorhandenen Geräte auf derselben Spur. Es funktioniert
weiterhin auch mit anderen von Live angebotenen Zielparametern.

## Verwendung

Voraussetzung: Ableton Live mit Max for Live auf macOS oder Windows.
Zielplattform ist wie beim Anhang Live 11 / Max 8.5. Die neue Oberfläche und die
native Ausführung müssen noch in diesem Host geprüft werden.

1. Die einzelne `.amxd` über den Download-Link herunterladen und als **neue
   Instanz** in die WET-Chain des Racks ziehen, vor die Zielgeräte. Bei einer
   MIDI-Spur hinter das Instrument setzen. Die Datei enthält ihre Skripte.
2. Falls gewünscht zuerst den Bereich mit **Min % / Max %** begrenzen.
3. In einer Zeile **Map** drücken und den gewünschten Regler in Auto Pan oder
   Align Delay anklicken. Die unabhängige Zufallsbewegung startet sofort.
4. **x** entfernt die betreffende Zuordnung. Der normale Ein-/Ausschalter des
   Geräts gibt alle Ziele frei bzw. startet sie wieder. Das Live-Set speichern.

Nur Map und Min/Max: keine zusätzlichen Rate-, Seed-, Start-, Kurven- oder
Glättungsregler. Die 16 Zeilen bilden zwei Spalten mit je acht Mappings.

Min/Max sind Prozent des nativen API-Regelwegs, nicht zwangsläufig Prozent des
angezeigten Hertz- oder Millisekundenwerts. Ziehen ändert ganze Prozentpunkte.
Doppelklick öffnet den gemeinsamen Zahleneditor; Dezimalzahl eingeben und mit
Enter bestätigen. Angezeigt wird gerundet, gespeichert wird die volle Zahl.
Die Hinweise an den Zahlenfeldern zeigen, soweit Live die Formatierung liefert,
die dazugehörigen nativen Einheiten. Das ist für kleine Delay-Bereiche hilfreich.

Bei einem bereits ausgewählten Ziel kann Live eine erneute Auswahl desselben
Parameters ohne neue Auswahlmeldung behandeln. Wenn Map dann wartet, einmal
einen anderen Regler und anschließend das gewünschte Ziel anklicken.

## Zufallsverhalten

Die Mathematik aus v4.1 ist unverändert übernommen. Jeder Slot hat eigene
Pseudozufallszustände, Ziele und Ereignistermine. Neue Zuordnungen und Instanzen
erhalten neue Startwerte. Ein neuer Auftrag darf eine laufende Rampe unterbrechen.
Die Zwischenwerte erzeugt unmittelbar `live.remote~` aus Zielwert und Dauer.

- Kontinuierliche Ziele: 50 % Vollbereichswahl, 50 % relative reflektierte
  Bewegung mit logarithmischer Schrittweite. Auch sehr kleine Bewegungen und
  die genauen Bereichsgrenzen bleiben möglich.
- 18 % Sprünge, sonst logarithmische Rampendauern von 1 ms bis knapp 60 s.
- Neu gezogene Wartezeiten mit wechselnder Skala; durchschnittlich ungefähr
  6,2 Aufträge pro Sekunde und bewegtem Slot. Ein Mindestabstand von 1 ms wird
  angefordert. Die JavaScript-Task arbeitet nicht samplegenau.
- Schalter und Auswahlparameter erhalten ausschließlich gültige ganzzahlige
  Zustände. Dort sind Sprünge richtig; auch ein Drehknopf kann diskret sein.
- Min = Max bzw. ein einziger zulässiger Schaltzustand ergibt einen konstanten
  Slot ohne laufende Zufallsereignisse. Ein leerer diskreter Bereich gibt das
  Ziel frei und wird angezeigt; nach Erweitern der Grenzen startet er wieder.

Zufall ist keine Gleichverteilung aller denkbaren Kurven. Die ursprüngliche
Gewichtung bleibt erhalten. Die Tests belegen weder physikalisch absoluten
Zufall noch absolute Unvorhersehbarkeit oder sämtliche mathematischen Verläufe.

## Optimierungen und Fehlerbehandlung

- **32 → 2 JSUI** und **32 → 1 Zahleneditor**. Die Anzeige wird nur bei
  Konfigurationsänderungen gezeichnet; keine laufende Zielwertanimation.
- **215 → 96 Max-Objekte**. Die 16 nativen Fernsteuerungen sind weiterhin nötig
  und werden unverändert über Zielwert-/Dauernachrichten angesprochen.
- Nur tatsächlich bewegte Slots stehen in der laufenden Liste. Eine Prüfung
  ermittelt gleichzeitig die fälligen Aufträge und den nächsten Termin.
- Die abgelaufene Einmal-Task wird nicht bei jedem Ereignis nochmals abgebrochen.
  Bypass und Zustandswechsel bündeln ihre Neuplanung.
- Unveränderte Grenzen erzeugen keine zusätzlichen Zufallsaufträge oder
  Speicherbenachrichtigungen. Leere Ausgänge erhalten keine nutzlosen Freigaben.
- Kein periodisches Live-API-Polling und keine Beobachtung des modulierten Werts.
  Namen und Strukturen werden nur bei entsprechenden Änderungen bearbeitet.
- Nach Änderungen der Geräte-/Rack-Position wird die native Bindung erneuert.
  Eine laufende Rampe wird aus der bisherigen Schätzung mit ihrer Restdauer
  fortgesetzt; Zufallszustand und nächster Ereignistermin bleiben erhalten.
- Strukturbeobachtung bezieht übergeordnete Rack-Ketten ein. Umbenennungen
  aktualisieren gespeicherte Signaturen. Alte Parameter-Handles werden abgelöst,
  und alte Rückmeldungen dürfen eine neue Zuordnung nicht beeinflussen.
- Fehler einzelner Ziele und fehlgeschlagene Oberflächenzugriffe stoppen die
  übrigen Slots nicht. Nicht endliche Rampenwerte werden abgefangen.
- Ungültige Zustandsdaten und Pfade werden geprüft. Gespeichert werden lokale
  Referenzen und Grenzen, keine flüchtigen Live-IDs oder Zufallszustände.
- Ein expliziter `freebang`-Pfad beendet Tasks und Bindungen beim Schließen.

Das ist eine Reduktion der **Steuerungs- und GUI-Arbeit**. Die eigentliche native
DSP-Arbeit der 16 Remotes und der Zielgeräte ist nicht auf Linux messbar und
wurde nicht durch geringere Ereignisdichte oder gröbere Kurven ersetzt.

## Tests und Reproduktion

Node.js 20+ und Python 3.10+, keine zusätzlichen Pakete:

```sh
cd /workspace/my-m4l-plugin
npm run check
```

Nur diese Version: `npm --prefix random-motion-v3 run check`.
Die Builds erzeugen in `random-motion-v3/dist/` eine eigenständige `.amxd`, eine
editierbare `.maxpat`, die drei Skripte und eine ungefrorene `_Source.amxd`.
Für die Source-Alternative müssen die drei Skripte im gleichen Ordner bleiben.
Die Hauptdatei enthält sie bereits.

Die Datei `Random_Motion_16_V3_1.amxd` im Repository-Stamm ist die veröffentlichte
Download-Kopie. Ein normaler Build schreibt nur ins ignorierte `dist/`. Für eine
neue Version nach Tests die Stammdatei bewusst aus dem neuen Build aktualisieren.

Ein unabhängiger Archivleser kontrolliert Ressourcen, Kabel und DSP-Pfad.
Die unveränderten v4.1-JS-Dateien liegen ausschließlich als Testreferenz unter
`tests/fixtures/v41/`. Prüfbericht und Ergebnisse: [VALIDATION.md](VALIDATION.md).

## Noch in echtem Live zu prüfen

Laden der `.amxd`, native Darstellung und Zahlenbedienung, Parameterbewegung in
Auto Pan und Align Delay, quantisierte Modi, Bypass/Freigabe, Löschen und Undo,
Set speichern/schließen/neu laden, Rack-Kopie auf eine neue Spur und
Geräte-/Spurverschiebungen. Den ganzen Rack-Aufbau kopieren, damit lokale
Zielreferenzen mitkommen. Gleiche Geräte mit identischen Signaturen können bei
beliebigen Umbauten nicht in jedem Fall eindeutig unterschieden werden; fehlende
oder zweifelhafte Ziele neu mappen. Eine laufende externe Automation, native
Parameter-Modi und DSP-Verhalten sind im Host zu beurteilen.

Zum CPU-Vergleich denselben Rack-Aufbau, dasselbe Audio, dieselben 16 Zielparameter,
Bereiche, Sample-Rate und Puffergröße verwenden. Erst die Zieleffekte ohne
Modulation, dann v4.1 und V3 getrennt messen, jeweils auch mit geschlossenen
Geräteoberflächen. Objektzahl und Dateigröße sind kein Ersatz für diese Messung.
Absturzfreiheit oder eine bestimmte CPU-Prozentersparnis wird nicht zugesichert.
