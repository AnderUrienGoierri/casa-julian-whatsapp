const fs = require('fs');
const path = require('path');
const { pool, DB_PATH } = require('./connection');

function loadDb() {
    try {
        if (!fs.existsSync(DB_PATH)) {
            const initial = { reservas: [], waitlist: [], tarjetasRegalo: [] };
            fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
            return initial;
        }
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error("Error leyendo db.json:", e.message);
        return { reservas: [], waitlist: [], tarjetasRegalo: [] };
    }
}

function saveDb(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Error guardando db.json:", e.message);
    }
}

function isDraftMode(isDraftParam) {
    if (typeof isDraftParam === 'boolean') return isDraftParam;
    if (typeof isDraftParam === 'string') {
        return isDraftParam.startsWith('sim_') || isDraftParam === 'test_admin';
    }
    return false;
}

function getDefaultMenuItems() {
    return [
        { id: 1, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Jamón Ibérico', price: 32, currency: '€', sort_order: 1 },
        { id: 2, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Cecina', price: 36, currency: '€', sort_order: 2 },
        { id: 3, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Charcutería', price: 34, currency: '€', sort_order: 3 },
        { id: 4, category: 'ENTRANTES Y CHARCUTERÍA', name: 'Txuleta Tartar', price: 32, currency: '€', sort_order: 4 },
        { id: 5, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Puerro', price: 18, currency: '€', sort_order: 5 },
        { id: 6, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Espárrago', price: 18, currency: '€', sort_order: 6 },
        { id: 7, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Pimientos del Piquillo', price: 18, currency: '€', sort_order: 7 },
        { id: 8, category: 'VERDURAS Y ENTRANTES CALIENTES', name: 'Ensalada', price: 4, currency: '€', sort_order: 8 },
        { id: 9, category: 'NUESTRA ESPECIALIDAD', name: 'Txuleta', price: 100, currency: '€ / kg', sort_order: 9 },
        { id: 10, category: 'POSTRES', name: 'Flan', price: 9, currency: '€', sort_order: 10 },
        { id: 11, category: 'POSTRES', name: 'Tarta de Queso', price: 10, currency: '€', sort_order: 11 },
        { id: 12, category: 'POSTRES', name: 'Fresa', price: 8, currency: '€', sort_order: 12 }
    ];
}

function ensureDraftAndPublished(db) {
    let changed = false;

    if (!db.publishedDynamicTexts) {
        db.publishedDynamicTexts = db.dynamicTexts ? JSON.parse(JSON.stringify(db.dynamicTexts)) : {};
        changed = true;
    }
    if (!db.draftDynamicTexts) {
        db.draftDynamicTexts = db.dynamicTexts ? JSON.parse(JSON.stringify(db.dynamicTexts)) : JSON.parse(JSON.stringify(db.publishedDynamicTexts));
        changed = true;
    }
    if (!db.publishedMenuItems || !Array.isArray(db.publishedMenuItems) || db.publishedMenuItems.length === 0) {
        db.publishedMenuItems = (db.menuItems && Array.isArray(db.menuItems) && db.menuItems.length > 0) ? JSON.parse(JSON.stringify(db.menuItems)) : getDefaultMenuItems();
        changed = true;
    }
    if (!db.draftMenuItems || !Array.isArray(db.draftMenuItems) || db.draftMenuItems.length === 0) {
        db.draftMenuItems = JSON.parse(JSON.stringify(db.publishedMenuItems));
        changed = true;
    }
    if (!db.publishedDisabledKeys) {
        db.publishedDisabledKeys = db.disabledKeys ? JSON.parse(JSON.stringify(db.disabledKeys)) : { welcomeImageUrl: true, welcomeStickerUrl: true };
        changed = true;
    }
    if (db.publishedDisabledKeys.welcomeImageUrl === undefined) {
        db.publishedDisabledKeys.welcomeImageUrl = true;
        changed = true;
    }
    if (db.publishedDisabledKeys.welcomeStickerUrl === undefined) {
        db.publishedDisabledKeys.welcomeStickerUrl = true;
        changed = true;
    }
    if (!db.draftDisabledKeys) {
        db.draftDisabledKeys = db.disabledKeys ? JSON.parse(JSON.stringify(db.disabledKeys)) : JSON.parse(JSON.stringify(db.publishedDisabledKeys));
        changed = true;
    }
    if (db.draftDisabledKeys.welcomeImageUrl === undefined) {
        db.draftDisabledKeys.welcomeImageUrl = true;
        changed = true;
    }
    if (db.draftDisabledKeys.welcomeStickerUrl === undefined) {
        db.draftDisabledKeys.welcomeStickerUrl = true;
        changed = true;
    }
    if (!db.publishedCustomRules) {
        db.publishedCustomRules = db.customRules ? JSON.parse(JSON.stringify(db.customRules)) : [];
        changed = true;
    }
    if (!db.draftCustomRules) {
        db.draftCustomRules = db.customRules ? JSON.parse(JSON.stringify(db.customRules)) : JSON.parse(JSON.stringify(db.publishedCustomRules));
        changed = true;
    }
    if (!db.publishedAttachments) {
        db.publishedAttachments = db.attachments ? JSON.parse(JSON.stringify(db.attachments)) : {};
        changed = true;
    }
    if (!db.draftAttachments) {
        db.draftAttachments = db.attachments ? JSON.parse(JSON.stringify(db.attachments)) : JSON.parse(JSON.stringify(db.publishedAttachments));
        changed = true;
    }

    if (changed) {
        saveDb(db);
    }
    return db;
}

function getDynamicTexts(isDraftParam = false) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    return isDraftMode(isDraftParam) ? (db.draftDynamicTexts || {}) : (db.publishedDynamicTexts || {});
}

async function saveDynamicText(lang, key_name, text_value, category = 'general') {
    const db = loadDb();
    ensureDraftAndPublished(db);
    if (!db.draftDynamicTexts) db.draftDynamicTexts = {};
    if (!db.draftDynamicTexts[lang]) db.draftDynamicTexts[lang] = {};
    db.draftDynamicTexts[lang][key_name] = text_value;
    saveDb(db);
    return true;
}

function getMenuItems(isDraftParam = false) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    const items = isDraftMode(isDraftParam) ? (db.draftMenuItems || []) : (db.publishedMenuItems || []);
    if (!items || items.length === 0) return getDefaultMenuItems();
    return items;
}

async function saveMenuItems(items) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    db.draftMenuItems = items;
    saveDb(db);
    return db.draftMenuItems;
}

function getDisabledKeys(isDraftParam = false) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    return isDraftMode(isDraftParam) ? (db.draftDisabledKeys || {}) : (db.publishedDisabledKeys || {});
}

async function toggleDisabledKey(key_name, is_disabled) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    if (!db.draftDisabledKeys) db.draftDisabledKeys = {};
    db.draftDisabledKeys[key_name] = !!is_disabled;
    saveDb(db);
    return db.draftDisabledKeys;
}

async function deleteCustomTextKey(lang, key_name) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    if (db.draftDynamicTexts && db.draftDynamicTexts[lang]) {
        delete db.draftDynamicTexts[lang][key_name];
        saveDb(db);
    }
    return true;
}

function getCustomRules(isDraftParam = false) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    return isDraftMode(isDraftParam) ? (db.draftCustomRules || []) : (db.publishedCustomRules || []);
}

async function saveCustomRule(rule) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    if (!db.draftCustomRules) db.draftCustomRules = [];
    const ruleId = rule.id || ('rule_' + Date.now());
    const newRule = {
        id: ruleId,
        keyword: (rule.keyword || '').trim().toLowerCase(),
        responseText: rule.responseText || '',
        category: rule.category || 'general',
        isActive: rule.isActive !== undefined ? !!rule.isActive : true
    };

    const existingIdx = db.draftCustomRules.findIndex(r => r.id === ruleId || r.keyword === newRule.keyword);
    if (existingIdx >= 0) {
        db.draftCustomRules[existingIdx] = newRule;
    } else {
        db.draftCustomRules.push(newRule);
    }
    saveDb(db);
    return newRule;
}

async function deleteCustomRule(ruleId) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    if (db.draftCustomRules) {
        db.draftCustomRules = db.draftCustomRules.filter(r => r.id !== ruleId && r.keyword !== ruleId);
        saveDb(db);
    }
    return true;
}

function getDraftChanges() {
    const db = loadDb();
    return db.draftChanges || [];
}

async function addDraftChange(changeObj) {
    const db = loadDb();
    if (!db.draftChanges) db.draftChanges = [];
    
    const draftId = 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const newChange = {
        id: draftId,
        changeType: changeObj.changeType || 'Edición de Texto',
        sequenceLocation: changeObj.sequenceLocation || 'General',
        details: changeObj.details || 'Cambio sin descripción',
        payload: changeObj.payload || {},
        createdAt: new Date().toISOString()
    };

    db.draftChanges.unshift(newChange);
    saveDb(db);

    if (pool) {
        try {
            await pool.query(
                `INSERT INTO bot_draft_changes (id, change_type, sequence_location, details, payload, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [newChange.id, newChange.changeType, newChange.sequenceLocation, newChange.details, JSON.stringify(newChange.payload), newChange.createdAt]
            );
        } catch (err) {
            console.error("❌ Error PostgreSQL addDraftChange:", err.message);
        }
    }
    return newChange;
}

function rebuildDraftFromPublished(db) {
    db.draftDynamicTexts = JSON.parse(JSON.stringify(db.publishedDynamicTexts || {}));
    db.draftMenuItems = JSON.parse(JSON.stringify(db.publishedMenuItems || []));
    db.draftDisabledKeys = JSON.parse(JSON.stringify(db.publishedDisabledKeys || {}));
    db.draftCustomRules = JSON.parse(JSON.stringify(db.publishedCustomRules || []));
    db.draftAttachments = JSON.parse(JSON.stringify(db.publishedAttachments || {}));

    const changes = db.draftChanges || [];
    const sortedChanges = [...changes].reverse();

    sortedChanges.forEach(change => {
        const payload = change.payload || {};
        switch (payload.type) {
            case 'text':
                if (payload.lang && payload.key) {
                    if (!db.draftDynamicTexts[payload.lang]) db.draftDynamicTexts[payload.lang] = {};
                    db.draftDynamicTexts[payload.lang][payload.key] = payload.text;
                }
                break;
            case 'delete':
                if (payload.lang && payload.key && db.draftDynamicTexts[payload.lang]) {
                    delete db.draftDynamicTexts[payload.lang][payload.key];
                }
                break;
            case 'toggle':
                if (payload.key) {
                    if (!db.draftDisabledKeys) db.draftDisabledKeys = {};
                    db.draftDisabledKeys[payload.key] = !!payload.isDisabled;
                }
                break;
            case 'menu':
                if (Array.isArray(payload.items)) {
                    db.draftMenuItems = JSON.parse(JSON.stringify(payload.items));
                }
                break;
            case 'rule':
                if (payload.rule || payload.keyword) {
                    const r = payload.rule || {
                        id: payload.id || ('rule_' + Date.now()),
                        keyword: payload.keyword,
                        responseText: payload.responseText || '',
                        category: payload.category || 'general',
                        isActive: payload.isActive !== undefined ? !!payload.isActive : true
                    };
                    if (!db.draftCustomRules) db.draftCustomRules = [];
                    const idx = db.draftCustomRules.findIndex(item => item.id === r.id || item.keyword === r.keyword);
                    if (idx >= 0) db.draftCustomRules[idx] = r;
                    else db.draftCustomRules.push(r);
                }
                break;
            case 'delete_rule':
                if (payload.id && db.draftCustomRules) {
                    db.draftCustomRules = db.draftCustomRules.filter(r => r.id !== payload.id && r.keyword !== payload.id);
                }
                break;
            case 'attachment':
                if (payload.attachment || payload.key_name) {
                    const key = payload.key_name || (payload.attachment && payload.attachment.key_name);
                    if (key) {
                        if (!db.draftAttachments) db.draftAttachments = {};
                        db.draftAttachments[key] = payload.attachment || {
                            key_name: key,
                            mediaType: payload.media_type || 'image',
                            mediaUrl: payload.media_url,
                            caption: payload.caption || '',
                            filename: payload.filename || ''
                        };
                    }
                }
                break;
            case 'delete_attachment':
                if (payload.key_name && db.draftAttachments) {
                    delete db.draftAttachments[payload.key_name];
                }
                break;
        }
    });
}

async function discardDraftChange(draftId) {
    const db = loadDb();
    ensureDraftAndPublished(db);

    if (db.draftChanges) {
        db.draftChanges = db.draftChanges.filter(d => d.id !== draftId);
    }
    rebuildDraftFromPublished(db);
    saveDb(db);

    if (pool) {
        try {
            await pool.query('DELETE FROM bot_draft_changes WHERE id = $1', [draftId]);
        } catch (err) {
            console.error("❌ Error PostgreSQL discardDraftChange:", err.message);
        }
    }
    return true;
}

async function clearAllDraftChanges() {
    const db = loadDb();
    ensureDraftAndPublished(db);

    db.draftDynamicTexts = JSON.parse(JSON.stringify(db.publishedDynamicTexts || {}));
    db.draftMenuItems = JSON.parse(JSON.stringify(db.publishedMenuItems || []));
    db.draftDisabledKeys = JSON.parse(JSON.stringify(db.publishedDisabledKeys || {}));
    db.draftCustomRules = JSON.parse(JSON.stringify(db.publishedCustomRules || []));
    db.draftAttachments = JSON.parse(JSON.stringify(db.publishedAttachments || {}));
    db.draftChanges = [];
    saveDb(db);

    if (pool) {
        try {
            await pool.query('DELETE FROM bot_draft_changes');
        } catch (err) {
            console.error("❌ Error PostgreSQL clearAllDraftChanges:", err.message);
        }
    }
    return true;
}

async function publishAllDraftChanges() {
    const db = loadDb();
    ensureDraftAndPublished(db);

    db.publishedDynamicTexts = JSON.parse(JSON.stringify(db.draftDynamicTexts || {}));
    db.publishedMenuItems = JSON.parse(JSON.stringify(db.draftMenuItems || []));
    db.publishedDisabledKeys = JSON.parse(JSON.stringify(db.draftDisabledKeys || {}));
    db.publishedCustomRules = JSON.parse(JSON.stringify(db.draftCustomRules || []));
    db.publishedAttachments = JSON.parse(JSON.stringify(db.draftAttachments || {}));

    db.dynamicTexts = db.publishedDynamicTexts;
    db.menuItems = db.publishedMenuItems;
    db.disabledKeys = db.publishedDisabledKeys;
    db.customRules = db.publishedCustomRules;
    db.attachments = db.publishedAttachments;

    db.draftChanges = [];
    const nowIso = new Date().toISOString();
    db.lastPublishTimestamp = nowIso;
    saveDb(db);

    if (pool) {
        try {
            await pool.query('DELETE FROM bot_texts');
            for (const lang of Object.keys(db.publishedDynamicTexts)) {
                for (const key of Object.keys(db.publishedDynamicTexts[lang])) {
                    await pool.query(
                        `INSERT INTO bot_texts (lang, key_name, text_value, category, updated_at)
                         VALUES ($1, $2, $3, 'general', CURRENT_TIMESTAMP)`,
                        [lang, key, db.publishedDynamicTexts[lang][key]]
                    );
                }
            }

            await pool.query('DELETE FROM menu_items');
            for (const item of db.publishedMenuItems) {
                await pool.query(
                    `INSERT INTO menu_items (id, category, name, price, currency, sort_order)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [item.id || null, item.category, item.name, item.price, item.currency || '€', item.sort_order || 0]
                );
            }

            await pool.query('DELETE FROM bot_disabled_keys');
            for (const key of Object.keys(db.publishedDisabledKeys)) {
                if (db.publishedDisabledKeys[key]) {
                    await pool.query(
                        `INSERT INTO bot_disabled_keys (key_name, is_disabled) VALUES ($1, $2)`,
                        [key, true]
                    );
                }
            }

            await pool.query('DELETE FROM bot_custom_rules');
            for (const rule of db.publishedCustomRules) {
                await pool.query(
                    `INSERT INTO bot_custom_rules (id, keyword, response_text, category, is_active)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [rule.id, rule.keyword, rule.responseText, rule.category || 'general', rule.isActive]
                );
            }

            await pool.query('DELETE FROM bot_attachments');
            for (const key of Object.keys(db.publishedAttachments)) {
                const att = db.publishedAttachments[key];
                if (att && att.mediaUrl) {
                    await pool.query(
                        `INSERT INTO bot_attachments (key_name, media_type, media_url, caption, filename, updated_at)
                         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
                        [att.key_name || key, att.mediaType || 'image', att.mediaUrl, att.caption || '', att.filename || '']
                    );
                }
            }

            await pool.query('DELETE FROM bot_draft_changes');
        } catch (err) {
            console.error("❌ Error PostgreSQL publishAllDraftChanges:", err.message);
        }
    }

    return { success: true, timestamp: nowIso };
}

function getLastPublishTimestamp() {
    const db = loadDb();
    return db.lastPublishTimestamp || null;
}

function getAttachments(isDraftParam = false) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    return isDraftMode(isDraftParam) ? (db.draftAttachments || {}) : (db.publishedAttachments || {});
}

function getAttachment(key_name, isDraftParam = false) {
    const attachments = getAttachments(isDraftParam);
    return attachments[key_name] || null;
}

async function saveAttachment(attachmentObj) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    if (!db.draftAttachments) db.draftAttachments = {};
    const { key_name, media_type, media_url, caption, filename } = attachmentObj;

    const attachment = {
        key_name,
        mediaType: media_type || 'image',
        mediaUrl: media_url,
        caption: caption || '',
        filename: filename || '',
        updatedAt: new Date().toISOString()
    };

    db.draftAttachments[key_name] = attachment;
    saveDb(db);
    return attachment;
}

async function deleteAttachment(key_name) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    if (db.draftAttachments && db.draftAttachments[key_name]) {
        delete db.draftAttachments[key_name];
        saveDb(db);
    }
    return true;
}

async function getSystemSettings() {
    const db = loadDb();
    ensureDraftAndPublished(db);
    if (!db.systemSettings) {
        db.systemSettings = {
            botActive: true,
            maintenanceMessage: 'El servicio de WhatsApp se encuentra en mantenimiento en este momento. Le atenderemos en breve.',
            updatedAt: new Date().toISOString()
        };
        saveDb(db);
    }
    return db.systemSettings;
}

async function updateSystemSetting(key, value) {
    const db = loadDb();
    ensureDraftAndPublished(db);
    if (!db.systemSettings) {
        db.systemSettings = {
            botActive: true,
            maintenanceMessage: 'El servicio de WhatsApp se encuentra en mantenimiento en este momento. Le atenderemos en breve.',
            updatedAt: new Date().toISOString()
        };
    }
    db.systemSettings[key] = value;
    db.systemSettings.updatedAt = new Date().toISOString();
    saveDb(db);

    if (pool) {
        try {
            await pool.query(
                `INSERT INTO bot_system_settings (key_name, value, updated_at)
                 VALUES ($1, $2, CURRENT_TIMESTAMP)
                 ON CONFLICT (key_name) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
                [key, typeof value === 'string' ? value : JSON.stringify(value)]
            );
        } catch (err) {
            console.error("❌ Error PostgreSQL updateSystemSetting:", err.message);
        }
    }
    return db.systemSettings;
}

module.exports = {
    getDynamicTexts,
    saveDynamicText,
    getMenuItems,
    saveMenuItems,
    getDisabledKeys,
    toggleDisabledKey,
    deleteCustomTextKey,
    getCustomRules,
    saveCustomRule,
    deleteCustomRule,
    getDraftChanges,
    addDraftChange,
    discardDraftChange,
    clearAllDraftChanges,
    publishAllDraftChanges,
    getLastPublishTimestamp,
    getAttachments,
    getAttachment,
    saveAttachment,
    deleteAttachment,
    getSystemSettings,
    updateSystemSetting
};
