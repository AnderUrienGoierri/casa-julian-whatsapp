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

const DEFAULT_TAXI_GROUP = {
    id: "group_taxi_casa_julian",
    nombre: "Taxi Casa Julián",
    categoria: "taxi",
    avatar: "/admin/taxi_img.png",
    etiquetas: ["TAXIS", "GRUPO"],
    participants: [
        { telefono: '34670426540', nombre: 'Taxi Iguaran', avatar: '/admin/avatar_taxi_iguaran.png' },
        { telefono: '34670449858', nombre: 'Taxi Tolosa', avatar: '/admin/avatar_taxi_tolosa.png' },
        { telefono: '34636979092', nombre: 'Taxi Lexus', avatar: '/admin/avatar_taxi_lexus.png' },
        { telefono: '34943671417', nombre: 'Casa Julián Tolosa', avatar: '/admin/casa_julian_logo_CJ.jpeg', isOfficial: true }
    ],
    created_at: "2026-08-20T10:00:00.000Z"
};

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
        "34664037707": true,
        "3466407707": true
    },
    archivedChats: {},
    deletedChats: {},
    chatAvatars: {
        "group_taxi_casa_julian": "/admin/taxi_img.png",
        "34664037707": "/admin/ander_img.png",
        "3466407707": "/admin/ander_img.png"
    },
    manualChatStatus: {},
    customGroups: {
        "group_taxi_casa_julian": DEFAULT_TAXI_GROUP
    }
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
                const rawVal = typeof res.rows[0].value === 'string' ? JSON.parse(res.rows[0].value) : res.rows[0].value;
                const val = (rawVal && rawVal.settings && typeof rawVal.settings === 'object') ? { ...rawVal, ...rawVal.settings } : rawVal;
                settings = {
                    ...DEFAULT_INBOX_SETTINGS,
                    ...val,
                    chatAvatars: { ...DEFAULT_INBOX_SETTINGS.chatAvatars, ...((val && val.chatAvatars) || {}) },
                    archivedChats: { ...DEFAULT_INBOX_SETTINGS.archivedChats, ...((val && val.archivedChats) || {}) },
                    deletedChats: { ...DEFAULT_INBOX_SETTINGS.deletedChats, ...((val && val.deletedChats) || {}) },
                    pinnedChats: { ...DEFAULT_INBOX_SETTINGS.pinnedChats, ...((val && val.pinnedChats) || {}) },
                    manualChatStatus: { ...DEFAULT_INBOX_SETTINGS.manualChatStatus, ...((val && val.manualChatStatus) || {}) }
                };
                return settings;
            }
        } catch (err) {
            console.error("⚠️ Error cargando inbox_shared_settings de PostgreSQL:", err.message);
        }
    }

    // 2. Respaldo en db.json
    const db = loadLocalDb();
    if (db.inboxSharedSettings) {
        const rawVal = db.inboxSharedSettings;
        const val = (rawVal && rawVal.settings && typeof rawVal.settings === 'object') ? { ...rawVal, ...rawVal.settings } : rawVal;
        settings = {
            ...DEFAULT_INBOX_SETTINGS,
            ...val,
            chatAvatars: { ...DEFAULT_INBOX_SETTINGS.chatAvatars, ...((val && val.chatAvatars) || {}) },
            archivedChats: { ...DEFAULT_INBOX_SETTINGS.archivedChats, ...((val && val.archivedChats) || {}) },
            deletedChats: { ...DEFAULT_INBOX_SETTINGS.deletedChats, ...((val && val.deletedChats) || {}) },
            pinnedChats: { ...DEFAULT_INBOX_SETTINGS.pinnedChats, ...((val && val.pinnedChats) || {}) },
            manualChatStatus: { ...DEFAULT_INBOX_SETTINGS.manualChatStatus, ...((val && val.manualChatStatus) || {}) }
        };
    }

    return settings;
}

/**
 * Guardar ajustes compartidos del buzón de forma atómica en PostgreSQL y db.json
 */
async function saveInboxSettings(patch) {
    const current = await getInboxSettings();
    const payload = (patch && patch.settings && typeof patch.settings === 'object') ? patch.settings : patch;
    const updated = {
        ...current,
        ...payload,
        updatedAt: getSpainIsoTimestamp()
    };
    if (updated.settings) delete updated.settings;

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
    const cleanPhone = (phone || '').toString().startsWith('group_') ? phone.toString().trim() : (phone || '').replace(/\D/g, '');
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
    const cleanPhone = (phone || '').toString().startsWith('group_') ? phone.toString().trim() : (phone || '').replace(/\D/g, '');
    if (!cleanPhone) return null;
    const settings = await getInboxSettings();
    const manualChatStatus = { ...(settings.manualChatStatus || {}) };
    const nowIso = new Date().toISOString();

    if (typeof status === 'object' && status !== null) {
        manualChatStatus[cleanPhone] = {
            ...status,
            updatedAt: status.updatedAt || nowIso
        };
    } else {
        manualChatStatus[cleanPhone] = status === 'leido' 
            ? { status: 'leido', readAt: nowIso, updatedAt: nowIso } 
            : { status: 'pendiente', readAt: null, updatedAt: nowIso };
    }
    
    await saveInboxSettings({ manualChatStatus });
    return manualChatStatus[cleanPhone];
}

/**
 * Asignar etiquetas a un chat específico
 */
async function setChatTags(phone, tagsArray) {
    const cleanPhone = (phone || '').toString().startsWith('group_') ? phone.toString().trim() : (phone || '').replace(/\D/g, '');
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

/**
 * Guardar o actualizar un grupo de WhatsApp personalizado
 */
async function saveCustomGroup(groupObj) {
    if (!groupObj || !groupObj.id || !groupObj.nombre) return null;
    const settings = await getInboxSettings();
    const customGroups = { ...(settings.customGroups || {}) };

    customGroups[groupObj.id] = {
        id: groupObj.id,
        nombre: groupObj.nombre.trim(),
        categoria: groupObj.categoria || 'grupo',
        avatar: groupObj.avatar || '',
        etiquetas: Array.isArray(groupObj.etiquetas) ? groupObj.etiquetas : ['GRUPO'],
        participants: Array.isArray(groupObj.participants) ? groupObj.participants : [],
        created_at: groupObj.created_at || new Date().toISOString()
    };

    await saveInboxSettings({ customGroups });
    return customGroups[groupObj.id];
}

/**
 * Eliminar un grupo de WhatsApp personalizado
 */
async function deleteCustomGroup(groupId) {
    if (!groupId || groupId === 'group_taxi_casa_julian') return false;
    const settings = await getInboxSettings();
    const customGroups = { ...(settings.customGroups || {}) };

    if (customGroups[groupId]) {
        delete customGroups[groupId];
        await saveInboxSettings({ customGroups });
        return true;
    }
    return false;
}

module.exports = {
    DEFAULT_TAXI_GROUP,
    getInboxSettings,
    saveInboxSettings,
    setChatPin,
    setChatStatus,
    setChatTags,
    setTagsOrder,
    saveCustomTag,
    deleteCustomTag,
    setChatAvatar,
    saveCustomGroup,
    deleteCustomGroup
};
