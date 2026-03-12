/**
 * Hilfsfunktionen für das Dashboard (ohne Abhängigkeiten).
 */

export function formatDate(iso) {
    if (!iso) return '–';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (_) { return iso; }
}

export function escapeHtml(s) {
    if (s == null || s === undefined) return '';
    const t = document.createElement('span');
    t.textContent = s;
    return t.innerHTML;
}
