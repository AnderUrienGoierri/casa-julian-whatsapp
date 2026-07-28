const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const DB_PATH = path.join(__dirname, 'db.json');

// Conexión opcional a PostgreSQL con Auto-Migración de columnas
let pool = null;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    console.log("🗄️ Modo Base de Datos: PostgreSQL Conectado.");

    // Auto-migración para asegurar que las columnas de idioma, dias_preferencia y tabla tarjetas_regalo existan
    pool.query(`
        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS idioma VARCHAR(10) DEFAULT 'es';
        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nacionalidad VARCHAR(50) DEFAULT 'España';
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS idioma VARCHAR(10) DEFAULT 'es';
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS dias_preferencia VARCHAR(100);
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS tipo_reserva VARCHAR(50) DEFAULT 'online';
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS nacionalidad VARCHAR(50) DEFAULT 'España';
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS alergias TEXT DEFAULT 'NO';
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS tipo_servicio VARCHAR(30);
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS tarjeta_regalo VARCHAR(50);
        DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lista_espera' AND column_name='cliente_dni') THEN
                ALTER TABLE lista_espera DROP COLUMN cliente_dni;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reservas' AND column_name='cliente_dni') THEN
                ALTER TABLE reservas DROP COLUMN cliente_dni;
            END IF;
        END $$;
        ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS estado VARCHAR(30) DEFAULT 'Pendiente confirmar';
        ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS ninos VARCHAR(50) DEFAULT '0';
        ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS alergias TEXT DEFAULT 'Ninguna';
        ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS nacionalidad VARCHAR(50) DEFAULT 'España';
        ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS idioma VARCHAR(10) DEFAULT 'es';
        ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS dias_preferencia VARCHAR(255);
        ALTER TABLE lista_espera ALTER COLUMN dias_preferencia TYPE VARCHAR(255);
        ALTER TABLE reservas ALTER COLUMN dias_preferencia TYPE VARCHAR(255);
        CREATE TABLE IF NOT EXISTS tarjetas_regalo (
            id VARCHAR(50) PRIMARY KEY,
            codigo VARCHAR(50) UNIQUE NOT NULL,
            comprador_nombre VARCHAR(100),
            comprador_telefono VARCHAR(20),
            fecha_compra VARCHAR(20),
            fecha_caducidad VARCHAR(20),
            estado VARCHAR(20) DEFAULT 'ACTIVA',
            fecha_ultima_modificacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS fecha_ultima_modificacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `).then(() => {
        // Sincronizar reservas y tarjetas de regalo desde PostgreSQL al arrancar
        return pool.query("SELECT id, nombre, telefono, dni, email, fecha, hora, comensales, estado, idioma, dias_preferencia, tipo_reserva, nacionalidad, alergias, tipo_servicio, tarjeta_regalo FROM reservas ORDER BY id DESC");
    }).then(res => {
        if (res && res.rows && res.rows.length > 0) {
            const currentDb = loadDb();
            currentDb.reservas = res.rows.map(r => ({
                id: r.id,
                nombre: r.nombre,
                telefono: r.telefono,
                dni: r.dni,
                email: r.email,
                fecha: r.fecha,
                hora: r.hora,
                comensales: parseInt(r.comensales, 10),
                estado: r.estado,
                idioma: r.idioma || 'es',
                dias_preferencia: r.dias_preferencia || 'Sin preferencia',
                tipo_reserva: r.tipo_reserva || 'online',
                nacionalidad: r.nacionalidad || 'España',
                alergias: r.alergias || 'NO',
                tipo_servicio: r.tipo_servicio || (r.hora ? (parseInt(r.hora.split(':')[0], 10) >= 20 ? 'Cena' : 'Comida') : 'Comida'),
                tarjeta_regalo: r.tarjeta_regalo || null
            }));
            saveDb(currentDb);
            console.log(`✅ Sincronizadas ${res.rows.length} reservas activas desde PostgreSQL Neon.`);
        }
        return pool.query("SELECT id, codigo, comprador_nombre, comprador_telefono, fecha_compra, fecha_caducidad, estado, fecha_ultima_modificacion FROM tarjetas_regalo ORDER BY id ASC");
    }).then(resCards => {
        if (resCards && resCards.rows && resCards.rows.length > 0) {
            const currentDb = loadDb();
            currentDb.tarjetasRegalo = resCards.rows;
            saveDb(currentDb);
            console.log(`✅ Sincronizadas ${resCards.rows.length} tarjetas de regalo desde PostgreSQL Neon.`);
        }
    }).catch(err => console.error("Error en inicialización/sincronización de PostgreSQL:", err.message));
} else {
    console.log("🗄️ Modo Base de Datos: Almacenamiento Local (db.json).");
}

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
        const endDate = new Date(startDate.getTime() + (2.5 * 60 * 60 * 1000)); // 2.5 horas de servicio

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

// Ejecutar inmediatamente y programar cada 5 minutos
autoUpdateReservationStatuses();
setInterval(autoUpdateReservationStatuses, 5 * 60 * 1000);

const defaultData = {
    capacidadMaximaPorTurno: 20,
    reservas: [],
    listaEspera: [],
    tarjetasRegalo: [
        { id: 'TR-001', codigo: 'MT-2026-001', comprador_nombre: 'Juan Pérez', comprador_telefono: '+34600112233', fecha_compra: '01/01/2026', fecha_caducidad: '31/12/2026', estado: 'ACTIVA' },
        { id: 'TR-002', codigo: 'MT-2026-002', comprador_nombre: 'María López', comprador_telefono: '+34611223344', fecha_compra: '15/02/2026', fecha_caducidad: '15/10/2026', estado: 'ACTIVA' },
        { id: 'TR-003', codigo: '12345', comprador_nombre: 'Cliente Prueba', comprador_telefono: '+34622334455', fecha_compra: '01/03/2026', fecha_caducidad: '30/11/2026', estado: 'ACTIVA' }
    ]
};

function loadDb() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            saveDb(defaultData);
            return defaultData;
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error al cargar la base de datos local:", error);
        return defaultData;
    }
}

function saveDb(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error("Error al guardar la base de datos local:", error);
    }
}

// -------------------------------------------------------------
// CONFIGURACIÓN DE HORARIOS Y CAPACIDADES SEGÚN REALIDAD CASA JULIAN
// -------------------------------------------------------------

const SHIFT_CAPACITIES = {
    // 1er Turno Comida (comparten 40p entre 12:30, 13:00, 13:30, 14:00)
    "12:30": 40,
    "13:00": 40,
    "13:30": 40,
    "14:00": 40,

    // 2º Turno Comida (20p)
    "15:15": 20,

    // Turno Cenas Viernes/Sábado (comparten 60p entre 20:00, 20:30, 21:00, 21:30)
    "20:00": 60,
    "20:30": 60,
    "21:00": 60,
    "21:30": 60
};

const SEATING_GROUPS = {
    "12:30": ["12:30", "13:00", "13:30", "14:00"],
    "13:00": ["12:30", "13:00", "13:30", "14:00"],
    "13:30": ["12:30", "13:00", "13:30", "14:00"],
    "14:00": ["12:30", "13:00", "13:30", "14:00"],
    "15:15": ["15:15"],
    "20:00": ["20:00", "20:30", "21:00", "21:30"],
    "20:30": ["20:00", "20:30", "21:00", "21:30"],
    "21:00": ["20:00", "20:30", "21:00", "21:30"],
    "21:30": ["20:00", "20:30", "21:00", "21:30"]
};

// 0: Dom, 1: Lun (CERRADO), 2: Mar, 3: Mié, 4: Jue, 5: Vie, 6: Sáb
const SCHEDULE_BY_DAY = {
    0: ["12:30", "13:00", "13:30", "14:00", "15:15"],                                           // Domingo
    1: [],                                                                                    // Lunes CERRADO
    2: ["12:30", "13:00", "13:30", "14:00", "15:15"],                                           // Martes
    3: ["12:30", "13:00", "13:30", "14:00", "15:15"],                                           // Miércoles
    4: ["12:30", "13:00", "13:30", "14:00", "15:15"],                                           // Jueves
    5: ["12:30", "13:00", "13:30", "14:00", "15:15", "20:00", "20:30", "21:00", "21:30"],      // Viernes
    6: ["12:30", "13:00", "13:30", "14:00", "15:15", "20:00", "20:30", "21:00", "21:30"]       // Sábado
};

function parseSpanishDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const parts = dateStr.trim().split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return null;
    return d;
}

// -------------------------------------------------------------
// OPERACIONES DE DISPONIBILIDAD Y RESERVAS
// -------------------------------------------------------------

function checkAvailability(fecha, hora, comensales) {
    const db = loadDb();
    const comensalesSolicitados = parseInt(comensales, 10) || 0;

    const dateObj = parseSpanishDate(fecha);
    if (dateObj) {
        const dayOfWeek = dateObj.getDay();
        if (dayOfWeek === 1) { // Lunes
            return {
                disponible: false,
                cerrado: true,
                razon: "Los lunes el restaurante está cerrado por descanso semanal."
            };
        }

        const turnosValidos = SCHEDULE_BY_DAY[dayOfWeek] || [];
        if (turnosValidos.length > 0 && !turnosValidos.includes(hora)) {
            return {
                disponible: false,
                turnoInvalido: true,
                turnosValidos,
                razon: `Turno no disponible para este día. Los turnos válidos son: ${turnosValidos.join(', ')}.`
            };
        }
    }

    const groupSlots = SEATING_GROUPS[hora] || [hora];
    const maxCapacidad = SHIFT_CAPACITIES[hora] || 20;

    const ocupacionActual = db.reservas
        .filter(r => r.fecha === fecha && groupSlots.includes(r.hora) && r.estado === 'CONFIRMADA')
        .reduce((total, r) => total + parseInt(r.comensales, 10), 0);

    const capacidadDisponible = maxCapacidad - ocupacionActual;

    return {
        disponible: capacidadDisponible >= comensalesSolicitados,
        capacidadRestante: Math.max(0, capacidadDisponible),
        maxCapacidad
    };
}

function getAvailableTimeSlotsForDate(fechaStr, comensales = 1) {
    const dateObj = parseSpanishDate(fechaStr);
    if (!dateObj) return { valido: false, error: "Formato de fecha no válido." };

    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 1) {
        return { cerrado: true, razon: "Los lunes el restaurante está cerrado por descanso semanal." };
    }

    const validSlots = SCHEDULE_BY_DAY[dayOfWeek] || [];
    const availableSlots = [];

    for (const slot of validSlots) {
        const check = checkAvailability(fechaStr, slot, comensales);
        if (check.disponible && check.capacidadRestante > 0) {
            availableSlots.push({
                hora: slot,
                capacidadRestante: check.capacidadRestante,
                maxCapacidad: check.maxCapacidad
            });
        }
    }

    return {
        valido: true,
        cerrado: false,
        validSlots,
        availableSlots
    };
}

function getUpcomingAvailableSlots(maxSlots = 8) {
    const db = loadDb();
    const slots = [];
    const today = new Date();

    // Escanear hasta 120 días vista para localizar los primeros turnos con plazas libres
    for (let i = 1; i <= 120 && slots.length < maxSlots; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + i);

        const dayOfWeek = targetDate.getDay();
        if (dayOfWeek === 1) continue; // Lunes cerrado

        const turnos = SCHEDULE_BY_DAY[dayOfWeek] || [];
        const dayStr = String(targetDate.getDate()).padStart(2, '0');
        const monthStr = String(targetDate.getMonth() + 1).padStart(2, '0');
        const yearStr = targetDate.getFullYear();
        const fechaFormatted = `${dayStr}/${monthStr}/${yearStr}`;

        for (const hora of turnos) {
            const check = checkAvailability(fechaFormatted, hora, 1);
            if (check.disponible && check.capacidadRestante > 0) {
                slots.push({
                    fecha: fechaFormatted,
                    hora: hora,
                    plazasLibres: check.capacidadRestante,
                    maxCapacidad: check.maxCapacidad
                });

                if (slots.length >= maxSlots) break;
            }
        }
    }

    return slots;
}

/**
 * Busca la primera fecha futura con disponibilidad para una hora y nº de comensales concretos.
 * @param {string} hora - Turno horario (ej: "13:00", "20:30")
 * @param {number} comensales - Número de comensales solicitados
 * @returns {{ encontrado: boolean, fecha?: string, diaSemana?: string }} 
 */
function getNextAvailableDate(hora, comensales = 1) {
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const today = new Date();
    const numComensales = parseInt(comensales, 10) || 1;

    for (let i = 1; i <= 120; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + i);

        const dayOfWeek = targetDate.getDay();
        if (dayOfWeek === 1) continue; // Lunes cerrado

        const turnosValidos = SCHEDULE_BY_DAY[dayOfWeek] || [];
        if (!turnosValidos.includes(hora)) continue; // Hora no válida para este día

        const dayStr = String(targetDate.getDate()).padStart(2, '0');
        const monthStr = String(targetDate.getMonth() + 1).padStart(2, '0');
        const yearStr = targetDate.getFullYear();
        const fechaFormatted = `${dayStr}/${monthStr}/${yearStr}`;

        const check = checkAvailability(fechaFormatted, hora, numComensales);
        if (check.disponible && check.capacidadRestante >= numComensales) {
            return {
                encontrado: true,
                fecha: fechaFormatted,
                diaSemana: diasSemana[dayOfWeek],
                plazasLibres: check.capacidadRestante
            };
        }
    }

    return { encontrado: false };
}

function formatNationalityCode(nacStr) {
    if (!nacStr || typeof nacStr !== 'string') return 'ES';
    const s = nacStr.toLowerCase().trim();
    if (s.includes('esp') || s.includes('spain') || s === 'es') return 'ES';
    if (s.includes('fran') || s === 'fr') return 'FR';
    if (s.includes('reino') || s.includes('uk') || s.includes('gb') || s.includes('erresuma') || s.includes('united kingdom')) return 'UK';
    if (s.includes('ee.uu') || s.includes('aeb') || s.includes('usa') || s.includes('us') || s.includes('estados unidos')) return 'US';
    if (s.includes('alem') || s.includes('germany') || s === 'de') return 'DE';
    if (s.includes('ital') || s === 'it') return 'IT';
    if (s.includes('port') || s === 'pt') return 'PT';
    if (s.includes('mex') || s === 'mx') return 'MX';
    if (s.includes('jap') || s === 'jp') return 'JP';
    if (s.includes('paises') || s.includes('neder') || s.includes('nether') || s === 'nl') return 'NL';
    if (s.includes('canad') || s === 'ca') return 'CA';
    if (s.includes('gali') || s === 'gl') return 'GL';
    if (s.includes('rusi') || s === 'ru') return 'RU';
    if (s.includes('chin') || s === 'zh' || s === 'cn') return 'CN';
    if (s.includes('argent') || s === 'ar') return 'AR';
    
    const cleanNoEmoji = nacStr.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1F9FF}]/gu, '').trim().toUpperCase();
    if (cleanNoEmoji.length === 2) return cleanNoEmoji;

    return 'OTRO';
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

function createReservation(data) {
    const db = loadDb();
    const rawDias = data.dias_preferencia || data.dias || 'Sin preferencia';
    const diasPref = formatDaysInSpanish(rawDias);
    const nacCode = formatNationalityCode(data.nacionalidad);

    const now = new Date();
    const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
    const seq = now.getTime().toString().slice(-6);
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
        estado: data.estado || 'CONFIRMADA',
        idioma: data.idioma || 'es',
        dias_preferencia: diasPref,
        tipo_reserva: data.tipo_reserva || 'online',
        alergias: formatAllergiesInSpanish(data.alergias),
        tipo_servicio: data.tipo_servicio || (data.hora ? (parseInt(data.hora.split(':')[0], 10) >= 20 ? 'Cena' : 'Comida') : 'Comida'),
        tarjeta_regalo: data.tarjeta_regalo || null,
        fechaCreacion: now.toISOString()
    };

    db.reservas.push(nuevaReserva);
    saveDb(db);

    if (pool) {
        // 1. Guardar o actualizar cliente
        pool.query(
            `INSERT INTO clientes(nombre, telefono, dni, email, idioma, nacionalidad)
             VALUES($1, $2, $3, $4, $5, $6)
             ON CONFLICT(dni) DO UPDATE SET nombre=$1, telefono=$2, email=$4, idioma=$5, nacionalidad=$6`,
            [nuevaReserva.nombre, nuevaReserva.telefono, nuevaReserva.dni, nuevaReserva.email, nuevaReserva.idioma, nuevaReserva.nacionalidad]
        ).catch(err => console.error("❌ Error PostgreSQL INSERT cliente:", err.message));

        // 2. Guardar reserva con todos los campos del formulario
        pool.query(
            `INSERT INTO reservas(id, nombre, telefono, dni, email, fecha, hora, comensales, estado, idioma, dias_preferencia, tipo_reserva, nacionalidad, alergias, tipo_servicio, tarjeta_regalo)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) ON CONFLICT(id) DO NOTHING`,
            [
                nuevaReserva.id,
                nuevaReserva.nombre,
                nuevaReserva.telefono,
                nuevaReserva.dni,
                nuevaReserva.email,
                nuevaReserva.fecha,
                nuevaReserva.hora,
                nuevaReserva.comensales,
                nuevaReserva.estado,
                nuevaReserva.idioma,
                nuevaReserva.dias_preferencia,
                nuevaReserva.tipo_reserva,
                nuevaReserva.nacionalidad,
                nuevaReserva.alergias,
                nuevaReserva.tipo_servicio,
                nuevaReserva.tarjeta_regalo
            ]
        ).then(() => console.log(`✅ Reserva guardada en PostgreSQL: ${nuevaReserva.id}`))
         .catch(err => console.error("❌ Error PostgreSQL INSERT reserva:", err.message, JSON.stringify(nuevaReserva)));
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
                `UPDATE reservas SET fecha=$1, hora=$2, comensales=$3, estado=$4, dias_preferencia=$5 WHERE id=$6`,
                [
                    db.reservas[index].fecha,
                    db.reservas[index].hora,
                    db.reservas[index].comensales,
                    db.reservas[index].estado,
                    db.reservas[index].dias_preferencia,
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

function updateReservationStatus(id, nuevoEstado) {
    const db = loadDb();
    const index = db.reservas.findIndex(r => r.id === id);

    if (index !== -1) {
        db.reservas[index].estado = nuevoEstado;
        saveDb(db);

        if (pool) {
            pool.query(
                `UPDATE reservas SET estado = $1 WHERE id = $2`,
                [nuevoEstado, id]
            ).catch(err => console.error("❌ Error PostgreSQL UPDATE estado reserva:", err.message));
        }

        return db.reservas[index];
    }
    return null;
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
        .trim();
}

function findActiveReservation(queryText, fromNumber) {
    autoUpdateReservationStatuses();
    const db = loadDb();
    const queryNorm = normalizeText(queryText);
    const queryDigits = normalizePhone(queryText);
    const fromDigits = normalizePhone(fromNumber);

    const allReservations = db.reservas || [];
    if (allReservations.length === 0) return null;

    // Detectar si el usuario introdujo explícitamente un patrón de código de reserva (ej. RES-...)
    const isExplicitCodePattern = /RES-/i.test(queryText) || /^\d{8}-\d+$/i.test(queryText.trim());

    const formatResult = (res, matchMethod = 'unknown') => {
        const resPhoneDigits = normalizePhone(res.telefono);
        const resNameNorm = normalizeText(res.nombre);
        const resDniNorm = normalizeText(res.dni);
        const resEmailNorm = normalizeText(res.email);

        // Verificación basada SOLO en lo que el usuario escribió explícitamente (queryText)
        // El teléfono del remitente NO cuenta como verificación de identidad
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

        // Verificación estricta: solo se considera verificado si el usuario proporcionó
        // al menos DOS factores de identificación diferentes, o si proporcionó el código de reserva.
        // Nombre solo NO es suficiente — necesita código, teléfono, DNI o email adicional.
        const factorsMatched = [queryPhoneMatches, nameMatches, dniMatches, emailMatches].filter(Boolean).length;
        const isVerifiedById = matchMethod === 'byId';
        const isVerified = isVerifiedById || factorsMatched >= 2 || queryPhoneMatches || dniMatches || emailMatches;
        // Nota: teléfono explícito, DNI o email son verificadores fuertes por sí solos.
        // Nombre solo requiere un segundo factor.

        const isModifiable = res.estado === 'CONFIRMADA';

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
        const active = candidates.find(r => r.estado === 'CONFIRMADA');
        return active || candidates[0];
    };

    // 1. Coincidencia directa por Código/ID de Reserva (ej. RES-20260722-1001 o 20260722-1001)
    const matchedById = allReservations.find(r => {
        if (!r.id) return false;
        const resIdNorm = normalizeText(r.id);
        return queryNorm.includes(resIdNorm) || resIdNorm.includes(queryNorm);
    });

    if (matchedById) {
        return formatResult(matchedById, 'byId');
    }

    // Si se introdujo explícitamente un código con formato RES- y no existe en BD, rechazar de inmediato
    if (isExplicitCodePattern) {
        return null;
    }

    // 2. Coincidencia por Número de Teléfono introducido explícitamente en el texto de búsqueda
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

    // 3. Coincidencia por Nombre / Apellidos introducidos en el texto de búsqueda
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

    // 4. Coincidencia por DNI o Email introducidos en el texto de búsqueda
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

    // 5. Fallback por Número de Teléfono del remitente (WhatsApp fromNumber)
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

// -------------------------------------------------------------
// OPERACIONES DE LISTA DE ESPERA
// -------------------------------------------------------------

async function addToWaitlist(data) {
    const db = loadDb();
    const diasPref = data.dias_preferencia || data.dias || data.fecha || 'Sin preferencia';
    const comensalesNum = parseInt(data.comensales, 10);
    const validComensales = isNaN(comensalesNum) ? 1 : comensalesNum;

    const nacCode = formatNationalityCode(data.nacionalidad);

    const nuevoRegistro = {
        id: 'ESP-' + Date.now().toString().slice(-6),
        nombre: data.nombre || 'No especificado',
        telefono: data.telefono || '',
        dni: (data.dni || 'N/A').toUpperCase().trim(),
        email: (data.email || 'N/A').toLowerCase().trim(),
        nacionalidad: nacCode,
        dias_preferencia: diasPref,
        hora: data.hora || 'No especificado',
        comensales: validComensales,
        ninos: data.ninos || '0',
        alergias: formatAllergiesInSpanish(data.alergias),
        estado: data.estado || 'Pendiente confirmar',
        idioma: data.idioma || 'es',
        fechaRegistro: new Date().toISOString()
    };

    db.listaEspera.push(nuevoRegistro);
    saveDb(db);

    if (pool) {
        try {
            await pool.query(
                `INSERT INTO lista_espera(id, nombre, telefono, dni, email, dias_preferencia, hora, comensales, ninos, alergias, estado, idioma, nacionalidad)
                 VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT(id) DO NOTHING`,
                [
                    nuevoRegistro.id,
                    nuevoRegistro.nombre,
                    nuevoRegistro.telefono,
                    nuevoRegistro.dni,
                    nuevoRegistro.email,
                    nuevoRegistro.dias_preferencia,
                    nuevoRegistro.hora,
                    nuevoRegistro.comensales,
                    nuevoRegistro.ninos,
                    nuevoRegistro.alergias,
                    nuevoRegistro.estado,
                    nuevoRegistro.idioma,
                    nuevoRegistro.nacionalidad
                ]
            );
            console.log(`✅ Registro ${nuevoRegistro.id} insertado exitosamente en PostgreSQL Neon y db.json.`);
        } catch (err) {
            console.error("❌ Error PostgreSQL INSERT lista_espera:", err.message);
        }
    }

    return nuevoRegistro;
}

function getWaitlistPosition(criterio) {
    const db = loadDb();
    const search = criterio.toUpperCase().trim();

    const index = db.listaEspera.findIndex(e => 
        (e.dni && e.dni.toUpperCase() === search) || 
        (e.telefono && e.telefono.includes(search)) ||
        (e.email && e.email.toUpperCase() === search)
    );

    if (index !== -1) {
        return {
            encontrado: true,
            registro: db.listaEspera[index],
            posicion: index + 1,
            personasDelante: index
        };
    }

    return { encontrado: false };
}

function getFirstWaitlistForSlot(fecha, hora) {
    const db = loadDb();
    return db.listaEspera.find(e => e.fecha === fecha && e.hora === hora);
}

function removeFromWaitlist(id) {
    const db = loadDb();
    const index = db.listaEspera.findIndex(e => e.id === id);

    if (index !== -1) {
        const eliminado = db.listaEspera[index];
        db.listaEspera.splice(index, 1);
        saveDb(db);

        if (pool) {
            pool.query(`DELETE FROM lista_espera WHERE id=$1`, [id])
                .catch(err => console.error("Error PostgreSQL DELETE lista_espera:", err.message));
        }

        return eliminado;
    }
    return null;
}

function getWaitlistEntry(criterio) {
    const db = loadDb();
    const search = (criterio || '').toUpperCase().trim();
    if (!search) return null;

    return db.listaEspera.find(e => 
        (e.estado !== 'Cancelado') && (
            (e.id && e.id.toUpperCase() === search) || 
            (e.dni && e.dni.toUpperCase() === search) || 
            (e.telefono && e.telefono.includes(search)) ||
            (e.email && e.email.toUpperCase() === search) ||
            (e.nombre && e.nombre.toUpperCase().includes(search))
        )
    );
}

function cancelWaitlistEntry(id) {
    const db = loadDb();
    const index = db.listaEspera.findIndex(e => e.id === id);

    if (index !== -1) {
        db.listaEspera[index].estado = 'Cancelado';
        saveDb(db);

        if (pool) {
            pool.query(`UPDATE lista_espera SET estado = 'Cancelado' WHERE id = $1`, [id])
                .catch(err => console.error("❌ Error PostgreSQL UPDATE cancel lista_espera:", err.message));
        }

        return db.listaEspera[index];
    }
    return null;
}

// -------------------------------------------------------------
// OPERACIONES DE TARJETAS REGALO
// -------------------------------------------------------------

async function getGiftCard(criterio) {
    if (!criterio) return null;
    const search = criterio.toString().trim().toUpperCase();

    // 1. Consultar PostgreSQL Neon si la conexión está lista (Coincidencia exacta 100%)
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

    // 2. Fallback a almacenamiento local db.json (Coincidencia exacta 100%)
    const db = loadDb();
    const tarjetas = db.tarjetasRegalo || [];
    const card = tarjetas.find(t => 
        (t.codigo && t.codigo.toUpperCase() === search) ||
        (t.id && t.id.toUpperCase() === search)
    );

    return card || null;
}

/**
 * Actualiza el estado de una tarjeta regalo en Neon PostgreSQL y en db.json local.
 */
async function updateGiftCardStatus(criterio, nuevoEstado) {
    if (!criterio) return null;
    const search = criterio.toString().trim().toUpperCase();
    const nowIso = new Date().toISOString();

    // 1. Actualizar db.json local
    const db = loadDb();
    if (db.tarjetasRegalo) {
        const localCard = db.tarjetasRegalo.find(t =>
            (t.codigo && t.codigo.toUpperCase() === search) ||
            (t.id && t.id.toUpperCase() === search)
        );
        if (localCard) {
            localCard.estado = nuevoEstado;
            localCard.fecha_ultima_modificacion = nowIso;
            saveDb(db);
        }
    }

    // 2. Actualizar en Neon PostgreSQL
    if (pool) {
        try {
            await pool.query(
                `UPDATE tarjetas_regalo SET estado = $1, fecha_ultima_modificacion = CURRENT_TIMESTAMP WHERE UPPER(codigo) = $2 OR UPPER(id) = $2`,
                [nuevoEstado, search]
            );
            console.log(`✅ Estado de tarjeta ${search} actualizado a '${nuevoEstado}' con timestamp de modificación en PostgreSQL.`);
        } catch (err) {
            console.error("Error actualizando tarjetas_regalo en PostgreSQL:", err.message);
        }
    }
}

function createGiftCard(data) {
    const db = loadDb();
    const nowIso = new Date().toISOString();
    const nuevaTarjeta = {
        id: 'TR-' + Date.now().toString().slice(-6),
        codigo: data.codigo.trim().toUpperCase(),
        comprador_nombre: data.comprador_nombre || 'Desconocido',
        comprador_telefono: data.comprador_telefono || '',
        fecha_compra: data.fecha_compra || new Date().toLocaleDateString('es-ES'),
        fecha_caducidad: data.fecha_caducidad,
        estado: data.estado || 'ACTIVA',
        fecha_ultima_modificacion: nowIso
    };

    if (!db.tarjetasRegalo) db.tarjetasRegalo = [];
    db.tarjetasRegalo.push(nuevaTarjeta);
    saveDb(db);

    if (pool) {
        pool.query(
            `INSERT INTO tarjetas_regalo(id, codigo, comprador_nombre, comprador_telefono, fecha_compra, fecha_caducidad, estado, fecha_ultima_modificacion)
             VALUES($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) ON CONFLICT(codigo) DO NOTHING`,
            [nuevaTarjeta.id, nuevaTarjeta.codigo, nuevaTarjeta.comprador_nombre, nuevaTarjeta.comprador_telefono, nuevaTarjeta.fecha_compra, nuevaTarjeta.fecha_caducidad, nuevaTarjeta.estado]
        ).catch(err => console.error("Error PostgreSQL INSERT tarjetas_regalo:", err.message));
    }

    return nuevaTarjeta;
}

module.exports = {
    checkAvailability,
    getAvailableTimeSlotsForDate,
    getUpcomingAvailableSlots,
    getNextAvailableDate,
    createReservation,
    getReservation,
    getAllReservations,
    getReservationById,
    updateReservation,
    updateReservationStatus,
    autoUpdateReservationStatuses,
    findActiveReservation,
    findReservationForCancellation,
    confirmReservation,
    cancelReservation,
    addToWaitlist,
    getWaitlistPosition,
    getFirstWaitlistForSlot,
    removeFromWaitlist,
    getWaitlistEntry,
    cancelWaitlistEntry,
    getGiftCard,
    updateGiftCardStatus,
    createGiftCard,
    SHIFT_CAPACITIES,
    SCHEDULE_BY_DAY
};
