# bamadi B2B-Portal — Technisches Konzept & Cursor-Implementierungsplan

**Stand:** März 2026 | **Projektroot:** bamadi-v2 | **Stack:** Vanilla JS + Supabase + bestehende bamadi-Infrastruktur

---

## Übersicht

Das B2B-Portal ist eine separate, passwortgeschützte Webanwendung auf `bamadi.de/partner` — für Unternehmen und Schulen die Abschlussarbeiten ihrer Studenten zentral verwalten, finanzieren und steuern wollen.

**Von außen sichtbar:** Nur ein unscheinbares Code-Feld im bamadi-Checkout (`"Haben Sie einen Aktionscode?"`)  
**Das Portal selbst:** Nicht indexiert, nicht in der Navigation, Zugang nur über Direktlink + Login.

---

## URL-Struktur

```
bamadi.de/partner              →  Login / Registrierung (nicht indexiert)
bamadi.de/partner/dashboard    →  Übersicht nach Login
bamadi.de/partner/gruppen      →  Gruppen & Studenten verwalten
bamadi.de/partner/codes        →  Codes generieren, versenden, drucken
bamadi.de/partner/abrechnung   →  Kostenübersicht & Rechnungen
bamadi.de/partner/einstellungen → Stammdaten, Kostenmodell, AGB-Zustimmung
```

---

## Nutzertypen

| Nutzertyp | Rolle |
|---|---|
| **Unternehmensadmin** | HR-Leiter oder Ausbildungsleiter. Richtet Account ein, definiert Kostenmodell, verwaltet Studenten und Gruppen, sieht Rechnungen. |
| **bamadi-Admin (intern)** | Holger / Team. Sieht alle Accounts, kann vorausfüllen, Accounts freischalten, Rechnungen generieren. |

---

## Onboarding-Prozess

### Registrierungs-Flow

1. Kunde ruft `bamadi.de/partner` auf (Link aus Musterbuch-Mailing oder persönlichem Gespräch)
2. Registrierung: Firmenname, Ansprechpartner, E-Mail-Adresse, Telefon
3. **E-Mail-Verifizierung: Magic Link via Supabase Auth** (kein Passwort nötig)
4. Stammdaten ergänzen: Rechnungsadresse, Steuernummer, bevorzugte Zahlungsweise
5. Kostenmodell wählen: Vollständig / Gedeckelt / Fixer Zuschuss (mit Live-Vorschau)
6. **AGB B2B lesen und aktiv bestätigen** (Checkbox + Timestamp in Supabase)
7. Account aktiv — erster Code kann generiert werden

### Vorausfüllen durch bamadi (optional)

Wenn bamadi den Account vorbereitet (z.B. nach persönlichem Gespräch mit EDAG): Stammdaten, Kostenmodell und erste Gruppe können bereits eingetragen sein. Kunde erhält dann einen Magic Link und muss nur noch prüfen, bestätigen und AGB akzeptieren.

### AGB B2B — Mindestinhalt (rechtlich zu prüfen)

- Vertragsgegenstand: bamadi erbringt Druckleistungen für vom Kunden benannte Nutzer (Studenten)
- Kostenmodell: Welches Modell gilt, Höhe der Übernahme, Limits
- Abrechnung: Monatliche Sammelrechnung, Zahlungsziel 14 Tage
- Haftung: Kunde haftet für korrekte Nutzerdaten, bamadi für Druckqualität
- Kündigung: Jederzeit mit 4 Wochen Frist, laufende Aufträge werden abgeschlossen
- Datenschutz: Nutzerdaten (Studenten) werden nur zur Auftragsabwicklung verwendet
- Kein Widerrufsrecht: Individuelle Fertigung gem. §312g Abs. 2 Nr. 1 BGB

---

## Gruppen & Studenten verwalten

### Gruppenkonzept

Eine Gruppe ist ein Jahrgang, eine Klasse, ein Studienprogramm. Ein Kunde kann beliebig viele Gruppen anlegen.

| Feld | Beschreibung |
|---|---|
| `group_name` | Frei wählbar: z.B. "Duales Studium BWL 2024" oder "Technikerschule Kurs A" |
| `submission_date` | Optional, wird im Dashboard angezeigt |
| `billing_model` | Kann pro Gruppe vom Account-Standard abweichen |
| `status` | `active` / `archived` |

### Studenten anlegen — drei Wege

**Weg 1: Manuell**
- Name, E-Mail, optionale Matrikelnummer eingeben
- System generiert automatisch einen persönlichen Code
- Code kann per E-Mail direkt vom Portal versandt werden

**Weg 2: CSV/XLS-Import**

```
Spalten (Mindest):  vorname | nachname | email
Optional:           matrikelnummer | gruppe | abgabedatum

Beispiel:
Max  | Mustermann | max@firma.de  | 12345 | BWL 2024 | 15.03.2025
Lisa | Schmidt    | lisa@firma.de | 12346 | BWL 2024 | 15.03.2025
```

- System validiert die Datei (fehlende Pflichtfelder, doppelte E-Mails)
- Preview vor dem Import: Kunde sieht was importiert wird
- Nach Import: Codes werden automatisch generiert
- Massenaktion: Alle Codes per E-Mail versenden in einem Klick

**Weg 3: Selbstregistrierung mit Gruppenlink** *(Phase 3 / optional)*
- Kunde verschickt einen Gruppenlink an seine Studenten
- Student registriert sich selbst mit Name + E-Mail
- Account-Inhaber muss Studenten freischalten (Vier-Augen-Prinzip)

### Studentenliste — Spalten

| Spalte | Inhalt |
|---|---|
| Name | Vor- und Nachname |
| Matrikelnummer | Optional |
| Gruppe | Zugehörigkeit |
| Code | Persönlicher Einlöse-Code (anzeigen / kopieren / versenden) |
| Wert | Betrag den das Unternehmen übernimmt |
| Status | `Noch nicht eingelöst` / `Eingelöst am TT.MM.JJJJ` |
| Auftragsnummer | Verknüpft mit dem bamadi-Auftrag wenn eingelöst |
| Betrag abgerechnet | Tatsächlicher Betrag der in Rechnung gestellt wird |

---

## Code-System

### Zwei Code-Typen

| Typ | Beschreibung |
|---|---|
| **Gruppencode** | Ein Code für alle Studenten einer Gruppe. Jeder der den Code kennt kann ihn nutzen — nur für geschlossene Gruppen sinnvoll. |
| **Persönlicher Code** | Individueller Code pro Student. Kann nur einmal eingelöst werden. Empfehlung für Corporate-Modell mit Kostenträger. |

### Code-Format

```
Format:   [PREFIX]-[RANDOM6]
Beispiel: EDAG-X7K2M9
          RMS-A3P8Q1

Prefix = aus Firmen-/Schulkürzel generiert (max. 6 Zeichen)
Random = 6 alphanumerische Zeichen (ohne 0, O, I, l — Verwechslungsvermeidung)
```

### Code versenden — drei Wege

1. **Direkt per E-Mail vom Portal:** Student erhält E-Mail mit Code und Link zu bamadi.de
2. **Als PDF-Liste:** Druckbare Übersicht aller Codes einer Gruppe
3. **Als CSV-Export:** Kunde kann Codes in eigenes System übernehmen

### Code-E-Mail an Studenten — Beispieltext

```
Betreff: Dein Druckcode für deine Abschlussarbeit — von [Firmenname]

Hallo [Vorname],

[Firmenname] übernimmt die Druckkosten für deine Abschlussarbeit.
Nutze dafür diesen persönlichen Code bei bamadi.de:

  Dein Code: EDAG-X7K2M9

Einfach auf bamadi.de konfigurieren, hochladen, Code eingeben — fertig.
Der Code ist persönlich und kann nur einmal eingelöst werden.

bamadi.de • hallo@bamadi.de • +49 661 480047-0
```

---

## Dashboard & Abrechnung

### Dashboard-Übersicht (Kundensicht)

| Element | Inhalt |
|---|---|
| KPI: Codes gesamt | Wie viele Codes wurden generiert |
| KPI: Eingelöst | Wie viele davon wurden bereits verwendet |
| KPI: Gesamtkosten lfd. Monat | Summe aller abzurechnenden Beträge |
| KPI: Offen / Abgerechnet | Status der Rechnungen |
| Letzte Aktivitäten | Welche Studenten haben wann bestellt |
| Schnellzugriff | Neue Gruppe / Code versenden / CSV importieren |

### Kostenübersicht

- Filter nach Gruppe / Jahrgang / Zeitraum / Status
- Summenzeile pro Gruppe und Gesamtsumme
- Export als CSV oder PDF

### Abrechnungsmodell

- **Kein Stripe für B2B** — Abrechnung auf Rechnung
- Monatliche Sammelrechnung am 1. des Folgemonats
- Zahlungsziel: 14 Tage
- Rechnung enthält: Datum, Studentenname (optional), Auftragsnummer, Arbeitgeberanteil, Studentenanteil, Gesamtsumme
- PDF-Generierung via `pdfmake` (bereits im System vorhanden)
- Gleichzeitig per E-Mail an Rechnungsempfänger

---

## Supabase-Datenbankstruktur

### Neue Tabelle: `b2b_accounts`

```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
company_name      text NOT NULL
account_type      text CHECK (account_type IN ('corporate','institutional'))
contact_name      text
contact_email     text UNIQUE NOT NULL
contact_phone     text
billing_address   jsonb    -- {street, city, zip, country}
tax_id            text
billing_model     text CHECK (billing_model IN ('full','capped','fixed','student_pays'))
cap_amount        integer  -- in Cent, nur bei 'capped'
fixed_amount      integer  -- in Cent, nur bei 'fixed'
agb_accepted_at   timestamptz
agb_version       text     -- z.B. '2026-03'
active            boolean DEFAULT false
notes             text     -- interne Notizen bamadi
created_at        timestamptz DEFAULT now()
created_by        text     -- 'self' oder 'bamadi'
```

### Neue Tabelle: `b2b_groups`

```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
account_id        uuid REFERENCES b2b_accounts(id)
group_name        text NOT NULL
description       text
submission_date   date
billing_model     text  -- optional: überschreibt Account-Modell
cap_amount        integer
fixed_amount      integer
status            text CHECK (status IN ('active','archived')) DEFAULT 'active'
created_at        timestamptz DEFAULT now()
```

### Neue Tabelle: `b2b_students`

```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
account_id        uuid REFERENCES b2b_accounts(id)
group_id          uuid REFERENCES b2b_groups(id)
first_name        text
last_name         text
email             text
matrikel_nr       text
code              text UNIQUE NOT NULL
code_type         text CHECK (code_type IN ('personal','group')) DEFAULT 'personal'
redeemed          boolean DEFAULT false
redeemed_at       timestamptz
order_id          uuid REFERENCES orders(id)
employer_amount   integer  -- tatsächlich übernommener Betrag in Cent
student_amount    integer  -- vom Student bezahlter Anteil in Cent
created_at        timestamptz DEFAULT now()
```

### Neue Tabelle: `b2b_invoices`

```sql
id                uuid PRIMARY KEY DEFAULT gen_random_uuid()
account_id        uuid REFERENCES b2b_accounts(id)
invoice_number    text UNIQUE
period_from       date
period_to         date
total_amount      integer  -- in Cent
pdf_path          text     -- Supabase Storage Pfad
sent_at           timestamptz
paid_at           timestamptz
status            text CHECK (status IN ('draft','sent','paid','overdue')) DEFAULT 'draft'
created_at        timestamptz DEFAULT now()
```

### Erweiterung bestehende `orders`-Tabelle

```sql
-- Neue Felder:
b2b_student_id    uuid REFERENCES b2b_students(id)   -- nullable
b2b_account_id    uuid REFERENCES b2b_accounts(id)   -- nullable
employer_amount   integer   -- Arbeitgeberanteil in Cent
student_amount    integer   -- Studentenanteil in Cent
```

---

## Edge Functions (neu)

| Function | Aufgabe |
|---|---|
| `validate-b2b-code` | Prüft ob Code gültig, aktiv und noch nicht eingelöst. Gibt Kostenmodell + Betrag zurück. |
| `redeem-b2b-code` | Markiert Code als eingelöst, verknüpft mit Order-ID, berechnet Anteile. |
| `generate-b2b-invoice` | Erstellt monatliche Sammelrechnung als PDF, speichert in Storage, sendet E-Mail. |
| `send-b2b-code-email` | Versendet Code-E-Mail an Studenten (einzeln oder Massenversand). |
| `import-b2b-students` | Verarbeitet CSV/XLS-Upload, validiert Daten, generiert Codes. |

---

## Checkout-Erweiterung (bestehender Kalkulator)

Im bestehenden Checkout-Flow wird ein optionales Code-Feld ergänzt:

```
"Haben Sie einen Aktionscode oder Firmencode?"
```

**Verhalten bei Code-Eingabe:**
1. Client ruft `validate-b2b-code` auf
2. Antwort enthält: `valid`, `billing_model`, `employer_amount`, `student_amount`, `account_name`
3. Preisanzeige aktualisiert sich: "Ihr Arbeitgeber übernimmt X €"
4. Bei `billing_model: full` → Checkout-Betrag = 0 (Zahlung entfällt)
5. Bei `billing_model: capped/fixed` → Checkout-Betrag = `student_amount`
6. Nach erfolgreicher Bestellung: `redeem-b2b-code` wird aufgerufen

---

## Sicherheit & Datenschutz

- **Supabase Auth:** Magic Link — kein Passwort, keine Passwort-Datenbank
- **RLS (Row Level Security):** Jeder B2B-Account sieht nur seine eigenen Daten
- **Codes:** Einmalig einlösbar, serverseitig geprüft (nie client-side)
- **Studentendaten:** Nur zur Auftragsabwicklung, nicht für Marketing
- **Portal:** `robots.txt` disallow, nicht in Navigation, nur per Direktlink
- **DSGVO:** Studentendaten werden nach Abrechnung gemäß Aufbewahrungspflichten gelöscht
- **Admin:** Internes Dashboard erfordert `x-admin-secret` Header wie bisher

---

## Cursor-Implementierungsplan

### ⚡ Phase 1 — MVP (Priorität: JETZT)

**Ziel:** Erster B2B-Kunde (EDAG oder Richard-Müller-Schule) kann live gehen.

- [ ] Supabase Migration: Tabellen `b2b_accounts`, `b2b_students` anlegen
- [ ] Supabase Auth: Magic Link Login für `b2b_accounts` einrichten
- [ ] Edge Function: `validate-b2b-code` implementieren
- [ ] Edge Function: `redeem-b2b-code` implementieren
- [ ] Checkout: Code-Feld + Live-Validierung + Anzeige Arbeitgeberanteil
- [ ] Portal `bamadi.de/partner`: Login-Seite
- [ ] Portal: Einfache Studentenliste mit manuellem Anlegen
- [ ] Portal: Code per E-Mail versenden (einzeln)
- [ ] Dashboard intern: B2B-Aufträge sichtbar, Code-Status einsehbar

### 🔧 Phase 2 — Komfort (nach erstem Kunden)

- [ ] CSV/XLS-Import mit Validierung und Preview (`import-b2b-students`)
- [ ] Gruppenstruktur: Tabelle `b2b_groups` + Filter im Portal
- [ ] Massenversand Code-E-Mails
- [ ] PDF-Liste: Alle Codes einer Gruppe zum Ausdrucken
- [ ] Kostenübersicht: filterbar nach Gruppe / Zeitraum
- [ ] AGB-Akzeptanz mit Timestamp

### 🚀 Phase 3 — Automatisierung (ab Wachstum)

- [ ] Monatliche Rechnungsgenerierung via `pg_cron` + `generate-b2b-invoice`
- [ ] Rechnungs-PDF im Kundenportal + automatischer E-Mail-Versand
- [ ] Registrierungs-Flow Self-Service komplett ausbauen
- [ ] Dashboard KPI-Kacheln + Export CSV/PDF
- [ ] CI-Steuerung (Cover-Templates pro Account) — separates Konzept

---

## Offene Punkte & Entscheidungsbedarf

| Thema | Klärungsbedarf | Priorität |
|---|---|---|
| AGB B2B | Rechtliche Prüfung. Bestehende bamadi-AGB als Basis, B2B-Klauseln ergänzen. | **HOCH** |
| Rechnungsformat | Pflichtangaben gem. UStG — Steuerberater freigeben lassen. | **HOCH** |
| Mahnwesen | Bei Zahlungsverzug: automatische Mahnung oder manuell? | Mittel |
| Mindestabnahme | Keine Mindestabnahme — aber Schwellwert für Verwaltungsaufwand? | Niedrig |
| Code-Gültigkeit | Ablaufdatum? Empfehlung: 12 Monate ab Generierung. | Mittel |
| Gruppenlink Phase 3 | Studenten-Selbstregistrierung — Komfort vs. Missbrauchspotenzial? | Niedrig |
| CI-Steuerung | Cover-Templates pro Account — separates Konzept, nicht Phase 1. | Mittel |

---

## Bestehende Referenzkunden (bereits live ohne Portal)

| Kunde | Modell | Status |
|---|---|---|
| **EDAG Engineering Fulda** | Corporate, Vollübernahme, eigenes Coverdesign | Aktiv, manuell |
| **Richard-Müller-Schule Fulda** | Institutional, Schule zahlt 2 Exemplare pro Student | Rahmenvertrag aktiv, manuell |
| **Polizeiakademie Fulda** | Institutional, Student zahlt selbst | Informell aktiv |

> Diese Kunden sind der Beweis dass das Modell funktioniert. Phase 1 digitalisiert was bereits existiert.

---

*bamadi.de · B2B-Portal Technisches Konzept · Stand: März 2026 · Keine Änderung an bestehendem Code ohne explizite Freigabe.*