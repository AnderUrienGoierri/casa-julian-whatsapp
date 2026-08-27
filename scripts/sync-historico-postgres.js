const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function syncHistoricoToPostgres() {
    try {
        console.log("🔌 Conectando a PostgreSQL para sincronizar histórico...");
        const client = await pool.connect();

        // 1. Asegurar tabla bot_chat_history
        await client.query(`
            CREATE TABLE IF NOT EXISTS bot_chat_history (
                id SERIAL PRIMARY KEY,
                telefono VARCHAR(30) NOT NULL,
                emisor VARCHAR(20) NOT NULL,
                tipo VARCHAR(30) DEFAULT 'text',
                texto TEXT,
                metadata JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_bot_chat_history_telefono ON bot_chat_history(telefono);
            CREATE INDEX IF NOT EXISTS idx_bot_chat_history_created ON bot_chat_history(created_at);
        `);

        // 2. Leer db.json
        const dbJsonPath = path.join(__dirname, '..', 'db.json');
        if (!fs.existsSync(dbJsonPath)) {
            console.log("❌ No existe db.json");
            client.release();
            await pool.end();
            return;
        }

        const dbData = JSON.parse(fs.readFileSync(dbJsonPath, 'utf8'));
        const history = dbData.bot_chat_history || [];
        console.log(`📦 Procesando ${history.length} mensajes históricos para PostgreSQL...`);

        // Obtener IDs existentes en metadata->>'origen_id' o texto+telefono+created_at para no duplicar
        const existingRes = await client.query(`SELECT telefono, texto, created_at FROM bot_chat_history`);
        const existingKeys = new Set(existingRes.rows.map(r => `${r.telefono}_${r.created_at ? new Date(r.created_at).getTime() : ''}`));

        let insertedCount = 0;

        for (const msg of history) {
            const tel = (msg.telefono || '').replace(/\D/g, '');
            if (!tel) continue;

            const timeKey = msg.created_at ? new Date(msg.created_at).getTime() : '';
            const key = `${tel}_${timeKey}`;

            if (existingKeys.has(key)) {
                continue;
            }

            await client.query(
                `INSERT INTO bot_chat_history (telefono, emisor, tipo, texto, metadata, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    tel,
                    msg.emisor || 'cliente',
                    msg.tipo || 'text',
                    msg.texto || '',
                    JSON.stringify(msg.metadata || {}),
                    msg.created_at || new Date().toISOString()
                ]
            );

            existingKeys.add(key);
            insertedCount++;
        }

        console.log(`🎉 ¡Sincronización completada! ${insertedCount} nuevos mensajes insertados en PostgreSQL.`);
        console.log(`📊 Total mensajes en tabla bot_chat_history: ${existingKeys.size}`);

        client.release();
        await pool.end();
    } catch (err) {
        console.error("❌ Error sincronizando a PostgreSQL:", err);
    }
}

syncHistoricoToPostgres();
