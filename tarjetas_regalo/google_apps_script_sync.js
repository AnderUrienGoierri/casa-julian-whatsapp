/**
 * ============================================================================
 * CASA JULIÁN - GOOGLE APPS SCRIPT PARA SINCRONIZACIÓN EN TIEMPO REAL
 * ============================================================================
 * Instrucciones de instalación:
 * 1. Abre el archivo de Google Sheets / Drive "OPARI TXARTELAK".
 * 2. Ve al menú superior: Extensiones > Apps Script.
 * 3. Borra el código existente y pega este archivo completo.
 * 4. Ajusta la variable SERVER_URL con la URL de tu servidor (o túnel HTTPS / Synology).
 * 5. Guarda el proyecto (Ctrl + S) con el nombre "SyncCasaJulianBot".
 * 6. Ve al menú izquierdo: Activadores (icono de reloj ⏰) > Añadir activador:
 *    - Función: onSheetEditTrigger
 *    - Despliegue: Principal
 *    - Origen del evento: De la hoja de cálculo
 *    - Tipo de evento: Al editar (o "Al cambiar")
 * ============================================================================
 */

const SERVER_URL = "https://casa-julian-whatsapp-bot.onrender.com/api/admin/sync-giftcards-webhook";
const SECRET = "casa_julian_drive_sync_2026";

/**
 * Disparador automático que se ejecuta cada vez que alguien escribe o modifica una celda.
 */
function onSheetEditTrigger(e) {
  if (!e) return;
  try {
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    const row = e.range.getRow();

    // Solo procesar filas con datos a partir de la fila 3 (las filas 1 y 2 son cabeceras)
    if (row < 3) return;

    if (sheetName === "OT PERSONALIZADAS") {
      syncPersonalizadaRow(sheet, row);
    } else if (sheetName === "OT WIX") {
      syncWixRow(sheet, row);
    } else if (sheetName === "OT SHOPIFY") {
      syncShopifyRow(sheet, row);
    }
  } catch (err) {
    Logger.log("Error en onSheetEditTrigger: " + err.toString());
  }
}

/**
 * Sincroniza una fila modificada de la pestaña "OT PERSONALIZADAS"
 */
function syncPersonalizadaRow(sheet, row) {
  const vals = sheet.getRange(row, 1, 1, 13).getValues()[0];
  const nombre = cleanStr(vals[1]);
  if (!nombre) return;

  const card = {
    id: "PERS-" + row,
    nombre_compra: nombre,
    telefono_compra: cleanStr(vals[2]),
    nombre_comensal: cleanStr(vals[3]),
    codigo_tarjeta_regalo: cleanStr(vals[4]),
    importe: cleanNumber(vals[5]),
    observaciones: cleanStr(vals[6]),
    creada_en_revo: null,
    fecha_compra: null,
    entregado: cleanBool(vals[7]),
    fecha_entrega: formatDate(vals[8]),
    pagado: cleanBool(vals[9]),
    fecha_pago: formatDate(vals[10]),
    usado: cleanBool(vals[11]),
    fecha_caducidad: formatDate(vals[12])
  };

  sendCardToServer(card);
}

/**
 * Sincroniza una fila modificada de la pestaña "OT WIX"
 */
function syncWixRow(sheet, row) {
  const vals = sheet.getRange(row, 1, 1, 11).getValues()[0];
  const nombre = cleanStr(vals[1]);
  if (!nombre) return;

  const card = {
    id: "WIX-" + row,
    nombre_compra: nombre,
    nombre_comensal: null,
    telefono_compra: cleanStr(vals[2]),
    codigo_tarjeta_regalo: cleanStr(vals[4]),
    importe: cleanNumber(vals[5]),
    observaciones: cleanStr(vals[6]),
    fecha_compra: formatDate(vals[7]),
    creada_en_revo: cleanBool(vals[8]),
    entregado: null,
    fecha_entrega: null,
    pagado: null,
    fecha_pago: null,
    usado: cleanBool(vals[9]),
    fecha_caducidad: formatDate(vals[10])
  };

  sendCardToServer(card);
}

/**
 * Sincroniza una fila modificada de la pestaña "OT SHOPIFY"
 */
function syncShopifyRow(sheet, row) {
  const vals = sheet.getRange(row, 1, 1, 9).getValues()[0];
  const nombre = cleanStr(vals[1]);
  if (!nombre) return;

  const card = {
    id: "SHOPIFY-" + row,
    nombre_compra: nombre,
    nombre_comensal: null,
    telefono_compra: null,
    codigo_tarjeta_regalo: cleanStr(vals[2]),
    importe: cleanNumber(vals[3]),
    observaciones: cleanStr(vals[4]),
    fecha_compra: formatDate(vals[5]),
    creada_en_revo: cleanBool(vals[6]),
    entregado: null,
    fecha_entrega: null,
    pagado: null,
    fecha_pago: null,
    usado: cleanBool(vals[7]),
    fecha_caducidad: formatDate(vals[8])
  };

  sendCardToServer(card);
}

/**
 * Envía la tarjeta al servidor mediante HTTP POST
 */
function sendCardToServer(card) {
  const payload = JSON.stringify({
    secret: SECRET,
    card: card,
    action: "upsert"
  });

  const options = {
    method: "post",
    contentType: "application/json",
    payload: payload,
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(SERVER_URL, options);
    Logger.log("Sincronización enviada. Respuesta: " + response.getContentText());
  } catch (err) {
    Logger.log("Error enviando webhook: " + err.toString());
  }
}

/**
 * Función manual para sincronizar todo el documento de golpe si se desea
 */
function syncAllSheetsManual() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allCards = [];
  let autoId = 1;

  // 1. OT PERSONALIZADAS
  const sheetP = ss.getSheetByName("OT PERSONALIZADAS");
  if (sheetP) {
    const dataP = sheetP.getDataRange().getValues();
    for (let r = 2; r < dataP.length; r++) {
      const row = dataP[r];
      const nombre = cleanStr(row[1]);
      if (!nombre) continue;
      allCards.push({
        id: String(autoId++),
        nombre_compra: nombre,
        telefono_compra: cleanStr(row[2]),
        nombre_comensal: cleanStr(row[3]),
        codigo_tarjeta_regalo: cleanStr(row[4]),
        importe: cleanNumber(row[5]),
        observaciones: cleanStr(row[6]),
        creada_en_revo: null,
        fecha_compra: null,
        entregado: cleanBool(row[7]),
        fecha_entrega: formatDate(row[8]),
        pagado: cleanBool(row[9]),
        fecha_pago: formatDate(row[10]),
        usado: cleanBool(row[11]),
        fecha_caducidad: formatDate(row[12])
      });
    }
  }

  // 2. OT WIX
  const sheetW = ss.getSheetByName("OT WIX");
  if (sheetW) {
    const dataW = sheetW.getDataRange().getValues();
    for (let r = 2; r < dataW.length; r++) {
      const row = dataW[r];
      const nombre = cleanStr(row[1]);
      if (!nombre) continue;
      allCards.push({
        id: String(autoId++),
        nombre_compra: nombre,
        nombre_comensal: null,
        telefono_compra: cleanStr(row[2]),
        codigo_tarjeta_regalo: cleanStr(row[4]),
        importe: cleanNumber(row[5]),
        observaciones: cleanStr(row[6]),
        fecha_compra: formatDate(row[7]),
        creada_en_revo: cleanBool(row[8]),
        entregado: null,
        fecha_entrega: null,
        pagado: null,
        fecha_pago: null,
        usado: cleanBool(row[9]),
        fecha_caducidad: formatDate(row[10])
      });
    }
  }

  // 3. OT SHOPIFY
  const sheetS = ss.getSheetByName("OT SHOPIFY");
  if (sheetS) {
    const dataS = sheetS.getDataRange().getValues();
    for (let r = 2; r < dataS.length; r++) {
      const row = dataS[r];
      const nombre = cleanStr(row[1]);
      if (!nombre) continue;
      allCards.push({
        id: String(autoId++),
        nombre_compra: nombre,
        nombre_comensal: null,
        telefono_compra: null,
        codigo_tarjeta_regalo: cleanStr(row[2]),
        importe: cleanNumber(row[3]),
        observaciones: cleanStr(row[4]),
        fecha_compra: formatDate(row[5]),
        creada_en_revo: cleanBool(row[6]),
        entregado: null,
        fecha_entrega: null,
        pagado: null,
        fecha_pago: null,
        usado: cleanBool(row[7]),
        fecha_caducidad: formatDate(row[8])
      });
    }
  }

  const payload = JSON.stringify({
    secret: SECRET,
    fullSyncList: allCards
  });

  const options = {
    method: "post",
    contentType: "application/json",
    payload: payload,
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(SERVER_URL, options);
  SpreadsheetApp.getUi().alert("Sincronización completada: " + res.getContentText());
}

// Helpers de formateo
function cleanStr(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return (s === "" || s === "-" || s.toLowerCase() === "none") ? null : s;
}

function cleanNumber(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return val;
  const s = String(val).replace("€", "").replace(",", ".").trim();
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function cleanBool(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "boolean") return val;
  const s = String(val).toLowerCase().trim();
  if (s === "true" || s === "1" || s === "si" || s === "sí" || s === "verdadero") return true;
  if (s === "false" || s === "0" || s === "no" || s === "falso") return false;
  return null;
}

function formatDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, "0");
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const y = val.getFullYear();
    return d + "/" + m + "/" + y;
  }
  const s = String(val).trim();
  return (s === "" || s === "-") ? null : s;
}
