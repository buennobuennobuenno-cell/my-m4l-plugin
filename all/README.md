# All 2.0.0

Eigenständiger Max-for-Live-Audioeffekt mit genau einem Dry/Wet-Regler.
Die einzelne Datei `All.amxd` enthält alle Laufzeitressourcen.
In Live als **neue Geräteinstanz** laden; eine bestehende All-1.0-Instanz
wird dadurch nicht ersetzt. Für Live mit Max for Live und Max 8.5+ vorgesehen.

## Bedienung und Oberfläche

Dry/Wet: 0–100 %, Startwert **10 %**, im Live-Set speicherbar und automatisierbar.
0 % gibt gültiges Eingangsaudio unverändert aus. 100 % gibt nur den bearbeiteten
Anteil aus. Die Zufallssteuerung und Eingangshistorie laufen auch bei 0 % weiter.

80 Pixel Gerätebreite, ein normal großes natives `live.dial`, ohne zusätzlichen
Titel, Anzeigen, Mapping-Buttons oder Animationen. Neutraler mittelgrauer
Hintergrund (#8D8D8D, optisch an der Align-Delay-Referenz orientiert), dunkler
Regler und hellblauer/türkiser Wertbogen. Keine eigenen Schriftvorgaben.
Lives Geräte-Kopfzeile und Auswahlmarkierung bleiben Sache des Hosts.
Die exakte Darstellung ist hier nicht nativ in Live überprüft.

## Audiokern

Ein eingebettetes `gen~` und **ein eingangsgespeister Stereo-Ringpuffer**.
Ein Delay-Puffer ist nur der Kurzzeitspeicher für die Verzögerung. Eine
Ausleseposition bedeutet „so viele Samples hinter dem aktuellen Eingang“.
Das eingehende Audio läuft laufend weiter; es wird keine Audiodatei abgespielt
und kein zusätzlicher Ton erzeugt.

Je Ausgang werden beide Eingangskanäle an einer eigenen ganzzahligen
Zeitposition gelesen. Eine nichtnegative Stereo-Matrix verteilt sie anschließend.
Damit kann auch ein ausschließlich links vorhandener Eingang rechts erscheinen,
mit einer anderen Verzögerung als am linken Ausgang. Separate Abschwächung links
und rechts; die Summe aller Audio-Gewichte ist je Ausgang höchstens 1.

Dry/Wet ist ebenfalls eine nichtnegative Mischung mit Gewichtssumme 1.
Daher überschreitet der Ausgang rechnerisch nicht den größten Betrag des
jeweils verwendeten Eingangsmaterials, bis auf Gleitkomma-Rundung.
Ein früher lautes Sample darf lauter als der aktuelle Eingang sein.
Diese Grenze gilt innerhalb des Geräts; ein extern parallel addiertes
Audio-Rack kann den Gesamtpegel trotzdem erhöhen. Bereits übersteuerter
Eingang wird durch diese Konstruktion nicht automatisch repariert.

Verzögerung: 0–2 Sekunden bei 8–192 kHz; kleinste Stufe **ein Sample**,
keine Fractional-Delay-Interpolation. Höhere Abtastraten bleiben adresssicher,
die Historie ist dann zusätzlich auf 524.287 Samples begrenzt.
Noch nicht vorhandene Historie ergibt Stille. Nach Ende des Eingangs wird
spätestens nach Ablauf der maximal zugänglichen Verzögerung auch der Wet-Pfad
still. Ein Abtastratenwechsel verwirft die alte zugängliche Historie, ohne
den ganzen Speicher im Audio-Thread zu löschen oder neu anzulegen.

Kein Ausgangsaudio wird in den Speicher zurückgeführt.
**Keine Rückkopplung, Verstärkung über 1, negative Audio-Gains, Sättigung,
Clipping-Kennlinie, Wavefolding, Amplitudenquantisierung, FFT, Oversampling,
additive Rauschquelle oder Audiooszillator.** Die Kontrollwerte haben ein
endliches digitales Raster; das ist keine Quantisierung des Audiosignals.

Nicht endliche Eingangswerte und Eingangsbeträge über 64 werden vor dem
Speichern verworfen. Es gibt keinen Ausgangslimiter oder Audio-De-Clicker.
Harte Modulations-/Delay-Sprünge dürfen klicken oder rauschähnlich klingen;
schnelle Modulation kann neue hörbare Frequenzanteile erzeugen.

## Zufall: Wiederholungen erlaubt, keine Bevorzugung kleiner Änderungen

Sechs voneinander getrennte Steuerzustände für zwei Abschwächungen, zwei
Stereo-Mischverhältnisse und zwei Verzögerungen. Keine Audioanalyse, Trigger,
Tempo-Synchronisation, vorbereiteten Szenenfolgen oder Vermeidung von Wiederholungen.

- Gain- und Mischziele: direkte gleich breite Auswahlintervalle über 65.536
  Kontrollwerte einschließlich 0 und 1.
- Delayziele: direkte gleich breite Auswahlintervalle über alle erlaubten
  ganzzahligen Samplepositionen.
- Ereignisabstände und Übergangsdauern: getrennte Ziehungen aus direkten
  gleich breiten Sampleintervallen von einem Sample bis zwölf Sekunden.
- Kurvenfamilien: halten/hart, linear, weich gekrümmt, gestuft, Dreiecksbewegung
  und sampleweise Zufallswerte; jede Familie hat ein gleich breites Auswahlintervall.
  Während der sampleweisen Familie wird bei jedem Sample ein neues Ziel gezogen.
- Keine Potenzgewichtung zugunsten kleiner Werte, kein bevorzugter Random Walk,
  keine Sonderwahrscheinlichkeit für Null/Identität, keine verkürzten Noise-Bursts.
- Identische Ziele, Zeiten und Kurven dürfen beliebig oft erneut gewählt werden.
  Es gibt keine Bedingung „muss sich ändern“. Neue Ereignisse dürfen auch laufende
  Übergänge unterbrechen. Links/rechts laufen unabhängig; ähnliche oder
  gegenläufige Abschnitte werden nicht als vorgeschriebene Szene erzeugt.

Die diskreten Bins sind gleich breit. Wegen des endlichen PRNG-Rasters ist dies
keine Behauptung exakt identischer Wahrscheinlichkeiten aller Bitmuster.
Interpolierte Kurvenwerte und komplette Zeitverläufe sind nicht gleichverteilt;
eine Gleichverteilung über sämtliche denkbaren Verläufe existiert hier nicht.

Die kombinierte ecuyer1988-Folge ist **Pseudozufall mit endlichem Zustand**.
Beim Laden kommt einmal ein neuer Seed aus Zeitstempel und JavaScript-Zufall.
Gleicher Test-Seed bedeutet reproduzierbaren Ablauf. Physikalischer Zufall,
kryptografische Sicherheit, absolute Unvorhersehbarkeit, ein Bernoulli-System
oder jede denkbare endliche Folge werden nicht zugesichert. JavaScript läuft
nicht im Audiotakt.

## Gegenüber All 1.0

Entfernt: zweiter Stereo-Puffer, drei gemischte Effektanordnungen, zusätzliche
Kennlinien, Drive, Rückkopplung, Audio-Polaritätswechsel und bis zu vierfache Gains.
Die bisherige Tabelle „numerisch endlich“ war keine ausreichende Pegelprüfung.

Der Audio-Puffer benötigt jetzt **8 statt 16 MiB** bei gleicher fester Länge.
Höchstens vier gepufferte Lese- und zwei Schreibzugriffe pro Stereo-Sample.
Keine laufenden Live-API-Abfragen, GUI-Zeichenschleifen oder neuen Pufferobjekte.

## Bauen und Prüfen

Node.js 20+, Python 3.10+, C++17-Compiler; keine zusätzlichen Projektpakete.

```sh
python3 all/test.py
python3 all/test.py --sanitize
python3 all/test.py --benchmark
python3 all/build.py
npm run check
```

Buildausgaben: `all/dist/All.amxd`, `All.maxpat`, `all_seed.js`.
Die Root-Datei `All.amxd` wird nach erfolgreicher Prüfung separat aktualisiert.
`all/reports/` enthält ignorierte generierte Modell- und Messdateien.

Die Pakettests prüfen Archiv, eingebettete Ressourcen, Verbindungen,
Dry/Wet-Start/Restore und die einzige sichtbare Bedienfläche.
Die Signaltests prüfen insbesondere die Eingangshistorien-Pegelgrenze,
nichtnegative Stereo-Mischung, Links-Rechts-Übertragung, unabhängige Delays
derselben Quelle, ganze Samplepositionen, Ring-Wrap, endliche Nachläufe,
keine Wiederholungsunterdrückung, Verteilungsplausibilität, Stille, ungültige
Werte, Re-Seeding und Abtastratenwechsel.

`tools/native_model.py` übersetzt die tatsächlich ausgelieferten GenExpr-
Anweisungen in einen eingeschränkten C++-Prüfhost mit geprüften Data-Adressen.
Das ist **nicht Cycling '74s Gen-Compiler**. Ergebnisse und ausdrücklich
ungetestete Hosteigenschaften stehen in [validation/results.json](validation/results.json).

Hier stehen Max und Ableton nicht zur Verfügung. Natives Gen-Kompilieren,
Laden der AMXD, Darstellung, Set-Wiederherstellung, Audio-Host-Lebenszyklus und
M1-DSP-Verbrauch müssen in Live überprüft werden. Die bisherigen etwa 6 %
werden nicht als gemessen oder garantiert ausgegeben. Modell-Benchmarks sind
keine Ableton-CPU-Anzeige und kein Nachweis von Absturzfreiheit.
