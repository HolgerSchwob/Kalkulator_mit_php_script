# Deployt eine feste Whitelist von Edge Functions – NICHT das gesamte Projekt.
# Verwendung (im Projektroot):  pwsh -File supabase/deploy-core-functions.ps1
#
# Bewusst NICHT enthalten (bei Bedarf einzeln deployen):
#   get-cover-template-group, get-cover-templates, get-cover-schema, admin-cover-templates,
#   admin-cover-template-groups, update-cover-schema, update-cover-palettes, get-cover-palette,
#   admin-farbpaare, upload-preview-asset, validate-b2b-code, create-order-and-checkout,
#   stripe-webhook, process-review-requests, …
#
# Vor dem ersten Lauf: supabase link --project-ref <REF>

$ErrorActionPreference = "Stop"
$functions = @(
    "get-order",
    "list-orders",
    "order-detail",
    "update-order",
    "send-order-email",
    "trigger-order-received-email",
    "email-templates",
    "get-shop-config",
    "shop-config",
    "spot-color-palette"
)

foreach ($name in $functions) {
    Write-Host "Deploy: $name" -ForegroundColor Cyan
    supabase functions deploy $name
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Fertig ($($functions.Count) Functions)." -ForegroundColor Green
