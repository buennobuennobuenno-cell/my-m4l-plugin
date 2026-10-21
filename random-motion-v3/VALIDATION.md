# Analyse und Prüfbericht — Random Motion 16 / V3

Stand: 22. Oktober 2026. Ausgangspunkt ist die angehängte Datei
`Random_Motion_16 (1).amxd`, intern **v4.1**. V3 bezeichnet diese neue Iteration.
Maschinenlesbare Ergebnisse: [validation/results.json](validation/results.json).

## Hintergrund und erhaltene Anforderungen

Das PDF dokumentiert acht Versionen: zunächst acht Mappings, später zwölf mit
einem eigenen Gen-Kurvenkern, schließlich 16 mit ereignisgesteuerten nativen
Rampen. Frühere Zusatzregler wurden zugunsten von Map, Min und Max entfernt.
Im Hintergrund steht das Rack mit Auto Pan und Align Delay zur Variation von
Amplitude, Zeit und Stereo. Mit „Auto Align“ ist in diesem Kontext Align Delay
gemeint. Die beiden Effekte selbst sind nicht Bestandteil dieses Modulators.

Das PDF enthält neben dem lesbaren Verlauf ein eingebettetes Projekt-ZIP.
Alle **133 Projektdateien** wurden gegen dessen SHA-256-Manifest geprüft.
Das angehängte Gerät ist bytegleich mit der archivierten v4.1; auch seine drei
eingebetteten Skripte stimmen exakt überein. Die historischen Gesprächs- und
Übergabetexte wurden als Hintergrund gelesen, nicht als neue Arbeitsaufträge.
Das Gesprächs-PDF und die ursprünglichen Textanhänge werden nicht veröffentlicht.

Die zeit- und amplitudenbezogene Rack-Idee begründet den gewünschten Modulator.
Sie ist kein Nachweis, dass ein endliches Delay-/Amplitude-Rack sämtliche
Audioeffekte oder physikalischen Veränderungen erzeugen könnte. Für die
Implementierung zählen die konkreten Parameter, ihre API-Bereiche und die
unabhängigen Zufallsfolgen.

Erhalten bleiben 16 Mappings auf derselben Spur, eigene Zufallszustände und
Termine je Slot, sofortiger Start nach Mapping, ausschließlich Min/Max als
weitere Bedienung, genaue Dezimalwerte unter einer ganzzahligen Anzeige,
unterbrechbare native Rampen, Sprünge und gültige diskrete Zustände. Es gibt
keine neue Rate-Begrenzung, keine gröbere Auflösung und keinen zusätzlichen
festen Modulationstakt. Die ursprüngliche Wahrscheinlichkeitsverteilung bleibt
erhalten. Eine neue Datei aktualisiert alte Live-Instanzen nicht automatisch.

## Befund und Umsetzung

| Befund in v4.1 | Umsetzung in V3 |
|---|---|
| Der eigene Kurven-DSP ist schon entfernt. | Native Zielwert-/Daueraufträge beibehalten; keine eigene Signal- oder Kurvenkette ergänzt. |
| 32 JSUI-Zahlenfelder plus 32 verborgene Flonum-Editoren und separate Nachrichtenwege. | Ein gemeinsames JSUI und ein beweglicher Editor für alle 32 Grenzen. |
| Der Scheduler durchsucht alle 16 Slots beim Auslösen und erneut beim Planen. | Sortierte Liste der tatsächlich bewegten Slots; ein Durchlauf erledigt beide Aufgaben. |
| Jede abgelaufene Einmal-Task wird nochmals abgebrochen. | Im normalen Callback kein zusätzliches `Task.cancel()`. |
| Laufende Diagnoseanzeige sucht Oberflächenobjekte und setzt Text. | Keine periodischen GUI-Nachrichten. Statusänderungen und Fehler bleiben sichtbar. |
| Bypass/Zustandswechsel planen innerhalb jeder einzelnen Freigabe neu. | Zusammenhängende Änderungen bündeln die Neuplanung. |
| Derselbe Min/Max-Wert löst einen neuen Zufallsauftrag aus. | Unveränderte Werte sind wirkungslos; keine unnötige Zustandsbenachrichtigung. |
| Neue LiveAPI-Handles ersetzen alte ohne ausdrückliche Ablösung; alte Callbacks können noch reagieren. | Alte Handles abmelden und auf ID 0 setzen; Rückmeldungen müssen zum aktuellen Handle und Ziel passen. |
| Nur die nächste Geräte-Chain wird strukturell beobachtet. | Übergeordnete Chains/Racks/Spuren einbeziehen, ohne Parameterwerte zu beobachten. |
| Bei einem Kontextwechsel ist keine ausdrückliche Wiederanbindung des bestehenden Remotes vorgesehen. | Nativer Kontextmelder und gezielte Wiederanbindung mit geschätzter aktueller Position und Restdauer; Zufallszustand/Termin bleiben erhalten. |
| Umbenennungen können gespeicherte Signaturen veralten lassen. | Namensänderungen getrennt beobachten und Metadaten aktualisieren. |
| Fehler im GUI-Zugriff können laufende Steuerung unterbrechen. | UI-Ausnahmen abfangen und ungültige Objekt-Caches verwerfen. |
| Zustandsdaten prüfen Pfadbestandteile nur grob. | Lokale Pfadtokens validieren; ungültige Zustandsversionen lassen den vorhandenen Zustand unangetastet. |
| Cleanup hängt am JavaScript-Lebenszyklus. | Zusätzlich ein expliziter `freebang`-Pfad zu `notifydeleted`. |

Bei der Überarbeitung wurden außerdem zwei Zustandsrandfälle getestet und
behandelt: Das Laden eines leeren Zustands muss die Anzeige sofort auf BEREIT
setzen; eine fehlgeschlagene native Freigabe darf beim Zustandswechsel nicht
aus der Fehleranzeige verschwinden und kann erneut versucht werden.

Zusätzliche Namens- und Strukturbeobachter reagieren auf Bearbeitungsvorgänge.
Sie erhöhen dort bewusst die Kontrollarbeit, damit Referenzen aktuell bleiben.
Sie beobachten keine laufenden Parameterwerte und erzeugen keinen eigenen DSP.

## Messbare Reduktion

| Statische Größe | v4.1 | V3 |
|---|---:|---:|
| Max-Objekte | 215 | 95 |
| JSUI-Objekte | 32 | 1 |
| native Zahleneditoren | 32 | 1 |
| `live.remote~` | 16 | 16 |
| AMXD-Dateigröße | 198.241 Bytes | 106.476 Bytes |

Der Codec und die eingebetteten Ressourcen werden unabhängig gelesen und
geprüft. Weniger Objekte und eine um 46,3 % kleinere Datei belegen keine gleich
große Ersparnis von CPU, DSP oder Speicher. Die nativen Fernsteuerungen und die
Zieleffekte benötigen weiterhin Verarbeitung.

Zusätzlich wurden jeweils **20.000 Scheduler-Aufrufe** instrumentiert. Gezählt
wurden Zugriffe auf das Slot-Array und Aufrufe der nachgebildeten Max-Schnittstelle;
es handelt sich nicht um Zeitmessungen in Max oder Ableton.

| Bewegte Slots | Slot-Zugriffe v4.1 → V3 | Native Wertaufträge je Version | Task-Abbrüche v4.1 → V3 | GUI-Nachrichten v4.1 → V3 |
|---|---:|---:|---:|---:|
| 1 | 734.433 → 40.000 | 20.000 | 20.000 → 0 | 2.153 → 0 |
| 4 | 822.903 → 100.037 | 20.037 | 20.000 → 0 | 718 → 0 |
| 16 | 1.300.385 → 340.186 | 20.186 | 20.000 → 0 | 199 → 0 |

Während dieser Läufe führten beide Versionen keine Live-API-Abfragen aus.
Anzahl der Timer-Planungen und Uhrabfragen blieb gleich. Die tatsächliche
Native-Ausgabe und DSP-Ausführung wurden dabei nicht ausgeführt.

## Testergebnisse

**71 V3-Prüfungen bestanden:** 61 JavaScript-Tests und 10 Python-Pakettests,
keine fehlgeschlagenen oder übersprungenen Tests. Der gemeinsame Projektlauf
prüfte zusätzlich die erhaltenen 35 Tests des früheren Einzelparameter-Prototyps:
**106 Prüfungen insgesamt**, beide Builds erfolgreich.

Die V3-Prüfungen umfassen:

- Zwei Vergleichsläufe mit jeweils 20.000 Task-Aufrufen, einmal stetige und
  einmal gemischte Ziele. In den geprüften Folgen waren sämtliche nativen
  Zielwert-/Dauernachrichten, Ereignistermine und PRNG-Zustände exakt wie v4.1.
  Entfernte nutzlose ID-0-Nachrichten an leere Slots werden dabei nicht als
  Wertaufträge betrachtet.
- 20.000 Ereignisse pro stetigem Slot und weitere 20.000 pro diskretem Slot:
  gleiche Regeln, verschiedene Verläufe, kurze/lange Rampen, Sprünge, gültige
  Schaltzustände; eine Korrelationsprüfung als Plausibilitätskontrolle.
- Gleiche normalisierte Verläufe für Hertz-, dB- und bipolare API-Bereiche bei
  gleichen Seeds und Startpositionen.
- **Acht Modellstunden:** 2.871.060 Ereignisse auf 16 getrennten Zuständen,
  ungefähr 99,69 Ereignisse/s insgesamt. Das ist ein reines Rechenmodell,
  kein achtstündiger Lauf von Ableton oder des nativen Schedulers.
- 2.000 simulierte Lebenszyklus-/Konfigurationsvorgänge mit Grenzen, Bypass,
  Löschen/Neumappen, Speicherzustand und Uhrzeitänderung.
- Alle 32 Zahlenfelder: richtige Zuordnung, Rundung, Einerschritte,
  genaue Tastatureingabe, beweglicher Editor, gekreuzte Grenzen und Tooltips.
- Fehlerisolation, leere/konstante Bereiche, veraltete Callbacks, ungültige
  Pfade, ungültige Uhrzeitwerte, Namensänderungen, Rack-Kopien und Rebind.
- Ressourcenintegrität, direkte Stereoverbindung, 16 native Remote-Wege,
  Zustandsspeicherung, Cleanup-Verkabelung und reproduzierbare Builds.

Die Bewegungsquelle ist weiterhin deterministischer ecuyer1988-Pseudozufall.
Statistische Plausibilität und lange Testfolgen beweisen weder absoluten Zufall
noch Absturzfreiheit. Im Archiv dokumentierte alte `@normalized`- und Gen-
Parserprobleme werden nicht wieder eingeführt. Gekrümmte Bewegung entsteht hier
aus aufeinanderfolgenden linearen Segmenten, nicht aus einem neuen Gen-Kern.

## Grenzen und Host-Abnahme

Hier steht Linux mit Node.js und Python zur Verfügung; Ableton Live und Max
fehlen. Deshalb bleiben das native Laden der Datei, die Darstellung, tatsächliche
Bedienung, native Referenzspeicherung und Audio-/DSP-Ausführung **ungetestet**.
Die Beobachter- und Kurvenmodelle sind keine Implementierung der Live-Laufzeit.
Die neue gebündelte GUI ist ein zusätzlicher Schwerpunkt für den ersten Hosttest.

In Live 11 zuerst eine neue Instanz in einem Test-Set einsetzen und prüfen:

1. Datei lädt ohne fehlende Objekte/Skripte; alle 16 Zeilen sichtbar.
2. Auto Pan und Align Delay: Mapping, native Einheiten, Bereichsgrenzen,
   stetige und quantisierte Modi, Dezimal-Eingabe in beiden Spalten.
3. Audio-Durchleitung, unterbrechbare Rampen, Bypass/Freigabe und Löschen.
4. Set speichern, schließen und neu öffnen; lokale Zuordnungen und Grenzen.
5. Rack duplizieren, neue Spur, Geräte/Ketten/Spuren verschieben, Ziel umbenennen,
   Ziel löschen und Undo. Bestehende externe Automation ebenfalls prüfen.
6. v4.1 und V3 unter gleichen Audio-, Ziel-, Puffer- und Sample-Rate-Bedingungen
   getrennt messen; Einfluss der Zielgeräte und geöffneter Oberfläche unterscheiden.

Die Rebind-Position ist eine Schätzung aus dem letzten Auftrag. Sie misst nicht
die samplegenaue native Position; Änderungen durch den Host können davon
abweichen. Identische Geräte-/Parametersignaturen und beliebige Umbauten sind
nicht immer eindeutig auflösbar. Eine konkrete CPU-/DSP-Prozentersparnis oder
ein vollkommen nicht abstürzbares Gerät wird nicht zugesichert.

## Reproduzieren

```sh
cd /workspace/my-m4l-plugin
npm run check
cd random-motion-v3
node tools/measure.cjs
RM16_MODEL_SECONDS=28800 RM16_REPORT_PATH=reports/long-model.json node --test tests/motion.test.cjs
```

Builds und aktuelle Messlogs werden in ignorierten Ausgabeverzeichnissen erzeugt.
Die eingefrorene Prüfzusammenfassung unter `validation/results.json` gehört zur
vorliegenden V3-Datei, einschließlich deren SHA-256. Ein neuer Testlauf ersetzt
diese Release-Zusammenfassung nicht automatisch.
