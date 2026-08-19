const { pool } = require('./db/connection');
const fs = require('fs');

async function recreateTableWithExactOrder() {
    try {
        console.log("1. Recreando tabla tarjetas_regalo con la nueva columna tipo_tarjeta_regalo...");

        // Reconstruir la tabla en Neon PostgreSQL incluyendo tipo_tarjeta_regalo
        await pool.query(`
            DROP TABLE IF EXISTS tarjetas_regalo CASCADE;

            CREATE TABLE tarjetas_regalo (
                id VARCHAR(100) PRIMARY KEY,
                codigo VARCHAR(150),
                tipo_tarjeta_regalo VARCHAR(50),
                nombre_compra VARCHAR(255),
                nombre_comensal VARCHAR(255),
                telefono_compra VARCHAR(100),
                importe NUMERIC(10,2),
                observaciones TEXT,
                creada_en_revo BOOLEAN,
                fecha_compra VARCHAR(50),
                entregado BOOLEAN,
                fecha_entrega VARCHAR(50),
                pagado BOOLEAN,
                fecha_pago VARCHAR(50),
                usado BOOLEAN,
                estado VARCHAR(50) DEFAULT 'DISPONIBLE',
                fecha_caducidad VARCHAR(50),
                fecha_ultima_modificacion TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid')
            );

            CREATE INDEX idx_tarjetas_codigo ON tarjetas_regalo(codigo);
            CREATE INDEX idx_tarjetas_tipo ON tarjetas_regalo(tipo_tarjeta_regalo);
        `);

        console.log("2. Cargando 1.133 registros purificados...");
        const raw = fs.readFileSync('tarjetas_regalo/tarjetas_regalo_unificadas.json', 'utf8');
        const cards = JSON.parse(raw);

        const insertQuery = `
            INSERT INTO tarjetas_regalo (
                id, codigo, tipo_tarjeta_regalo, nombre_compra, nombre_comensal, telefono_compra,
                importe, observaciones, creada_en_revo, fecha_compra,
                entregado, fecha_entrega, pagado, fecha_pago, usado,
                estado, fecha_caducidad, fecha_ultima_modificacion
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                $11, $12, $13, $14, $15,
                $16, $17, (NOW() AT TIME ZONE 'Europe/Madrid')
            )
        `;

        for (const c of cards) {
            const idStr = String(c.id);
            const codigoStr = c.codigo_tarjeta_regalo ? String(c.codigo_tarjeta_regalo) : (`SINC-${idStr}`);
            const estado = c.usado === true ? 'CONSUMIDA' : 'DISPONIBLE';

            await pool.query(insertQuery, [
                idStr,
                codigoStr,
                c.tipo_tarjeta_regalo || 'OTRAS',
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

        const colsRes = await pool.query(`
            SELECT column_name, ordinal_position
            FROM information_schema.columns 
            WHERE table_name = 'tarjetas_regalo'
            ORDER BY ordinal_position
        `);
        console.log("✅ ORDEN DE COLUMNAS CON TIPO_TARJETA_REGALO CONFIRMADO EN POSTGRESQL:");
        colsRes.rows.forEach(r => console.log(`  ${r.ordinal_position}. ${r.column_name}`));

        const countRes = await pool.query('SELECT COUNT(*) FROM tarjetas_regalo');
        console.log(`✅ Total tarjetas guardadas: ${countRes.rows[0].count}`);
        process.exit(0);
    } catch (err) {
        console.error("Error recreando tabla tarjetas_regalo:", err);
        process.exit(1);
    }
}

recreateTableWithExactOrder();
