# All 2.1.0

Eigenständiger Max-for-Live-Audioeffekt mit genau einem Dry/Wet-Regler.
Die einzelne Datei `All.amxd` enthält alle Laufzeitressourcen.
In Live als **neue Geräteinstanz** laden; eine bestehende All-1.0-/2.0-Instanz
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
Delayziele werden zwischen Ereignissen gehalten und frühestens nach 20 ms neu
gewählt. Es gibt keine kontinuierlichen Delayfahrten oder sampleweise zufälligen
Leseadressen. Diese Einschränkung betrifft die Modulationsgeschwindigkeit,
nicht die weiterhin ganzzahlige Ein-Sample-Auflösung der Verzögerung.
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
- Gain-/Panning-Ereignisabstände und Übergangsdauern: getrennte Ziehungen aus
  direkten gleich breiten Sampleintervallen von einem Sample bis zwölf Sekunden.
- Delay-Ereignisabstände: gleich breite Sampleintervalle zwischen 20 ms und
  zwölf Sekunden. Das Ziel bleibt bis zum nächsten Ereignis konstant.
- Fünf Gain-/Panning-Kurvenfamilien: halten/hart, linear, weich gekrümmt,
  gestuft und Dreiecksbewegung; jede hat ein gleich breites Auswahlintervall.
  Es werden keine neuen Zufallswerte zwischen Ereignissen gezogen.
- Keine Potenzgewichtung zugunsten kleiner Werte, kein bevorzugter Random Walk,
  keine Sonderwahrscheinlichkeit für Null/Identität, kein sampleweiser Rauschmodus.
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

## Korrektur gegenüber All 2.0

Der sampleweise Zufallsmodus konnte über mehrere Sekunden aus dem Eingangsaudio
Noise erzeugen, obwohl kein Rauschen addiert wurde. Er ist entfernt.
Auch das kontinuierliche Verändern ganzzahliger Delayadressen konnte das Material
stark umsortieren und rauschähnlich klingen; Delayzeiten werden nun gehalten.
Dies schränkt die vorher uneingeschränkt zugelassenen Modulationsverläufe bewusst
ein. Einzelne harte Wechsel können weiterhin klicken; ein beliebiges Eingangssignal
oder alle extremen Modulationsfolgen werden nicht als garantiert rauschfrei bezeichnet.

Ein Fünf-Sekunden-Sinustest mit Seed 3823 reproduziert den Fehler aus 2.0.
Er misst den Energieanteil des Sinus-Rekurrenzfehlers: vorher etwa 5,96254,
mit der Korrektur etwa 0,000000640. Das ist ein gezielter Modell-Regressionsnachweis,
keine allgemeine Klang- oder Native-Host-Zertifizierung.

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
Werte, Re-Seeding und Abtastratenwechsel. Dazu kommen der Fünf-Sekunden-
Noise-Regressionsfall, konstante Delayzeiten zwischen Ereignissen und der
abtastratenabhängige Mindestabstand der Delaywechsel.

`tools/native_model.py` übersetzt die tatsächlich ausgelieferten GenExpr-
Anweisungen in einen eingeschränkten C++-Prüfhost mit geprüften Data-Adressen.
Das ist **nicht Cycling '74s Gen-Compiler**. Ergebnisse und ausdrücklich
ungetestete Hosteigenschaften stehen in [validation/results.json](validation/results.json).

Hier stehen Max und Ableton nicht zur Verfügung. Natives Gen-Kompilieren,
Laden der AMXD, Darstellung, Set-Wiederherstellung, Audio-Host-Lebenszyklus und
M1-DSP-Verbrauch müssen in Live überprüft werden. Die bisherigen etwa 6 %
werden nicht als gemessen oder garantiert ausgegeben. Modell-Benchmarks sind
keine Ableton-CPU-Anzeige und kein Nachweis von Absturzfreiheit.
