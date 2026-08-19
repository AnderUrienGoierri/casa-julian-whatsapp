const { pool } = require('./db/connection');

function parseDateStrToDate(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim();
    const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
        return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10), 23, 59, 59);
    }
    const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
        return new Date(parseInt(ymdMatch[1], 10), parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10), 23, 59, 59);
    }
    return null;
}

async function updateExpiredCards() {
    try {
        console.log("Calculando estado de caducidad para todas las tarjetas en Neon...");
        const res = await pool.query("SELECT id, codigo, estado, fecha_caducidad, usado FROM tarjetas_regalo");
        const now = new Date();
        let caducadasActualizadas = 0;

        for (const card of res.rows) {
            // Si ya está usada, su estado es CONSUMIDA
            if (card.usado === true) {
                if (card.estado !== 'CONSUMIDA') {
                    await pool.query("UPDATE tarjetas_regalo SET estado = 'CONSUMIDA' WHERE id = $1", [card.id]);
                }
                continue;
            }

            // Si no está usada, verificar si la fecha de caducidad ya pasó
            if (card.fecha_caducidad) {
                const expDate = parseDateStrToDate(card.fecha_caducidad);
                if (expDate && now.getTime() > expDate.getTime()) {
                    await pool.query("UPDATE tarjetas_regalo SET estado = 'CADUCADA' WHERE id = $1", [card.id]);
                    caducadasActualizadas++;
                } else if (expDate && now.getTime() <= expDate.getTime()) {
                    if (card.estado !== 'DISPONIBLE') {
                        await pool.query("UPDATE tarjetas_regalo SET estado = 'DISPONIBLE' WHERE id = $1", [card.id]);
                    }
                }
            }
        }

        console.log(`✅ Total tarjetas no usadas que han pasado a CADUCADA: ${caducadasActualizadas}`);
        const stats = await pool.query("SELECT estado, COUNT(*) FROM tarjetas_regalo GROUP BY estado ORDER BY count DESC");
        console.log("📊 Resumen de estados en la base de datos Neon:");
        stats.rows.forEach(r => console.log(`   • ${r.estado}: ${r.count} tarjetas`));

        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

updateExpiredCards();
