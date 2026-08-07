const fs = require('fs');
const path = require('path');
const { pool, DB_PATH } = require('./connection');

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
// OPERACIONES DE DISPONIBILIDAD
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
    const slots = [];
    const today = new Date();

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
        if (!turnosValidos.includes(hora)) continue;

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

async function getFechasPreferencia(reservaId) {
    try {
        if (pool) {
            const result = await pool.query(
                `SELECT fecha FROM reservas_fechas_preferencia WHERE reserva_id = $1 ORDER BY orden ASC`,
                [reservaId]
            );
            if (result && result.rows) return result.rows;
        }
        return [];
    } catch (err) {
        console.error('⚠️ Error getFechasPreferencia:', err.message);
        return [];
    }
}

module.exports = {
    SHIFT_CAPACITIES,
    SCHEDULE_BY_DAY,
    parseSpanishDate,
    checkAvailability,
    getAvailableTimeSlotsForDate,
    getUpcomingAvailableSlots,
    getNextAvailableDate,
    getFechasPreferencia,
    loadDb
};
