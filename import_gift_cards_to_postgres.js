const { pool } = require('./db/connection');
const fs = require('fs');
const path = require('path');

async function importAllCards() {
    const jsonPath = path.join(__dirname, 'tarjetas_regalo', 'tarjetas_regalo_unificadas.json');
    if (!fs.existsSync(jsonPath)) {
        console.error("No se encontró el archivo tarjetas_regalo_unificadas.json");
        return;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log(`Iniciando importación de ${data.length} tarjetas a PostgreSQL...`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let count = 0;

        for (const c of data) {
            const rawCodigo = c.codigo_tarjeta_regalo ? String(c.codigo_tarjeta_regalo).trim() : '';
            const id = rawCodigo ? rawCodigo : `ID-${c.id}`;
            const codigo = rawCodigo || id;
            const tipo = c.tipo_tarjeta_regalo || 'PERSONALIZADAS';
            const nombre_compra = c.nombre_compra || '';
            const nombre_comensal = c.nombre_comensal || '';
            const telefono_compra = c.telefono_compra || '';
            const importe = typeof c.importe === 'number' ? c.importe : 0;
            const observaciones = c.observaciones || '';
            const creada_en_revo = !!c.creada_en_revo;
            const fecha_compra = c.fecha_compra || null;
            const entregado = c.entregado !== null ? !!c.entregado : null;
            const fecha_entrega = c.fecha_entrega || null;
            const pagado = c.pagado !== null ? !!c.pagado : null;
            const fecha_pago = c.fecha_pago || null;
            const usado = !!c.usado;
            // ACTIVO: En Google Sheets, ACTIVO es True si no está usado y es válida
            const activo = !usado;
            const estado = usado ? 'CONSUMIDA' : 'DISPONIBLE';
            const fecha_caducidad = c.fecha_caducidad || null;

            const query = `
                INSERT INTO tarjetas_regalo (
                    id, codigo, tipo_tarjeta_regalo, nombre_compra, nombre_comensal,
                    telefono_compra, importe, observaciones, creada_en_revo, fecha_compra,
                    entregado, fecha_entrega, pagado, fecha_pago, usado, estado,
                    fecha_caducidad, activo, fecha_ultima_modificacion
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16,
                    $17, $18, (NOW() AT TIME ZONE 'Europe/Madrid')
                )
                ON CONFLICT (id) DO UPDATE SET
                    codigo = EXCLUDED.codigo,
                    tipo_tarjeta_regalo = EXCLUDED.tipo_tarjeta_regalo,
                    nombre_compra = EXCLUDED.nombre_compra,
                    nombre_comensal = EXCLUDED.nombre_comensal,
                    telefono_compra = EXCLUDED.telefono_compra,
                    importe = EXCLUDED.importe,
                    observaciones = EXCLUDED.observaciones,
                    creada_en_revo = EXCLUDED.creada_en_revo,
                    fecha_compra = EXCLUDED.fecha_compra,
                    entregado = EXCLUDED.entregado,
                    fecha_entrega = EXCLUDED.fecha_entrega,
                    pagado = EXCLUDED.pagado,
                    fecha_pago = EXCLUDED.fecha_pago,
                    usado = EXCLUDED.usado,
                    estado = EXCLUDED.estado,
                    fecha_caducidad = EXCLUDED.fecha_caducidad,
                    activo = EXCLUDED.activo,
                    fecha_ultima_modificacion = (NOW() AT TIME ZONE 'Europe/Madrid');
            `;

            await client.query(query, [
                id, codigo, tipo, nombre_compra, nombre_comensal,
                telefono_compra, importe, observaciones, creada_en_revo, fecha_compra,
                entregado, fecha_entrega, pagado, fecha_pago, usado, estado,
                fecha_caducidad, activo
            ]);
            count++;
        }

        await client.query('COMMIT');
        console.log(`✅ ¡Éxito! Se sincronizaron ${count} tarjetas de regalo en PostgreSQL.`);

        // Sincronizar también db.json para redundancia
        const dbPath = path.join(__dirname, 'db.json');
        if (fs.existsSync(dbPath)) {
            const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
            dbData.tarjetasRegalo = data.map(c => {
                const rawCodigo = c.codigo_tarjeta_regalo ? String(c.codigo_tarjeta_regalo).trim() : '';
                const id = rawCodigo ? rawCodigo : `ID-${c.id}`;
                return {
                    id: id,
                    codigo: rawCodigo || id,
                    tipo_tarjeta_regalo: c.tipo_tarjeta_regalo || 'PERSONALIZADAS',
                    nombre_compra: c.nombre_compra || '',
                    nombre_comensal: c.nombre_comensal || '',
                    telefono_compra: c.telefono_compra || '',
                    importe: typeof c.importe === 'number' ? c.importe : 0,
                    observaciones: c.observaciones || '',
                    creada_en_revo: !!c.creada_en_revo,
                    fecha_compra: c.fecha_compra || null,
                    entregado: c.entregado !== null ? !!c.entregado : null,
                    fecha_entrega: c.fecha_entrega || null,
                    pagado: c.pagado !== null ? !!c.pagado : null,
                    fecha_pago: c.fecha_pago || null,
                    usado: !!c.usado,
                    activo: !c.usado,
                    estado: c.usado ? 'CONSUMIDA' : 'DISPONIBLE',
                    fecha_caducidad: c.fecha_caducidad || null
                };
            });
            fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
            console.log(`✅ Sincronizadas ${dbData.tarjetasRegalo.length} tarjetas en db.json también.`);
        }

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error importando tarjetas:", err);
    } finally {
        client.release();
    }
}

if (require.main === module) {
    importAllCards().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { importAllCards };
