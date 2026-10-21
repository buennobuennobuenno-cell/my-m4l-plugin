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

Entwicklung: Node.js 20+, Python 3.10+, keine zusätzlichen Abhängigkeiten.
`npm run check` führt beide Projekt-Testgruppen aus und baut die Geräte.
Generierte Dateien liegen in `dist/` und `random-motion-v3/dist/`.

Der frühere Einzelparameter-Prototyp **Set and Forget Chaos** bleibt erhalten:
[Anleitung](SET_AND_FORGET_README.md),
[alte Geräte-Datei](Set-and-Forget-Chaos.amxd).
