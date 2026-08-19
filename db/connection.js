const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const DB_PATH = path.join(__dirname, '..', 'db.json');

/**
 * Genera la fecha/hora exacta en la zona horaria de España (Europe/Madrid) con offset explícito (+02:00 / +01:00).
 */
function getSpainIsoTimestamp() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    const dateStr = formatter.format(now).replace(' ', 'T');
    
    const tzFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' });
    const parts = tzFormatter.formatToParts(now);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    let offset = '+02:00';
    if (tzPart && tzPart.value) {
        const match = tzPart.value.match(/GMT([+-]\d{1,2}:?\d{0,2})/);
        if (match && match[1]) {
            offset = match[1];
            if (!offset.includes(':') && offset.length === 3) offset += ':00';
        }
    }
    return `${dateStr}${offset}`;
}

// Conexión a PostgreSQL con Auto-Migración de columnas
let pool = null;
if (process.env.DATABASE_URL) {
    const sanitizedDbUrl = process.env.DATABASE_URL.replace(/sslmode=(require|prefer|verify-ca)/gi, 'sslmode=verify-full');
    pool = new Pool({
        connectionString: sanitizedDbUrl,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    console.log("🗄️ Modo Base de Datos: PostgreSQL Conectado.");

    pool.on('connect', (client) => {
        client.query("SET TIMEZONE TO 'Europe/Madrid'").catch(err => console.error("Error configurando Timezone Europe/Madrid:", err.message));
    });

    // Auto-migración
    pool.query(`
        CREATE TABLE IF NOT EXISTS clientes (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(150) NOT NULL,
            telefono VARCHAR(50) NOT NULL,
            dni VARCHAR(50) DEFAULT 'N/A',
            email VARCHAR(150) DEFAULT 'N/A',
            idioma VARCHAR(50) DEFAULT 'es',
            nacionalidad VARCHAR(100) DEFAULT 'España',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid')
        );

        DO $$ 
        DECLARE r RECORD;
        BEGIN
            FOR r IN (
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name = 'clientes' AND constraint_type = 'UNIQUE'
            ) LOOP
                EXECUTE 'ALTER TABLE clientes DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name) || ' CASCADE;';
            END LOOP;
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;

        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS idioma VARCHAR(50) DEFAULT 'es';
        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nacionalidad VARCHAR(100) DEFAULT 'España';
        ALTER TABLE clientes ALTER COLUMN idioma TYPE VARCHAR(50);
        ALTER TABLE clientes ALTER COLUMN nacionalidad TYPE VARCHAR(100);
        ALTER TABLE clientes ALTER COLUMN dni TYPE VARCHAR(50);
        ALTER TABLE clientes ALTER COLUMN email TYPE VARCHAR(150);
        ALTER TABLE clientes ALTER COLUMN nombre TYPE VARCHAR(150);
        ALTER TABLE clientes ALTER COLUMN telefono TYPE VARCHAR(50);
        ALTER TABLE clientes ALTER COLUMN dni DROP NOT NULL;
        ALTER TABLE clientes ALTER COLUMN email DROP NOT NULL;

        CREATE TABLE IF NOT EXISTS reservas (
            id VARCHAR(50) PRIMARY KEY,
            cliente_id INT REFERENCES clientes(id) ON DELETE CASCADE,
            fecha VARCHAR(50) DEFAULT '',
            tipo_servicio VARCHAR(50) DEFAULT 'Sin preferencia',
            hora VARCHAR(50) DEFAULT '',
            comensales INT DEFAULT 2,
            num_ninos INT DEFAULT 0,
            alergias TEXT DEFAULT 'NO',
            estado VARCHAR(50) DEFAULT 'PENDIENTE CONFIRMACION',
            tipo_reserva VARCHAR(50) DEFAULT 'online',
            tarjeta_regalo VARCHAR(100),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid')
        );

        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cliente_id INT;
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS tipo_reserva VARCHAR(50) DEFAULT 'online';
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS alergias TEXT DEFAULT 'NO';
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS tipo_servicio VARCHAR(50) DEFAULT 'Sin preferencia';
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS tarjeta_regalo VARCHAR(100);
        ALTER TABLE reservas ADD COLUMN IF NOT EXISTS num_ninos INT DEFAULT 0;
        UPDATE reservas SET num_ninos = 0 WHERE num_ninos IS NULL;
        ALTER TABLE reservas ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid');
        ALTER TABLE reservas ALTER COLUMN hora TYPE VARCHAR(50);
        ALTER TABLE reservas ALTER COLUMN fecha TYPE VARCHAR(50);
        ALTER TABLE reservas ALTER COLUMN estado TYPE VARCHAR(50);
        ALTER TABLE reservas ALTER COLUMN tipo_servicio TYPE VARCHAR(50);
        ALTER TABLE reservas ALTER COLUMN tarjeta_regalo TYPE VARCHAR(100);
        ALTER TABLE reservas ALTER COLUMN fecha DROP NOT NULL;

        CREATE TABLE IF NOT EXISTS reservas_fechas_preferencia (
            id SERIAL PRIMARY KEY,
            reserva_id VARCHAR(50) NOT NULL,
            fecha VARCHAR(20) NOT NULL,
            orden INT DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tarjetas_regalo (
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
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS tipo_tarjeta_regalo VARCHAR(50);
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS nombre_compra VARCHAR(255);
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS nombre_comensal VARCHAR(255);
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS telefono_compra VARCHAR(100);
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS importe NUMERIC(10,2);
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS observaciones TEXT;
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS creada_en_revo BOOLEAN;
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS entregado BOOLEAN;
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS fecha_entrega VARCHAR(50);
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS pagado BOOLEAN;
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS fecha_pago VARCHAR(50);
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS usado BOOLEAN;
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS fecha_caducidad VARCHAR(50);
        ALTER TABLE tarjetas_regalo ADD COLUMN IF NOT EXISTS fecha_ultima_modificacion TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid');
        ALTER TABLE tarjetas_regalo ALTER COLUMN fecha_ultima_modificacion SET DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid');

        CREATE TABLE IF NOT EXISTS bot_texts (
            id SERIAL PRIMARY KEY,
            lang VARCHAR(10) NOT NULL,
            key_name VARCHAR(100) NOT NULL,
            text_value TEXT NOT NULL,
            category VARCHAR(50) DEFAULT 'general',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(lang, key_name)
        );

        CREATE TABLE IF NOT EXISTS menu_items (
            id SERIAL PRIMARY KEY,
            category VARCHAR(100) NOT NULL,
            name VARCHAR(100) NOT NULL,
            price NUMERIC(10,2) NOT NULL,
            currency VARCHAR(20) DEFAULT '€',
            sort_order INT DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS bot_disabled_keys (
            key_name VARCHAR(100) PRIMARY KEY,
            is_disabled BOOLEAN DEFAULT TRUE
        );

        CREATE TABLE IF NOT EXISTS bot_custom_rules (
            id VARCHAR(100) PRIMARY KEY,
            keyword VARCHAR(100) NOT NULL,
            response_text TEXT NOT NULL,
            category VARCHAR(50) DEFAULT 'general',
            is_active BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bot_draft_changes (
            id SERIAL PRIMARY KEY,
            item_type VARCHAR(50) NOT NULL,
            item_key VARCHAR(100) NOT NULL,
            action VARCHAR(20) NOT NULL,
            old_value TEXT,
            new_value TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bot_attachments (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            file_size INT NOT NULL,
            url_path VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS solicitudes (
            id VARCHAR(100) PRIMARY KEY,
            tipo_accion VARCHAR(150) NOT NULL,
            categoria VARCHAR(100) NOT NULL,
            categoria_label VARCHAR(150) NOT NULL,
            telefono_cliente VARCHAR(50) NOT NULL,
            nombre_cliente VARCHAR(150) DEFAULT 'Cliente Casa Julián',
            telefono_reserva VARCHAR(50),
            datos_detallados TEXT,
            estado VARCHAR(50) DEFAULT 'PENDIENTE',
            respuesta_staff TEXT,
            fecha_respuesta TIMESTAMP WITH TIME ZONE,
            en_atencion_humana BOOLEAN DEFAULT FALSE,
            mensajes TEXT DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid')
        );

        CREATE TABLE IF NOT EXISTS bot_system_settings (
            key_name VARCHAR(100) PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bot_chat_history (
            id SERIAL PRIMARY KEY,
            telefono VARCHAR(50) NOT NULL,
            emisor VARCHAR(20) NOT NULL,
            tipo VARCHAR(30) DEFAULT 'text',
            texto TEXT,
            metadata TEXT DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Europe/Madrid')
        );

        CREATE INDEX IF NOT EXISTS idx_bot_chat_history_telefono ON bot_chat_history(telefono);

        ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS en_atencion_humana BOOLEAN DEFAULT FALSE;
        ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS mensajes TEXT DEFAULT '[]';
    `).catch(err => console.error("⚠️ Error en Auto-Migración de BD:", err.message));
}

module.exports = {
    pool,
    DB_PATH,
    getSpainIsoTimestamp
};
