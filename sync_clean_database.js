const { pool } = require('./db/connection');
const fs = require('fs');

async function syncAllGiftCardsPure() {
    try {
        console.log("Leyendo archivo JSON de tarjetas extraídas sin '.0'...");
        const raw = fs.readFileSync('tarjetas_regalo/tarjetas_regalo_unificadas.json', 'utf8');
        const cards = JSON.parse(raw);
        console.log(`Total tarjetas puras a sincronizar: ${cards.length}`);

        console.log("Limpiando tabla tarjetas_regalo para inserción limpia...");
        await pool.query('TRUNCATE TABLE tarjetas_regalo;');

        const insertQuery = `
            INSERT INTO tarjetas_regalo (
                id, codigo, nombre_compra, nombre_comensal, telefono_compra,
                importe, observaciones, creada_en_revo, fecha_compra,
                entregado, fecha_entrega, pagado, fecha_pago, usado,
                estado, fecha_caducidad, fecha_ultima_modificacion
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12, $13, $14,
                $15, $16, (NOW() AT TIME ZONE 'Europe/Madrid')
            )
        `;

        for (const c of cards) {
            const idStr = String(c.id);
            const codigoStr = c.codigo_tarjeta_regalo ? String(c.codigo_tarjeta_regalo) : (`SINC-${idStr}`);
            const estado = c.usado === true ? 'CONSUMIDA' : 'DISPONIBLE';

            await pool.query(insertQuery, [
                idStr,
                codigoStr,
                c.nombre_compra || null,
                c.nombre_comensal || null,
                c.telefono_compra || null,
                c.importe !== null && c.importe !== undefined ? Number(c.importe) : null,
                c.observaciones || null,
                c.creada_en_revo,
                c.fecha_compra || null,
                c.entregado,
                c.fecha_entrega || null,
                c.pagado,
                c.fecha_pago || null,
                c.usado,
                estado,
                c.fecha_caducidad || null
            ]);
        }

        const countRes = await pool.query('SELECT COUNT(*) FROM tarjetas_regalo');
        console.log(`✅ Base de datos Neon PostgreSQL limpia y reorganizada con éxito. Total registros: ${countRes.rows[0].count}`);
        process.exit(0);
    } catch (err) {
        console.error("Error sincronizando tarjetas de regalo:", err);
        process.exit(1);
    }
}

syncAllGiftCardsPure();
