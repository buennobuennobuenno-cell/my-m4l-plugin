# All — 1.0.0

**[All direkt herunterladen (.amxd)](https://github.com/buennobuennobuenno-cell/my-m4l-plugin/raw/refs/heads/main/All.amxd)**

Ein eigenständiger Stereo-Audioeffekt für Ableton Live mit Max for Live.
Einziger Geräteparameter: **Dry/Wet**. Keine Mappings, Zielgeräte oder zusätzlichen
Stock-Effekte nötig. Startet automatisch mit aktiver Audioverarbeitung, unabhängig
von Transport, Tempo oder Eingangstriggern. Vorgesehene Basis: Live 11/12 und
Max 8.5+, einschließlich nativem Apple Silicon; tatsächlicher Hosttest steht aus.

Die einzelne Datei als **neue Instanz** auf die Audiospur bzw. hinter ein
Instrument ziehen. **0 %** gibt den Eingang durch, **100 %** den bearbeiteten
Ausgang. Der Startwert ist **100 %**. Für eine parallele Rack-Chain kann All
vollständig wet bleiben und der Chain-Pegel den Anteil bestimmen, wie vom Nutzer
vorgesehen. Der einzige Regler ist in Live automatisierbar und wird im Set
gespeichert. Die Zufallszustände werden beim Laden neu initialisiert.

Die kompakte Oberfläche ist 110 Pixel breit. Das Gerät enthält den Audiokern
und das einmalig ausgeführte Startskript. Es muss keine ZIP entpackt werden.

## Festgelegtes Verhalten dieser ersten Version

- Sechs unabhängige, samplegetaktete Zustandsmaschinen steuern vier
  Stereo-Mischkoeffizienten und zwei Delayzeiten. Eine weitere Zustandsmaschine
  steuert die Kombinationen. Keine JavaScript-Tasks oder Live-API-Abfragen laufen
  im Betrieb; JavaScript gibt beim Laden genau einen neuen Seed aus.
- Gain-/Delay-Zustände: halten/hart springen, linear, weich gekrümmt, gestuft,
  Dreiecksbewegungen und sampleweise Zufallsbursts. Neue Ziele können laufende
  Bewegungen unterbrechen. Dauer, Abstand und Ziel sind getrennte Ziehungen.
- Die Auswahl enthält explizit Ein-Sample-Intervalle und breite Zeitskalen über
  eine gemischte Potenzverteilung. Es gibt weder einen festen Modulationstakt noch
  vorgeschriebene Glättung. Diese neue Verteilung ist nicht die alte V3.1-Verteilung.
- Gain-Ziele einschließlich 0, +1 und −1; alle vier Koeffizienten können zwischen
  −4 und +4 liegen. Die Summe ihrer Absolutwerte wird je Ausgangszeile auf 4
  begrenzt. Das erlaubt Polaritätswechsel, Verstärkung, Stummschaltung und
  Übertragung jedes Eingangskanals auf beide Ausgangskanäle.
- Linke/rechte Verläufe sind wahlweise unabhängig, gemeinsam oder gegenläufig
  gekoppelt. Die unbenutzten unabhängigen Verläufe laufen intern weiter.
- Ganzzahlige Delayziele von **0 bis 2 Sekunden bei 8–192 kHz**; kleinste Änderung
  **ein Sample**. Es gibt keine Fractional-Delay-Interpolation. Bei höheren Raten
  begrenzt zusätzlich die feste Pufferlänge auf 524.287 Samples. Noch nicht
  vorhandene Eingangshistorie ergibt null, nicht eine verkürzte Verzögerung.
- Beide seriellen Anordnungen **Delay → Matrix** und **Matrix → Delay** sowie
  **paralleles Delay + Matrix**. Sie können einzeln oder gleichzeitig beitragen.
  Umschaltungen dürfen hart oder mit linearem/weichem Verlauf stattfinden.
- Optionale, automatisch gewählte Kennlinien: unverändert, Clipping, Faltung,
  Amplitudenquantisierung und rationale weiche Sättigung. Platzierung im
  vorverarbeiteten Speicherzweig, hinter der Summe oder an beiden Stellen.
- Zeitweise positive/negative Rückkopplung. Ihr gespeicherter Rücklauf ist intern
  auf ±1 begrenzt. Es gibt keinen globalen Ausgangslimiter oder De-Clicker.
  Eingänge außerhalb ±64 sowie nicht endliche Eingangswerte werden vor dem
  Speichern verworfen. Diese Grenzen sichern eine endliche Berechnung.
- Keine autonomen Audiotöne oder additive Rauschquelle. Bei Stille und leeren
  Speichern bleibt der Ausgang exakt still. Vorhandenes Material kann durch
  die Rückkopplung nachlaufen; sampleweise Modulation darf selbst rau klingen.

## Was gegenüber dem theoretischen Gespräch präzisiert wurde

Kurze zufällige Gainfolgen können für einen konkreten Eingang die Ausgabe
anderer Effekte annähern. Das setzt verfügbare, passende Eingangswerte und
erreichbare Gains voraus. Ein fester Multiweg-Kern ersetzt hierfür getrennte
Stock-Effekte und laufendes Umverkabeln. Gezielte Nichtlinearitäten machen einige
dieser Verläufe außerdem häufiger erreichbar.

**All ist kein bewiesener Generator sämtlicher denkbarer Audioverläufe und kein
mathematisch nachgewiesenes Bernoulli-System.** Die kombinierte ecuyer1988-Folge
hat endlichen Zustand; auch die Koeffizienten, Speicher und Zeitskalen sind
begrenzt. Es wird weder vollständige Unterstützung aller möglichen kurzen
Bitfolgen noch physikalischer Zufall oder absolute Unvorhersehbarkeit behauptet.
Wahrscheinlichkeitsverteilungen und Abhängigkeiten gehören zum Klangentwurf.

Ein geringer Wet-Anteil fügt einen weiteren Signalbeitrag hinzu, beseitigt aber
keine Bereichsgrenzen. Exakte Treffer einer beliebig vorgegebenen kontinuierlichen
Wertefolge sind kein sinnvolles Erfolgsversprechen. Diese Version ist eine
konkrete, begrenzte erste Umsetzung des besprochenen Möglichkeitsraums.

## DSP und Speicher

Ein eingebettetes `gen~`, zwei Stereo-Ringpuffer, höchstens vier gepufferte
Lesezugriffe und vier Schreibzugriffe pro Sample. Die Speicherbereiche benötigen
zusammen **16 MiB**, unabhängig von Laufzeit und Zahl der Zufallsereignisse.
Kein FFT, Oversampling, eigener nativer External, Audio-Thread-JavaScript,
periodisches GUI-Zeichnen oder Laufzeit-Anlegen von Geräten/Puffern. Der
GenExpr-Kern verwendet keine Sinus-, Exponential- oder Logarithmusfunktionen.

Die Berechnung läuft auch bei 0 % Wet weiter, damit das Zufallssystem weiterläuft.
Der normale Live-Geräteschalter bleibt der Host-Bypass. Teilbare Rechenwege werden
gemeinsam verwendet; der Effekt besteht nicht aus versteckten Auto-Pan-/Align-
Delay-Instanzen. Kleinere Datei oder weniger Objekte beweisen keine CPU-Ersparnis.

**Die vom Nutzer genannten etwa 6 % auf einem MacBook Air M1 wurden hier nicht
gemessen oder als eingehalten bestätigt.** Der Linux-Arithmetik-Benchmark ist
kein Test von Gen-JIT, Ableton, Audiotreiber, M1, Puffergröße oder Lives DSP-Anzeige.

## Prüfen und Bauen

Benötigt: Node.js 20+, Python 3.10+, C++17-Compiler (`g++` oder `CXX`). Keine
zusätzlichen Projektpakete, Ports, Dienste oder Zugangsdaten.

```sh
python3 all/test.py
python3 all/test.py --sanitize
python3 all/test.py --benchmark
python3 all/build.py
```

Der gemeinsame Projektlauf `npm run check` prüft und baut alle drei Geräte.
CI führt zusätzlich die Address-/UndefinedBehavior-Sanitizer-Prüfung für All aus.
Buildausgaben: `all/dist/All.amxd`, `All.maxpat`, `all_seed.js`. Die GenExpr-Quelle
ist im Patch eingebettet. Die Datei `All.amxd` im Repository-Stamm ist eine nach
den Prüfungen bewusst aktualisierte Download-Kopie; normale Builds ersetzen sie
nicht. `all/reports/` ist ein ignoriertes Ausgabeverzeichnis.

`tools/native_model.py` übersetzt die **tatsächlich eingebetteten GenExpr-
Anweisungen** in einen eingeschränkten C++-Prüfhost, einschließlich getrennten
History-Zuständen je Aufrufstelle und geprüften Data-Adressen. Das ist kein
separat neu geschriebenes DSP-Modell, aber **auch nicht Cycling '74s Gen-Compiler**.
Native Gen-Sprachakzeptanz, Optimierungen und Hostverhalten werden dadurch nicht
ausgeführt. Der Adapter und seine Einschränkungen sind mit veröffentlicht.

Pakettests prüfen Archiv, Ressourcen, alle Verbindungen, Start-/Parameterpfade
und den einzigen sichtbaren Regler. Die ausführbaren Signaltests prüfen unter
anderem exakte Impulspositionen, Ring-Wrap, alle drei Anordnungen, gleichzeitige
Mischung, Stereo-Kreuzverteilung, harte Gains, Kennlinien, Stille, Feedbackgrenzen,
Dry/Wet, ungültige Zahlen, Re-Seeding und wechselnde Sample-Raten. Ein 62,5-Sekunden-
Render durchläuft alle Kurven- und Kennlinienfamilien; das ist ein Offline-Modelllauf.
Adress-/UB-Sanitizer gelten für diesen C++-Prüfhost, nicht für Max selbst.

Prüfstand 22. Oktober 2026: **136 unterschiedliche Prüfungen bestanden**,
davon 27 für All (10 Paket-/Startskripttests und 17 Signal-/Rechentests).
Die 17 Rechentests wurden zusätzlich mit Address- und UndefinedBehavior-
Sanitizern erfolgreich ausgeführt. Beide Durchläufe erzeugten im 62,5-Sekunden-
Modellrender denselben Spitzenwert von ungefähr 4,87123. Paket und eingebettete
Quellen stimmen bytegenau überein. Ergebnisse, Dateihash und ausdrücklich
ungetestete Hosteigenschaften: [validation/results.json](validation/results.json).

Im lokalen x86-64-C++-Modell benötigten 20 Sekunden Audio bei 48 kHz ungefähr
0,415 Sekunden Rechenzeit im normalen Zufallsbetrieb und 0,930 Sekunden bei
erzwungenen sampleweisen Verläufen mit gleichzeitig aktiven Wegen. Das sind
Momentaufnahmen dieses Prüfprogramms; sie werden nicht als Ableton-CPU-Prozente
oder M1-Prognose ausgegeben.

## Noch im echten Host erforderlich

Hier gibt es weder Max noch Ableton Live. Daher sind tatsächliches Laden und
Gen-Kompilieren, Darstellung, Audioausführung, Automations-/Set-Speicherung,
Bypass-/DSP-Neustarts und Absturzverhalten **noch nicht nativ getestet**.

In Live 11/12 mit Max 8.5+ prüfen: neue Instanz ohne Max-Fehler, genau ein sichtbarer
Dry/Wet-Regler, 0 % unverändert und 100 % bearbeitet, Mono-/Stereoquellen, schnelle
Automation, Set speichern/neu öffnen, Duplikate und Löschvorgänge sowie DSP- und
Sample-Rate-Wechsel. Auf dem M1 44,1/48/96 kHz mit üblichen Puffergrößen messen,
auch mit geschlossener Geräteansicht und mehreren Instanzen. CPU-Vergleich mit
dem bisherigen vollständigen Rack unter denselben Bedingungen durchführen.
Absturzfreiheit oder maximal 6 % CPU lassen sich ohne diese Messungen nicht zusichern.
