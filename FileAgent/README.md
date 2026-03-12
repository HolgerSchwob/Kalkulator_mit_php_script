# FileAgent

Kleiner lokaler HTTP-Dienst als Schnittstelle zwischen **Browser (Dashboard)** und **PC/NAS**: Ordner öffnen, Auftragsdateien von Supabase auf die Synology-NAS synchronisieren. Später erweiterbar um Hotfolder-Kopien, Workflow-Automatisierung.

## Wo laufen lassen?

| Ort | Vorteile | Nachteile |
|-----|----------|-----------|
| **24/7-Rechner (RIP oder Server)** | Immer erreichbar für alle Arbeitsplatz-PCs, ein zentraler Dienst, NAS meist schon als Netzlaufwerk gemountet | Ein Rechner muss dauerhaft laufen |
| **Synology-NAS** | Läuft dort, wo die Dateien liegen, kein extra PC nötig | Auf der NAS muss die Binary laufen (DSM 7: Docker oder Task Scheduler + Linux-Binary); Konfiguration auf der NAS nötig |
| **Arbeitsplatz-PC** | Einfach zu starten, nur wenn jemand am Dashboard arbeitet | Nur von diesem PC aus erreichbar (localhost), NAS-Zugriff muss dieser PC haben |

**Empfehlung:** Auf einem **24/7-Rechner (RIP oder Server)** betreiben, der die Synology-NAS als Netzlaufwerk eingebunden hat. Dann ist der Agent zentral erreichbar (z. B. `http://SERVER:41123`), und alle Druckdaten landen zuverlässig auf der NAS. Auf der NAS selbst ist möglich (z. B. als Docker-Container oder mit einer für Synology gebauten Linux-Binary), erfordert aber mehr Einrichtung auf der NAS.

## Build (Windows .exe)

Voraussetzung: [Go 1.21+](https://go.dev/dl/) installiert.

```bash
cd FileAgent
go build -o FileAgent.exe .
```

Die Datei `FileAgent.exe` ist standalone (keine zusätzliche Runtime nötig).

### Linux (z. B. für Synology/NAS)

```bash
GOOS=linux GOARCH=amd64 go build -o FileAgent .
```

Auf der Synology z. B. unter `/volume1/FileAgent/` ablegen und per Task Scheduler oder Docker starten.

## Konfiguration

1. `config.example.json` nach `config.json` kopieren.
2. Anpassen:
   - **port**: HTTP-Port (Standard 41123).
   - **listenHost**: `127.0.0.1` = nur localhost; `0.0.0.0` = alle Schnittstellen (für Zugriff von anderen PCs).
   - **apiKey**: Optional. Wenn gesetzt, muss das Dashboard jeden Request mit Header `X-Agent-Key: <apiKey>` oder Query `?apiKey=<apiKey>` schicken.
   - **nasBasePath**: Basisordner für Aufträge. **Einheitlich auf allen Rechnern:** UNC-Pfad verwenden (z. B. `\\NAS\Auftraege` oder `\\192.168.1.10\Auftraege`). Dann ist dieselbe `config.json` auf jedem PC nutzbar – unabhängig davon, ob dort zusätzlich ein Laufwerksbuchstabe (Z:, Y: …) gemappt ist. In der JSON-Datei UNC mit doppelten Backslashes: `"\\\\NAS\\Auftraege"`. Unter Linux: Mount-Pfad, z. B. `/volume1/Auftraege`.
   - **supabaseUrl**: Projekt-URL (z. B. `https://xxxx.supabase.co`).
   - **adminSecret**: Derselbe Wert wie in Supabase Edge Functions (ADMIN_SECRET), damit der Agent `order-detail` aufrufen kann.

**Warum UNC-Pfad?** Wenn jeder Rechner die NAS anders gemappt hat (PC1: `Z:\Auftraege`, PC2: `Y:\Auftraege`), würde man pro Rechner eine andere Config brauchen. Mit dem **UNC-Pfad** `\\<NAS-Name-oder-IP>\Auftraege` greift Windows direkt auf die Freigabe zu; der Pfad ist im Netz gleich. Eine gemeinsame `config.json` (z. B. aus dem Projekt kopiert) funktioniert dann auf allen PCs.

Umgebungsvariable: `FILEAGENT_CONFIG` kann auf einen anderen Config-Pfad zeigen.

## Endpoints

- **GET /health** – Prüfen, ob der Agent läuft. Antwort: `{"status":"ok"}`.

- **POST /open-folder**  
  Body: `{"orderNumber":"A-20250213-XXX"}`  
  Öffnet den Auftragsordner auf der NAS (Windows: Explorer; Linux: xdg-open).

- **POST /sync-order**  
  Body: `{"orderId":"uuid"}` oder `{"orderNumber":"A-20250213-XXX"}`  
  Ruft Supabase `order-detail` auf, lädt alle verknüpften Dateien (PDF, SVGs) und speichert sie unter `nasBasePath/<Auftragsnummer>/`. Dateinamen: Haupt-PDF als `<Auftragsnummer>.pdf`, SVGs mit ihrem Namen.

## Dashboard-Anbindung

Im Dashboard (z. B. in `dashboard.config.json`) eine Option `agentUrl` eintragen, z. B. `http://127.0.0.1:41123` oder `http://SERVER:41123`. Buttons „Ordner öffnen“ und „Dateien auf NAS speichern“ rufen dann per `fetch(agentUrl + '/open-folder', ...)` bzw. `fetch(agentUrl + '/sync-order', ...)` den FileAgent auf.

## Lizenz / Projekt

Teil des Kalkulator-/Production-Workflows. Eigenes kleines Projekt „FileAgent“, kann bei Bedarf in ein separates Repository ausgegliedert werden.
