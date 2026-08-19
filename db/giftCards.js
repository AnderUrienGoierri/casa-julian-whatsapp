const fs = require('fs');
const path = require('path');
const { pool, DB_PATH, getSpainIsoTimestamp } = require('./connection');

function loadDb() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const initial = { reservas: [], waitlist: [], tarjetasRegalo: [], solicitudes: [] };
            fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
            return initial;
        }
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed.tarjetasRegalo) parsed.tarjetasRegalo = [];
        return parsed;
    } catch (e) {
        console.error("Error leyendo db.json:", e.message);
        return { reservas: [], waitlist: [], tarjetasRegalo: [], solicitudes: [] };
    }
}

function saveDb(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Error guardando db.json:", e.message);
    }
}

/**
 * Parsea fechas en formatos 'DD/MM/YYYY', 'DD-MM-YYYY' o 'YYYY-MM-DD' a objeto Date (a las 23:59:59 del día).
 */
function parseDateStrToDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim();
    // DD/MM/YYYY o DD-MM-YYYY
    const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
        const day = parseInt(dmyMatch[1], 10);
        const month = parseInt(dmyMatch[2], 10) - 1;
        const year = parseInt(dmyMatch[3], 10);
        return new Date(year, month, day, 23, 59, 59);
    }
    // YYYY-MM-DD
    const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10) - 1;
        const day = parseInt(ymdMatch[3], 10);
        return new Date(year, month, day, 23, 59, 59);
    }
    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Calcula la fecha de caducidad exacta a 6 meses desde la fecha de compra.
 * Formato devuelto: DD/MM/YYYY
 */
function calculateSixMonthsValidity(fechaCompraStr) {
    let date = parseDateStrToDate(fechaCompraStr) || new Date();
    // Sumar 6 meses
    const targetMonth = date.getMonth() + 6;
    date.setMonth(targetMonth);
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Comprueba si la fecha de caducidad ha pasado respecto a la fecha actual en España.
 */
function isCardExpired(fechaCaducidadStr) {
    if (!fechaCaducidadStr) return false;
    const expDate = parseDateStrToDate(fechaCaducidadStr);
    if (!expDate) return false;
    const now = new Date();
    return now.getTime() > expDate.getTime();
}

/**
 * Extrae el código de tarjeta regalo de cualquier texto de solicitud o resumen.
 */
function extractGiftCardCodeFromText(text) {
    if (!text) return null;
    const match = text.match(/(?:TR\-[\w\d]+|[A-Z0-9]{4,15})/i);
    return match ? match[0].toUpperCase() : null;
}

/**
 * Obtiene una tarjeta regalo por código o ID, aplicando la validación de caducidad automática.
 */
async function getGiftCard(criterio) {
    if (!criterio) return null;
    const search = criterio.toString().trim().toUpperCase();
    let card = null;

    if (pool) {
        try {
            const res = await pool.query(
                `SELECT * 
                 FROM tarjetas_regalo 
                 WHERE UPPER(codigo) = $1 
                    OR UPPER(id) = $1 
                 LIMIT 1`,
                [search]
            );
            if (res && res.rows && res.rows.length > 0) {
                card = res.rows[0];
            }
        } catch (err) {
            console.error("Error consultando tarjetas_regalo en PostgreSQL:", err.message);
        }
    }

    if (!card) {
        const db = loadDb();
        const tarjetas = db.tarjetasRegalo || [];
        card = tarjetas.find(t => 
            (t.codigo && t.codigo.toUpperCase() === search) ||
            (t.id && t.id.toUpperCase() === search)
        ) || null;
    }

    if (!card) return null;

    // Normalizar estado 'ACTIVA' a 'DISPONIBLE' si viene de datos legacy
    if (card.estado === 'ACTIVA') {
        card.estado = 'DISPONIBLE';
    }

    // Regla de Caducidad (6 Meses):
    // Si ha pasado la fecha de caducidad y el estado no es ya CONSUMIDA, pasa a CADUCADA
    if (isCardExpired(card.fecha_caducidad) && card.estado !== 'CONSUMIDA' && card.estado !== 'CADUCADA') {
        console.log(`⏳ Tarjeta ${card.codigo} superó su plazo de 6 meses (${card.fecha_caducidad}). Actualizando a 'CADUCADA'.`);
        card.estado = 'CADUCADA';
        await updateGiftCardStatus(card.codigo, 'CADUCADA');
    }

    return card;
}

/**
 * Actualiza el estado de una tarjeta regalo en PostgreSQL y db.json.
 */
async function updateGiftCardStatus(criterio, nuevoEstado) {
    if (!criterio) return null;
    const search = criterio.toString().trim().toUpperCase();
    const nowSpain = getSpainIsoTimestamp ? getSpainIsoTimestamp() : new Date().toISOString();

    const db = loadDb();
    if (db.tarjetasRegalo) {
        const localCard = db.tarjetasRegalo.find(t =>
            (t.codigo && t.codigo.toUpperCase() === search) ||
            (t.id && t.id.toUpperCase() === search)
        );
        if (localCard) {
            localCard.estado = nuevoEstado;
            localCard.fecha_ultima_modificacion = nowSpain;
            saveDb(db);
        }
    }

    if (pool) {
        try {
            await pool.query(
                `UPDATE tarjetas_regalo 
                 SET estado = $1, fecha_ultima_modificacion = (NOW() AT TIME ZONE 'Europe/Madrid') 
                 WHERE UPPER(codigo) = $2 OR UPPER(id) = $2`,
                [nuevoEstado, search]
            );
            console.log(`✅ Estado de tarjeta ${search} actualizado a '${nuevoEstado}' en PostgreSQL.`);
        } catch (err) {
            console.error("Error actualizando tarjetas_regalo en PostgreSQL:", err.message);
        }
    }
}

/**
 * Crea una nueva tarjeta regalo con fecha de caducidad automática a 6 meses.
 */
function createGiftCard(data) {
    const db = loadDb();
    const nowSpain = getSpainIsoTimestamp ? getSpainIsoTimestamp() : new Date().toISOString();
    const fechaCompra = data.fecha_compra || new Date().toLocaleDateString('es-ES');
    const fechaCaducidad = data.fecha_caducidad || calculateSixMonthsValidity(fechaCompra);

    const nuevaTarjeta = {
        id: 'TR-' + Date.now().toString().slice(-6),
        codigo: data.codigo.trim().toUpperCase(),
        comprador_nombre: data.comprador_nombre || 'Desconocido',
        comprador_telefono: data.comprador_telefono || '',
        fecha_compra: fechaCompra,
        fecha_caducidad: fechaCaducidad,
        estado: data.estado || 'DISPONIBLE',
        fecha_ultima_modificacion: nowSpain
    };

    if (!db.tarjetasRegalo) db.tarjetasRegalo = [];
    db.tarjetasRegalo.push(nuevaTarjeta);
    saveDb(db);

    if (pool) {
        pool.query(
            `INSERT INTO tarjetas_regalo(id, codigo, comprador_nombre, comprador_telefono, fecha_compra, fecha_caducidad, estado, fecha_ultima_modificacion)
             VALUES($1, $2, $3, $4, $5, $6, $7, (NOW() AT TIME ZONE 'Europe/Madrid')) ON CONFLICT(codigo) DO NOTHING`,
            [nuevaTarjeta.id, nuevaTarjeta.codigo, nuevaTarjeta.comprador_nombre, nuevaTarjeta.comprador_telefono, nuevaTarjeta.fecha_compra, nuevaTarjeta.fecha_caducidad, nuevaTarjeta.estado]
        ).catch(err => console.error("Error PostgreSQL INSERT tarjetas_regalo:", err.message));
    }

    return nuevaTarjeta;
}

/**
 * Obtiene todas las tarjetas regalo registradas con su estado actualizado.
 */
async function getAllGiftCards() {
    let list = [];
    if (pool) {
        try {
            const res = await pool.query(`SELECT * FROM tarjetas_regalo ORDER BY fecha_compra DESC, codigo ASC`);
            if (res && res.rows) list = res.rows;
        } catch (err) {
            console.error("Error consultando lista completa de tarjetas:", err.message);
        }
    }
    if (list.length === 0) {
        const db = loadDb();
        list = db.tarjetasRegalo || [];
    }

    return list.map(card => {
        let estado = card.estado || 'DISPONIBLE';
        if (estado === 'ACTIVA') estado = 'DISPONIBLE';
        if (isCardExpired(card.fecha_caducidad) && estado !== 'CONSUMIDA') {
            estado = 'CADUCADA';
        }
        return { ...card, estado };
    });
}

module.exports = {
    getGiftCard,
    updateGiftCardStatus,
    createGiftCard,
    getAllGiftCards,
    calculateSixMonthsValidity,
    isCardExpired,
    extractGiftCardCodeFromText
};
