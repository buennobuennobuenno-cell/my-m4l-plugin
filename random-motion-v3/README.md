# Random Motion 24 — V3.2

**[Plugin direkt herunterladen (.amxd)](https://github.com/buennobuennobuenno-cell/my-m4l-plugin/raw/refs/heads/main/Random_Motion_24_V3_2.amxd)**

Erweiterung der bewährten **Random Motion 16 V3.1** auf **24 unabhängige Mappings**.
Gleiche Zufallsregeln, native Rampen und Map-/Min-/Max-Bedienung. Drei Spalten
mit je acht Zeilen, 1080 Pixel breit bei gleicher Gerätehöhe. Die drei schmalen
Zahlenflächen überdecken keine Map-Buttons oder Zielnamen.

Die ursprüngliche 16er-V3.1 bleibt separat verfügbar:
[Random Motion 16 V3.1](https://github.com/buennobuennobuenno-cell/my-m4l-plugin/raw/refs/heads/main/Random_Motion_16_V3_1.amxd).

## Bedienung

Die einzelne AMXD enthält alle drei Skripte. Für Live mit Max for Live und
Max 8.5+ vorgesehen. Als **neue Instanz** vor Auto Pan/Align Delay auf dieselbe
Spur beziehungsweise Rack-Chain ziehen; bei MIDI-Spuren hinter das Instrument.
Eine alte Instanz wird durch den Download nicht automatisch ausgetauscht.

**Map** drücken und Zielparameter anklicken: Die Bewegung beginnt sofort.
**x** löst die Zuordnung. Min/Max begrenzen den nativen API-Regelweg in Prozent;
diese Prozent entsprechen nicht zwingend angezeigten Hertz oder Millisekunden.
Ziehen ändert ganze Prozentpunkte; Doppelklick öffnet den gemeinsamen Editor
für Dezimalwerte. Anzeigen werden gerundet, gespeicherte Werte nicht.
Der normale Geräteschalter gibt Ziele frei beziehungsweise startet sie wieder.

Wie bei V3.1 sind regelbare Parameter derselben Spur möglich, auch in benachbarten
Rack-Chains. Ein Ziel kann nicht gleichzeitig zwei Zeilen zugeordnet werden.
Bei einem bereits ausgewählten Ziel gegebenenfalls erst einen anderen Parameter
und dann das gewünschte Ziel anklicken.

**Das Gerät ist wieder ausschließlich ein Parameter-Modulator.** Audio wird
direkt durchgereicht. Es enthält weder die All-Effektengine noch eigene Delays,
Verzerrer, Rauschquellen oder Rückkopplungen. Die Stock-Effekte bleiben im Rack.

## Zufallsverhalten

Die Datei `rm16_v3_motion.js` bleibt bytegleich mit V3.1 und dem gelieferten
v4.1-Zufallskern. Die internen Dateinamen behalten das historische „rm16“.
Alle 24 Plätze verwenden eigene Zustände und Termine.

- Kontinuierliche Ziele: ursprüngliche Mischung aus Vollbereichswahl und
  relativer reflektierter Bewegung mit logarithmischer Schrittweite.
- 18 % Sprünge, ansonsten ursprüngliche Rampendauern von etwa 1 ms bis 60 s.
- Ursprüngliche variierende Wartezeiten, kein neuer fester Modulationstakt.
- Neue Aufträge dürfen laufende Rampen unterbrechen.
- Schalter und Auswahlparameter erhalten ausschließlich gültige Ganzzahlen.
- Konstante Bereiche erzeugen keine laufenden Zufallsaufträge.
- Keine Audio-Trigger, kein Wert-Polling oder laufendes Anzeigen der Zielwerte.

Die Verteilungen der All-Versionen werden nicht übernommen. Die ursprüngliche
Gewichtung bleibt ausdrücklich erhalten. Es bleibt endlicher Pseudozufall;
absolute Unvorhersehbarkeit oder sämtliche denkbaren Verläufe sind nicht bewiesen.

## Optimierung und DSP

V3.1 erledigt bereits die wesentlichen Einsparungen: native Zielwert-/Daueraufträge,
ein gemeinsamer Einmal-Scheduler nur für bewegte Slots, keine laufenden
Live-API-Abfragen, keine GUI-Animation und gemeinsame Beobachter je Zielgerät.

Neu in V3.2:

- Eine vorab angelegte JS-Liste je Slot wird für Rampenaufträge wiederverwendet.
  Max übergibt ihre primitiven Werte beim `outlet()`-Aufruf als Nachricht.
- Die native Parameterspanne wird bei Zuordnung/Bereichsänderung berechnet,
  statt ihre Differenz bei jedem neuen Zielauftrag erneut zu bilden.
- Plätze 17–24 verwenden denselben Scheduler, keine zusätzlichen Timer.
- Drei schmale Zahlenflächen und ein Editor bedienen alle 48 Grenzen.

Das spart JS-Listenallokationen und etwas Steuerungsarbeit. Native Max-Nachrichten
müssen weiterhin übergeben werden. Dies ist **keine gemessene Verringerung von
Lives DSP-Prozentanzeige**. Bei 24 statt 16 bewegten Zielen entsteht zusätzliche
Fernsteuerungs- und Zielgeräte-Arbeit. Weniger Gesamtlast trotz acht weiterer
aktiver Ziele wird nicht versprochen. Unbelegte/konstante Plätze stehen nicht
in der laufenden Schedulerliste; ihre nativen Objekte bleiben im Patch vorhanden.

## Speicherung

Zustandsversion 6 speichert 24 Zuordnungs-/Grenzenzeilen. Alte Versionen 2–5 für
8, 12 und 16 Plätze werden akzeptiert; zusätzliche Plätze bleiben leer.
Flüchtige Live-IDs und laufende Zufallszustände werden nicht gespeichert.
Das ist Parser-Kompatibilität, kein Nachweis nativer Live-Preset-Migration.

V3.1 akzeptiert Version 6 absichtlich nicht: Ein Zurückladen soll die acht
zusätzlichen Zuordnungen nicht unbemerkt abschneiden.

## Bauen und Prüfen

Node.js 20+ und Python 3.10+, keine zusätzlichen Projektpakete:

```sh
npm --prefix random-motion-v3 run check
node random-motion-v3/tools/measure.cjs
```

Der gemeinsame Lauf `npm run check` prüft auch die anderen erhaltenen Geräte
und benötigt dort einen C++17-Compiler. Buildausgaben liegen in
`random-motion-v3/dist/`: eingefrorene `Random_Motion_24_V3_2.amxd`, editierbare
Maxpat, drei Skripte und eine ungefrorene Source-AMXD. Nur die Source-Alternative
braucht die Skripte daneben. Die Stammdatei wird nach Tests separat aktualisiert.

**77 Prüfungen:** 64 JavaScript- und 13 Paketprüfungen. Darunter exakte Vergleiche
von Zielwerten, Dauern, Terminen und PRNG-Zuständen, alle 24 Remotes/Map-Buttons,
48 Grenzen, gespeicherte Zustände, Bereichswechsel und Fehler-/Lebenszyklusfälle.

Unveränderte Referenzen: `tests/fixtures/v41/` und `tests/fixtures/v31/`.
Beim 24er-Vergleich wird die V3.1-Referenz nur im Test auf 24 Plätze erweitert;
dies ist kein historischer 24er-Release. [Prüfbericht](VALIDATION.md),
[Messdaten](validation/results.json).

## Native Grenzen

Max und Ableton sind hier nicht verfügbar. Laden, GUI, native Set-/Preset-
Wiederherstellung, Rampenausführung und M1-DSP-Verbrauch der neuen Datei sind
noch im Host zu prüfen. Die Modelle führen weder Live noch `live.remote~` aus.
Absturzfreiheit oder bestimmte CPU-Prozentwerte sind damit nicht nachgewiesen.

Zum CPU-Vergleich zuerst dieselben 16 Ziele und Einstellungen wie V3.1 verwenden;
anschließend die weiteren acht aktivieren. Audio, Bereiche, Sample-Rate,
Puffergröße und geöffnete/geschlossene Geräteansicht im Vergleich gleich halten.
