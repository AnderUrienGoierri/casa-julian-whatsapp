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
        if (!parsed.solicitudes) parsed.solicitudes = [];
        return parsed;
    } catch (e) {
        console.error("Error leyendo db.json:", e.message);
        return { reservas: [], waitlist: [], tarjetasRegalo: [], solicitudes: [] };
    }
}

function saveDb(data) {
    try {
        if (!data.solicitudes) data.solicitudes = [];
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Error guardando db.json:", e.message);
    }
}

/**
 * Clasifica la solicitud en una categoría estructurada con su etiqueta visual e icono.
 */
function getCategoryTagInfo(tipoAccion, datosDetallados) {
    const tipo = (tipoAccion || '').toUpperCase();
    const datos = (datosDetallados || '').toUpperCase();

    // 1. Tarjeta Regalo / Menú Tradición
    if (tipo.includes('TRADICIÓN') || tipo.includes('TRADICION') || tipo.includes('REGALO')) {
        return {
            key: 'reservas_menu_tradicion',
            label: '🎁 Reservas Menú Tradición',
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.15)',
            badgeClass: 'badge-tradicion'
        };
    }

    // 2. Cancelaciones
    if (tipo.includes('CANCELACIÓN') || tipo.includes('CANCELACION')) {
        return {
            key: 'cancelacion',
            label: '❌ Cancelaciones',
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.15)',
            badgeClass: 'badge-cancelacion'
        };
    }

    // 3. Modificaciones (Desglosadas por Comensales, Día u Hora)
    if (tipo.includes('MODIFICACIÓN') || tipo.includes('MODIFICACION')) {
        if (datos.includes('COMENSALES') || datos.includes('PERSONAS') || datos.includes('ASISTENTES') || datos.includes('NIÑOS') || datos.includes('NINOS')) {
            return {
                key: 'mod_comensales',
                label: '👥 Modificaciones Comensales',
                color: '#06b6d4',
                bg: 'rgba(6, 182, 212, 0.15)',
                badgeClass: 'badge-mod-comensales'
            };
        }
        if (datos.includes('DÍA') || datos.includes('DIA') || datos.includes('FECHA')) {
            return {
                key: 'mod_dia',
                label: '📅 Modificaciones Día',
                color: '#6366f1',
                bg: 'rgba(99, 102, 241, 0.15)',
                badgeClass: 'badge-mod-dia'
            };
        }
        if (datos.includes('HORA') || datos.includes('TURNO') || datos.includes('SERVICIO')) {
            return {
                key: 'mod_hora',
                label: '🕐 Modificaciones Hora',
                color: '#a855f7',
                bg: 'rgba(168, 85, 247, 0.15)',
                badgeClass: 'badge-mod-hora'
            };
        }
        return {
            key: 'mod_general',
            label: '✏️ Modificación General',
            color: '#3b82f6',
            bg: 'rgba(59, 130, 246, 0.15)',
            badgeClass: 'badge-mod-general'
        };
    }

    // 4. Consultas Abiertas / Casuísticas Especiales
    if (tipo.includes('CONSULTA') || tipo.includes('CASUÍSTICA') || tipo.includes('CASUISTICA') || tipo.includes('PREGUNTA')) {
        return {
            key: 'consulta_abierta',
            label: '💬 Consultas Abiertas',
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.15)',
            badgeClass: 'badge-consulta'
        };
    }

    // 5. Lista de Espera
    if (tipo.includes('ESPERA')) {
        return {
            key: 'lista_espera',
            label: '📋 Lista de Espera',
            color: '#eab308',
            bg: 'rgba(234, 179, 8, 0.15)',
            badgeClass: 'badge-espera'
        };
    }

    // 6. Default / Reserva Online
    return {
        key: 'reserva_online',
        label: '🔴 Reserva Online',
        color: '#dc2626',
        bg: 'rgba(220, 38, 38, 0.15)',
        badgeClass: 'badge-reserva'
    };
}

/**
 * Crea y guarda una nueva solicitud enviada por un cliente desde el chatbot.
 */
async function createSolicitud({ tipoAccion, telefonoCliente, datosDetallados, nombreCliente = null, telefonoReserva = null }) {
    const tagInfo = getCategoryTagInfo(tipoAccion, datosDetallados);
    
    // Las Reservas Online y Lista de Espera se autogestionan vía TheFork / Web Oficial.
    // Se descartan de esta bandeja de entrada.
    if (tagInfo.key === 'reserva_online' || tagInfo.key === 'lista_espera') {
        console.log(`   └─ ℹ️ Solicitud de tipo "${tagInfo.key}" ignorada (gestionada externa por TheFork/Web).`);
        return null;
    }

    const id = `SOL-${Date.now()}`;
    const timestamp = getSpainIsoTimestamp();

    const nuevaSolicitud = {
        id,
        tipoAccion,
        categoria: tagInfo.key,
        categoriaLabel: tagInfo.label,
        categoriaColor: tagInfo.color,
        telefonoCliente: telefonoCliente ? telefonoCliente.toString().replace(/\D/g, '') : '',
        nombreCliente: nombreCliente || 'Cliente Casa Julián',
        telefonoReserva: telefonoReserva ? telefonoReserva.toString().replace(/\D/g, '') : (telefonoCliente ? telefonoCliente.toString().replace(/\D/g, '') : ''),
        datosDetallados: datosDetallados || '',
        estado: 'PENDIENTE',
        respuestaStaff: null,
        fechaRespuesta: null,
        created_at: timestamp
    };

    if (pool) {
        try {
            await pool.query(
                `INSERT INTO solicitudes 
                (id, tipo_accion, categoria, categoria_label, telefono_cliente, nombre_cliente, telefono_reserva, datos_detallados, estado, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    nuevaSolicitud.id,
                    nuevaSolicitud.tipoAccion,
                    nuevaSolicitud.categoria,
                    nuevaSolicitud.categoriaLabel,
                    nuevaSolicitud.telefonoCliente,
                    nuevaSolicitud.nombreCliente,
                    nuevaSolicitud.telefonoReserva,
                    nuevaSolicitud.datosDetallados,
                    nuevaSolicitud.estado,
                    nuevaSolicitud.created_at
                ]
            );
        } catch (e) {
            console.error("Error insertando solicitud en Postgres:", e.message);
        }
    }

    const db = loadDb();
    if (!db.solicitudes) db.solicitudes = [];
    db.solicitudes.unshift(nuevaSolicitud);
    saveDb(db);

    return nuevaSolicitud;
}

/**
 * Obtiene todas las solicitudes ordenadas por fecha más reciente.
 */
async function getAllSolicitudes() {
    if (pool) {
        try {
            const res = await pool.query(`SELECT * FROM solicitudes ORDER BY created_at DESC`);
            if (res.rows && res.rows.length > 0) {
                return res.rows.map(r => ({
                    id: r.id,
                    tipoAccion: r.tipo_accion,
                    categoria: r.categoria,
                    categoriaLabel: r.categoria_label,
                    telefonoCliente: r.telefono_cliente,
                    nombreCliente: r.nombre_cliente,
                    telefonoReserva: r.telefono_reserva,
                    datosDetallados: r.datos_detallados,
                    estado: r.estado,
                    respuestaStaff: r.respuesta_staff,
                    fechaRespuesta: r.fecha_respuesta,
                    created_at: r.created_at
                }));
            }
        } catch (e) {
            console.error("Error consultando solicitudes en Postgres:", e.message);
        }
    }

    const db = loadDb();
    return db.solicitudes || [];
}

/**
 * Actualiza el estado y respuesta de una solicitud por su ID.
 */
async function updateSolicitudStatus(id, estado, respuestaStaff = null) {
    const timestamp = getSpainIsoTimestamp();

    if (pool) {
        try {
            await pool.query(
                `UPDATE solicitudes SET estado = $1, respuesta_staff = $2, fecha_respuesta = $3 WHERE id = $4`,
                [estado, respuestaStaff, timestamp, id]
            );
        } catch (e) {
            console.error("Error actualizando solicitud en Postgres:", e.message);
        }
    }

    const db = loadDb();
    if (db.solicitudes) {
        const sol = db.solicitudes.find(s => s.id === id);
        if (sol) {
            sol.estado = estado;
            if (respuestaStaff !== null) sol.respuestaStaff = respuestaStaff;
            sol.fechaRespuesta = timestamp;
            saveDb(db);
            return sol;
        }
    }
    return null;
}

/**
 * Elimina una solicitud por ID.
 */
async function deleteSolicitud(id) {
    if (pool) {
        try {
            await pool.query(`DELETE FROM solicitudes WHERE id = $1`, [id]);
        } catch (e) {
            console.error("Error eliminando solicitud en Postgres:", e.message);
        }
    }

    const db = loadDb();
    if (db.solicitudes) {
        db.solicitudes = db.solicitudes.filter(s => s.id !== id);
        saveDb(db);
        return true;
    }
    return false;
}

module.exports = {
    getCategoryTagInfo,
    createSolicitud,
    getAllSolicitudes,
    updateSolicitudStatus,
    deleteSolicitud
};
