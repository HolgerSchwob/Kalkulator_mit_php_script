# Milestones = automatische Backups

## Wie löse ich ein automatisches Backup aus?

Ein Backup wird automatisch erstellt, **wenn** du beim Commit im Commit-Text eines davon verwendest:

- `[milestone]`
- `milestone: ...`

Groß-/Kleinschreibung ist egal.

## Was passiert dann genau?

- Es wird automatisch ein Git-Tag erstellt: `backup-YYYY-MM-DD-HHMMSS`
- Wenn der Remote `bamadi` existiert, wird dieses Tag **automatisch** nach `bamadi` gepusht (best effort).

## Beispiele

```bash
git commit -m "[milestone] Kalkulator + Bindungsmodals stabil"
```

```bash
git commit -m "milestone: Checkout fertig verdrahtet"
```

## Rettungspunkt anzeigen / verwenden

```bash
git tag --list "backup-*"
git show backup-2026-03-12-085501
```

Zu einem Backup-Stand zurück (nur anschauen):

```bash
git checkout backup-2026-03-12-085501
```

Von dort weiterarbeiten (neuer Branch):

```bash
git checkout -b restore/2026-03-12-085501
git push -u bamadi HEAD
```

