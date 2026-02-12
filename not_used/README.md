# Nicht mehr verwendete Dateien

Dieser Ordner enthält Backups und alte Ansätze, die durch die Supabase-Integration ersetzt wurden.

- **upload.php.minimal**, **upload .php.backup** – ehemalige PHP-Upload-Skripte (Aufträge wurden zuvor an PHP und Google Drive geschickt).
- **code.gs** – Google Apps Script für das alte Dashboard (Auftragsprotokoll in Google Sheets).
- **Modern_Dashboard_UI_V3.html** – alte Dashboard-UI, die mit Google Apps Script kommunizierte.
- **test.html** – Testseite „Google Drive Uploader“ für den PHP-Upload.
- **composer.json**, **composer.lock** – PHP-Abhängigkeiten (für das Upload-PHP-Skript).

Aktueller Stack: **Kalkulator** → Supabase (Tabelle `orders`, Storage `order-files`) → **dashboard.html** (Edge Functions) bzw. **auftrag.html** (Kunden-Link).
