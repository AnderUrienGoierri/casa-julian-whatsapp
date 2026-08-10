const fs = require('fs');
const path = require('path');
const { pool, DB_PATH, getSpainIsoTimestamp } = require('./connection');

function loadDb() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const initial = { reservas: [], waitlist: [], tarjetasRegalo: [] };
            fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
            return initial;
        }
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error("Error leyendo db.json:", e.message);
        return { reservas: [], waitlist: [], tarjetasRegalo: [] };
    }
}

function saveDb(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Error guardando db.json:", e.message);
    }
}

async function getGiftCard(criterio) {
    if (!criterio) return null;
    const search = criterio.toString().trim().toUpperCase();

    if (pool) {
        try {
            const res = await pool.query(
                `SELECT id, codigo, comprador_nombre, comprador_telefono, fecha_compra, fecha_caducidad, estado, fecha_ultima_modificacion 
                 FROM tarjetas_regalo 
                 WHERE UPPER(codigo) = $1 OR UPPER(id) = $1 LIMIT 1`,
                [search]
            );
            if (res && res.rows && res.rows.length > 0) {
                return res.rows[0];
            }
        } catch (err) {
            console.error("Error consultando tarjetas_regalo en PostgreSQL:", err.message);
        }
    }

    const db = loadDb();
    const tarjetas = db.tarjetasRegalo || [];
    const card = tarjetas.find(t => 
        (t.codigo && t.codigo.toUpperCase() === search) ||
        (t.id && t.id.toUpperCase() === search)
    );

    return card || null;
}

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
                `UPDATE tarjetas_regalo SET estado = $1, fecha_ultima_modificacion = (NOW() AT TIME ZONE 'Europe/Madrid') WHERE UPPER(codigo) = $2 OR UPPER(id) = $2`,
                [nuevoEstado, search]
            );
            console.log(`✅ Estado de tarjeta ${search} actualizado a '${nuevoEstado}' con timestamp de modificación Madrid en PostgreSQL.`);
        } catch (err) {
            console.error("Error actualizando tarjetas_regalo en PostgreSQL:", err.message);
        }
    }
}

function createGiftCard(data) {
    const db = loadDb();
    const nowSpain = getSpainIsoTimestamp ? getSpainIsoTimestamp() : new Date().toISOString();
    const nuevaTarjeta = {
        id: 'TR-' + Date.now().toString().slice(-6),
        codigo: data.codigo.trim().toUpperCase(),
        comprador_nombre: data.comprador_nombre || 'Desconocido',
        comprador_telefono: data.comprador_telefono || '',
        fecha_compra: data.fecha_compra || new Date().toLocaleDateString('es-ES'),
        fecha_caducidad: data.fecha_caducidad,
        estado: data.estado || 'ACTIVA',
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

module.exports = {
    getGiftCard,
    updateGiftCardStatus,
    createGiftCard
};
