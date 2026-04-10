-- Produktions-SVGs mit eingebetteten Fonts überschreiten häufig 2 MiB (Storage-Fehler „max allowed size“).

UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'cover-templates';
