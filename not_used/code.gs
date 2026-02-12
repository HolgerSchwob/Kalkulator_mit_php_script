// ===================================================================================
// --- KONFIGURATION ---
// ===================================================================================
const CONFIG = {
  // ID deiner Master-Google-Tabelle
  sheetId: "1TX4aLbAQDqkkznyfHFvYnGRYnK-YiF6pHl7Ngde36MA",
  // Name des Tabellenblatts
  sheetName: "Auftragsprotokoll",
  // Feste Reihenfolge der Status für die UI
  statusOrder: [
    "Eingegangen",
    "In Prüfung",
    "Wartet auf Zahlung",
    "Bereit für Druck",
    "Bereit für Bindung",
    "Versand-/Abholbereit",
    "Versendet",
    "Abgeholt",
    "Storniert",
    "Archiviert"
  ],
  // Definition der einzelnen Status
  statusWorkflow: {
    "Eingegangen":       { displayName: "Neu / Unbearbeitet", icon: "inbox", nextPossible: ["In Prüfung", "Storniert"], actionsOnEnter: [] },
    "In Prüfung":        { displayName: "In Prüfung", icon: "edit-3", nextPossible: ["Wartet auf Zahlung", "Storniert"], 
                           actionsOnEnter: [
                             { key: "sendOrderConfirmation", label: "Auftragsbestätigung & Zahlungsaufforderung an Kunden senden?" }
                           ]
                         },
    "Wartet auf Zahlung":  { displayName: "Wartet auf Zahlung", icon: "clock", nextPossible: ["Bereit für Druck", "Storniert"], actionsOnEnter: [] },
    "Bereit für Druck":    { displayName: "Bereit für Druck", icon: "printer", nextPossible: ["Bereit für Bindung", "Storniert"], actionsOnEnter: [] },
    "Bereit für Bindung":  { displayName: "Bereit für Bindung", icon: "book-open", nextPossible: ["Versand-/Abholbereit", "Storniert"], actionsOnEnter: [] },
    "Versand-/Abholbereit": { displayName: "Versand-/Abholbereit", icon: "package", nextPossible: ["Versendet", "Abgeholt", "Archiviert"],
                           actionsOnEnter: [
                             { key: "createShippingDocuments", label: "Versandpapiere jetzt erstellen?" },
                             { key: "notifyCustomerForPickup", label: "Kunden über Abholbereitschaft informieren?" }
                           ]
                         },
    "Versendet":         { displayName: "Versendet", icon: "truck", nextPossible: ["Archiviert"], 
                           actionsOnEnter: [
                             { key: "sendShippingNotification", label: "Versandbestätigung an Kunden senden?" }
                           ]
                         },
    "Abgeholt":          { displayName: "Abgeholt", icon: "user-check", nextPossible: ["Archiviert"], actionsOnEnter: [] },
    "Storniert":         { displayName: "Storniert", icon: "x-circle", nextPossible: ["Archiviert"], actionsOnEnter: [] },
    "Archiviert":        { displayName: "Archiviert", icon: "archive", nextPossible: [], actionsOnEnter: [] }
  },
  // Definition von Aktionen, die immer manuell verfügbar sind
  manualActions: [
    { key: "createOfferPDF", label: "Angebot als PDF erstellen", icon: "file-text" },
    { key: "sendOrderConfirmation", label: "Auftragsbestätigung senden", icon: "send" },
    { key: "createInvoice", label: "Rechnung erstellen", icon: "file-plus" },
    { key: "createShippingDocuments", label: "Versanddokumente erstellen", icon: "truck" }
  ],
  // Verfügbare Benutzer für die Zuweisung
  assignableUsers: ["Holger Schwob", "Martin Rabold", "Katja DeHaney", "Lea Süß", "Tim Rösner"],
  // Name der JSON-Datei in den Auftragsordnern
  jsonFileName: "auftragsdetails.json"
};

// Spaltenindizes in der Google-Tabelle (0-basiert).
const COL_INDEX = {
  AUFTRAGSNUMMER: 0, FOLDER_ID: 1, STATUS: 2, KUNDENNAME: 3, KUNDENMAIL: 4, GESAMTPREIS: 5, IS_EXPRESS: 6,
  EINGANGSDATUM: 7, LIEFERTERMIN_GEPLANT: 8, FERTIGSTELLUNGSDATUM: 9, VERSANDDATUM: 10, ABHOLDATUM: 11, BEARBEITER: 12
};

// ===================================================================================
// --- WEBAPP-EINSTIEGSPUNKT & DATENABRUF ---
// ===================================================================================
function doGet(e) {
  return HtmlService.createTemplateFromFile('Modern_Dashboard_UI_V3')
    .evaluate().setTitle('Auftrags-Dashboard').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getDashboardConfig() {
  return {
    statusWorkflow: CONFIG.statusWorkflow,
    statusOrder: CONFIG.statusOrder,
    assignableUsers: CONFIG.assignableUsers,
    manualActions: CONFIG.manualActions
  };
}

/**
 * NEU: Zählt die Aufträge für jeden Status.
 * @returns {object} Ein Objekt mit den Anzahlen, z.B. { "Eingegangen": 5, "In Prüfung": 2 }.
 */
function getStatusCounts() {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.sheetId).getSheetByName(CONFIG.sheetName);
    const statusColumn = sheet.getRange(2, COL_INDEX.STATUS + 1, sheet.getLastRow() - 1, 1).getValues();
    const counts = {};
    // Initialisiere alle Zähler mit 0
    CONFIG.statusOrder.forEach(status => counts[status] = 0);
    // Zähle die Aufträge
    statusColumn.forEach(row => {
      if (row[0] && counts.hasOwnProperty(row[0])) {
        counts[row[0]]++;
      }
    });
    return { success: true, counts: counts };
  } catch (e) {
    Logger.log(`Fehler in getStatusCounts: ${e.toString()}`);
    return { success: false, error: e.message };
  }
}

function getOrders(status) {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.sheetId).getSheetByName(CONFIG.sheetName);
    const data = sheet.getDataRange().getValues();
    data.shift(); 
    const orders = data.map(row => {
      if (row[COL_INDEX.STATUS] === status && row[COL_INDEX.AUFTRAGSNUMMER]) {
        return {
          auftragsNummer: row[COL_INDEX.AUFTRAGSNUMMER],
          kundenName: row[COL_INDEX.KUNDENNAME],
          lieferTermin: formatDateForDisplay(row[COL_INDEX.LIEFERTERMIN_GEPLANT]),
          gesamtPreis: formatPrice(row[COL_INDEX.GESAMTPREIS]),
          isExpress: row[COL_INDEX.IS_EXPRESS] === true,
          bearbeiter: row[COL_INDEX.BEARBEITER] || ''
        };
      }
      return null;
    }).filter(order => order !== null);
    return { success: true, orders: orders };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getJobDetails(auftragsNummer) {
  try {
    const sheetData = getSheetRowByOrderNumber(auftragsNummer);
    if (!sheetData) return { success: false, error: "Auftrag nicht gefunden." };

    const folderId = sheetData.row[COL_INDEX.FOLDER_ID];
    const folder = DriveApp.getFolderById(folderId);
    const jsonFileIterator = folder.getFilesByName(CONFIG.jsonFileName);
    let details = {};
    if (jsonFileIterator.hasNext()) {
      details = JSON.parse(jsonFileIterator.next().getBlob().getDataAsString());
    }

    if (details.varianten && details.dateienMeta?.coverDateien) {
      const thumbnailMetas = details.dateienMeta.coverDateien.filter(f => f.type === 'thumbnail');
      details.varianten.forEach(variante => {
        const thumbMeta = thumbnailMetas.find(t => t.variantId === variante.id);
        if (thumbMeta?.name) {
          const thumbFileIterator = folder.getFilesByName(thumbMeta.name);
          if (thumbFileIterator.hasNext()) {
            const thumbFile = thumbFileIterator.next();
            variante.thumbnailDataUrl = `data:${thumbFile.getBlob().getContentType()};base64,${Utilities.base64Encode(thumbFile.getBlob().getBytes())}`;
          }
        }
      });
    }

    return {
      success: true,
      auftragsNummer: sheetData.row[COL_INDEX.AUFTRAGSNUMMER],
      driveLink: folder.getUrl(),
      aktuellerStatus: sheetData.row[COL_INDEX.STATUS],
      aktiverBearbeiter: sheetData.row[COL_INDEX.BEARBEITER],
      kundenName: details.kundenDaten?.name || sheetData.row[COL_INDEX.KUNDENNAME],
      kundenEmail: details.kundenDaten?.email || sheetData.row[COL_INDEX.KUNDENMAIL],
      kundenTelefon: details.kundenDaten?.phone || '',
      gesamtPreis: formatPrice(sheetData.row[COL_INDEX.GESAMTPREIS]),
      eingangsDatum: dateToISO(sheetData.row[COL_INDEX.EINGANGSDATUM]),
      lieferTermin: dateToISO(sheetData.row[COL_INDEX.LIEFERTERMIN_GEPLANT]),
      produktionszeitDisplay: details.produktionszeit?.name || '',
      isExpress: sheetData.row[COL_INDEX.IS_EXPRESS],
      hinweise: details.hinweise || '',
      buchblock: details.buchblock,
      lieferDetails: details.lieferDetails,
      varianten: details.varianten || [],
      statusHistorie: details.statusHistorie || []
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getHauptPdfDownloadUrl(auftragsNummer) {
  try {
    const sheetData = getSheetRowByOrderNumber(auftragsNummer);
    if (!sheetData) return { success: false, error: "Auftrag nicht gefunden." };

    const folder = DriveApp.getFolderById(sheetData.row[COL_INDEX.FOLDER_ID]);
    const jsonFileIterator = folder.getFilesByName(CONFIG.jsonFileName);
    
    if (jsonFileIterator.hasNext()) {
      const details = JSON.parse(jsonFileIterator.next().getBlob().getDataAsString());
      const pdfName = details.dateienMeta?.hauptPdfName;

      if (pdfName) {
        const pdfFileIterator = folder.getFilesByName(pdfName);
        if (pdfFileIterator.hasNext()) {
          const pdfFile = pdfFileIterator.next();
          return { success: true, url: pdfFile.getDownloadUrl() };
        } else {
          return { success: false, error: `PDF-Datei "${pdfName}" nicht im Ordner gefunden.` };
        }
      } else {
        return { success: false, error: "Kein PDF-Name in der JSON-Datei vermerkt." };
      }
    }
    return { success: false, error: "JSON-Datei nicht gefunden." };
  } catch(e) {
    return { success: false, error: e.message };
  }
}


// ===================================================================================
// --- DATEN-UPDATE & WORKFLOW-FUNKTIONEN ---
// ===================================================================================
function assignAndStartProcessing(auftragsNummer, bearbeiter) {
  try {
    const sheetData = getSheetRowByOrderNumber(auftragsNummer);
    if (!sheetData) return { success: false, message: "Auftrag nicht gefunden." };

    sheetData.sheet.getRange(sheetData.rowIndex, COL_INDEX.BEARBEITER + 1).setValue(bearbeiter);
    sheetData.sheet.getRange(sheetData.rowIndex, COL_INDEX.STATUS + 1).setValue("In Prüfung");
    
    updateStatusHistoryInJson(sheetData.row[COL_INDEX.FOLDER_ID], "In Prüfung", new Date());
    
    return { success: true, message: `Auftrag von ${bearbeiter} übernommen.` };
  } catch(e) {
    return { success: false, message: e.message };
  }
}


function updateOrderStatus(auftragsNummer, newStatus) {
  try {
    const sheetData = getSheetRowByOrderNumber(auftragsNummer);
    if (!sheetData) return { success: false, message: "Auftrag nicht gefunden." };
    
    const sheet = sheetData.sheet;
    const rowIndex = sheetData.rowIndex;
    const now = new Date();
    
    sheet.getRange(rowIndex, COL_INDEX.STATUS + 1).setValue(newStatus);
    
    if (newStatus === "Fertig Produziert") sheet.getRange(rowIndex, COL_INDEX.FERTIGSTELLUNGSDATUM + 1).setValue(now);
    else if (newStatus === "Versendet") sheet.getRange(rowIndex, COL_INDEX.VERSANDDATUM + 1).setValue(now);
    else if (newStatus === "Abgeholt") sheet.getRange(rowIndex, COL_INDEX.ABHOLDATUM + 1).setValue(now);
    
    updateStatusHistoryInJson(sheetData.row[COL_INDEX.FOLDER_ID], newStatus, now);

    const postActions = CONFIG.statusWorkflow[newStatus]?.actionsOnEnter || [];
    return { success: true, message: `Status auf "${newStatus}" geändert.`, postActions: postActions };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function executeAction(auftragsNummer, actionKey) {
  Logger.log(`Aktion "${actionKey}" für Auftrag ${auftragsNummer} wurde getriggert.`);
  Utilities.sleep(1000); 
  return { success: true, message: `Aktion "${actionKey}" erfolgreich simuliert.` };
}


// --- HILFSFUNKTIONEN ---
function updateJobAssignee(auftragsNummer, newAssignee) {
  try {
    const sheetData = getSheetRowByOrderNumber(auftragsNummer);
    if (!sheetData) return { success: false, message: "Auftrag nicht gefunden." };
    sheetData.sheet.getRange(sheetData.rowIndex, COL_INDEX.BEARBEITER + 1).setValue(newAssignee);
    return { success: true, message: "Bearbeiter gespeichert." };
  } catch (e) { return { success: false, message: e.message }; }
}
function updateJobNotes(auftragsNummer, newNotes) {
   try {
    const sheetData = getSheetRowByOrderNumber(auftragsNummer);
    if (!sheetData) return { success: false, message: "Auftrag nicht gefunden." };
    const folder = DriveApp.getFolderById(sheetData.row[COL_INDEX.FOLDER_ID]);
    const fileIterator = folder.getFilesByName(CONFIG.jsonFileName);
    if (fileIterator.hasNext()) {
      const file = fileIterator.next();
      let jsonData = JSON.parse(file.getBlob().getDataAsString());
      jsonData.hinweise = newNotes;
      file.setContent(JSON.stringify(jsonData, null, 2));
      return { success: true, message: "Hinweise gespeichert." };
    }
    return { success: false, message: "JSON-Datei nicht gefunden." };
  } catch (e) { return { success: false, message: e.message }; }
}
function getSheetRowByOrderNumber(auftragsNummer) {
  const sheet = SpreadsheetApp.openById(CONFIG.sheetId).getSheetByName(CONFIG.sheetName);
  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex(row => row[COL_INDEX.AUFTRAGSNUMMER] && row[COL_INDEX.AUFTRAGSNUMMER].toString() === auftragsNummer.toString()) + 1;
  if (rowIndex > 0) return { sheet: sheet, rowIndex: rowIndex, row: data[rowIndex - 1] };
  return null;
}
function formatDateForDisplay(date) {
  if (!date || !(date instanceof Date)) return "";
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd.MM.yyyy");
}
function dateToISO(date) {
  if (date instanceof Date && !isNaN(date)) return date.toISOString();
  return null;
}
function formatPrice(price) {
  try {
    const number = parseFloat(price);
    if (isNaN(number)) return "";
    return number.toFixed(2).replace('.', ',') + " €";
  } catch (e) { return ""; }
}
function updateStatusHistoryInJson(folderId, newStatus, date) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const fileIterator = folder.getFilesByName(CONFIG.jsonFileName);
    if (fileIterator.hasNext()) {
      const file = fileIterator.next();
      let jsonData = JSON.parse(file.getBlob().getDataAsString());
      if (!jsonData.statusHistorie) jsonData.statusHistorie = [];
      jsonData.statusHistorie.push({ status: newStatus, datum: date.toISOString() });
      jsonData.aktuellerStatus = newStatus;
      file.setContent(JSON.stringify(jsonData, null, 2));
    }
  } catch(e) {
    Logger.log(`Konnte Statushistorie für Ordner ${folderId} nicht aktualisieren: ${e.toString()}`);
  }
}
