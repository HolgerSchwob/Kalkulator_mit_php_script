<?php
// upload.php - Angepasst für Kalkulator-Datenempfang und Google Drive Ablage

// --- CORS-Header ---
// Erlaube Cross-Origin-Anfragen. Für lokale Tests ist "*" oft ausreichend.
// Für Produktion: Ersetze "*" durch die Domain deines Kalkulators.
// Wichtig: Stelle sicher, dass dieser Origin mit dem in deiner script.js (PHP_UPLOAD_URL) übereinstimmt,
// bzw. mit dem Origin, von dem die Anfrage kommt (z.B. http://127.0.0.1:5500 für VS Code Live Server).
header("Access-Control-Allow-Origin: http://127.0.0.1:5500"); 
// header("Access-Control-Allow-Origin: *"); // Alternativ für breitere Tests
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200); // Erfolgreicher Preflight
    // error_log("PHP Full: OPTIONS request received and headers sent."); // Optional: Log in PHP error log
    exit();
}

// --- Konfiguration ---
// ID des übergeordneten Google Drive Ordners, in dem die "pending_..." Unterordner erstellt werden.
$rootPendingOrdnerId = '1iyhs5Uvgamj7gxWLMsYTwBGT3nLIpAw3'; // WICHTIG: Deine Google Drive Ordner-ID hier eintragen!
$serviceAccountKeyFile = __DIR__ . '/hs-driveupload-e61508e32fc9.json'; // Pfad zu deiner Service Account Schlüsseldatei
$emailToGrantPermission = 'info@schwob-digitaldruck.de'; // E-Mail-Adresse, die Bearbeiterrechte erhalten soll

// --- Google API Client Library laden ---
// Stelle sicher, dass das 'vendor'-Verzeichnis im selben Ordner wie dieses Skript liegt
// oder der Pfad zu autoload.php korrekt ist.
require_once __DIR__ . '/vendor/autoload.php';

// --- Hilfsfunktionen ---
function createJsonResponse($status, $message, $data = null, $debugLog = null) {
    http_response_code($status === 'success' ? 200 : ($status === 'error_client' ? 400 : 500));
    header('Content-Type: application/json; charset=utf-8');
    $response = ['status' => $status, 'message' => $message];
    if ($data) {
        $response['data'] = $data;
    }
    if ($debugLog && is_array($debugLog)) {
        $response['debug_log_php'] = $debugLog; 
    }
    echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit();
}

$debugLog = [];
$debugLog[] = "PHP Full: Anfrage gestartet um " . date('Y-m-d H:i:s');
$debugLog[] = "PHP Full: Request-Methode: " . $_SERVER['REQUEST_METHOD'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    createJsonResponse('error_client', 'Ungültige Anfrage-Methode. Nur POST erlaubt.', null, $debugLog);
}

// --- Datenempfang ---
$jsonDataString = $_POST['jsonData'] ?? null;
$uploadedFiles = $_FILES;

$debugLog[] = "PHP Full: Empfangenes jsonData (existiert): " . ($jsonDataString ? 'Ja' : 'Nein');
$debugLog[] = "PHP Full: Anzahl empfangener Dateien im _FILES Array: " . count($uploadedFiles);

if (!$jsonDataString) {
    $debugLog[] = "PHP Full Fehler: Keine JSON-Daten ('jsonData') im POST-Request gefunden.";
    createJsonResponse('error_client', 'Fehlende JSON-Daten in der Anfrage.', null, $debugLog);
}

$auftragsDatenGesamt = json_decode($jsonDataString, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    $debugLog[] = "PHP Full Fehler: JSON-Daten konnten nicht dekodiert werden. Fehler: " . json_last_error_msg();
    createJsonResponse('error_client', 'Ungültiges JSON-Format empfangen. Fehler: ' . json_last_error_msg(), null, $debugLog);
}
$debugLog[] = "PHP Full: JSON-Daten erfolgreich dekodiert.";

// --- Google Drive Service initialisieren ---
if ($rootPendingOrdnerId === 'DEINE_ORDNER_ID_HIER' || empty($rootPendingOrdnerId)) {
    $debugLog[] = "PHP Full FEHLER: rootPendingOrdnerId ist nicht konfiguriert im PHP-Skript.";
    createJsonResponse('error_server_config', 'Serverfehler: Google Drive Zielordner-ID ist nicht konfiguriert.', null, $debugLog);
}
if (!file_exists($serviceAccountKeyFile)) {
    $debugLog[] = "PHP Full FEHLER: Dienstkonto-Schlüsseldatei nicht gefunden: " . $serviceAccountKeyFile;
    createJsonResponse('error_server_config', 'Serverfehler: Dienstkonto-Schlüsseldatei nicht gefunden.', null, $debugLog);
}

$client = new Google\Client();
$service = null;
try {
    $client->setAuthConfig($serviceAccountKeyFile);
    $client->setScopes([Google\Service\Drive::DRIVE]); // DRIVE_FILE Scope ist für Permissions nicht ausreichend, DRIVE wird benötigt
    $client->fetchAccessTokenWithAssertion();
    $service = new Google\Service\Drive($client);
    $debugLog[] = "PHP Full: Google Drive Service erfolgreich initialisiert.";
} catch (Exception $e) {
    $debugLog[] = "PHP Full FEHLER bei Google Drive Authentifizierung: " . $e->getMessage();
    createJsonResponse('error_google_auth', 'Serverfehler: Google Drive Authentifizierung fehlgeschlagen. Details: ' . $e->getMessage(), null, $debugLog);
}

// --- Neuen Unterordner in Google Drive erstellen ---
$zeitstempel = date('Ymd_His');
$kundenNameFuerOrdner = isset($auftragsDatenGesamt['kundenDaten']['name']) ? preg_replace('/[^a-zA-Z0-9_-]/', '_', $auftragsDatenGesamt['kundenDaten']['name']) : 'UnbekannterKunde';
$neuerDriveOrdnerName = "pending_" . $zeitstempel . "_" . $kundenNameFuerOrdner;
$neuerDriveOrdner = null;
$neuerDriveOrdnerId = null; 
$neuerDriveOrdnerLink = null;

try {
    $folderMetadata = new Google\Service\Drive\DriveFile([
        'name' => $neuerDriveOrdnerName,
        'mimeType' => 'application/vnd.google-apps.folder',
        'parents' => [$rootPendingOrdnerId]
    ]);
    $neuerDriveOrdner = $service->files->create($folderMetadata, ['fields' => 'id, webViewLink']);
    $neuerDriveOrdnerId = $neuerDriveOrdner->id;
    $neuerDriveOrdnerLink = $neuerDriveOrdner->getWebViewLink();
    $debugLog[] = "PHP Full: Neuer Google Drive Ordner erstellt: ID " . $neuerDriveOrdnerId . ", Name: " . $neuerDriveOrdnerName . ", Link: " . $neuerDriveOrdnerLink;

    // --- NEU: Berechtigung für den Ordner setzen ---
    if ($neuerDriveOrdnerId && !empty($emailToGrantPermission)) {
        $permission = new Google\Service\Drive\Permission([
            'type' => 'user',
            'role' => 'writer', // 'writer' entspricht Bearbeiter/Editor Rechten
            'emailAddress' => $emailToGrantPermission
        ]);
        try {
            $service->permissions->create($neuerDriveOrdnerId, $permission, ['sendNotificationEmail' => false]); // Keine E-Mail-Benachrichtigung senden
            $debugLog[] = "PHP Full: Erfolgreich Bearbeiter-Berechtigung für Ordner ID " . $neuerDriveOrdnerId . " an " . $emailToGrantPermission . " vergeben.";
        } catch (Exception $e) {
            $debugLog[] = "PHP Full FEHLER beim Setzen der Berechtigung für Ordner ID " . $neuerDriveOrdnerId . " für " . $emailToGrantPermission . ": " . $e->getMessage();
            // Fahre trotzdem fort, da der Ordner und die Dateien bereits erstellt sein könnten
        }
    } else {
        $debugLog[] = "PHP Full: Überspringe Berechtigungsvergabe. Ordner-ID oder E-Mail nicht vorhanden.";
    }
    // --- ENDE NEU ---

} catch (Exception $e) {
    $debugLog[] = "PHP Full FEHLER beim Erstellen des Google Drive Ordners: " . $e->getMessage();
    createJsonResponse('error_google_drive', 'Serverfehler: Google Drive Ordner konnte nicht erstellt werden. Details: ' . $e->getMessage(), null, $debugLog);
}


// --- JSON-Datei in den neuen Drive-Ordner hochladen ---
try {
    $jsonFileMetadata = new Google\Service\Drive\DriveFile([
        'name' => 'auftragsdetails.json',
        'parents' => [$neuerDriveOrdnerId]
    ]);
    $service->files->create($jsonFileMetadata, [
        'data' => json_encode($auftragsDatenGesamt, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
        'mimeType' => 'application/json',
        'uploadType' => 'media'
    ]);
    $debugLog[] = "PHP Full: auftragsdetails.json erfolgreich in Drive-Ordner ID " . $neuerDriveOrdnerId . " hochgeladen.";
} catch (Exception $e) {
    $debugLog[] = "PHP Full FEHLER beim Hochladen der auftragsdetails.json: " . $e->getMessage();
}

// --- Dateien aus $_FILES in den neuen Drive-Ordner hochladen ---
$hochgeladeneDateinamenInDrive = [];
foreach ($uploadedFiles as $fileKey => $fileData) {
    if ($fileData['error'] === UPLOAD_ERR_OK) {
        $originalName = basename($fileData['name']);
        $filePath = $fileData['tmp_name'];
        $mimeType = mime_content_type($filePath) ?: $fileData['type'];

        try {
            $driveFileMetadata = new Google\Service\Drive\DriveFile([
                'name' => $originalName,
                'parents' => [$neuerDriveOrdnerId]
            ]);
            $content = file_get_contents($filePath);
            $driveFile = $service->files->create($driveFileMetadata, [
                'data' => $content,
                'mimeType' => $mimeType,
                'uploadType' => 'multipart'
            ]);
            $debugLog[] = "PHP Full: Datei '" . $originalName . "' (Key: " . $fileKey . ") erfolgreich in Drive hochgeladen. Drive File ID: " . $driveFile->id;
            $hochgeladeneDateinamenInDrive[] = $originalName;
        } catch (Exception $e) {
            $debugLog[] = "PHP Full FEHLER beim Hochladen der Datei '" . $originalName . "' (Key: " . $fileKey . ") nach Drive: " . $e->getMessage();
        } finally {
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }
    } elseif ($fileData['error'] !== UPLOAD_ERR_NO_FILE) {
        $debugLog[] = "PHP Full Fehler beim Datei-Upload für Key '" . $fileKey . "': Code " . $fileData['error'];
    }
}

$debugLog[] = "PHP Full: Verarbeitung abgeschlossen.";
// --- Google Apps Script Web App aufrufen ---
$appsScriptWebAppUrl = 'https://script.google.com/macros/s/AKfycbyBvhHvmrOIGV0iMzj3sOY3fnFohLOgpOkAACADCXMbn8VdDWlxXFFu2rOuaXC7LfyXgg/exec'; 

if (!empty($appsScriptWebAppUrl) && $appsScriptWebAppUrl !== 'IHRE_KOPIERTE_WEBAPP_URL_HIER_EINFUEGEN' && filter_var($appsScriptWebAppUrl, FILTER_VALIDATE_URL)) {
    $debugLog[] = "PHP Full: Versuche, Apps Script Web App aufzurufen: " . $appsScriptWebAppUrl;
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $appsScriptWebAppUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); 
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);          
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); 

    $scriptResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        $debugLog[] = "PHP Full FEHLER beim Aufruf der Apps Script Web App (cURL Fehler): " . $curlError;
    } elseif ($httpCode >= 200 && $httpCode < 400) { 
        $debugLog[] = "PHP Full: Apps Script Web App erfolgreich aufgerufen. HTTP Code: " . $httpCode . ". Antwort (Ausschnitt): " . substr(strip_tags((string)$scriptResponse), 0, 200);
    } else {
        $debugLog[] = "PHP Full FEHLER beim Aufruf der Apps Script Web App. HTTP Code: " . $httpCode . ". Antwort (Ausschnitt): " . substr(strip_tags((string)$scriptResponse), 0, 200);
    }
} else {
    if (empty($appsScriptWebAppUrl) || $appsScriptWebAppUrl === 'IHRE_KOPIERTE_WEBAPP_URL_HIER_EINFUEGEN') {
        $debugLog[] = "PHP Full: Apps Script Web App URL ist nicht konfiguriert. Überspringe Aufruf.";
    } else {
        $debugLog[] = "PHP Full: Apps Script Web App URL ist ungültig: " . $appsScriptWebAppUrl . ". Überspringe Aufruf.";
    }
}

createJsonResponse(
    'success', 
    'Anfrage und Dateien erfolgreich empfangen und in Google Drive verarbeitet.',
    [
        'driveFolderId' => $neuerDriveOrdnerId,
        'driveFolderLink' => $neuerDriveOrdnerLink,
        'driveFolderName' => $neuerDriveOrdnerName,
        'uploadedFilesToDrive' => $hochgeladeneDateinamenInDrive,
        'jsonFileUploaded' => true
    ],
    $debugLog
);

?>
