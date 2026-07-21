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

    // Auto-migración para asegurar que las columnas de idioma existan
    pool.query(`
        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS idioma VARCHAR(10) DEFAULT 'es';
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS idioma VARCHAR(10) DEFAULT 'es';
        ALTER TABLE lista_espera ADD COLUMN IF NOT EXISTS idioma VARCHAR(10) DEFAULT 'es';
    `).catch(err => console.error("Error al asegurar columnas de idioma en PostgreSQL:", err.message));
} else {
    console.log("🗄️ Modo Base de Datos: Almacenamiento Local (db.json).");
}

const defaultData = {
    capacidadMaximaPorTurno: 20,
    reservas: [],
    listaEspera: []
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
    "12:30": 40,
    "15:15": 20,
    "19:30": 60
};

// 0: Domingo, 1: Lunes (CERRADO), 2: Martes, 3: Miércoles, 4: Jueves, 5: Viernes, 6: Sábado
const SCHEDULE_BY_DAY = {
    0: ["12:30", "15:15"],          // Domingo: Comida 12:30 (40p) y 15:15 (20p)
    1: [],                          // Lunes: CERRADO
    2: ["12:30", "15:15"],          // Martes: Comida 12:30 (40p) y 15:15 (20p)
    3: ["12:30", "15:15"],          // Miércoles: Comida 12:30 (40p) y 15:15 (20p)
    4: ["12:30", "15:15"],          // Jueves: Comida 12:30 (40p) y 15:15 (20p)
    5: ["12:30", "15:15", "19:30"], // Viernes: Comida 12:30 (40p), 15:15 (20p) y Cena 19:30 (60p)
    6: ["12:30", "15:15", "19:30"]  // Sábado: Comida 12:30 (40p), 15:15 (20p) y Cena 19:30 (60p)
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

    const maxCapacidad = SHIFT_CAPACITIES[hora] || 20;

    const ocupacionActual = db.reservas
        .filter(r => r.fecha === fecha && r.hora === hora && r.estado === 'CONFIRMADA')
        .reduce((total, r) => total + parseInt(r.comensales, 10), 0);

    const capacidadDisponible = maxCapacidad - ocupacionActual;

    return {
        disponible: capacidadDisponible >= comensalesSolicitados,
        capacidadRestante: Math.max(0, capacidadDisponible),
        maxCapacidad
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
            const maxCap = SHIFT_CAPACITIES[hora] || 20;
            const ocupacion = db.reservas
                .filter(r => r.fecha === fechaFormatted && r.hora === hora && r.estado === 'CONFIRMADA')
                .reduce((t, r) => t + parseInt(r.comensales, 10), 0);
            const disponibles = maxCap - ocupacion;

            if (disponibles > 0) {
                slots.push({
                    fecha: fechaFormatted,
                    hora: hora,
                    plazasLibres: disponibles,
                    maxCapacidad: maxCap
                });

                if (slots.length >= maxSlots) break;
            }
        }
    }

    return slots;
}

function createReservation(data) {
    const db = loadDb();
    const nuevaReserva = {
        id: 'RES-' + Date.now().toString().slice(-6),
        nombre: data.nombre,
        telefono: data.telefono,
        dni: data.dni.toUpperCase().trim(),
        email: data.email.toLowerCase().trim(),
        fecha: data.fecha,
        hora: data.hora,
        comensales: parseInt(data.comensales, 10),
        estado: 'CONFIRMADA',
        idioma: data.idioma || 'es',
        fechaCreacion: new Date().toISOString()
    };

    db.reservas.push(nuevaReserva);
    saveDb(db);

    if (pool) {
        // 1. Guardar o actualizar cliente con idioma
        pool.query(
            `INSERT INTO clientes(nombre, telefono, dni, email, idioma)
             VALUES($1, $2, $3, $4, $5)
             ON CONFLICT(dni) DO UPDATE SET nombre=$1, telefono=$2, email=$4, idioma=$5`,
            [nuevaReserva.nombre, nuevaReserva.telefono, nuevaReserva.dni, nuevaReserva.email, nuevaReserva.idioma]
        ).catch(err => console.error("Error PostgreSQL INSERT cliente:", err.message));

        // 2. Guardar reserva con idioma
        pool.query(
            `INSERT INTO reservas(id, cliente_dni, nombre, telefono, dni, email, fecha, hora, comensales, estado, idioma)
             VALUES($1, $3, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT(id) DO NOTHING`,
            [nuevaReserva.id, nuevaReserva.nombre, nuevaReserva.telefono, nuevaReserva.dni, nuevaReserva.email, nuevaReserva.fecha, nuevaReserva.hora, nuevaReserva.comensales, nuevaReserva.estado, nuevaReserva.idioma]
        ).catch(err => console.error("Error PostgreSQL INSERT reserva:", err.message));
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
        (r.email && r.email.toUpperCase() === search)
    );
}

function getAllReservations(criterio) {
    const db = loadDb();
    const search = criterio.toUpperCase().trim();
    
    return db.reservas.filter(r => 
        (r.id && r.id.toUpperCase() === search) ||
        (r.dni && r.dni.toUpperCase() === search) || 
        (r.telefono && r.telefono.includes(search)) ||
        (r.email && r.email.toUpperCase() === search)
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
                `UPDATE reservas SET fecha=$1, hora=$2, comensales=$3 WHERE id=$4`,
                [newData.fecha, newData.hora, newData.comensales, id]
            ).catch(err => console.error("Error PostgreSQL UPDATE reserva:", err.message));
        }

        return db.reservas[index];
    }
    return null;
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

// -------------------------------------------------------------
// OPERACIONES DE LISTA DE ESPERA
// -------------------------------------------------------------

function addToWaitlist(data) {
    const db = loadDb();
    const nuevoRegistro = {
        id: 'ESP-' + Date.now().toString().slice(-6),
        nombre: data.nombre,
        telefono: data.telefono,
        dni: data.dni.toUpperCase().trim(),
        email: data.email.toLowerCase().trim(),
        fecha: data.fecha,
        hora: data.hora,
        comensales: parseInt(data.comensales, 10),
        idioma: data.idioma || 'es',
        fechaRegistro: new Date().toISOString()
    };

    db.listaEspera.push(nuevoRegistro);
    saveDb(db);

    if (pool) {
        pool.query(
            `INSERT INTO lista_espera(id, nombre, telefono, dni, email, fecha, hora, comensales, idioma)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(id) DO NOTHING`,
            [nuevoRegistro.id, nuevoRegistro.nombre, nuevoRegistro.telefono, nuevoRegistro.dni, nuevoRegistro.email, nuevoRegistro.fecha, nuevoRegistro.hora, nuevoRegistro.comensales, nuevoRegistro.idioma]
        ).catch(err => console.error("Error PostgreSQL INSERT lista_espera:", err.message));
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

module.exports = {
    checkAvailability,
    getUpcomingAvailableSlots,
    createReservation,
    getReservation,
    getAllReservations,
    getReservationById,
    updateReservation,
    cancelReservation,
    addToWaitlist,
    getWaitlistPosition,
    getFirstWaitlistForSlot,
    removeFromWaitlist,
    SHIFT_CAPACITIES,
    SCHEDULE_BY_DAY
};
