# Lokalen Server starten

**Wichtig:** Immer vom **Projekt-Root** (dieser Ordner) starten, nicht aus dem Unterordner `kalkulator/`.

- **Richtig:** Im Ordner `Kalkulator 130226` z. B. `npx serve` oder „Live Server“ starten, dann im Browser `http://localhost:…/` bzw. `http://localhost:…/kalkulator/` öffnen.
- **Falsch:** Server im Ordner `kalkulator` starten – dann liefern `../config.json` und `../logo bamadi/` 404, weil sie außerhalb des Document Root liegen.

Wenn du eine 404 siehst: Im Browser DevTools → Tab **Network** prüfen, welche genaue URL rot ist (z. B. `config.json`, `supabase.config.json`, `bamadi-logo.css`).
