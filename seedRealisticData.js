const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const DB_PATH = path.join(__dirname, 'db.json');

let pool = null;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
}

const FIRST_NAMES = [
    "Miren", "Ainhoa", "Jon", "Unai", "Iñigo", "Mikel", "Gorka", "Nerea", "Amaia", "Ane",
    "Javier", "Carlos", "María", "Carmen", "Sofia", "Pablo", "Alejandro", "Lucía", "Elena", "Hugo",
    "John", "Sarah", "David", "Emma", "James", "Michael", "Pierre", "Sophie", "Lucas", "Camille",
    "Wei", "Hitoshi", "Dmitry", "Tariq", "Koldo", "Xabier", "Itziar", "Maite", "Oihan", "Lander"
];

const LAST_NAMES = [
    "Gorrotxategi", "Urien", "Goikoetxea", "Etxeberria", "Agirre", "Zabala", "Muguruza", "Otegi",
    "García", "Rodríguez", "Martínez", "López", "González", "Pérez", "Sánchez", "Fernández",
    "Smith", "Johnson", "Brown", "Dubois", "Martin", "Bernard", "Tanaka", "Sato", "Ivanov"
];

const LANGUAGES = ["es", "es", "es", "es", "eu", "eu", "en", "fr", "zh", "ja", "ru", "ar"];
const EMAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.es", "hotmail.com", "euskalnet.net", "icloud.com"];

function getRandomElem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateDni(index) {
    const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
    const num = 10000000 + index;
    const letter = letters[num % 23];
    return `${num}${letter}`;
}

// Configuración exacta de Grupos de Seating
const SEATING_GROUPS_SPEC = [
    { name: "Comida 1º Turno", slots: ["12:30", "13:00", "13:30", "14:00"], maxCap: 40, days: [0, 2, 3, 4, 5, 6] },
    { name: "Comida 2º Turno", slots: ["15:15"], maxCap: 20, days: [0, 2, 3, 4, 5, 6] },
    { name: "Cena Turno Único", slots: ["20:00", "20:30", "21:00", "21:30"], maxCap: 60, days: [5, 6] }
];

async function seedDatabase() {
    console.log("🌱 Generando base de datos profesional para Casa Julian con Turnos de Imagen...");

    const clientesMap = new Map();
    const reservas = [];
    const listaEspera = [];

    let clientIndex = 1000;
    let resIndex = 1000;

    const startDate = new Date(2026, 6, 22); // 22/07/2026
    const endDate = new Date(2026, 10, 15);  // 15/11/2026
    const fullUntilDate = new Date(2026, 9, 31); // Lleno total hasta 31/10/2026

    let curr = new Date(startDate);

    while (curr <= endDate) {
        const dayOfWeek = curr.getDay();

        if (dayOfWeek !== 1) { // No es lunes (Lunes CERRADO)
            const dayStr = String(curr.getDate()).padStart(2, '0');
            const monthStr = String(curr.getMonth() + 1).padStart(2, '0');
            const yearStr = curr.getFullYear();
            const fechaFormatted = `${dayStr}/${monthStr}/${yearStr}`;

            for (const group of SEATING_GROUPS_SPEC) {
                if (!group.days.includes(dayOfWeek)) continue;

                let targetCap = group.maxCap;

                // Dejar libres a partir de Noviembre 2026
                if (curr > fullUntilDate) {
                    if (curr.getDate() === 1) targetCap = Math.floor(group.maxCap * 0.75); // 75% lleno
                    else if (curr.getDate() === 3) targetCap = Math.floor(group.maxCap * 0.50); // 50% lleno
                    else if (curr.getDate() === 4) targetCap = Math.floor(group.maxCap * 0.25); // 25% lleno
                    else if (curr.getDate() >= 5) targetCap = Math.floor(group.maxCap * 0.10); // 10% lleno
                }

                let currentDiners = 0;

                while (currentDiners < targetCap) {
                    let comensales = getRandomElem([2, 2, 2, 3, 4, 4, 4, 5, 6]);
                    if (currentDiners + comensales > targetCap) {
                        comensales = targetCap - currentDiners;
                    }
                    if (comensales <= 0) break;

                    clientIndex++;
                    resIndex++;

                    const hora = getRandomElem(group.slots); // Distribuir entre las horas del grupo
                    const fname = getRandomElem(FIRST_NAMES);
                    const lname1 = getRandomElem(LAST_NAMES);
                    const lname2 = getRandomElem(LAST_NAMES);
                    const nombre = `${fname} ${lname1} ${lname2}`;
                    const telefono = `+346${getRandomInt(10000000, 99999999)}`;
                    const dni = generateDni(clientIndex);
                    const email = `${fname.toLowerCase()}.${lname1.toLowerCase()}${getRandomInt(10, 99)}@${getRandomElem(EMAIL_DOMAINS)}`;
                    const idioma = getRandomElem(LANGUAGES);

                    clientesMap.set(dni, { nombre, telefono, dni, email, idioma });

                    reservas.push({
                        id: `RES-${yearStr}${monthStr}${dayStr}-${resIndex}`,
                        nombre,
                        telefono,
                        dni,
                        email,
                        fecha: fechaFormatted,
                        hora,
                        comensales,
                        estado: 'CONFIRMADA',
                        idioma,
                        fechaCreacion: new Date(curr.getTime() - getRandomInt(1, 30) * 86400000).toISOString()
                    });

                    currentDiners += comensales;
                }

                // Lista de espera para días llenos
                if (curr <= fullUntilDate && Math.random() > 0.4) {
                    clientIndex++;
                    const hora = getRandomElem(group.slots);
                    const fname = getRandomElem(FIRST_NAMES);
                    const lname = getRandomElem(LAST_NAMES);
                    const nombre = `${fname} ${lname}`;
                    const telefono = `+346${getRandomInt(10000000, 99999999)}`;
                    const dni = generateDni(clientIndex);
                    const email = `${fname.toLowerCase()}.${lname.toLowerCase()}@${getRandomElem(EMAIL_DOMAINS)}`;
                    const idioma = getRandomElem(LANGUAGES);

                    clientesMap.set(dni, { nombre, telefono, dni, email, idioma });

                    listaEspera.push({
                        id: `ESP-${yearStr}${monthStr}${dayStr}-${clientIndex}`,
                        nombre,
                        telefono,
                        dni,
                        email,
                        fecha: fechaFormatted,
                        hora,
                        comensales: getRandomElem([2, 4]),
                        idioma,
                        fechaRegistro: new Date().toISOString()
                    });
                }
            }
        }

        curr.setDate(curr.getDate() + 1);
    }

    const clientesArr = Array.from(clientesMap.values());
    console.log(`✅ Creados ${clientesArr.length} clientes, ${reservas.length} reservas y ${listaEspera.length} inscripciones en lista de espera.`);

    // 1. Guardar localmente db.json
    const dbData = {
        capacidadMaximaPorTurno: 20,
        reservas,
        listaEspera
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2), 'utf8');
    console.log("💾 Guardado correctamente en db.json local.");

    // 2. Si PostgreSQL está activo, hacer inserciones masivas en bloques
    if (pool) {
        try {
            console.log("⚡ Sincronizando con PostgreSQL Neon...");
            await pool.query(`
                CREATE TABLE IF NOT EXISTS clientes (
                    id SERIAL PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    telefono VARCHAR(20) UNIQUE NOT NULL,
                    dni VARCHAR(20) UNIQUE NOT NULL,
                    email VARCHAR(100) NOT NULL,
                    idioma VARCHAR(10) DEFAULT 'es',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS reservas (
                    id VARCHAR(30) PRIMARY KEY,
                    cliente_dni VARCHAR(20) REFERENCES clientes(dni) ON DELETE CASCADE,
                    nombre VARCHAR(100) NOT NULL,
                    telefono VARCHAR(20) NOT NULL,
                    dni VARCHAR(20) NOT NULL,
                    email VARCHAR(100) NOT NULL,
                    fecha VARCHAR(20) NOT NULL,
                    hora VARCHAR(10) NOT NULL,
                    comensales INT NOT NULL,
                    estado VARCHAR(20) DEFAULT 'CONFIRMADA',
                    idioma VARCHAR(10) DEFAULT 'es',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS lista_espera (
                    id VARCHAR(30) PRIMARY KEY,
                    cliente_dni VARCHAR(20) REFERENCES clientes(dni) ON DELETE CASCADE,
                    nombre VARCHAR(100) NOT NULL,
                    telefono VARCHAR(20) NOT NULL,
                    dni VARCHAR(20) NOT NULL,
                    email VARCHAR(100) NOT NULL,
                    fecha VARCHAR(20) NOT NULL,
                    hora VARCHAR(10) NOT NULL,
                    comensales INT NOT NULL,
                    idioma VARCHAR(10) DEFAULT 'es',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                DELETE FROM lista_espera;
                DELETE FROM reservas;
                DELETE FROM clientes;
            `);

            // Inserción en lote de Clientes
            const clientChunks = chunkArray(clientesArr, 500);
            for (const chunk of clientChunks) {
                const values = [];
                const params = [];
                let p = 1;
                for (const c of chunk) {
                    values.push(`($${p}, $${p+1}, $${p+2}, $${p+3}, $${p+4})`);
                    params.push(c.nombre, c.telefono, c.dni, c.email, c.idioma);
                    p += 5;
                }
                await pool.query(`INSERT INTO clientes(nombre, telefono, dni, email, idioma) VALUES ${values.join(', ')} ON CONFLICT(dni) DO NOTHING`, params);
            }

            // Inserción en lote de Reservas
            const resChunks = chunkArray(reservas, 500);
            for (const chunk of resChunks) {
                const values = [];
                const params = [];
                let p = 1;
                for (const r of chunk) {
                    values.push(`($${p}, $${p+1}, $${p+2}, $${p+3}, $${p+4}, $${p+5}, $${p+6}, $${p+7}, $${p+8}, $${p+9}, $${p+10})`);
                    params.push(r.id, r.dni, r.nombre, r.telefono, r.dni, r.email, r.fecha, r.hora, r.comensales, r.estado, r.idioma);
                    p += 11;
                }
                await pool.query(`INSERT INTO reservas(id, cliente_dni, nombre, telefono, dni, email, fecha, hora, comensales, estado, idioma) VALUES ${values.join(', ')} ON CONFLICT(id) DO NOTHING`, params);
            }

            // Inserción en lote de Lista de Espera
            if (listaEspera.length > 0) {
                const values = [];
                const params = [];
                let p = 1;
                for (const e of listaEspera) {
                    values.push(`($${p}, $${p+1}, $${p+2}, $${p+3}, $${p+4}, $${p+5}, $${p+6}, $${p+7}, $${p+8}, $${p+9})`);
                    params.push(e.id, e.dni, e.nombre, e.telefono, e.dni, e.email, e.fecha, e.hora, e.comensales, e.idioma);
                    p += 10;
                }
                await pool.query(`INSERT INTO lista_espera(id, cliente_dni, nombre, telefono, dni, email, fecha, hora, comensales, idioma) VALUES ${values.join(', ')} ON CONFLICT(id) DO NOTHING`, params);
            }

            console.log("🚀 Sincronización masiva con PostgreSQL completada con ÉXITO en SEGUNDOS.");
        } catch (err) {
            console.error("Error al sincronizar con PostgreSQL:", err.message);
        } finally {
            await pool.end();
        }
    }
}

function chunkArray(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

seedDatabase();
