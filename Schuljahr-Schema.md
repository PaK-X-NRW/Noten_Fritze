# Ein Schuljahr im Noten-Fritze – Schritt für Schritt

Trockendurchlauf mit drei Beispiel-Schüler/innen. Alle Zahlen sind **echt
nachgerechnet** nach den Regeln, die ab Version 1.8.0 im Code stehen.
Dieselbe Struktur steckt in der Beispielklasse **„9a (Musterjahr)“**
(Einstellungen → Beispielklassen anlegen), dort mit anderen Namen und
Zufallsnoten.

**Klasse 9a · Mathematik · Hauptfach (50 % schriftlich / 50 % sonstige) · Schuljahr 2025/26**

| Kategorie | Art | Gewicht | Herkunft der Noten |
|---|---|---|---|
| Klassenarbeit | schriftlich | 1 | von Hand |
| Mündliche Mitarbeit | sonstige | 2 | aus „Quartal abschließen“ |
| Test | sonstige | 2 | von Hand |
| HÜ | sonstige | 1 | von Hand |
| Hausaufgaben | sonstige | – | nur Zählung, zählt nicht in die Note |

| Schüler/in | Typ |
|---|---|
| Anna Bauer | meldet sich viel, gute Arbeiten |
| Ben Fischer | wechselhaft, vergisst öfter die Hausaufgaben |
| Clara Weber | sehr still, eine Leistungsverweigerung |

Quartale: **Q1** Aug–Okt · **Q2** Nov–Jan · **Q3** Feb–Apr · **Q4** Mai–Jul.
1. Halbjahr = Q1 + Q2 · 2. Halbjahr = Q3 + Q4.

---

## Schritt 1 · Die einzelne Stunde → eine Stundennote

**Ansicht: Tracker** (Klasse öffnen → „▶︎ Tracker“). Du tippst auf die Kacheln,
die App zählt Punkte.

Punkte je Ereignis: Wortmeldung **+1** · gute Meldung **+2** · sehr gute Meldung **+3** ·
Störung **−2** · vergessene HA **−1** · Verweigerung 🚫 = diese Stunde zählt als **6** ·
abwesend = dieser Tag zählt für die Person gar nicht.

Am Ende der Stunde übersetzt die App die Punkte **dieser einen Stunde** in eine
Stundennote (Schwellen aus den Einstellungen, seit 1.8.0 auf ganze Punkte gelegt):

| Punkte in der Stunde | ab 3 | ab 2 | ab 1 | ab 0 | ab −1 | darunter |
|---|---|---|---|---|---|---|
| **Stundennote** | 1 | 2 | 3 | 4 | 5 | 6 |

In der Praxis heißt das: sehr gute Meldung = **1** · gute Meldung = **2** ·
Wortmeldung = **3** · stille Stunde = **4** · vergessene HA = **5** · Störung = **6**.

**Doppelstunde:** Sie zählt wie zwei Einzelstunden. Die Punkte werden dafür auf
45 Minuten umgerechnet – wer sich in 90 Minuten einmal gut meldet (2 Punkte),
kommt auf 1 Punkt je Stunde und bekommt **zweimal die Note 3**; in einer
Einzelstunde wäre dieselbe Meldung eine 2. In der doppelten Zeit zählt also auch
die doppelte Gelegenheit.

Beispielstunde am Dienstag, 16.09.:

| Schüler/in | erfasst | Punkte | Stundennote |
|---|---|---|---|
| Anna | 1× sehr gute Meldung | +3 | **1** |
| Ben | 1× Wortmeldung, 1× Störung | +1 −2 = −1 | **5** |
| Clara | nichts | 0 | **4** |

---

## Schritt 2 · Viele Stundennoten → Mitarbeitsnote des Quartals

**Ansicht: Reiter „Mitarbeit“**, oben Quartal „1. Q“. So sieht die Tabelle nach
20 gehaltenen Stunden im 1. Quartal aus (Anna und Clara haben je einen Tag
gefehlt, für sie zählen 19 Stunden):

| Name | Meld. | Punkte | Stunden | Zuletzt | Vorschlag | Note | Aufschlüsselung |
|---|---|---|---|---|---|---|---|
| Bauer, Anna | 17 | 38 | 19 | vor 2 Tagen | **2** | 2 | 4× Meldung · 5× gut · 8× sehr gut |
| Fischer, Ben | 7 | 4 | 20 | vor 5 Tagen | **4+** | 4+ | 5× Meldung · 2× gut · 1× Störung · 3× keine HA |
| Weber, Clara | 4 | 3 | 19 | vor 9 Tagen | **4** | 4 | 3× Meldung · 1× gut · 1× Störung · 1× Verweigerung |

- „Meld.“ zählt nur echte Wortmeldungen; Störungen, vergessene Hausaufgaben und
  Verweigerungen stehen in der Aufschlüsselung.
- **Vorschlag** ist der Ø der Stundennoten, gerundet auf eine echte Note (2, 4+,
  3-) – genau der Wert, mit dem der Abschluss-Dialog vorbelegt wird. Der exakte Ø
  (Anna 2,0 · Ben 3,8 · Clara 3,9) steht im Tooltip; ein Tipp auf die Note zeigt
  die ganze Herleitung.
- **Note** ist die beim Quartalsabschluss tatsächlich übertragene Note – nur sie
  geht in die Epochalnote ein. Vor dem Abschluss steht dort „–“. In der Oberstufe
  stehen hier MSS-Punkte, während der Vorschlag eine Note 1–6 bleibt.

So kommen die Vorschläge zustande (Tipp auf den Vorschlag zeigt genau das):

| Schüler/in | Stundennoten im Quartal | Ø |
|---|---|---|
| Anna | 8× **1** · 5× **2** · 4× **3** · 2× **4** (still) | 38 ÷ 19 = **2,0** |
| Ben | 2× **2** · 5× **3** · 9× **4** (still) · 3× **5** (keine HA) · 1× **6** (Störung) | 76 ÷ 20 = **3,8** |
| Clara | 1× **2** · 3× **3** · 13× **4** (still) · 1× **6** (Störung) · 1× **6** (Verweigerung) | 75 ÷ 19 = **3,9** |

---

## Schritt 3 · Quartal abschließen

**Ansicht: Reiter „Mitarbeit“ → Knopf „Quartal abschließen“.** Der Vorschlag ist
als echte Note vorbelegt, aber überschreibbar; die Spalte „Vorschlag“ zeigt den
genauen Ø:

| Name | Vorschlag | Note (Eingabefeld) | Lehrkraft trägt ein |
|---|---|---|---|
| Bauer, Anna | 2,0 | `2` (vorbelegt) | **2** übernommen |
| Fischer, Ben | 3,8 | `4+` (vorbelegt) | **4+** übernommen |
| Weber, Clara | 3,9 | `4` (vorbelegt) | **4** übernommen |

Ergebnis: **eine** Spalte „Mitarbeit 1. Quartal“ mit genau einer Note pro Person.
Wird ein Quartal ein zweites Mal abgeschlossen, sind die Felder mit der bereits
übertragenen Note vorbelegt – nicht mit dem Rohvorschlag.

---

## Schritt 4 · Reiter „Mitarbeit“ nach dem Abschluss

Stunden und Meldungen bleiben erhalten, die Ansicht wird grau und gesperrt:

```
┌────────────────────────────────────────────────────────────────────┐
│  [Gesamt] [30 Tage] [7 Tage]     [1. Q] [2. Q] [3. Q] [4. Q] [Jahr]│
│                                  [Schwellen] [Abschluss aufheben]  │
│                                                                     │
│  🔒 1. Quartal abgeschlossen am 24.10.2025. Die Noten stehen in     │
│     der Notenübersicht; Stunden und Meldungen bleiben zur Ansicht   │
│     erhalten. Für dieses Quartal lässt sich kein Tracker starten.   │
│                                                                     │
│  ░ Name          ░ Meld. ░ Punkte ░ Stunden ░ Vorschlag ░ Note ░    │  ← grau
│  ░ Bauer, Anna   ░ 17    ░ 38     ░ 19      ░ 2         ░ 2    ░    │
│  ░ Fischer, Ben  ░ 7     ░ 4      ░ 20      ░ 4+        ░ 4+   ░    │
│  ░ Weber, Clara  ░ 4     ░ 3      ░ 19      ░ 4         ░ 4    ░    │
└────────────────────────────────────────────────────────────────────┘
```

Der Tracker verweigert für dieses Quartal den Start. „Abschluss aufheben“ macht
alles wieder normal; die übertragene Note bleibt dabei stehen.

---

## Schritt 5 · Reiter „Noten“, 1. Halbjahr

Die Spalten der Mitarbeit sind ausgeblendet – pro Quartal steht dort die
Epochalnote:

| Name | KA 1 | KA 2 | Test 1 | HÜ 1 | HA 1. Q | **Epochalnote 1** | Test 2 | HÜ 2 | HA 2. Q | **Epochalnote 2** | Schriftl. | Sonstige | **Zeugnis 1. HJ** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Anna | 2 | 2+ | 2 | 1- | – | **2** | 2+ | 2 | – | **2+** | 2 | 2 | **2** |
| Ben | 4 | 3- | 3 | 4 | 3× | **3-** | 3- | 3 | 2× | **3-** | 4+ | 3- | **3** |
| Clara | 5 | 4- | 4- | 5 | 1× | **4-** | 4 | 4- | – | **4-** | 5+ | 4- | **4-** |

Die Mitarbeitsnote ist damit **nicht verschwunden** – sie steckt weiterhin
doppelt gewichtet in jeder Epochalnote und ist über den Namen erreichbar
(Schritt 6). Verwendet wurden: Mitarbeit Q1 = 2 / 4+ / 4, Q2 = 2+ / 4+ / 4-.

### Die Rechnung dahinter (Beispiel Anna)

| Schritt | Rechnung | Ergebnis |
|---|---|---|
| Epochalnote 1 | (Mitarbeit 2,0 ×2 + Test 2,0 ×2 + HÜ 1,3 ×1) ÷ 5 = 1,86 | **2** |
| Epochalnote 2 | (Mitarbeit 1,7 ×2 + Test 1,7 ×2 + HÜ 2,0 ×1) ÷ 5 = 1,76 | **2+** |
| Sonstige Leistungen 1. HJ | Ø der **gerundeten** Epochalnoten: (2,0 + 1,7) ÷ 2 = 1,85 | **2** |
| Schriftliche Leistungen 1. HJ | (KA 2,0 + KA 1,7) ÷ 2 = 1,85 | **2** |
| Zeugnisnote 1. Halbjahr | 50 % × 2,0 + 50 % × 2,0 = 2,0 | **2** |

Zwei Rundungsregeln, die man kennen muss:
- **Zwischennoten** (Epochalnote, Schriftlich, Sonstige) laufen auf Dritteln
  (2+, 2, 2-). Liegt ein Wert genau in der Mitte, gewinnt die **schlechtere**
  Note – bei Anna wird aus 1,85 deshalb eine glatte 2 und keine 2+.
- **Zeugnisnoten** sind ganze Noten, einzige Tendenz 4-. Genau auf der Grenze
  gewinnt die **bessere** Note: Ben landet bei (4+ und 3-) → 3,5 und bekommt
  eine **3**, Clara bei 4,5 und bekommt eine **4-**.

---

## Schritt 6 · Schüler-Detail (Tipp auf den Namen)

**Ansicht: Reiter „Noten“ → auf den Namen tippen.** Zeigt die Rechnung von oben
Zeile für Zeile – und darunter die Korrekturmöglichkeit für die Mitarbeitsnote:

```
┌──────────────────────────────────────────────┐
│  Anna Bauer                                  │
│                                              │
│  Schriftliche Leistungen – Ø 1,85 · 50 %     │
│    Klassenarbeit (Gew 1, 2 Noten)       1,85 │
│    gerundet                                2 │
│                                              │
│  Epochalnote 1 (1. Quartal) – Ø 1,86         │
│    Mündliche Mitarbeit (Gew 2, 1 Note)   2,0 │
│    Test (Gew 2, 1 Note)                  2,0 │
│    HÜ (Gew 1, 1 Note)                    1,3 │
│    gerundet                                2 │
│  …                                           │
│  ─────────────────────────────────────────── │
│  Zeugnisnote 1. Halbjahr                   2 │
│                                              │
│  Mitarbeitsnote je Quartal                   │
│    1. Quartal  [ 2  ]   2. Quartal  [ 2+ ]   │
│         [Schließen] [Mitarbeitsnoten speichern]│
└──────────────────────────────────────────────┘
```

Leer speichern entfernt die Note – dann gilt das Quartal in der Notenübersicht
wieder als offen und die Epochalnote zeigt „⋯“.

---

## Schritt 7 · 2. Halbjahr und Jahresnote

**Ansicht: Reiter „Noten“ → oben „2. Halbjahr“.** Gleiche Tabelle, dazu ganz
rechts eine Spalte mehr:

| Name | KA 3 | KA 4 | **Epochalnote 3** | **Epochalnote 4** | Schriftl. | Sonstige | **Zeugnis 2. HJ** | **Zeugnis Jahr** |
|---|---|---|---|---|---|---|---|---|
| Anna | 2+ | 1- | **2+** | **2+** | 2+ | 2+ | **2** | **2** |
| Ben | 3 | 3- | **3-** | **3** | 3- | 3- | **3** | **3** |
| Clara | 4- | 4 | **4-** | **4-** | 4- | 4- | **4-** | **4-** |

Die Jahresnote gewichtet 49 % erstes und 51 % zweites Halbjahr – bei Gleichstand
gibt also das zweite den Ausschlag. Stünde bei Ben im 1. Halbjahr eine 4 und im
2. eine 3, ergäbe das 0,49 × 4 + 0,51 × 3 = 3,49 → **3**.

---

## Dasselbe in der Oberstufe (MSS-Punkte)

**Klasse „Mathematik LK 12“, Klassenstufe 12** – identischer Ablauf, aber
Punkte 0–15 statt Noten, und die Reiter heißen **12.1 / 12.2** statt
1./2. Halbjahr. Eine Jahresnote gibt es dort nicht: jedes Kurshalbjahr ist eine
eigene Endnote.

| Name | Kursarbeit 1 | Kursarbeit 2 | **Epochal 1** | **Epochal 2** | Schriftl. | Sonstige | **Zeugnis 12.1** |
|---|---|---|---|---|---|---|---|
| Lena | 12 | 11 | **11** | **12** | 12 | 12 | **12** |
| Tim | 8 | 9 | **7** | **8** | 9 | 8 | **9** |
| Sofia | 4 | 5 | **4** | **5** | 5 | 5 | **5** |

Lenas Epochalnote 1: (Mitarbeit 11 ×2 + Test 10 ×2) ÷ 4 = 10,5 → **11**. Bei
genau x,5 wird in der Oberstufe durchgehend auf die **größere** Punktzahl
gerundet – für Zwischen- und Endnoten gleichermaßen.

Der Mitarbeits-Tracker rechnet auch hier intern in Schulnoten 1–6. Angezeigt und
im Abschluss-Dialog vorbelegt wird der Vorschlag aber in **Punkten** – über die
offizielle Umrechnung:

| Note | 1+ | 1 | 1- | 2+ | 2 | 2- | 3+ | 3 | 3- | 4+ | 4 | 4- | 5+ | 5 | 5- | 6 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Punkte** | 15 | 14 | 13 | 12 | 11 | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |

Ein Stundennoten-Ø von 2,7 („3+“) wird also zu **9 Punkten**. Die Herleitung
(Tipp auf den Vorschlag) zeigt den ganzen Weg. Nur die 15 (= 1+) kommt nie
automatisch zustande, weil die Notenskala der App bei 1,0 endet – die trägst du
selbst ein.

---

## Was aus dem ersten Durchgang geworden ist

Dieser Trockendurchlauf hat vier Dinge sichtbar gemacht, die mit Version 1.8.0
alle behoben sind:

1. **Die Notenschwellen passten nicht zum Stundennoten-Modell.** Sie stammten
   aus der Zeit, als sie auf den Ø aller Stunden angewandt wurden. Pro
   Einzelstunde waren die Stufen 2 und 4 mit ganzen Punkten unerreichbar und
   eine stille Stunde ergab eine 5. Die Schwellen liegen jetzt auf ganzen
   Punkten (siehe Schritt 1). Wer eigene Werte eingestellt hatte, behält sie.
2. **„Noten-Ø“ und „Vorschlag“ zeigten denselben Wert** – die doppelte Spalte
   ist weg.
3. **„Meld.“ zählte auch Störungen und vergessene Hausaufgaben** – jetzt stehen
   dort nur noch echte Wortmeldungen.
4. **Die Oberstufe rundete uneinheitlich** (Zwischenergebnisse ab, Endnoten
   auf) – jetzt wird überall bei x,5 aufgerundet.
