const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initializePostgres() {
    try {
        console.log("🔌 Conectando a Neon PostgreSQL...");
        const client = await pool.connect();
        
        // 1. Ejecutar el schema.sql
        const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        await client.query(schemaSql);
        console.log("✅ Tablas (clientes, reservas, lista_espera) e índices creados correctamente en PostgreSQL.");

        // 2. Migrar los datos existentes de db.json si existen
        const dbJsonPath = path.join(__dirname, 'db.json');
        if (fs.existsSync(dbJsonPath)) {
            const dbData = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));

            console.log(`📦 Migrando ${dbData.reservas.length} reservas a PostgreSQL...`);
            for (const r of dbData.reservas) {
                // Crear o ignorar cliente
                await client.query(
                    `INSERT INTO clientes (nombre, telefono, dni, email)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (dni) DO NOTHING`,
                    [r.nombre, r.telefono, r.dni, r.email]
                );

                // Insertar reserva
                await client.query(
                    `INSERT INTO reservas (id, cliente_dni, nombre, telefono, dni, email, fecha, hora, comensales, estado)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     ON CONFLICT (id) DO NOTHING`,
                    [r.id, r.dni, r.nombre, r.telefono, r.dni, r.email, r.fecha, r.hora, r.comensales, r.estado || 'CONFIRMADA']
                );
            }

            console.log(`📦 Migrando ${dbData.listaEspera.length} lista de espera a PostgreSQL...`);
            for (const e of dbData.listaEspera) {
                await client.query(
                    `INSERT INTO clientes (nombre, telefono, dni, email)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (dni) DO NOTHING`,
                    [e.nombre, e.telefono, e.dni, e.email]
                );

                await client.query(
                    `INSERT INTO lista_espera (id, cliente_dni, nombre, telefono, dni, email, fecha, hora, comensales)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     ON CONFLICT (id) DO NOTHING`,
                    [e.id, e.dni, e.nombre, e.telefono, e.dni, e.email, e.fecha, e.hora, e.comensales]
                );
            }

            console.log("🎉 ¡MIGRACIÓN COMPLETA A NEON POSTGRESQL EXITOSA!");
        }

        client.release();
        await pool.end();
    } catch (error) {
        console.error("❌ Error inicializando PostgreSQL:", error);
    }
}

initializePostgres();
