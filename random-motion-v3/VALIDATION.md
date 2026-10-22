# Prüfung — Random Motion 24 / V3.2

Ausgangspunkt ist die vom Nutzer ausgewählte **Random Motion 16 V3.1**.
Das erneut angehängte `Random_Motion_16 (1).amxd` ist die historische v4.1:
198.241 Bytes, SHA-256
`1538ec4deb8ff5fc172c5a74fde8ba0c3dd232670eca008d474293ed3c3be40d`.
Ihre eingebetteten Mapping-/Bewegungsskripte stimmen bytegleich mit den
vorhandenen v4.1-Testreferenzen überein.

Die Aufträge: zum funktionierenden Mapping-Konzept zurückkehren, Optimierungen
prüfen und 24 statt 16 Zuordnungen anbieten. Die späteren All-Audioeffekte sind
kein Bestandteil dieser Änderung.

## Umsetzung

24 native Remote-Wege, drei Spalten mit je acht Map-/Min-/Max-Zeilen.
Gerätehöhe, Zeilen- und Buttonmaße bleiben wie V3.1; die Breite wächst von
720 auf 1080 Pixel. Drei Zahlenflächen liegen ausschließlich in den Zahlenspalten.
Ein beweglicher Zahleneditor versorgt alle 48 Grenzen.

Stereo-Audio bleibt direkt von `plugin~` mit `plugout~` verbunden. Es gibt keinen
eigenen Kurven-DSP, `gen~`, Audio-Delay, Rausch- oder Feedbackpfad.
Die Zufalls-Arithmetikquelle wurde nicht geändert.

Neu: wiederverwendbare primitive JS-Listen für native Rampenaufträge und eine
zwischengespeicherte Parameterspanne. Diese wird bei erkannten Bereichsänderungen
erneuert. Ausgaben, Ereignisdichte und Kurven werden nicht ausgedünnt.
Ein Scheduler bearbeitet weiterhin nur bewegte Plätze.

Zustandsversion 6 akzeptiert die alten Formate 2–5 und ergänzt leere Zeilen.
Das Modell prüft die Wiederherstellung aller 24 Zuordnungen. Native Live-Presets
werden damit nicht ausgeführt.

## Vergleich

Die unveränderten V3.1-Skripte aus Commit `104b9f0` liegen unter
`tests/fixtures/v31/`. Beim 24er-Vergleich wird nur im Prüfhost die Kapazität der
Referenz auf 24 gesetzt. Die Dateien werden nicht geändert und es wird kein
historischer 24er-Release behauptet.

Je 20.000 Scheduler-Callbacks mit 24 stetigen beziehungsweise gemischten
stetigen/diskreten Zielen prüfen **exakt gleiche** native Wert-/Daueraufträge,
Task-Wartezeiten, Ereignistermine und beide PRNG-Zustände aller Slots.
Weitere Vergleiche mit v4.1 prüfen die ursprünglichen 16 Wege.
Die bytegleiche Bewegungsquelle wird zusätzlich per SHA-256 abgesichert.

## Gemessene Steuerungsarbeit

Je 20.000 simulierte Scheduler-Callbacks:

| Bewegte Plätze | Wertaufträge je Version | Unterschiedliche JS-Wertlisten V3.1 → V3.2 |
|---|---:|---:|
| 1 | 20.000 | 20.000 → 1 |
| 4 | 20.037 | 20.037 → 4 |
| 16 | 20.186 | 20.186 → 16 |
| 24 | 20.365 | 20.365 → 24 |

Für die letzte Zeile gilt der oben beschriebene reine Kapazitätsvergleich.
Listen werden anhand ihrer Objektidentität gezählt. Native Max-Nachrichten und
interne Host-Allokationen werden nicht gemessen.

In allen V3.1-/V3.2-Läufen: keine laufenden Live-API-Abfragen, GUI-Nachrichten,
Objektsuchen oder redundanten Task-Abbrüche. Scheduler- und Slot-Zugriffszahlen
werden nicht durch einen anderen Zufallsablauf reduziert. Die Messdatei enthält
außerdem den Vergleich mit der älteren v4.1.

Das belegt weniger neue JS-Listen, keine bestimmte Verringerung von CPU oder
nativer DSP-Last in Ableton. 24 aktive Remotes und ihre Ziele dürfen mehr
Arbeit benötigen als 16.

## Prüfungen

**77 Prüfungen:** 64 JavaScript- und 13 Python-Pakettests.

- Alle 24 Remote-Wege und Map-Buttons vorhanden, sichtbar konfiguriert,
  korrekt verkabelt und ohne Überschneidung mit Zahlenflächen.
- Alle drei Zahlenflächen und 48 Grenzen: richtige Zeile/Spalte, Rundung,
  Dragging, Dezimaleingabe und Editorposition bis zur dritten Spalte.
- Eigene Zufallszustände, stetige/diskrete, konstante/leere Bereiche,
  unterbrechbare Rampen und dynamische Parameterbereiche.
- 24 gespeicherte Mappings, ältere Zustände, lokale Rack-Referenzen.
- 2.000 Konfigurations-/Lebenszyklusvorgänge mit 24 Plätzen, Fehlerisolation,
  Bypass/Freigabe, Löschen, Neumappen und veränderte Uhrzeit.
- 24 Zufallsströme im 30-Minuten-Ereignismodell, kein Ableton-Dauerlauf.
- Wiederverwendete Listen ändern bereits abgegebene Nachrichten im Modell nicht.
- Unveränderte Referenzdateien, eigenständiges Ressourcenarchiv, direkte
  Stereoverbindung, Start-/Cleanup-Pfade und reproduzierbare Builds.

Der gemeinsame Projektlauf prüft zusätzlich 35 Fälle des frühen Mapping-
Prototyps und 33 für All: **145 insgesamt**. Diese anderen Geräte werden durch
die neue Mapping-Datei nicht ersetzt.

## Native Grenzen

Der Prüfhost bildet Max-JavaScript-, Task-, GUI- und LiveAPI-Schnittstellen nach.
Ein nativer Max-/Ableton-Host steht hier nicht zur Verfügung. Laden, Darstellung,
native Speicherung, Rampenausführung und M1-DSP-Verbrauch sind noch nicht geprüft.
Absturzfreiheit wird nicht zugesichert.

V3.1 und V3.2 zuerst mit denselben 16 Mappings vergleichen, danach die weiteren
acht aktivieren. Audio, Zielgeräte, Bereiche, Sample-Rate, Puffergröße und
geöffnete/geschlossene Geräteansicht dabei gleich halten.

Reproduktion: [README.md](README.md). Maschinenlesbare Ergebnisse:
[validation/results.json](validation/results.json).
