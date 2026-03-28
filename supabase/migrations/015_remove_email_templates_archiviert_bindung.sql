-- E-Mail-Vorlagen für diese Status entfernen (UI-Entlastung; Status-E-Mails nutzen dann den Fallback-Text in send-order-email)
DELETE FROM public.email_templates
WHERE template_key IN ('Archiviert', 'Bereit für Bindung');
