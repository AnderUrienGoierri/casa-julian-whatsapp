/**
 * ============================================================================
 * CASA JULIÁN - GOOGLE APPS SCRIPT PARA SINCRONIZACIÓN EN TIEMPO REAL
 * ============================================================================
 * Instrucciones de instalación:
 * 1. Abre el archivo de Google Sheets / Drive "OPARI TXARTELAK".
 * 2. Ve al menú superior: Extensiones > Apps Script.
 * 3. Borra el código existente y pega este archivo completo.
 * 4. Guarda el proyecto (Ctrl + S) con el nombre "SyncCasaJulianBot".
 * 5. Ve al menú izquierdo: Activadores (icono de reloj ⏰) > Añadir activador:
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

    if (sheetName === "OT PERSONALIZADAS" || sheetName === "OT WIX" || sheetName === "OT SHOPIFY") {
      syncDynamicRow(sheet, sheetName, row);
    }
  } catch (err) {
    Logger.log("Error en onSheetEditTrigger: " + err.toString());
  }
}

/**
 * Sincroniza dinámicamente cualquier fila identificando las columnas por sus cabeceras
 */
function syncDynamicRow(sheet, sheetName, row) {
  const headers = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowVals = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

  const map = {};
  for (let c = 0; c < headers.length; c++) {
    const h = String(headers[c] || "").trim().toUpperCase();
    if (h) map[h] = rowVals[c];
  }

  const nombre = cleanStr(map["NOMBRE"] || map["DATOS COMPRADOR"]);
  if (!nombre) return;

  const card = buildCardFromMap(map, sheetName, row);
  sendCardToServer(card);
}

/**
 * Construye el objeto de tarjeta a partir del mapeo de cabeceras
 */
function buildCardFromMap(map, sheetName, row) {
  let prefix = "PERS-";
  let tipo = "PERSONALIZADAS";
  if (sheetName === "OT WIX") {
    prefix = "WIX-";
    tipo = "WIX";
  } else if (sheetName === "OT SHOPIFY") {
    prefix = "SHOPIFY-";
    tipo = "SHOPIFY";
  }

  // Activo: Si la columna ACTIVO tiene 'SI', 'SÍ', 'TRUE', o checkbox marcado -> true
  let activoVal = map["ACTIVO"];
  let activo = true;
  if (activoVal !== undefined && activoVal !== null && String(activoVal).trim() !== "") {
    activo = cleanBool(activoVal);
  }

  const nombreCompra = cleanStr(map["NOMBRE"] || map["DATOS COMPRADOR"]);
  const telefonoCompra = cleanStr(map["TELF"] || map["TELEFONO"] || map["TELÉFONO"]);
  const nombreComensal = cleanStr(map["NOMBRE COMENSAL"] || map["COMENSAL"]);
  const codigo = cleanStr(map["NºTARJ.REG."] || map["Nº"] || map["NUMERO"] || map["CODIGO"] || map["CÓDIGO"] || map["Nº TARJETA"]);
  const importeRaw = map["IMPORTE"];
  let obs = cleanStr(map["OBSERVACIONES"]);
  const importe = cleanNumber(importeRaw);

  const entregado = map["ENTREGADO"] !== undefined ? cleanBool(map["ENTREGADO"]) : null;
  const fechaEntrega = formatDate(map["FECHA ENTREGADO"] || map["FECHA ENTREGA"]);
  const pagado = map["PAGADO"] !== undefined ? cleanBool(map["PAGADO"]) : null;
  const fechaPago = formatDate(map["FECHA PAGADO"] || map["FECHA PAGO"]);
  const creadaEnRevo = map["CREADA EN REVO"] !== undefined ? cleanBool(map["CREADA EN REVO"]) : null;
  const fechaCompra = formatDate(map["COMPRADO"] || map["FECHA COMPRA"] || map["FECHA"]);
  const usado = cleanBool(map["USADO"]);
  const fechaCaducidad = formatDate(map["FECHA CADUCIDAD"] || map["CADUCIDAD"]);

  return {
    id: prefix + row,
    tipo_tarjeta_regalo: tipo,
    nombre_compra: nombreCompra,
    nombre_comensal: nombreComensal,
    telefono_compra: telefonoCompra,
    codigo_tarjeta_regalo: codigo,
    importe: importe,
    observaciones: obs,
    creada_en_revo: creadaEnRevo,
    fecha_compra: fechaCompra,
    entregado: entregado,
    fecha_entrega: fechaEntrega,
    pagado: pagado,
    fecha_pago: fechaPago,
    usado: usado,
    fecha_caducidad: fechaCaducidad,
    activo: activo
  };
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
    Logger.log("Sincronización enviada (" + card.id + "). Respuesta: " + response.getContentText());
  } catch (err) {
    Logger.log("Error enviando webhook: " + err.toString());
  }
}

/**
 * Sincronización completa manual de todas las pestañas de una sola vez
 */
function syncAllSheetsManual() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const allCards = [];
  const sheets = ["OT PERSONALIZADAS", "OT WIX", "OT SHOPIFY"];

  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    if (data.length < 3) return;

    const headers = data[1]; // Fila 2
    for (let r = 2; r < data.length; r++) {
      const rowVals = data[r];
      const map = {};
      for (let c = 0; c < headers.length; c++) {
        const h = String(headers[c] || "").trim().toUpperCase();
        if (h) map[h] = rowVals[c];
      }

      const nombre = cleanStr(map["NOMBRE"] || map["DATOS COMPRADOR"]);
      if (!nombre) continue;

      allCards.push(buildCardFromMap(map, sheetName, r + 1));
    }
  });

  Logger.log("Enviando lote de " + allCards.length + " tarjetas al servidor...");
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

  try {
    const response = UrlFetchApp.fetch(SERVER_URL, options);
    Logger.log("Resultado sincronización completa: " + response.getContentText());
  } catch (err) {
    Logger.log("Error en sincronización completa: " + err.toString());
  }
}

// ==========================================
// UTILIDADES DE LIMPIEZA DE DATOS
// ==========================================

function cleanStr(val) {
  if (val === null || val === undefined) return null;
  let s = String(val).trim();
  if (s.endsWith(".0") && s.slice(0, -2).match(/^\d+$/)) {
    s = s.slice(0, -2);
  }
  if (s === "" || s === "-" || s === "?" || s.toLowerCase() === "none") return null;
  return s;
}

function cleanBool(val) {
  if (val === null || val === undefined) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  const s = String(val).trim().toLowerCase();
  return ["true", "1", "si", "sí", "s", "verdadero", "x"].includes(s);
}

function cleanNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  let s = String(val).replace("€", "").replace(/\s/g, "").replace(",", ".").trim();
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function formatDate(val) {
  if (!val) return null;
  if (Object.prototype.toString.call(val) === "[object Date]") {
    if (isNaN(val.getTime())) return null;
    const day = ("0" + val.getDate()).slice(-2);
    const month = ("0" + (val.getMonth() + 1)).slice(-2);
    const year = val.getFullYear();
    return day + "/" + month + "/" + year;
  }
  const s = cleanStr(val);
  if (!s) return null;
  return s;
}
