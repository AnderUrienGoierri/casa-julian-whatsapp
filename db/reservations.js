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

function normalizePhone(phone) {
    if (!phone) return '';
    let digits = phone.toString().replace(/\D/g, '');
    if (digits.startsWith('34') && digits.length > 9) {
        digits = digits.slice(2);
    }
    return digits;
}

function normalizeText(text) {
    if (!text) return '';
    return text.toString().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, ' ')
        .trim();
}

function formatNationalityCode(nacStr) {
    if (!nacStr || ['null', 'undefined', 'n/a', 'omitir', 'omitido', 'sin especificar', 'otro / sin especificar', 'other / unspecified', 'beste bat / sin especificar'].includes(nacStr.toString().trim().toLowerCase())) {
        return null;
    }
    return nacStr.trim();
}

function formatLanguageCode(langStr) {
    if (!langStr || ['null', 'undefined', 'n/a', 'omitir', 'omitido', 'sin especificar', 'form_lang_skip'].includes(langStr.toString().trim().toLowerCase())) {
        return null;
    }
    return langStr.trim().toLowerCase();
}

function formatAllergiesInSpanish(alergiasStr) {
    if (!alergiasStr || typeof alergiasStr !== 'string') return 'NO';
    const clean = alergiasStr.trim().toLowerCase();
    const noValues = [
        '0', 'none', 'nada', 'no', 'ninguna', 'ninguno', 'ez', 'n/a', 'ningun', 
        'ez dugu alergiarik', 'sin alergias', 'sin alergia', 'sin restricciones', 
        'hobespenik ez', 'ez dugu', 'ninguna/sin alergia', 'sin alergias / ninguna',
        'sin alergias/ninguna', 'no tenemos', 'ez'
    ];
    if (noValues.includes(clean) || clean === '') return 'NO';

    const allergyTranslations = {
        'glutena': 'Gluten / Celíacos',
        'gluten': 'Gluten / Celíacos',
        'zeliakoa': 'Gluten / Celíacos',
        'celiaco': 'Gluten / Celíacos',
        'celíaco': 'Gluten / Celíacos',
        'laktosa': 'Lactosa',
        'fruitu lehorrak': 'Frutos secos / Huevo',
        'mariskoa': 'Marisco / Pescado',
        'arraina': 'Marisco / Pescado',
        'diabetikoa': 'Diabetes',
        'diabetesa': 'Diabetes',
        'hipertentsioa': 'Hipertensión',
        'begetarianoa': 'Vegetariano / Vegano',
        'vegano': 'Vegetariano / Vegano',
        'vegana': 'Vegetariano / Vegano'
    };

    if (allergyTranslations[clean]) return allergyTranslations[clean];

    if (alergiasStr.includes(',')) {
        const parts = alergiasStr.split(',').map(p => p.trim());
        const translatedParts = parts.map(p => {
            const low = p.toLowerCase();
            return allergyTranslations[low] || p;
        });
        return translatedParts.join(', ');
    }

    return alergiasStr.trim();
}

function formatDaysInSpanish(diasStr) {
    if (!diasStr || typeof diasStr !== 'string') return 'Sin preferencia';
    const dayMap = {
        'asteartea': 'Martes', 'martes': 'Martes', 'tuesday': 'Martes',
        'asteazkena': 'Miércoles', 'miércoles': 'Miércoles', 'miercoles': 'Miércoles', 'wednesday': 'Miércoles',
        'osteguna': 'Jueves', 'jueves': 'Jueves', 'thursday': 'Jueves',
        'ostirala': 'Viernes', 'viernes': 'Viernes', 'friday': 'Viernes',
        'larunbata': 'Sábado', 'sábado': 'Sábado', 'sabado': 'Sábado', 'saturday': 'Sábado',
        'igandea': 'Domingo', 'domingo': 'Domingo', 'sunday': 'Domingo',
        'sin preferencia': 'Sin preferencia', 'hobespenik ez': 'Sin preferencia', 'no preference': 'Sin preferencia'
    };

    const parts = diasStr.split(',').map(s => s.trim());
    const translated = parts.map(part => {
        const lower = part.toLowerCase();
        return dayMap[lower] || part;
    });

    return translated.join(', ');
}

// -------------------------------------------------------------
// ACTUALIZACIÓN AUTOMÁTICA DE ESTADOS
// -------------------------------------------------------------

function autoUpdateReservationStatuses() {
    const db = loadDb();
    if (!db.reservas || db.reservas.length === 0) return;

    const now = new Date();
    let updatedCount = 0;

    db.reservas.forEach(r => {
        if (!r.fecha || !r.hora) return;
        if (r.estado === 'CANCELADA' || r.estado === 'SERVICIO FINALIZADO') return;

        let day, month, year;
        if (r.fecha.includes('/')) {
            const parts = r.fecha.split('/');
            day = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            year = parseInt(parts[2], 10);
        } else if (r.fecha.includes('-')) {
            const parts = r.fecha.split('-');
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1;
            day = parseInt(parts[2], 10);
        } else {
            return;
        }

        const partsTime = r.hora.split(':');
        const hour = parseInt(partsTime[0], 10);
        const min = parseInt(partsTime[1], 10) || 0;

        if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour)) return;

        const startDate = new Date(year, month, day, hour, min, 0);
        const endDate = new Date(startDate.getTime() + (2.5 * 60 * 60 * 1000));

        if (now >= endDate) {
            if (r.estado !== 'SERVICIO FINALIZADO') {
                r.estado = 'SERVICIO FINALIZADO';
                updatedCount++;
            }
        } else if (now >= startDate) {
            if (r.estado !== 'EN SERVICIO') {
                r.estado = 'EN SERVICIO';
                updatedCount++;
            }
        }
    });

    if (updatedCount > 0) {
        saveDb(db);
        console.log(`🔄 Actualizados automáticamente ${updatedCount} estados de reserva a EN SERVICIO / SERVICIO FINALIZADO.`);
    }

    if (pool) {
        pool.query(`
            UPDATE reservas 
            SET estado = 'EN SERVICIO' 
            WHERE estado IN ('CONFIRMADA', 'PENDIENTE CONFIRMACIÓN') 
              AND TO_TIMESTAMP(fecha || ' ' || hora, 'DD/MM/YYYY HH24:MI') <= NOW()
              AND TO_TIMESTAMP(fecha || ' ' || hora, 'DD/MM/YYYY HH24:MI') + INTERVAL '2.5 hours' > NOW();
        `).catch(err => console.error("Error actualizando EN SERVICIO en PG:", err.message));

        pool.query(`
            UPDATE reservas 
            SET estado = 'SERVICIO FINALIZADO' 
            WHERE estado IN ('CONFIRMADA', 'PENDIENTE CONFIRMACIÓN', 'EN SERVICIO', 'PENDIENTE CANCELACION', 'PENDIENTE MODIFICACION') 
              AND TO_TIMESTAMP(fecha || ' ' || hora, 'DD/MM/YYYY HH24:MI') + INTERVAL '2.5 hours' <= NOW();
        `).catch(err => console.error("Error actualizando SERVICIO FINALIZADO en PG:", err.message));
    }
}

// -------------------------------------------------------------
// OPERACIONES CRUD DE RESERVAS
// -------------------------------------------------------------

function createReservation(data) {
    const db = loadDb();
    const nacCode = formatNationalityCode(data.nacionalidad);
    const langCode = formatLanguageCode(data.idioma);

    let fechasPref = [];
    if (Array.isArray(data.fechas_preferencia)) {
        fechasPref = data.fechas_preferencia.map(f => (f.label || f).toString().trim()).filter(Boolean);
    } else if (typeof data.fechas_preferencia === 'string' && data.fechas_preferencia.trim()) {
        fechasPref = data.fechas_preferencia.split(',').map(s => s.trim()).filter(Boolean);
    } else if (Array.isArray(data.fechas)) {
        fechasPref = data.fechas.map(f => (f.label || f).toString().trim()).filter(Boolean);
    } else if (typeof data.dias === 'string' && data.dias.trim()) {
        fechasPref = [data.dias.trim()];
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
    const seq = now.getTime().toString().slice(-6);
    const spainStamp = getSpainIsoTimestamp();
    const nuevaReserva = {
        id: `RES-${dateStr}-${seq}`,
        nombre: data.nombre,
        telefono: data.telefono,
        dni: (data.dni || 'N/A').toUpperCase().trim(),
        email: (data.email || 'N/A').toLowerCase().trim(),
        nacionalidad: nacCode,
        fecha: data.fecha || '',
        hora: data.hora || '',
        comensales: parseInt(data.comensales, 10) || 2,
        num_ninos: parseInt(data.ninos || data.num_ninos, 10) || 0,
        estado: data.estado || 'PENDIENTE CONFIRMACION',
        idioma: langCode,
        tipo_reserva: data.tipo_reserva || 'tarjeta_regalo',
        alergias: formatAllergiesInSpanish(data.alergias),
        tipo_servicio: data.tipo_servicio || 'Sin preferencia',
        tarjeta_regalo: data.tarjeta_regalo || null,
        fechas_preferencia: fechasPref,
        fechaCreacion: spainStamp
    };

    db.reservas.push(nuevaReserva);
    saveDb(db);

    if (pool) {
        (async () => {
            let clienteId = null;
            const clientLang = nuevaReserva.idioma || 'es';
            const clientNac = nuevaReserva.nacionalidad || 'España';
            const clientDni = nuevaReserva.dni || 'N/A';
            const clientEmail = nuevaReserva.email || 'N/A';

            try {
                const searchClient = await pool.query(
                    `SELECT id FROM clientes WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1)) AND telefono = $2 LIMIT 1`,
                    [nuevaReserva.nombre, nuevaReserva.telefono]
                );

                if (searchClient && searchClient.rows && searchClient.rows.length > 0) {
                    clienteId = searchClient.rows[0].id;
                    await pool.query(
                        `UPDATE clientes SET dni = COALESCE(NULLIF($1, 'N/A'), dni), email = COALESCE(NULLIF($2, 'N/A'), email), idioma = $3, nacionalidad = $4 WHERE id = $5`,
                        [clientDni, clientEmail, clientLang, clientNac, clienteId]
                    );
                } else {
                    const newClient = await pool.query(
                        `INSERT INTO clientes(nombre, telefono, dni, email, idioma, nacionalidad)
                         VALUES($1, $2, $3, $4, $5, $6)
                         RETURNING id`,
                        [nuevaReserva.nombre, nuevaReserva.telefono, clientDni, clientEmail, clientLang, clientNac]
                    );
                    if (newClient && newClient.rows && newClient.rows[0]) {
                        clienteId = newClient.rows[0].id;
                    }
                }
                console.log(`✅ Cliente '${nuevaReserva.nombre}' (${nuevaReserva.telefono}) asignado a cliente_id: ${clienteId}`);
            } catch (err) {
                console.error("⚠️ Error procesando cliente en PostgreSQL:", err.message);
                try {
                    const fallback = await pool.query(
                        `INSERT INTO clientes(nombre, telefono, dni, email, idioma, nacionalidad) VALUES($1, $2, 'N/A', 'N/A', 'es', 'España') RETURNING id`,
                        [nuevaReserva.nombre || 'Cliente WhatsApp', nuevaReserva.telefono]
                    );
                    if (fallback && fallback.rows && fallback.rows[0]) {
                        clienteId = fallback.rows[0].id;
                    }
                } catch (e) {}
            }

            try {
                await pool.query(
                    `INSERT INTO reservas(id, cliente_id, fecha, hora, comensales, estado, tipo_reserva, alergias, tipo_servicio, tarjeta_regalo, num_ninos, created_at)
                     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                     ON CONFLICT(id) DO UPDATE SET cliente_id=$2, hora=$4, comensales=$5, estado=$6, tipo_reserva=$7, alergias=$8, tipo_servicio=$9, tarjeta_regalo=$10, num_ninos=$11, created_at=$12`,
                    [
                        nuevaReserva.id,
                        clienteId,
                        nuevaReserva.fecha || '',
                        nuevaReserva.hora || 'Sin preferencia',
                        nuevaReserva.comensales || 2,
                        nuevaReserva.estado || 'PENDIENTE CONFIRMACION',
                        nuevaReserva.tipo_reserva || 'tarjeta_regalo',
                        nuevaReserva.alergias || 'NO',
                        nuevaReserva.tipo_servicio || 'Sin preferencia',
                        nuevaReserva.tarjeta_regalo || null,
                        nuevaReserva.num_ninos || 0,
                        spainStamp
                    ]
                );
                console.log(`✅ Reserva ${nuevaReserva.id} guardada exitosamente en PostgreSQL.`);
            } catch (err) {
                console.error("❌ Error PostgreSQL INSERT reservas:", err.message);
            }

            try {
                if (fechasPref && fechasPref.length > 0) {
                    await pool.query(`DELETE FROM reservas_fechas_preferencia WHERE reserva_id = $1`, [nuevaReserva.id]);
                    for (let i = 0; i < fechasPref.length; i++) {
                        await pool.query(
                            `INSERT INTO reservas_fechas_preferencia(reserva_id, fecha, orden) VALUES($1, $2, $3)`,
                            [nuevaReserva.id, fechasPref[i], i + 1]
                        );
                    }
                    console.log(`✅ ${fechasPref.length} fechas de preferencia insertadas para reserva ${nuevaReserva.id}.`);
                }
            } catch (err) {
                console.error("❌ Error PostgreSQL INSERT reservas_fechas_preferencia:", err.message);
            }
        })();
    }

    return nuevaReserva;
}

function getReservation(criterio) {
    const db = loadDb();
    const search = criterio.toUpperCase().trim();
    
    return db.reservas.find(r => 
        (r.id && r.id.toUpperCase() === search) ||
        (r.dni && r.dni.toUpperCase() === search) || 
        (r.telefono && r.telefono.includes(search)) ||
        (r.email && r.email.toUpperCase() === search) ||
        (r.nombre && r.nombre.toUpperCase().includes(search))
    );
}

function getAllReservations(criterio) {
    const db = loadDb();
    if (!criterio) return db.reservas || [];
    const search = criterio.toUpperCase().trim();
    
    return db.reservas.filter(r => 
        (r.id && r.id.toUpperCase() === search) ||
        (r.dni && r.dni.toUpperCase() === search) || 
        (r.telefono && r.telefono.includes(search)) ||
        (r.email && r.email.toUpperCase() === search) ||
        (r.nombre && r.nombre.toUpperCase().includes(search))
    );
}

function getReservationById(id) {
    const db = loadDb();
    return db.reservas.find(r => r.id === id);
}

function updateReservation(id, newData) {
    const db = loadDb();
    const index = db.reservas.findIndex(r => r.id === id);

    if (index !== -1) {
        db.reservas[index] = { ...db.reservas[index], ...newData };
        saveDb(db);

        if (pool) {
            pool.query(
                `UPDATE reservas SET fecha=$1, hora=$2, comensales=$3, estado=$4 WHERE id=$5`,
                [
                    db.reservas[index].fecha,
                    db.reservas[index].hora,
                    db.reservas[index].comensales,
                    db.reservas[index].estado,
                    id
                ]
            ).catch(err => console.error("Error PostgreSQL UPDATE reserva:", err.message));
        }

        return db.reservas[index];
    }
    return null;
}

function confirmReservation(id, fecha, hora) {
    return updateReservation(id, {
        estado: 'CONFIRMADA',
        fecha: fecha,
        hora: hora
    });
}

function cancelReservation(id) {
    const db = loadDb();
    const index = db.reservas.findIndex(r => r.id === id);

    if (index !== -1) {
        const reservaCancelada = db.reservas[index];
        db.reservas.splice(index, 1);
        saveDb(db);

        if (pool) {
            pool.query(`DELETE FROM reservas WHERE id=$1`, [id])
                .catch(err => console.error("Error PostgreSQL DELETE reserva:", err.message));
        }

        return reservaCancelada;
    }
    return null;
}

async function updateReservationStatus(id, nuevoEstado) {
    const db = loadDb();
    const index = db.reservas.findIndex(r => r.id === id);

    if (index !== -1) {
        db.reservas[index].estado = nuevoEstado;
        saveDb(db);
    }

    if (pool) {
        try {
            await pool.query(
                `UPDATE reservas SET estado = $1 WHERE id = $2`,
                [nuevoEstado, id]
            );
        } catch (err) {
            console.error("❌ Error PostgreSQL UPDATE estado reserva:", err.message);
        }
    }

    return index !== -1 ? db.reservas[index] : null;
}

// -------------------------------------------------------------
// BÚSQUEDAS DE RESERVA
// -------------------------------------------------------------

function findActiveReservation(queryText, fromNumber) {
    autoUpdateReservationStatuses();
    const db = loadDb();
    const queryNorm = normalizeText(queryText);
    const queryDigits = normalizePhone(queryText);
    const fromDigits = normalizePhone(fromNumber);

    const allReservations = db.reservas || [];
    if (allReservations.length === 0) return null;

    const isExplicitCodePattern = /RES-/i.test(queryText) || /^\d{8}-\d+$/i.test(queryText.trim());

    const formatResult = (res, matchMethod = 'unknown') => {
        const resPhoneDigits = normalizePhone(res.telefono);
        const resNameNorm = normalizeText(res.nombre);
        const resDniNorm = normalizeText(res.dni);
        const resEmailNorm = normalizeText(res.email);

        const queryPhoneMatches = queryDigits.length >= 7 && (queryDigits.includes(resPhoneDigits) || resPhoneDigits.includes(queryDigits));

        const resWords = resNameNorm.split(/\s+/).filter(w => w.length >= 2);
        const queryWords = queryNorm.split(/\s+/).filter(w => w.length >= 2);
        let nameMatches = false;
        if (queryWords.length > 0 && resWords.length > 0) {
            const firstWordMatches = resWords.includes(queryWords[0]);
            const fullStringMatches = resNameNorm.includes(queryNorm) || queryNorm.includes(resNameNorm);
            const wordsOverlap = queryWords.filter(qw => resWords.includes(qw)).length >= 2;
            nameMatches = firstWordMatches && (fullStringMatches || wordsOverlap || queryWords.length === 1);
        }

        const dniMatches = resDniNorm && resDniNorm.length >= 4 && (queryNorm.includes(resDniNorm) || resDniNorm.includes(queryNorm));
        const emailMatches = resEmailNorm && resEmailNorm.length >= 4 && (queryNorm.includes(resEmailNorm) || resEmailNorm.includes(queryNorm));

        const factorsMatched = [queryPhoneMatches, nameMatches, dniMatches, emailMatches].filter(Boolean).length;
        const isVerifiedById = matchMethod === 'byId';
        const isVerified = isVerifiedById || factorsMatched >= 2 || queryPhoneMatches || dniMatches || emailMatches;

        const validStatuses = ['CONFIRMADA', 'CONFIRMADO', 'PENDIENTE CONFIRMACION', 'PENDIENTE CONFIRMACIÓN', 'PENDIENTE CONFIRMAR', 'PENDIENTE'];
        const isModifiable = validStatuses.includes((res.estado || '').trim().toUpperCase());

        return {
            reservation: res,
            verified: isVerified,
            isModifiable: isModifiable,
            statusReason: res.estado,
            matchMethod: matchMethod
        };
    };

    const pickBestMatch = (candidates) => {
        if (!candidates || candidates.length === 0) return null;
        const validStatuses = ['CONFIRMADA', 'CONFIRMADO', 'PENDIENTE CONFIRMACION', 'PENDIENTE CONFIRMACIÓN', 'PENDIENTE CONFIRMAR', 'PENDIENTE'];
        const active = candidates.find(r => validStatuses.includes((r.estado || '').trim().toUpperCase()));
        return active || candidates[0];
    };

    const matchedById = allReservations.find(r => {
        if (!r.id) return false;
        const resIdNorm = normalizeText(r.id);
        return queryNorm.includes(resIdNorm) || resIdNorm.includes(queryNorm);
    });

    if (matchedById) {
        return formatResult(matchedById, 'byId');
    }

    if (isExplicitCodePattern) {
        return null;
    }

    if (queryDigits.length >= 7) {
        const phoneCandidates = allReservations.filter(r => {
            if (!r.telefono) return false;
            const resPhoneDigits = normalizePhone(r.telefono);
            return resPhoneDigits.includes(queryDigits) || queryDigits.includes(resPhoneDigits);
        });

        const bestByQueryPhone = pickBestMatch(phoneCandidates);
        if (bestByQueryPhone) {
            return formatResult(bestByQueryPhone, 'byQueryPhone');
        }
    }

    if (queryNorm.length >= 2) {
        const queryWords = queryNorm.split(/\s+/).filter(w => w.length >= 2);
        const nameCandidates = allReservations.filter(r => {
            if (!r.nombre) return false;
            const resNameNorm = normalizeText(r.nombre);
            const resWords = resNameNorm.split(/\s+/).filter(w => w.length >= 2);
            if (queryWords.length === 0 || resWords.length === 0) return false;

            const firstWordMatches = resWords.includes(queryWords[0]);
            const fullStringMatches = resNameNorm.includes(queryNorm) || queryNorm.includes(resNameNorm);
            const wordsOverlap = queryWords.filter(qw => resWords.includes(qw)).length >= 2;
            return firstWordMatches && (fullStringMatches || wordsOverlap || queryWords.length === 1);
        });

        const bestByName = pickBestMatch(nameCandidates);
        if (bestByName) {
            return formatResult(bestByName, 'byName');
        }
    }

    if (queryNorm.length >= 4) {
        const dniOrEmailCandidates = allReservations.filter(r => {
            const dniNorm = normalizeText(r.dni);
            const emailNorm = normalizeText(r.email);
            return (dniNorm && dniNorm.length >= 4 && (queryNorm.includes(dniNorm) || dniNorm.includes(queryNorm))) ||
                   (emailNorm && emailNorm.length >= 4 && (queryNorm.includes(emailNorm) || emailNorm.includes(queryNorm)));
        });

        const bestByDniOrEmail = pickBestMatch(dniOrEmailCandidates);
        if (bestByDniOrEmail) {
            return formatResult(bestByDniOrEmail, 'byDniEmail');
        }
    }

    if (fromDigits.length >= 7) {
        const fromCandidates = allReservations.filter(r => {
            if (!r.telefono) return false;
            const resPhoneDigits = normalizePhone(r.telefono);
            return resPhoneDigits.includes(fromDigits) || fromDigits.includes(resPhoneDigits);
        });

        const bestByFromPhone = pickBestMatch(fromCandidates);
        if (bestByFromPhone) {
            return formatResult(bestByFromPhone, 'byFromPhone');
        }
    }

    return null;
}

const findReservationForCancellation = findActiveReservation;

function isStrictNameMatch(queryName, targetName) {
    const normQuery = normalizeText(queryName || '');
    const normTarget = normalizeText(targetName || '');

    if (!normQuery || !normTarget) return false;
    return normQuery === normTarget;
}

function findReservationByNameAndPhone(telefono, nombre) {
    const dbData = loadDb();
    const allReservations = dbData.reservas || [];

    const normPhone = normalizePhone(telefono || '');
    const normName = normalizeText(nombre || '');

    if (!normPhone || !normName) return null;

    const candidates = allReservations.filter(r => {
        const estadoUpper = (r.estado || '').toUpperCase();
        const isCancelled = ['CANCELADA', 'CANCELADO', 'RECHAZADA'].includes(estadoUpper);
        if (isCancelled) return false;

        const resPhone = normalizePhone(r.telefono || '');
        const resName = normalizeText(r.nombre || '');

        const phoneMatch = normPhone && resPhone && (
            resPhone.endsWith(normPhone.slice(-9)) || normPhone.endsWith(resPhone.slice(-9))
        );

        const nameMatch = isStrictNameMatch(normName, resName);

        return phoneMatch && nameMatch;
    });

    if (candidates.length === 0) return null;

    const validStatuses = ['CONFIRMADA', 'CONFIRMADO', 'PENDIENTE CONFIRMACION', 'PENDIENTE CONFIRMACIÓN', 'PENDIENTE CONFIRMAR', 'PENDIENTE'];
    const active = candidates.find(r => validStatuses.includes((r.estado || '').trim().toUpperCase())) || candidates[0];

    return {
        reservation: active,
        verified: true,
        isModifiable: validStatuses.includes((active.estado || '').trim().toUpperCase()),
        statusReason: active.estado
    };
}

function findActiveReservationsByName(nombre) {
    const dbData = loadDb();
    const allReservations = dbData.reservas || [];
    const normName = normalizeText(nombre || '');
    if (!normName || normName.length < 2) return [];

    return allReservations.filter(r => {
        const estadoUpper = (r.estado || '').toUpperCase();
        if (['CANCELADA', 'CANCELADO', 'RECHAZADA'].includes(estadoUpper)) return false;
        return isStrictNameMatch(normName, r.nombre);
    });
}

function findActiveReservationsByPhone(telefono) {
    const dbData = loadDb();
    const allReservations = dbData.reservas || [];
    const normPhone = normalizePhone(telefono || '');
    if (!normPhone || normPhone.length < 7) return [];

    return allReservations.filter(r => {
        const estadoUpper = (r.estado || '').toUpperCase();
        if (['CANCELADA', 'CANCELADO', 'RECHAZADA'].includes(estadoUpper)) return false;
        const resPhone = normalizePhone(r.telefono || '');
        return resPhone.endsWith(normPhone.slice(-9)) || normPhone.endsWith(resPhone.slice(-9));
    });
}

async function getMostRecentPendingReservationByPhone(telefono) {
    try {
        if (pool) {
            const result = await pool.query(
                `SELECT r.*, c.nombre, c.email, c.dni FROM reservas r
                 LEFT JOIN clientes c ON r.cliente_id = c.id
                 WHERE r.estado = 'PENDIENTE CONFIRMACION'
                 AND c.telefono = $1
                 ORDER BY r.created_at DESC LIMIT 1`,
                [telefono]
            );
            if (result && result.rows && result.rows[0]) {
                return result.rows[0];
            }
        }
        const db = loadDb();
        const matching = (db.reservas || []).filter(r =>
            r.telefono === telefono && r.estado === 'PENDIENTE CONFIRMACION'
        ).sort((a, b) => new Date(b.fechaCreacion || 0) - new Date(a.fechaCreacion || 0));
        return matching[0] || null;
    } catch (err) {
        console.error('⚠️ Error getMostRecentPendingReservationByPhone:', err.message);
        return null;
    }
}

module.exports = {
    createReservation,
    getReservation,
    getAllReservations,
    getReservationById,
    updateReservation,
    confirmReservation,
    cancelReservation,
    updateReservationStatus,
    autoUpdateReservationStatuses,
    findActiveReservation,
    findReservationForCancellation,
    findReservationByNameAndPhone,
    findActiveReservationsByName,
    findActiveReservationsByPhone,
    getMostRecentPendingReservationByPhone,
    normalizePhone,
    normalizeText,
    formatNationalityCode,
    formatLanguageCode,
    formatAllergiesInSpanish,
    formatDaysInSpanish
};
