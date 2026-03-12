#!/usr/bin/env python3
"""
Inkscape-Erweiterung: Personalisierung zuweisen (Buchdecken-Template)
Setzt auf dem ausgewählten Objekt die gewählte ID bzw. Attribute
gemäß den Konventionen des Buchdecken-Editors.
Prüfmodus und Plausibilitätsprüfungen für konsistente Daten.
"""
import inkex
try:
    from inkex.extensions import EffectExtension
except ImportError:
    from inkex import EffectExtension
try:
    from inkex.utils import AbortExtension
except ImportError:
    from inkex.base import AbortExtension

# Zuweisungen, die eine Gruppe (g) erwarten
GROUP_IDS = {"tpl-group-u1", "tpl-group-u4", "tpl-group-spine"}
# Zuweisungen, die ein Text-Element (text) erwarten
TEXT_IDS = {
    "tpl-title", "tpl-subtitle", "tpl-name", "tpl-mat-nr", "tpl-year", "tpl-topic",
    "tpl-topic-multiline", "tpl-subtitle-line1", "tpl-subtitle-line2", "tpl-subtitle-line3",
    "tpl-title-spine", "tpl-name-spine", "tpl-topic-spine",
}
# Zuweisungen, die ein Rechteck (rect) für Logo erwarten
LOGO_IDS = {"tpl-logo-Logo1", "tpl-logo-Logo2"}
# Nur Attribut (beliebiges Element)
COLOR_ONLY = {"color1", "color2"}


def local_tag(elem):
    """SVG-Tag ohne Namespace (z. B. 'g', 'text', 'rect')."""
    tag = elem.tag
    if isinstance(tag, str) and "}" in tag:
        return tag.split("}")[-1]
    return getattr(tag, "localname", str(tag))


def parent_group_id(elem):
    """ID der übergeordneten Gruppe (tpl-group-u1, tpl-group-u4, tpl-group-spine) oder None."""
    parent = elem.getparent()
    while parent is not None:
        gid = parent.get("id") or ""
        if gid in ("tpl-group-u1", "tpl-group-u4", "tpl-group-spine"):
            return gid
        parent = parent.getparent()
    return None


def expected_type(assignment):
    """Erwarteter Elementtyp für die Zuweisung: 'g', 'text', 'rect' oder None (beliebig)."""
    if assignment in GROUP_IDS:
        return "g"
    if assignment in TEXT_IDS:
        return "text"
    if assignment in LOGO_IDS:
        return "rect"
    return None


class PersonalizationHelper(EffectExtension):
    """Weist dem ausgewählten Objekt die gewählte Personalisierungs-Funktion zu."""

    def _show_current_only(self):
        """Zeigt nur die aktuelle Zuweisung der Auswahl – kompakt, auf einen Blick."""
        n = len(self.svg.selection)
        head = "Aktuelle Zuweisung ({} Objekt/e)".format(n)
        lines = [head]
        any_not_in_group = False
        for element in self.svg.selection:
            tag = local_tag(element)
            cur_id = element.get("id") or "–"
            cur_color = element.get("colorselector") or "–"
            parent_grp = parent_group_id(element)
            grp = parent_grp if parent_grp else "–"
            if parent_grp is None and tag in ("text", "rect"):
                any_not_in_group = True
            lines.append("  id: {}   Tag: {}   colorselector: {}   Gruppe: {}".format(
                cur_id, tag, cur_color, grp
            ))
        if any_not_in_group:
            lines.append("  Hinweis: Nicht in tpl-group-u1/u4/spine.")
        raise AbortExtension("\n".join(lines))

    def add_arguments(self, pars):
        try:
            bool_type = inkex.Boolean
        except AttributeError:
            def bool_type(s):
                return str(s).strip().lower() in ("true", "1", "yes")
        pars.add_argument(
            "--nur_anzeigen",
            type=bool_type,
            default=False,
            dest="nur_anzeigen",
            help="Nur aktuelle Zuweisung anzeigen, kein Dialog nötig",
        )
        pars.add_argument(
            "--nur_pruefung",
            type=bool_type,
            default=False,
            dest="nur_pruefung",
            help="Nur Prüfung, keine Änderung",
        )
        pars.add_argument(
            "--assignment",
            type=str,
            default="",
            help="Zuweisung: ID oder Attribut (z. B. tpl-title, color1)",
        )

    def effect(self):
        if not self.svg.selection:
            raise AbortExtension("Bitte zuerst ein Objekt auswählen.")

        nur_anzeigen = getattr(self.options, "nur_anzeigen", False)
        if nur_anzeigen:
            self._show_current_only()
            return

        assignment = (self.options.assignment or "").strip()
        if not assignment:
            raise AbortExtension("Keine Zuweisung gewählt.")

        nur_pruefung = getattr(self.options, "nur_pruefung", False)

        # Geplante Änderung
        elem_id = None
        attrs = {}
        if assignment == "color1":
            attrs["colorselector"] = "color1"
        elif assignment == "color2":
            attrs["colorselector"] = "color2"
        elif assignment == "tpl-topic-multiline":
            elem_id = "tpl-topic"
            attrs["data-multiline"] = "true"
            attrs["data-max-lines"] = "4"
        else:
            elem_id = assignment

        expect = expected_type(assignment)
        lines = []
        warnings = []
        any_not_in_group = False

        for element in self.svg.selection:
            tag = local_tag(element)
            cur_id = element.get("id") or "(keine)"
            cur_color = element.get("colorselector") or "(nicht gesetzt)"
            parent_grp = parent_group_id(element)

            if nur_pruefung:
                lines.append("  id: {}   Tag: {}   colorselector: {}   Gruppe: {}".format(
                    cur_id, tag, cur_color, parent_grp or "–"
                ))
            # Plausibilität
            if expect == "g" and tag != "g":
                warnings.append("Gruppen-Zuweisung ({}): Ausgewähltes Objekt ist keine Gruppe (aktuell: {}).".format(assignment, tag))
            elif expect == "text" and tag != "text":
                warnings.append("Text-Zuweisung ({}): Ausgewähltes Objekt ist kein Text-Element (aktuell: {}).".format(assignment, tag))
            elif expect == "rect" and tag != "rect":
                warnings.append("Logo-Zuweisung ({}): Üblicherweise ein Rechteck (rect); aktuell: {}.".format(assignment, tag))
            if expect and parent_grp is None and tag in ("text", "rect"):
                any_not_in_group = True
        if any_not_in_group and nur_pruefung:
            warnings.append("Hinweis: Mindestens ein Objekt liegt nicht in tpl-group-u1, tpl-group-u4 oder tpl-group-spine – im Editor möglicherweise nicht sichtbar.")

        if nur_pruefung:
            n = len(self.svg.selection)
            report = ["Prüfung ({} Objekt/e) – keine Änderung".format(n)]
            report.extend(lines)
            report.append("Geplante Zuweisung: {} → id={}, Attribute={}".format(
                assignment, elem_id or "(unverändert)", attrs or "(keine)"
            ))
            if warnings:
                report.append("Plausibilität:")
                for w in warnings:
                    report.append("  " + w)
            else:
                report.append("Plausibilität: OK.")
            raise AbortExtension("\n".join(report))

        if warnings:
            raise AbortExtension("Zuweisung abgebrochen:\n" + "\n".join(warnings))

        # Anwenden
        for element in self.svg.selection:
            if elem_id is not None:
                element.set("id", elem_id)
            for name, value in attrs.items():
                element.set(name, value)


if __name__ == "__main__":
    PersonalizationHelper().run()
