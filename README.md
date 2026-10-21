# SET / FORGET CHAOS

**[Plugin direkt herunterladen (.amxd)](https://github.com/buennobuennobuenno-cell/my-m4l-plugin/raw/refs/heads/main/Set-and-Forget-Chaos.amxd)**

Ein Max-for-Live-Modulator: **MAP drücken, einen Regler anklicken, loslassen.**
Der Parameterwert verändert sich danach selbstständig. Die Zuordnung bleibt
fest. Keine weiteren Einstellungen, kein festes Tempo und keine feste Schleife.

Das Gerät wechselt zufällig zwischen langsamen Fahrten (DRIFT), Sprüngen
(JUMP), kleinen Ausbrüchen (FLUTTER) und Pausen (HOLD). Zeitpunkt, Dauer und
Zielwert variieren. „Unvorhersehbar“ bedeutet musikalischen, nicht
kryptografischen Zufall; Wiederholungen einzelner Werte sind möglich.

## Benutzen

Voraussetzung: Ableton Live 11/12 unter macOS oder Windows mit Max for Live,
Zielversion Max 8.5 oder neuer. Noch nicht in diesen Hosts verifiziert.

1. Über den Download-Link oben die Datei herunterladen.
2. `Set-and-Forget-Chaos.amxd` in Live auf eine Audiospur ziehen, oder auf
   einer MIDI-Spur hinter das Instrument.
3. **MAP** drücken, dann einen zuweisbaren Regler anklicken, etwa Auto Filters
   Frequenz. Ein Gerät steuert genau einen Parameter, auch auf anderen Spuren.
4. Das Live-Set speichern. Es werden keine externen JavaScript-Dateien benötigt.

**RUNNING / PAUSED** pausiert bzw. startet die Bewegung. Während einer Pause
wird der Regler für manuelle Bedienung freigegeben. Beim Fortsetzen beginnt
die Bewegung an dessen aktuellem Wert. **CLEAR** entfernt die Zuordnung.
Erneutes **MAP** startet eine neue Auswahl; nochmals drücken bricht sie ab.

Der gesamte Wertebereich wird genutzt; bei Lautstärke oder Feedback kann das
sehr starke Veränderungen erzeugen. Für einen ersten Versuch eignet sich ein
Filter. Mehrere Geräte liefern unabhängige Verläufe für mehrere Parameter.
Das Audio wird stereo unverändert durchgeleitet. Es handelt sich um einen
Parameter-Modulator, nicht um einen Klangerzeuger oder MIDI-Effekt.

## Entwicklungsumgebung

Die Linux-Cloud unterstützt Quellcode, Builds und automatisierte Tests.
Ableton Live und Max können hier nicht ausgeführt werden. Für die Laufzeit
werden weder Webserver, Zugangsschlüssel noch zusätzliche Max-Pakete benötigt.
Für die Entwicklung genügen **Node.js 20+** und **Python 3.10+**; es gibt keine
herunterzuladenden npm- oder Python-Abhängigkeiten.

```sh
cd /workspace/my-m4l-plugin
npm run check
```

`npm test` führt die Engine-/Controller-Tests und die Archiv-/Patch-Prüfungen
aus. `npm run build` erzeugt das einzelne `.amxd`, eine bearbeitbare `.maxpat`,
das gebündelte JavaScript und ein ZIP mit deutschsprachiger Kurzanleitung.
Für die Bearbeitung der `.maxpat` muss `chaos-runtime.js` im selben Ordner
bleiben. `dist/` wird generiert und ist in Git ignoriert.
Die fertige Download-Datei liegt zusätzlich als `Set-and-Forget-Chaos.amxd`
im Repository-Stamm. Bei einer neuen Geräteversion nach Build und Tests
diese Kopie aus `dist/Set and Forget Chaos.amxd` aktualisieren. Normale
Setup- und Testläufe verändern ausschließlich die generierten Build-Dateien.

Die JavaScript-Quellen verwenden absichtlich ES5 für Maxs klassisches `js`.
Es gibt keine Node-APIs oder `require()`-Aufrufe im Max-Controller.

## Aufbau und Grenzen

- `src/chaos-engine.js`: zeitbasierte Zufallssegmente und eine chaotische
  Zustandsfolge, ohne Live-Abhängigkeit.
- `src/live-controller.js`: Auswahl, Bereichsprüfung, Zeitsteuerung, Pause,
  Freigabe und Wiederherstellung einer Live-Parameterreferenz.
- `tools/build.py`: Max-Patch und eigenständiges AMPF/mx@c-Archiv mit
  eingebettetem JavaScript. Das Dateiformat wurde mit Abletons öffentlichem
  [Connection Kit](https://github.com/Ableton/m4l-connection-kit) abgeglichen;
  dessen Quellcode und Medien werden nicht übernommen.
- `test/`: Node-Tests mit simulierter Live API sowie unabhängige Prüfungen des
  erzeugten Gerätearchivs, der Kabel und der eingebetteten Ressourcen.

Die Live API wird erst nach `live.thisdevice` initialisiert. Die Steuerung
erfolgt über `line~` und `live.remote~`, nicht über laufende `set value`-
Aufrufe. Ein nativer `live.observer id` mit Persistenz speichert die Referenz
im Live-Set; flüchtige IDs oder positionsabhängige Pfade werden nicht in JS
gespeichert. Nach Änderungen der Geräteposition wird die Remote-Verbindung
erneuert. Pausieren, Ausschalten und Löschen geben die Fernsteuerung frei.
Kontinuierliche Werte erhalten 25-ms-Rampen; quantisierte Parameter werden
auf ganze Werte gerundet. Die interne Steuerung läuft mit höchstens 40 Hz.

Die automatisierten Tests ersetzen keinen Hosttest. Offen sind das tatsächliche
Laden der generierten `.amxd`, die Darstellung, das Mapping, die Klangprüfung,
Undo-Verhalten und die native Referenzpersistenz in Live. Die Mapping-Auswahl
reagiert auf Änderungen von Lives ausgewähltem Parameter. Falls derselbe
Regler schon ausgewählt ist und nicht reagiert, zuerst einen anderen anklicken.

## Hostprüfung vor einer Veröffentlichung

1. `.amxd` in Live laden: keine fehlenden Objekte oder JS-Fehler in der Max-Konsole.
2. Audio vorher/nachher vergleichen: Durchleitung ohne Pegeländerung.
3. MAP auf Auto Filters Frequenz: Parameter bewegt sich, UI zeigt das Ziel.
4. Pause: Wert bleibt stehen, Regler manuell ändern, fortsetzen ohne Nullsprung.
5. CLEAR und Gerät ausschalten: Zielregler ist sofort wieder bedienbar.
6. Einen quantisierten Parameter mappen: ausschließlich erlaubte Stufen.
7. Live-Set mit aktiver und pausierter Instanz speichern, schließen, neu laden:
   richtige Zielparameter und Pausenstatus bleiben erhalten.
8. Zielgerät löschen sowie Spuren/Geräte verschieben oder duplizieren:
   keine falsche Zuordnung, keine verwaiste Fernsteuerung.

Version 0.1.0 ist ein vorbereiteter Prototyp; diese Hostprüfungen stehen aus.
