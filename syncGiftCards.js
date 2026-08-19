const { pool } = require('./db/connection');
const fs = require('fs');

async function syncGiftCards() {
    try {
        console.log("Leyendo archivo JSON de tarjetas unificadas...");
        const raw = fs.readFileSync('tarjetas_regalo/tarjetas_regalo_unificadas.json', 'utf8');
        const cards = JSON.parse(raw);
        console.log(`Total tarjetas a procesar: ${cards.length}`);

        // Ampliar tipos de columnas en PostgreSQL para evitar truncation
        await pool.query(`
            ALTER TABLE tarjetas_regalo ALTER COLUMN id TYPE VARCHAR(100);
            ALTER TABLE tarjetas_regalo ALTER COLUMN codigo TYPE VARCHAR(150);
            ALTER TABLE tarjetas_regalo ALTER COLUMN comprador_nombre TYPE VARCHAR(255);
            ALTER TABLE tarjetas_regalo ALTER COLUMN comprador_telefono TYPE VARCHAR(100);
            ALTER TABLE tarjetas_regalo ALTER COLUMN fecha_compra TYPE VARCHAR(50);
            ALTER TABLE tarjetas_regalo ALTER COLUMN fecha_caducidad TYPE VARCHAR(50);
            ALTER TABLE tarjetas_regalo ALTER COLUMN estado TYPE VARCHAR(50);
            ALTER TABLE tarjetas_regalo ALTER COLUMN nombre_compra TYPE VARCHAR(255);
            ALTER TABLE tarjetas_regalo ALTER COLUMN nombre_comensal TYPE VARCHAR(255);
            ALTER TABLE tarjetas_regalo ALTER COLUMN telefono_compra TYPE VARCHAR(100);
            ALTER TABLE tarjetas_regalo ALTER COLUMN codigo_tarjeta_regalo TYPE VARCHAR(150);
            ALTER TABLE tarjetas_regalo ALTER COLUMN fecha_entrega TYPE VARCHAR(50);
            ALTER TABLE tarjetas_regalo ALTER COLUMN fecha_pago TYPE VARCHAR(50);
            ALTER TABLE tarjetas_regalo DROP CONSTRAINT IF EXISTS tarjetas_regalo_codigo_key;
            ALTER TABLE tarjetas_regalo ALTER COLUMN codigo DROP NOT NULL;
        `);
        console.log("Tipos de columnas ampliados correctamente.");

        const upsertQuery = `
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
            ) ON CONFLICT (id) DO UPDATE SET
                codigo = EXCLUDED.codigo,
                comprador_nombre = EXCLUDED.comprador_nombre,
                comprador_telefono = EXCLUDED.comprador_telefono,
                fecha_compra = EXCLUDED.fecha_compra,
                fecha_caducidad = EXCLUDED.fecha_caducidad,
                estado = EXCLUDED.estado,
                nombre_compra = EXCLUDED.nombre_compra,
                nombre_comensal = EXCLUDED.nombre_comensal,
                telefono_compra = EXCLUDED.telefono_compra,
                codigo_tarjeta_regalo = EXCLUDED.codigo_tarjeta_regalo,
                importe = EXCLUDED.importe,
                observaciones = EXCLUDED.observaciones,
                creada_en_revo = EXCLUDED.creada_en_revo,
                entregado = EXCLUDED.entregado,
                fecha_entrega = EXCLUDED.fecha_entrega,
                pagado = EXCLUDED.pagado,
                fecha_pago = EXCLUDED.fecha_pago,
                usado = EXCLUDED.usado,
                fecha_ultima_modificacion = (NOW() AT TIME ZONE 'Europe/Madrid')
        `;

        for (const c of cards) {
            const idStr = String(c.id);
            const codigoStr = c.codigo_tarjeta_regalo ? String(c.codigo_tarjeta_regalo) : (`SINC-${idStr}`);
            const estado = c.usado === true ? 'CONSUMIDA' : 'DISPONIBLE';

            await pool.query(upsertQuery, [
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
        console.log(`✅ Base de datos Neon sincronizada con éxito. Total registros: ${countRes.rows[0].count}`);
        process.exit(0);
    } catch (err) {
        console.error("Error sincronizando tarjetas de regalo:", err);
        process.exit(1);
    }
}

syncGiftCards();
