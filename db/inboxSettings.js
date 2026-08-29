/**
 * db/inboxSettings.js
 * Módulo de Persistencia Compartida en Servidor y PostgreSQL para:
 * - Etiquetas personalizadas (creadas/editadas/eliminadas)
 * - Orden personalizado de etiquetas (Drag & Drop)
 * - Chats fijados con chincheta (📌)
 * - Estados de lectura manual (Leído / Pendiente)
 * - Etiquetas asignadas a cada conversación de chat
 */

const { pool, getSpainIsoTimestamp } = require('./connection');
const fs = require('fs');
const path = require('path');

const DB_JSON_PATH = path.join(__dirname, '..', 'db.json');

function loadLocalDb() {
    try {
        if (fs.existsSync(DB_JSON_PATH)) {
            const raw = fs.readFileSync(DB_JSON_PATH, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error("⚠️ Error leyendo db.json:", e.message);
    }
    return {};
}

function saveLocalDb(db) {
    try {
        fs.writeFileSync(DB_JSON_PATH, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error("⚠️ Error escribiendo db.json:", e.message);
    }
}

// Configuración por defecto si no existe en BD
const DEFAULT_INBOX_SETTINGS = {
    customTags: [],
    tagsOrder: [
        'menu_tradicion',
        'modificacion',
        'cancelacion',
        'faq',
        'otras_cuestiones',
        'proveedor',
        'hoteles',
        'empleado',
        'taxi',
        'grupo',
        'cliente',
        'otro'
    ],
    deletedTags: [],
    chatTags: {},
    pinnedChats: {
        "group_taxi_casa_julian": true, // 🚕 Grupo Taxi Casa Julián
        "34645747754": true, // Xabi Gorrotxategi
        "34623476521": true, // Ricardo Entretiempo Studio
        "41795958760": true  // +41 79 595 87 60
    },
    chatAvatars: {
        "group_taxi_casa_julian": "/admin/taxi_img.png",
        "34664037707": "/admin/ander_img.png"
    },
    manualChatStatus: {}
};

/**
 * Obtener todos los ajustes compartidos del buzón y contactos
 */
async function getInboxSettings() {
    let settings = { ...DEFAULT_INBOX_SETTINGS };

    // 1. Intentar cargar desde PostgreSQL
    if (pool) {
        try {
            const res = await pool.query(
                `SELECT key_name, value FROM bot_system_settings WHERE key_name = 'inbox_shared_settings' LIMIT 1`
            );
            if (res.rows.length > 0 && res.rows[0].value) {
                const val = typeof res.rows[0].value === 'string' ? JSON.parse(res.rows[0].value) : res.rows[0].value;
                settings = { ...settings, ...val };
                return settings;
            }
        } catch (err) {
            console.error("⚠️ Error cargando inbox_shared_settings de PostgreSQL:", err.message);
        }
    }

    // 2. Respaldo en db.json
    const db = loadLocalDb();
    if (db.inboxSharedSettings) {
        settings = { ...settings, ...db.inboxSharedSettings };
    }

    return settings;
}

/**
 * Guardar ajustes compartidos del buzón de forma atómica en PostgreSQL y db.json
 */
async function saveInboxSettings(patch) {
    const current = await getInboxSettings();
    const updated = {
        ...current,
        ...patch,
        updatedAt: getSpainIsoTimestamp()
    };

    // 1. Guardar en PostgreSQL
    if (pool) {
        try {
            await pool.query(
                `INSERT INTO bot_system_settings (key_name, value, updated_at)
                 VALUES ('inbox_shared_settings', $1, (NOW() AT TIME ZONE 'Europe/Madrid'))
                 ON CONFLICT (key_name) DO UPDATE SET value = EXCLUDED.value, updated_at = (NOW() AT TIME ZONE 'Europe/Madrid')`,
                [JSON.stringify(updated)]
            );
        } catch (err) {
            console.error("❌ Error guardando inbox_shared_settings en PostgreSQL:", err.message);
        }
    }

    // 2. Guardar en db.json
    const db = loadLocalDb();
    db.inboxSharedSettings = updated;
    saveLocalDb(db);

    return updated;
}

/**
 * Fijar / Desfijar Chat con Chincheta 📌
 */
async function setChatPin(phone, isPinned) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) return false;
    const settings = await getInboxSettings();
    const pinnedChats = { ...(settings.pinnedChats || {}) };

    if (isPinned) {
        pinnedChats[cleanPhone] = true;
    } else {
        delete pinnedChats[cleanPhone];
    }

    await saveInboxSettings({ pinnedChats });
    return !!pinnedChats[cleanPhone];
}

/**
 * Marcar conversación como Leída o Pendiente
 */
async function setChatStatus(phone, status) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) return null;
    const settings = await getInboxSettings();
    const manualChatStatus = { ...(settings.manualChatStatus || {}) };

    manualChatStatus[cleanPhone] = status === 'leido' ? 'leido' : 'pendiente';
    await saveInboxSettings({ manualChatStatus });
    return manualChatStatus[cleanPhone];
}

/**
 * Asignar etiquetas a un chat específico
 */
async function setChatTags(phone, tagsArray) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) return [];
    const settings = await getInboxSettings();
    const chatTags = { ...(settings.chatTags || {}) };

    chatTags[cleanPhone] = Array.isArray(tagsArray) ? tagsArray : [];
    await saveInboxSettings({ chatTags });
    return chatTags[cleanPhone];
}

/**
 * Guardar el orden personalizado de etiquetas
 */
async function setTagsOrder(orderArray) {
    if (!Array.isArray(orderArray)) return [];
    await saveInboxSettings({ tagsOrder: orderArray });
    return orderArray;
}

/**
 * Guardar o actualizar una etiqueta personalizada
 */
async function saveCustomTag(tagObj) {
    if (!tagObj || !tagObj.id) return null;
    const settings = await getInboxSettings();
    const customTags = [...(settings.customTags || [])];
    const deletedTags = (settings.deletedTags || []).filter(d => d !== tagObj.id);

    const idx = customTags.findIndex(t => t.id === tagObj.id);
    if (idx > -1) {
        customTags[idx] = { ...customTags[idx], ...tagObj };
    } else {
        customTags.push(tagObj);
    }

    await saveInboxSettings({ customTags, deletedTags });
    return tagObj;
}

/**
 * Eliminar una etiqueta personalizada o marcar etiqueta del sistema como eliminada
 */
async function deleteCustomTag(tagId) {
    if (!tagId) return false;
    const settings = await getInboxSettings();
    const customTags = (settings.customTags || []).filter(t => t.id !== tagId);
    const deletedTags = [...(settings.deletedTags || [])];

    if (!deletedTags.includes(tagId)) {
        deletedTags.push(tagId);
    }

    await saveInboxSettings({ customTags, deletedTags });
    return true;
}

/**
 * Guardar o eliminar el avatar personalizado de un chat
 */
async function setChatAvatar(phone, avatarUrl) {
    if (!phone) return null;
    const settings = await getInboxSettings();
    const chatAvatars = { ...(settings.chatAvatars || {}) };
    if (!avatarUrl) {
        delete chatAvatars[phone];
    } else {
        chatAvatars[phone] = avatarUrl;
    }
    await saveInboxSettings({ chatAvatars });
    return chatAvatars;
}

module.exports = {
    getInboxSettings,
    saveInboxSettings,
    setChatPin,
    setChatStatus,
    setChatTags,
    setTagsOrder,
    saveCustomTag,
    deleteCustomTag,
    setChatAvatar
};
