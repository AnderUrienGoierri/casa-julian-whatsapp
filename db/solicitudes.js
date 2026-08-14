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

    const initialMensajes = [
        {
            emisor: 'cliente',
            texto: datosDetallados || 'Solicitud inicial enviada.',
            fecha: timestamp
        }
    ];

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
        enAtencionHumana: false,
        mensajes: initialMensajes,
        created_at: timestamp
    };

    if (pool) {
        try {
            await pool.query(
                `INSERT INTO solicitudes 
                (id, tipo_accion, categoria, categoria_label, telefono_cliente, nombre_cliente, telefono_reserva, datos_detallados, estado, en_atencion_humana, mensajes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
                    nuevaSolicitud.enAtencionHumana,
                    JSON.stringify(nuevaSolicitud.mensajes),
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
 * Obtiene todas las solicitudes ordenadas por fecha más reciente con sus hilos de conversación.
 */
async function getAllSolicitudes() {
    if (pool) {
        try {
            const res = await pool.query(`SELECT * FROM solicitudes ORDER BY created_at DESC`);
            if (res.rows && res.rows.length > 0) {
                return res.rows.map(r => {
                    let parsedMensajes = [];
                    if (r.mensajes) {
                        try {
                            parsedMensajes = typeof r.mensajes === 'string' ? JSON.parse(r.mensajes) : r.mensajes;
                        } catch (e) {
                            parsedMensajes = [{ emisor: 'cliente', texto: r.datos_detallados, fecha: r.created_at }];
                        }
                    } else if (r.datos_detallados) {
                        parsedMensajes = [{ emisor: 'cliente', texto: r.datos_detallados, fecha: r.created_at }];
                    }

                    return {
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
                        enAtencionHumana: r.en_atencion_humana === true,
                        mensajes: parsedMensajes,
                        created_at: r.created_at
                    };
                });
            }
        } catch (e) {
            console.error("Error consultando solicitudes en Postgres:", e.message);
        }
    }

    const db = loadDb();
    const list = db.solicitudes || [];
    return list.map(s => ({
        ...s,
        enAtencionHumana: s.enAtencionHumana === true,
        mensajes: s.mensajes || (s.datosDetallados ? [{ emisor: 'cliente', texto: s.datosDetallados, fecha: s.created_at }] : [])
    }));
}

/**
 * Comprueba si un cliente tiene una solicitud activa en Modo Atención Humana (bot pausado).
 * IMPORTANTE: Consulta SIEMPRE PostgreSQL directamente. Si PG no está disponible, devuelve null
 * (bot activo por defecto) para evitar falsos positivos con datos obsoletos del fallback db.json.
 */
async function getActiveHumanHandoverSolicitud(telefono) {
    if (!telefono) return null;
    const cleanTel = telefono.toString().replace(/\D/g, '');

    // Consulta directa a PostgreSQL (fuente de verdad)
    if (pool) {
        try {
            const res = await pool.query(
                `SELECT * FROM solicitudes 
                 WHERE en_atencion_humana = true 
                 AND estado IN ('PENDIENTE', 'EN_GESTION', 'RESPONDIDA')
                 AND (telefono_cliente = $1 OR telefono_reserva = $1)
                 LIMIT 1`,
                [cleanTel]
            );
            if (res.rows && res.rows.length > 0) {
                const r = res.rows[0];
                let parsedMensajes = [];
                try {
                    parsedMensajes = typeof r.mensajes === 'string' ? JSON.parse(r.mensajes) : (r.mensajes || []);
                } catch (e) {
                    parsedMensajes = [];
                }
                return {
                    id: r.id,
                    tipoAccion: r.tipo_accion,
                    categoria: r.categoria,
                    categoriaLabel: r.categoria_label,
                    telefonoCliente: r.telefono_cliente,
                    nombreCliente: r.nombre_cliente,
                    telefonoReserva: r.telefono_reserva,
                    datosDetallados: r.datos_detallados,
                    estado: r.estado,
                    enAtencionHumana: true,
                    mensajes: parsedMensajes,
                    created_at: r.created_at
                };
            }
            return null; // Sin solicitud activa en modo humano
        } catch (e) {
            // Si PostgreSQL falla, devolvemos null (bot activo) — no usamos el fallback db.json
            // para evitar bloqueos erróneos con datos obsoletos
            console.warn(`⚠️ [handover] PostgreSQL no disponible, bot activo por defecto: ${e.message}`);
            return null;
        }
    }

    // Sin pool PostgreSQL configurado: consulta al db.json (solo en entorno local sin PG)
    const db = loadDb();
    const list = db.solicitudes || [];
    return list.find(s =>
        (s.enAtencionHumana === true) &&
        (s.estado === 'PENDIENTE' || s.estado === 'EN_GESTION' || s.estado === 'RESPONDIDA') &&
        (s.telefonoCliente === cleanTel || s.telefonoReserva === cleanTel)
    ) || null;
}

/**
 * Añade un mensaje al hilo de conversación de una solicitud.
 */
async function appendMessageToSolicitud(id, { emisor, texto, fecha = null }) {
    const timestamp = fecha || getSpainIsoTimestamp();
    const nuevoMensaje = {
        emisor: emisor || 'cliente',
        texto: texto || '',
        fecha: timestamp
    };

    const all = await getAllSolicitudes();
    const sol = all.find(s => s.id === id);
    if (!sol) return null;

    const mensajesActualizados = Array.isArray(sol.mensajes) ? [...sol.mensajes, nuevoMensaje] : [nuevoMensaje];

    if (pool) {
        try {
            await pool.query(
                `UPDATE solicitudes SET mensajes = $1 WHERE id = $2`,
                [JSON.stringify(mensajesActualizados), id]
            );
        } catch (e) {
            console.error("Error actualizando mensajes de solicitud en Postgres:", e.message);
        }
    }

    const db = loadDb();
    if (db.solicitudes) {
        const target = db.solicitudes.find(s => s.id === id);
        if (target) {
            target.mensajes = mensajesActualizados;
            saveDb(db);
        }
    }

    return { ...sol, mensajes: mensajesActualizados };
}

/**
 * Actualiza el estado, respuesta y modo de atención humana de una solicitud por su ID.
 */
async function updateSolicitudStatus(id, estado, respuestaStaff = null, enAtencionHumana = null) {
    const timestamp = getSpainIsoTimestamp();
    const all = await getAllSolicitudes();
    const sol = all.find(s => s.id === id);
    if (!sol) return null;

    let mensajesActualizados = Array.isArray(sol.mensajes) ? [...sol.mensajes] : [];
    if (respuestaStaff) {
        mensajesActualizados.push({
            emisor: 'recepcion',
            texto: respuestaStaff,
            fecha: timestamp
        });
    }

    const finalEnAtencion = (enAtencionHumana !== null) ? enAtencionHumana : (estado === 'CONFIRMADA' || estado === 'RECHAZADA' || estado === 'RESUELTA' ? false : sol.enAtencionHumana);

    if (pool) {
        try {
            await pool.query(
                `UPDATE solicitudes 
                SET estado = $1, respuesta_staff = $2, fecha_respuesta = $3, en_atencion_humana = $4, mensajes = $5 
                WHERE id = $6`,
                [estado, respuestaStaff, timestamp, finalEnAtencion, JSON.stringify(mensajesActualizados), id]
            );
        } catch (e) {
            console.error("Error actualizando solicitud en Postgres:", e.message);
        }
    }

    const db = loadDb();
    if (db.solicitudes) {
        const target = db.solicitudes.find(s => s.id === id);
        if (target) {
            target.estado = estado;
            if (respuestaStaff !== null) target.respuestaStaff = respuestaStaff;
            target.fechaRespuesta = timestamp;
            target.enAtencionHumana = finalEnAtencion;
            target.mensajes = mensajesActualizados;
            saveDb(db);
            return target;
        }
    }
    return sol;
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
    getActiveHumanHandoverSolicitud,
    appendMessageToSolicitud,
    updateSolicitudStatus,
    deleteSolicitud
};
