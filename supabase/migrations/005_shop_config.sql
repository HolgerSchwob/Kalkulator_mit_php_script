-- Shop-Konfiguration für Kalkulator (Papier, Bindungen, Extras, Preise)
-- Öffentlich: get-shop-config; Admin: shop-config (Dashboard Einstellungen)

CREATE TABLE IF NOT EXISTS public.shop_config (
  id integer PRIMARY KEY DEFAULT 1,
  config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

COMMENT ON TABLE public.shop_config IS 'Einzelne Zeile mit vollständiger Kalkulator-Config (general, papers, bindings, extras, productionAndDelivery).';

ALTER TABLE public.shop_config ENABLE ROW LEVEL SECURITY;

-- Nur Service Role (Edge Functions) darf lesen/schreiben.

INSERT INTO public.shop_config (id, config, updated_at)
VALUES (1, '{"general":{"orderBaseFee":9.5,"bookBlockBaseFee":5,"currencySymbol":"€","maxVariants":3,"absoluteMinThicknessMm":2,"absoluteMaxThicknessMm":50,"defaultFallbackBindingId":"softcover_foil","a3PagePrice":0.85,"vatRate":7},"productionAndDelivery":{"productionTimes":[{"id":"prod_standard","name":"Standard (ca. 3-5 WT)","price":0,"default":true},{"id":"prod_express","name":"Express Produktion (ca. 1-2 WT)","price":35}],"deliveryMethods":[{"id":"pickup","name":"Selbstabholung","price":0,"requiresAddress":false,"default":true},{"id":"standard_shipping","name":"Standardversand (DE)","price":5.9,"requiresAddress":true}]},"papers":[{"id":"soporset_100","name":"Soporset 100 g/qm","pricePerSheetMaterial":0.02,"pricePerPagePrint":0.14,"paperThickness":0.1},{"id":"soporset_120","name":"Soporset 120 g/qm","pricePerSheetMaterial":0.03,"pricePerPagePrint":0.14,"paperThickness":0.12}],"bindings":[{"id":"softcover_foil","name":"Paperback (Folienvariante)","bindingTypeBaseFee":2.5,"pricePerItem":4.5,"minBlockThicknessMm":2,"maxBlockThicknessMm":30,"requiresPersonalization":false,"options":[{"name":"Folientyp","type":"radio","optionKey":"foil_type","choices":[{"id":"foil_glossy","name":"Glänzend","price":0,"default":true},{"id":"foil_matte","name":"Mattiert","price":0.5}]}]},{"id":"hardcover_modern_fullcolor","name":"Hardcover Modern (Vollfarbdruck)","bindingTypeBaseFee":15,"pricePerItem":22,"minBlockThicknessMm":8,"maxBlockThicknessMm":50,"requiresPersonalization":true,"personalizationInterface":"coverEditor","editorConfig":{"templatePath":"templates/hardcover/","usesPdfPreviewAsCover":false,"dimensions":{"u1Width":215,"u4Width":215,"visibleCoverHeight":302,"svgTotalWidth":500,"svgTotalHeight":330,"svgCenterX":250,"falzZoneWidth":8}},"options":[]},{"id":"paperback_perfect","name":"Paperback (Klebebindung)","bindingTypeBaseFee":2.5,"pricePerItem":4.5,"minBlockThicknessMm":2,"maxBlockThicknessMm":30,"requiresPersonalization":true,"personalizationInterface":"coverEditor","editorConfig":{"templatePath":"templates/paperback/","usesPdfPreviewAsCover":true,"dimensions":{"u1Width":210,"u4Width":210,"visibleCoverHeight":297,"svgTotalWidth":450,"svgTotalHeight":310,"svgCenterX":225,"falzZoneWidth":0}},"options":[]}],"extras":[{"id":"cd_packaging_service","name":"CD/DVD: Verpackung","unitPrice":0,"options":[{"groupName":"CD Verpackung wählen","type":"radio","optionKey":"cd_packaging","choices":[{"id":"cd_sleeve","name":"Papiertasche","price":0.4,"default":true},{"id":"cd_adhesive_pocket","name":"Klebetasche","price":0.65}]}],"hasIndependentQuantity":true,"defaultQuantity":1},{"id":"postbox","name":"Versandverpackung","unitPrice":0,"options":[{"groupName":"Dicke wählen","type":"radio","optionKey":"box_typeg","choices":[{"id":"box_kleine","name":"Füllhöhe 10 cm","price":3.5,"default":true},{"id":"cbox_gross","name":"Füllhöhe 20 cm","price":4.5}]}],"hasIndependentQuantity":true,"defaultQuantity":0}]}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;
