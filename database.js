const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const DB_PATH = path.join(__dirname, 'db.json');

// Conexión opcional a PostgreSQL
let pool = null;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    console.log("🗄️ Modo Base de Datos: PostgreSQL Conectado.");
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
// OPERACIONES DE DISPONIBILIDAD Y RESERVAS
// -------------------------------------------------------------

function checkAvailability(fecha, hora, comensales) {
    const db = loadDb();
    const comensalesSolicitados = parseInt(comensales, 10) || 0;

    const ocupacionActual = db.reservas
        .filter(r => r.fecha === fecha && r.hora === hora && r.estado === 'CONFIRMADA')
        .reduce((total, r) => total + parseInt(r.comensales, 10), 0);

    const capacidadDisponible = db.capacidadMaximaPorTurno - ocupacionActual;

    return {
        disponible: capacidadDisponible >= comensalesSolicitados,
        capacidadRestante: capacidadDisponible
    };
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
        fechaCreacion: new Date().toISOString()
    };

    db.reservas.push(nuevaReserva);
    saveDb(db);

    // Si PostgreSQL está activo, guardar asíncronamente en PostgreSQL
    if (pool) {
        pool.query(
            `INSERT INTO reservas(id, nombre, telefono, dni, email, fecha, hora, comensales, estado)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(id) DO NOTHING`,
            [nuevaReserva.id, nuevaReserva.nombre, nuevaReserva.telefono, nuevaReserva.dni, nuevaReserva.email, nuevaReserva.fecha, nuevaReserva.hora, nuevaReserva.comensales, nuevaReserva.estado]
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
        fechaRegistro: new Date().toISOString()
    };

    db.listaEspera.push(nuevoRegistro);
    saveDb(db);

    if (pool) {
        pool.query(
            `INSERT INTO lista_espera(id, nombre, telefono, dni, email, fecha, hora, comensales)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT(id) DO NOTHING`,
            [nuevoRegistro.id, nuevoRegistro.nombre, nuevoRegistro.telefono, nuevoRegistro.dni, nuevoRegistro.email, nuevoRegistro.fecha, nuevoRegistro.hora, nuevoRegistro.comensales]
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
    createReservation,
    getReservation,
    getAllReservations,
    getReservationById,
    updateReservation,
    cancelReservation,
    addToWaitlist,
    getWaitlistPosition,
    getFirstWaitlistForSlot,
    removeFromWaitlist
};
