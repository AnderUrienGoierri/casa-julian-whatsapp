const { pool } = require('./db/connection');
const fs = require('fs');

async function syncAllGiftCardsPure() {
    try {
        console.log("Leyendo archivo JSON de tarjetas extraídas puras...");
        const raw = fs.readFileSync('tarjetas_regalo/tarjetas_regalo_unificadas.json', 'utf8');
        const cards = JSON.parse(raw);
        console.log(`Total tarjetas puras reales a sincronizar: ${cards.length}`);

        // Limpiar tabla tarjetas_regalo para eliminar residuos previos o datos desactualizados
        console.log("Limpiando tabla tarjetas_regalo para inserción 100% limpia...");
        await pool.query('TRUNCATE TABLE tarjetas_regalo;');

        const insertQuery = `
            INSERT INTO tarjetas_regalo (
                id, codigo, comprador_nombre, comprador_telefono, fecha_compra, fecha_caducidad,
                estado, nombre_compra, nombre_comensal, telefono_compra, codigo_tarjeta_regalo,
                importe, observaciones, creada_en_revo, entregado, fecha_entrega,
                pagado, fecha_pago, usado, fecha_ultima_modificacion
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16,
                $17, $18, $19, (NOW() AT TIME ZONE 'Europe/Madrid')
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
                c.telefono_compra || null,
                c.fecha_compra || null,
                c.fecha_caducidad || null,
                estado,
                c.nombre_compra || null,
                c.nombre_comensal || null,
                c.telefono_compra || null,
                c.codigo_tarjeta_regalo ? String(c.codigo_tarjeta_regalo) : null,
                c.importe !== null && c.importe !== undefined ? Number(c.importe) : null,
                c.observaciones || null,
                c.creada_en_revo,
                c.entregado,
                c.fecha_entrega || null,
                c.pagado,
                c.fecha_pago || null,
                c.usado
            ]);
        }

        const countRes = await pool.query('SELECT COUNT(*) FROM tarjetas_regalo');
        console.log(`✅ Base de datos Neon PostgreSQL sincronizada al 100% limpia. Total registros: ${countRes.rows[0].count}`);
        process.exit(0);
    } catch (err) {
        console.error("Error sincronizando tarjetas de regalo puras:", err);
        process.exit(1);
    }
}

syncAllGiftCardsPure();
