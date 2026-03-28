-- Supabase Storage: Bucket für Preview-Assets (Shop-Vorschau: Hintergrundbilder pro Bindung)
-- Öffentlich lesbar, damit der Kalkulator die Bilder ohne Auth laden kann.
-- Upload erfolgt über Edge Function upload-preview-asset (Service Role).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'preview-assets',
  'preview-assets',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']::text[];
