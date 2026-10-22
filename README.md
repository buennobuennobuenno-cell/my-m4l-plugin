# All — 2.0.0

**[All direkt herunterladen (.amxd)](https://github.com/buennobuennobuenno-cell/my-m4l-plugin/raw/refs/heads/main/All.amxd)**

Eigenständiger Stereo-Chaoseffekt mit **einem einzigen Dry/Wet-Regler**.
Keine Mappings oder zusätzlichen Stock-Effekte nötig. Die einzelne Datei in
Ableton Live mit Max for Live als **neue Instanz** laden. Startwert: **10 % Wet**.

Samplegetaktete Abschwächung und ganzzahlige Delayverläufe mit Stereo-Kreuzmischung.
**Keine zusätzliche Verstärkung, Rückkopplung oder Verzerrungskennlinie.**
Harte, weiche, gestufte und sampleweise Veränderungen sind erlaubt.
Keine Bevorzugung kleiner Zufallsziele oder Unterdrückung von Wiederholungen.
Ein Stereo-Eingangspuffer statt zweier Puffer halbiert den Audio-Speicherbedarf.
Ein kompakter nativer `gen~`-Kern ersetzt die externe Parameterfernsteuerung.

[Bedienung, Architektur, Tests und Grenzen](all/README.md).
Paket und tatsächliche Rechenanweisungen werden auf Linux geprüft. Das ersetzt
keinen nativen Max-/Ableton-Ladetest. Absturzfreiheit oder höchstens 6 % CPU auf
einem M1 sind hier nicht verifiziert. Keine Garantie sämtlicher denkbarer Effekte.

Entwicklung: Node.js 20+, Python 3.10+ und C++17-Compiler. `npm run check` prüft
und baut alle Geräte. All liegt unter `all/`; der ausführbare C++-Prüfhost ist
kein Ersatz für Cycling '74s Gen-Compiler. Die bisherigen Projekte bleiben erhalten.

# Random Motion 16 — V3.1

**[Plugin direkt herunterladen (.amxd)](https://github.com/buennobuennobuenno-cell/my-m4l-plugin/raw/refs/heads/main/Random_Motion_16_V3_1.amxd)**

V3.1 korrigiert die verdeckten Map-Buttons aus V3: Zwei schmale Zahlenflächen
liegen ausschließlich über Min/Max. Keine Zahlenfläche überlappt mehr einen
der 16 Map-Buttons oder Zielnamen. Die neue Datei als neue Instanz laden;
im Gerät steht **V3.1**. Eine vorhandene V3-Instanz aktualisiert sich nicht selbst.

16 unabhängige Zufalls-Mappings für Ableton Live / Max for Live, insbesondere
für **Auto Pan und Align Delay**. Einmal zuordnen, bei Bedarf Min/Max begrenzen,
automatisch weiterlaufen lassen. Keine zusätzlichen Rate- oder Kurvenregler.

Die `.amxd` in Live auf die Audiospur bzw. in die WET-Chain ziehen. Bei einer
MIDI-Spur hinter das Instrument setzen. **Map** drücken, Zielregler anklicken.
**x** entfernt eine Zuordnung. Min/Max ziehen für ganze Prozentpunkte,
doppelklicken für genaue Dezimalwerte. Die Datei enthält alle benötigten Skripte.

Weiterentwicklung des vom Nutzer bereitgestellten **Random Motion 16 v4.1**.
Das bestehende Zufallsverhalten und die nativen Rampen bleiben erhalten;
Steuerung, Oberfläche und Lebensdauerbehandlung wurden überarbeitet.
Die Version wurde automatisiert auf Linux geprüft. Laden, Oberfläche, Klang,
native Speicherung und tatsächliche CPU-/DSP-Ersparnis in Ableton sind noch
nicht verifiziert.

- [Bedienung, Architektur und Grenzen](random-motion-v3/README.md)
- [Analyse und Prüfbericht](random-motion-v3/VALIDATION.md)
- [Quellcode und Tests](random-motion-v3)

V3 allein benötigt Node.js 20+ und Python 3.10+, ohne zusätzliche Pakete.
Der gemeinsame Lauf `npm run check` prüft alle drei Projekte und benötigt für
All zusätzlich einen C++17-Compiler. Generierte Dateien liegen in `dist/`,
`random-motion-v3/dist/` und `all/dist/`.

Der frühere Einzelparameter-Prototyp **Set and Forget Chaos** bleibt erhalten:
[Anleitung](SET_AND_FORGET_README.md),
[alte Geräte-Datei](Set-and-Forget-Chaos.amxd).
