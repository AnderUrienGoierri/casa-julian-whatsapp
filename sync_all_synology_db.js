const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
});

async function runFullSync() {
    console.log("🔌 Conectando a PostgreSQL en Synology...");
    const client = await pool.connect();
    
    try {
        console.log("🛠️ Creando / Verificando esquema completo de tablas...");
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                telefono VARCHAR(50) NOT NULL,
                dni VARCHAR(50) UNIQUE,
                email VARCHAR(255),
                idioma VARCHAR(100) DEFAULT 'es',
                nacionalidad VARCHAR(100) DEFAULT 'España',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS reservas (
                id VARCHAR(50) PRIMARY KEY,
                cliente_dni VARCHAR(50),
                nombre VARCHAR(255) NOT NULL,
                telefono VARCHAR(50) NOT NULL,
                dni VARCHAR(50),
                email VARCHAR(255),
                fecha VARCHAR(100),
                hora VARCHAR(100),
                comensales INT NOT NULL DEFAULT 2,
                estado VARCHAR(50) DEFAULT 'CONFIRMADA',
                idioma VARCHAR(100) DEFAULT 'es',
                dias_preferencia VARCHAR(255) DEFAULT 'Sin preferencia',
                tipo_reserva VARCHAR(100) DEFAULT 'online',
                nacionalidad VARCHAR(100) DEFAULT 'España',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS lista_espera (
                id VARCHAR(50) PRIMARY KEY,
                nombre VARCHAR(255) NOT NULL,
                telefono VARCHAR(50) NOT NULL,
                dni VARCHAR(50) DEFAULT 'N/A',
                email VARCHAR(255) DEFAULT 'N/A',
                dias_preferencia VARCHAR(255) DEFAULT 'Sin preferencia',
                hora VARCHAR(100),
                comensales INT NOT NULL DEFAULT 2,
                ninos VARCHAR(50) DEFAULT '0',
                alergias TEXT DEFAULT 'Ninguna',
                estado VARCHAR(50) DEFAULT 'Pendiente confirmar',
                idioma VARCHAR(100) DEFAULT 'es',
                nacionalidad VARCHAR(100) DEFAULT 'España',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS tarjetas_regalo (
                id VARCHAR(100) PRIMARY KEY,
                codigo VARCHAR(150),
                tipo_tarjeta_regalo VARCHAR(100),
                nombre_compra VARCHAR(255),
                nombre_comensal VARCHAR(255),
                telefono_compra VARCHAR(100),
                importe NUMERIC(10,2),
                observaciones TEXT,
                creada_en_revo BOOLEAN,
                fecha_compra VARCHAR(100),
                entregado BOOLEAN,
                fecha_entrega VARCHAR(100),
                pagado BOOLEAN,
                fecha_pago VARCHAR(100),
                usado BOOLEAN,
                estado VARCHAR(50) DEFAULT 'DISPONIBLE',
                fecha_caducidad VARCHAR(100),
                activo BOOLEAN DEFAULT TRUE,
                fecha_ultima_modificacion TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid')
            );

            CREATE TABLE IF NOT EXISTS bot_silenced_numbers (
                id SERIAL PRIMARY KEY,
                telefono VARCHAR(50) NOT NULL UNIQUE,
                nombre VARCHAR(255) NOT NULL,
                categoria VARCHAR(100) DEFAULT 'proveedor',
                notas TEXT,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid'),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid')
            );

            CREATE TABLE IF NOT EXISTS solicitudes (
                id SERIAL PRIMARY KEY,
                tipo_accion VARCHAR(100) NOT NULL,
                telefono_cliente VARCHAR(50) NOT NULL,
                nombre_cliente VARCHAR(255),
                telefono_reserva VARCHAR(50),
                datos_detallados TEXT NOT NULL,
                estado VARCHAR(50) DEFAULT 'PENDIENTE',
                categoria_tag VARCHAR(100),
                topic_tag VARCHAR(100),
                notas_internas TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid'),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid')
            );
        `);

        // Ampliar columnas por si se crearon antes con longitud corta
        await client.query(`
            DO $$ 
            BEGIN
                BEGIN ALTER TABLE reservas ALTER COLUMN hora TYPE VARCHAR(100); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE reservas ALTER COLUMN idioma TYPE VARCHAR(100); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE reservas ALTER COLUMN dias_preferencia TYPE VARCHAR(255); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE clientes ALTER COLUMN idioma TYPE VARCHAR(100); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE clientes ALTER COLUMN nacionalidad TYPE VARCHAR(100); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE lista_espera ALTER COLUMN hora TYPE VARCHAR(100); EXCEPTION WHEN OTHERS THEN NULL; END;
                BEGIN ALTER TABLE lista_espera ALTER COLUMN idioma TYPE VARCHAR(100); EXCEPTION WHEN OTHERS THEN NULL; END;
            END $$;
        `);

        console.log("✅ Tablas creadas / verificadas con éxito.");

        // 1. Cargar números silenciados desde silenciar.txt
        const txtPath = path.join(__dirname, 'telefonos_contactos_silenciar_bot', 'silenciar.txt');
        if (fs.existsSync(txtPath)) {
            console.log("📦 Importando números de silenciar.txt a PostgreSQL...");
            const txt = fs.readFileSync(txtPath, 'utf8');
            const lines = txt.split(/\r?\n/);
            let cat = 'proveedor';
            let imported = 0;

            for (const line of lines) {
                const tr = line.trim();
                if (!tr) continue;
                if (tr.toUpperCase().includes('PROVEEDOR')) { cat = 'proveedor'; continue; }
                if (tr.toUpperCase().includes('ALBA') || tr.toUpperCase().includes('EMPLEADO')) { cat = 'empleado'; continue; }

                const match = tr.match(/^([+0-9\s()\-]+)(?:-\s*(.*))?$/);
                if (match) {
                    const rawPhone = match[1].trim();
                    const rawName = match[2] ? match[2].trim() : 'Contacto Silenciado';
                    const cleanPhone = rawPhone.replace(/\D/g, '');
                    if (cleanPhone.length >= 7) {
                        await client.query(`
                            INSERT INTO bot_silenced_numbers (telefono, nombre, categoria, notas, activo)
                            VALUES ($1, $2, $3, $4, true)
                            ON CONFLICT (telefono) DO UPDATE 
                            SET nombre = EXCLUDED.nombre, categoria = EXCLUDED.categoria, notas = EXCLUDED.notas, activo = true
                        `, [cleanPhone, rawName, cat, `Importado de silenciar.txt (${cat})`]);
                        imported++;
                    }
                }
            }
            console.log(`✅ ${imported} números silenciados sincronizados en PostgreSQL.`);
        }

        // 2. Cargar reservas y listas de espera de db.json si existe
        const dbJsonPath = path.join(__dirname, 'db.json');
        if (fs.existsSync(dbJsonPath)) {
            const db = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
            if (Array.isArray(db.reservas)) {
                console.log(`📦 Importando ${db.reservas.length} reservas a PostgreSQL...`);
                for (const r of db.reservas) {
                    if (r.dni) {
                        await client.query(`
                            INSERT INTO clientes (nombre, telefono, dni, email)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (dni) DO NOTHING
                        `, [r.nombre || 'Cliente', r.telefono || '', r.dni, r.email || '']);
                    }

                    await client.query(`
                        INSERT INTO reservas (id, cliente_dni, nombre, telefono, dni, email, fecha, hora, comensales, estado)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (id) DO NOTHING
                    `, [
                        r.id || `res_${Date.now()}_${Math.random()}`, 
                        r.dni || null, 
                        r.nombre || 'Cliente', 
                        r.telefono || '', 
                        r.dni || '', 
                        r.email || '', 
                        (r.fecha || '').toString().slice(0, 100), 
                        (r.hora || '').toString().slice(0, 100), 
                        parseInt(r.comensales) || 2, 
                        r.estado || 'CONFIRMADA'
                    ]);
                }
                console.log(`✅ Reservas sincronizadas con éxito.`);
            }

            if (Array.isArray(db.tarjetasRegalo)) {
                console.log(`📦 Importando ${db.tarjetasRegalo.length} tarjetas regalo a PostgreSQL...`);
                for (const t of db.tarjetasRegalo) {
                    await client.query(`
                        INSERT INTO tarjetas_regalo (id, codigo, tipo_tarjeta_regalo, nombre_compra, nombre_comensal, telefono_compra, importe, observaciones, estado, activo)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
                        ON CONFLICT (id) DO NOTHING
                    `, [
                        t.id || t.codigo, 
                        t.codigo, 
                        t.tipo_tarjeta_regalo || 'PERSONALIZADAS', 
                        t.nombre_compra || '', 
                        t.nombre_comensal || '', 
                        t.telefono_compra || '', 
                        parseFloat(t.importe) || 0, 
                        t.observaciones || '', 
                        t.estado || 'DISPONIBLE'
                    ]);
                }
                console.log(`✅ Tarjetas regalo sincronizadas con éxito.`);
            }
        }

        console.log("\n🎉 ¡SINCRONIZACIÓN TOTAL CON SYNOLOGY POSTGRESQL COMPLETADA CON ÉXITO!");

    } catch (e) {
        console.error("❌ Error durante la sincronización:", e);
    } finally {
        client.release();
        await pool.end();
    }
}

runFullSync();
