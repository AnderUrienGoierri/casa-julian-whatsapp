const fs = require('fs');
const path = require('path');
const { pool } = require('../db/connection');

async function migrateChatHistory() {
    if (!pool) {
        console.error("❌ No hay conexión a PostgreSQL.");
        process.exit(1);
    }

    const dbPath = path.join(__dirname, '..', 'db.json');
    if (!fs.existsSync(dbPath)) {
        console.error("❌ No existe db.json.");
        process.exit(1);
    }

    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const list = db.bot_chat_history || [];
    console.log(`🚀 Total mensajes en db.json a migrar: ${list.length}`);

    const client = await pool.connect();
    let inserted = 0;
    try {
        await client.query('BEGIN');
        for (const item of list) {
            const tel = (item.telefono || '').toString().trim();
            if (!tel) continue;
            const emisor = (item.emisor || 'cliente').toString().trim();
            const tipo = (item.tipo || 'text').toString().trim();
            const texto = (item.texto || '').toString();
            const metadataStr = typeof item.metadata === 'object' && item.metadata !== null 
                ? JSON.stringify(item.metadata) 
                : (item.metadata || '{}');
            const createdAt = item.created_at || new Date().toISOString();

            await client.query(
                `INSERT INTO bot_chat_history (telefono, emisor, tipo, texto, metadata, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [tel, emisor, tipo, texto, metadataStr, createdAt]
            );
            inserted++;
        }
        await client.query('COMMIT');
        console.log(`✅ ¡Migración exitosa! Se han insertado ${inserted} mensajes en bot_chat_history.`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en la transacción de migración:", err.message);
    } finally {
        client.release();
    }

    const res = await pool.query('SELECT count(*) as total FROM bot_chat_history');
    console.log(`📊 Total actual de mensajes en PostgreSQL: ${res.rows[0].total}`);
    process.exit(0);
}

migrateChatHistory().catch(e => {
    console.error("❌ Error fatal:", e);
    process.exit(1);
});
