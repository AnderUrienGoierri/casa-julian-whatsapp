/**
 * addGiftCards.js
 * Script one-shot: inserta nuevas tarjetas regalo DISPONIBLES en Neon PostgreSQL.
 * Uso: node addGiftCards.js
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Generar 40 nuevas tarjetas DISPONIBLES: MT-2026-040 ... MT-2026-079
const nuevasTarjetas = Array.from({ length: 40 }, (_, i) => {
    const num = String(i + 40).padStart(3, '0');
    return {
        codigo: `MT-2026-${num}`,
        comprador_nombre: 'Test Cliente',
        comprador_telefono: `346000${String(i + 40).padStart(5, '0')}`,
        fecha_compra: '2026-01-01',
        fecha_caducidad: '2027-12-31',
        estado: 'DISPONIBLE'
    };
});

async function run() {
    const client = await pool.connect();
    try {
        console.log(`\n🎁 Insertando ${nuevasTarjetas.length} nuevas tarjetas regalo en Neon...\n`);
        let inserted = 0;
        let skipped = 0;

        for (const t of nuevasTarjetas) {
            const res = await client.query(
                `INSERT INTO tarjetas_regalo (id, codigo, comprador_nombre, comprador_telefono, fecha_compra, fecha_caducidad, estado)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (codigo) DO NOTHING`,
                [t.codigo, t.codigo, t.comprador_nombre, t.comprador_telefono, t.fecha_compra, t.fecha_caducidad, t.estado]
            );
            if (res.rowCount > 0) {
                console.log(`  ✅ Insertada: ${t.codigo}`);
                inserted++;
            } else {
                console.log(`  ⏭️  Ya existía: ${t.codigo}`);
                skipped++;
            }
        }

        // Verificación final
        const verificacion = await client.query(
            `SELECT codigo, estado, fecha_caducidad FROM tarjetas_regalo WHERE estado = 'DISPONIBLE' ORDER BY codigo`
        );
        console.log(`\n📊 Resumen:`);
        console.log(`   Insertadas: ${inserted}`);
        console.log(`   Ya existían (omitidas): ${skipped}`);
        console.log(`\n🟢 Tarjetas DISPONIBLES ahora en total: ${verificacion.rows.length}`);
        verificacion.rows.forEach(r => console.log(`   • ${r.codigo}  (caduca: ${r.fecha_caducidad})`));

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
