/**
 * Módulo de Gestión de Números Silenciados (Proveedores, Empleados, etc.)
 * Permite que ciertos números operen en Bypass permanente del Chatbot automático.
 */

const { pool, getSpainIsoTimestamp } = require('./connection');

/**
 * Obtener todos los números silenciados registrados
 */
async function getAllSilencedNumbers() {
    try {
        const res = await pool.query(`
            SELECT id, telefono, nombre, categoria, notas, activo, created_at, updated_at
            FROM bot_silenced_numbers
            ORDER BY categoria ASC, nombre ASC, created_at DESC
        `);
        return res.rows.map(r => ({
            id: r.id,
            telefono: r.telefono,
            nombre: r.nombre,
            categoria: r.categoria || 'proveedor',
            notas: r.notas || '',
            activo: r.activo !== false,
            created_at: r.created_at,
            updated_at: r.updated_at
        }));
    } catch (err) {
        console.error("⚠️ Error obteniendo números silenciados:", err.message);
        return [];
    }
}

/**
 * Comprobar si un número de teléfono está en la lista de silenciados activos
 */
async function isPhoneSilenced(telefono) {
    if (!telefono) return false;
    const cleanPhone = telefono.toString().replace(/\D/g, '');
    try {
        const res = await pool.query(`
            SELECT id, nombre, categoria FROM bot_silenced_numbers 
            WHERE (telefono = $1 OR regexp_replace(telefono, '\\D', '', 'g') = $2) AND activo = true
            LIMIT 1
        `, [telefono, cleanPhone]);
        
        if (res.rows.length > 0) {
            return res.rows[0];
        }
        return false;
    } catch (err) {
        console.error("⚠️ Error comprobando si el teléfono está silenciado:", err.message);
        return false;
    }
}

/**
 * Añadir o actualizar un número silenciado
 */
async function addOrUpdateSilencedNumber({ telefono, nombre, categoria = 'proveedor', notas = '' }) {
    if (!telefono) throw new Error("El teléfono es obligatorio");
    const cleanPhone = telefono.toString().replace(/\D/g, '');
    const phoneToStore = cleanPhone.startsWith('34') || cleanPhone.length > 9 ? cleanPhone : `34${cleanPhone}`;
    const cleanName = (nombre || 'Contacto').trim();
    const cleanCategory = (categoria || 'proveedor').trim().toLowerCase();

    try {
        const check = await pool.query(`
            SELECT id FROM bot_silenced_numbers 
            WHERE telefono = $1 OR regexp_replace(telefono, '\\D', '', 'g') = $2
            LIMIT 1
        `, [phoneToStore, cleanPhone]);

        if (check.rows.length > 0) {
            const id = check.rows[0].id;
            await pool.query(`
                UPDATE bot_silenced_numbers 
                SET nombre = $1, categoria = $2, notas = $3, activo = true, updated_at = (NOW() AT TIME ZONE 'Europe/Madrid')
                WHERE id = $4
            `, [cleanName, cleanCategory, notas, id]);
            return { id, telefono: phoneToStore, nombre: cleanName, categoria: cleanCategory, updated: true };
        } else {
            const res = await pool.query(`
                INSERT INTO bot_silenced_numbers (telefono, nombre, categoria, notas, activo, created_at, updated_at)
                VALUES ($1, $2, $3, $4, true, (NOW() AT TIME ZONE 'Europe/Madrid'), (NOW() AT TIME ZONE 'Europe/Madrid'))
                RETURNING id
            `, [phoneToStore, cleanName, cleanCategory, notas]);
            return { id: res.rows[0].id, telefono: phoneToStore, nombre: cleanName, categoria: cleanCategory, created: true };
        }
    } catch (err) {
        console.error("⚠️ Error guardando número silenciado:", err.message);
        throw err;
    }
}

/**
 * Eliminar un número silenciado por ID
 */
async function deleteSilencedNumber(id) {
    try {
        await pool.query(`DELETE FROM bot_silenced_numbers WHERE id = $1`, [id]);
        return { success: true };
    } catch (err) {
        console.error("⚠️ Error eliminando número silenciado:", err.message);
        throw err;
    }
}

/**
 * Activar o desactivar el silencio para un número
 */
async function toggleSilencedNumberActive(id, activo) {
    try {
        await pool.query(`
            UPDATE bot_silenced_numbers 
            SET activo = $1, updated_at = (NOW() AT TIME ZONE 'Europe/Madrid')
            WHERE id = $2
        `, [activo, id]);
        return { success: true, id, activo };
    } catch (err) {
        console.error("⚠️ Error actualizando estado de número silenciado:", err.message);
        throw err;
    }
}

/**
 * Cargar números iniciales desde el archivo silenciar.txt si la tabla está vacía o para sincronización
 */
async function seedSilencedNumbersFromTxt(filePath) {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) return;

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        let currentCategory = 'proveedor';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.toUpperCase().includes('PROVEEDOR')) {
                currentCategory = 'proveedor';
                continue;
            } else if (trimmed.toUpperCase().includes('ALBA') || trimmed.toUpperCase().includes('TRABAJADOR') || trimmed.toUpperCase().includes('EMPLEADO')) {
                currentCategory = 'empleado';
                continue;
            }

            // Formato esperado: +34 633 63 87 32 - Maitines
            const match = trimmed.match(/^([+0-9\s()\-]+)(?:-\s*(.*))?$/);
            if (match) {
                const rawPhone = match[1].trim();
                const rawName = match[2] ? match[2].trim() : 'Contacto Silenciado';
                const cleanPhone = rawPhone.replace(/\D/g, '');
                
                if (cleanPhone.length >= 7) {
                    await addOrUpdateSilencedNumber({
                        telefono: cleanPhone,
                        nombre: rawName || 'Contacto Silenciado',
                        categoria: currentCategory,
                        notas: `Importado de silenciar.txt (${currentCategory})`
                    }).catch(e => console.error("Error importando línea:", trimmed, e.message));
                }
            }
        }
        console.log("✅ [Silenced Numbers] Sincronización inicial desde silenciar.txt completada exitosamente.");
    } catch (err) {
        console.error("⚠️ Error importando silenciar.txt a la base de datos:", err.message);
    }
}

/**
 * Cambiar estado activo/inactivo por lotes
 */
async function bulkToggleSilencedNumbers({ ids = [], phones = [], activo = true }) {
    try {
        if (ids.length > 0) {
            await pool.query(`
                UPDATE bot_silenced_numbers 
                SET activo = $1, updated_at = (NOW() AT TIME ZONE 'Europe/Madrid')
                WHERE id = ANY($2::int[])
            `, [activo, ids]);
        }
        if (phones.length > 0) {
            for (const p of phones) {
                const clean = p.replace(/\D/g, '');
                if (clean) {
                    await pool.query(`
                        INSERT INTO bot_silenced_numbers (telefono, nombre, categoria, notas, activo, created_at, updated_at)
                        VALUES ($1, $2, 'cliente', '', $3, (NOW() AT TIME ZONE 'Europe/Madrid'), (NOW() AT TIME ZONE 'Europe/Madrid'))
                        ON CONFLICT (telefono) DO UPDATE
                        SET activo = EXCLUDED.activo, updated_at = (NOW() AT TIME ZONE 'Europe/Madrid')
                    `, [clean, `+${clean}`, activo]);
                }
            }
        }
        return { success: true };
    } catch (err) {
        console.error("⚠️ Error en bulkToggleSilencedNumbers:", err.message);
        throw err;
    }
}

/**
 * Eliminar contactos por lotes
 */
async function bulkDeleteSilencedNumbers({ ids = [], phones = [] }) {
    try {
        if (ids.length > 0) {
            await pool.query(`DELETE FROM bot_silenced_numbers WHERE id = ANY($1::int[])`, [ids]);
        }
        if (phones.length > 0) {
            const cleanPhones = phones.map(p => p.replace(/\D/g, '')).filter(Boolean);
            if (cleanPhones.length > 0) {
                await pool.query(`DELETE FROM bot_silenced_numbers WHERE telefono = ANY($1::varchar[])`, [cleanPhones]);
            }
        }
        return { success: true };
    } catch (err) {
        console.error("⚠️ Error en bulkDeleteSilencedNumbers:", err.message);
        throw err;
    }
}

/**
 * Actualizar categoría por lotes
 */
async function bulkUpdateCategory({ ids = [], phones = [], categoria = 'cliente' }) {
    try {
        if (ids.length > 0) {
            await pool.query(`
                UPDATE bot_silenced_numbers 
                SET categoria = $1, updated_at = (NOW() AT TIME ZONE 'Europe/Madrid')
                WHERE id = ANY($2::int[])
            `, [categoria, ids]);
        }
        if (phones.length > 0) {
            for (const p of phones) {
                const clean = p.replace(/\D/g, '');
                if (clean) {
                    await pool.query(`
                        INSERT INTO bot_silenced_numbers (telefono, nombre, categoria, notas, activo, created_at, updated_at)
                        VALUES ($1, $2, $3, '', true, (NOW() AT TIME ZONE 'Europe/Madrid'), (NOW() AT TIME ZONE 'Europe/Madrid'))
                        ON CONFLICT (telefono) DO UPDATE
                        SET categoria = EXCLUDED.categoria, updated_at = (NOW() AT TIME ZONE 'Europe/Madrid')
                    `, [clean, `+${clean}`, categoria]);
                }
            }
        }
        return { success: true };
    } catch (err) {
        console.error("⚠️ Error en bulkUpdateCategory:", err.message);
        throw err;
    }
}

module.exports = {
    getAllSilencedNumbers,
    isPhoneSilenced,
    addOrUpdateSilencedNumber,
    deleteSilencedNumber,
    toggleSilencedNumberActive,
    bulkToggleSilencedNumbers,
    bulkDeleteSilencedNumbers,
    bulkUpdateCategory,
    seedSilencedNumbersFromTxt
};
