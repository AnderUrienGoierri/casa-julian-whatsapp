const express = require('express');
const router = express.Router();
const { getTranslation, translations } = require('./i18n');
const { 
    getDynamicTexts, 
    saveDynamicText, 
    getMenuItems, 
    saveMenuItems,
    getAllSolicitudes,
    updateSolicitudStatus,
    deleteSolicitud,
    getCategoryTagInfo,
    getGiftCard,
    updateGiftCardStatus,
    extractGiftCardCodeFromText,
    getAllGiftCards,
    isCardExpired,
    getSystemSettings,
    updateSystemSetting,
    getUserChatHistory
} = require('./database');
const { pool } = require('./db/connection');
const { getSimMessages, clearSimMessages, sendMessage } = require('./whatsappApi');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'julian2026';
const RECEPCION_PASSWORD = process.env.RECEPCION_PASSWORD || 'recepcion';

const VALID_ADMIN_TOKEN = Buffer.from(`admin_casa_julian_${ADMIN_PASSWORD}`).toString('base64');
const VALID_RECEPCION_TOKEN = Buffer.from(`recepcion_casa_julian_${RECEPCION_PASSWORD}`).toString('base64');
const VALID_TOKEN = VALID_ADMIN_TOKEN;

// Middleware de autenticación
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['x-admin-token'] || req.headers['authorization'] || req.query.token;
    const tokenStr = (authHeader || '').replace('Bearer ', '').trim();
    if (tokenStr === VALID_ADMIN_TOKEN || tokenStr === VALID_RECEPCION_TOKEN || tokenStr === VALID_TOKEN) {
        req.userRole = (tokenStr === VALID_RECEPCION_TOKEN) ? 'recepcion' : 'admin';
        return next();
    }
    return res.status(401).json({ error: 'No autorizado. Token de administración o recepción inválido.' });
}

// 1. Login
router.post('/login', (req, res) => {
    const { password } = req.body || {};
    const inputPass = (password || '').toString().trim();

    if (inputPass === RECEPCION_PASSWORD || inputPass.toLowerCase() === 'recepcion' || inputPass.toLowerCase() === 'recepción') {
        return res.json({ success: true, token: VALID_RECEPCION_TOKEN, role: 'recepcion' });
    }

    if (inputPass === ADMIN_PASSWORD) {
        return res.json({ success: true, token: VALID_ADMIN_TOKEN, role: 'admin' });
    }

    return res.status(401).json({ success: false, error: 'Contraseña de acceso incorrecta.' });
});

// 2. Obtener estructura completa y datos del chatbot
router.get('/structure', requireAdminAuth, (req, res) => {
    try {
        const dynamicTexts = getDynamicTexts(true);
        const menuItems = getMenuItems(true);
        
        // Estructura de flujos del chatbot
        const flowTree = [
            {
                id: 'step_welcome',
                title: '1. Bienvenida y Selección de Idioma',
                type: 'system',
                description: 'Envía el mensaje de bienvenida y solicita seleccionar idioma entre 3 opciones (Español, Euskara, English).',
                messageKey: 'welcomeMessage',
                buttons: ['1. Español', '2. Euskara', '3. English']
            },
            {
                id: 'step_location',
                title: '2. Selección de Ubicación',
                type: 'buttons',
                description: 'Pregunta si desea información de Tolosa (País Vasco) o Madrid.',
                messageKey: 'selectLocationBody',
                buttons: [
                    { id: 'loc_pais_vasco', key: 'locPaisVasco' },
                    { id: 'loc_madrid', key: 'locMadrid' }
                ]
            },
            {
                id: 'step_main_menu',
                title: '3. Menú Principal',
                type: 'interactive_list',
                description: 'Menú interactivo con los servicios principales de Casa Julián.',
                messageKey: 'mainMenuHeader',
                rows: [
                    { id: 'opt_quiero_reservar', titleKey: 'opt1Title', descKey: 'opt1Desc' },
                    { id: 'opt_modificacion', titleKey: 'opt2Title', descKey: 'opt2Desc' },
                    { id: 'opt_cancelacion', titleKey: 'opt3Title', descKey: 'opt3Desc' },
                    { id: 'opt_consulta_abierta', titleKey: 'optConsultaAbiertaTitle', descKey: 'optConsultaAbiertaDesc' },
                    { id: 'opt_otras_cuestiones', titleKey: 'opt5Title', descKey: 'opt5Desc' }
                ]
            },
            {
                id: 'step_reserva',
                title: '4. Solicitud de Reserva',
                type: 'branch',
                description: 'Pregunta si tiene Tarjeta Regalo (Menú Tradición) o envía el enlace oficial de reserva web.',
                messageKey: 'reservaCardPrompt',
                buttons: [
                    { id: 'btn_reserva_con_tarjeta', key: 'reservaCardBtnSi' },
                    { id: 'btn_reserva_sin_tarjeta', key: 'reservaCardBtnNo' }
                ]
            },
            {
                id: 'step_faqs',
                title: '5. Otras Cuestiones (Preguntas Frecuentes)',
                type: 'interactive_list',
                description: 'Desplegable con 10 opciones organizadas (Carta, Horarios, Vacaciones, Cancelación, etc.).',
                messageKey: 'faqTitle',
                rows: [
                    { id: 'faq_1', titleKey: 'faq1Title', descKey: 'faq1Desc' },
                    { id: 'faq_2', titleKey: 'faq2Title', descKey: 'faq2Desc' },
                    { id: 'faq_3', titleKey: 'faq3Title', descKey: 'faq3Desc' },
                    { id: 'faq_4', titleKey: 'faq4Title', descKey: 'faq4Desc' },
                    { id: 'faq_5', titleKey: 'faq5Title', descKey: 'faq5Desc' },
                    { id: 'faq_6', titleKey: 'faq6Title', descKey: 'faq6Desc' },
                    { id: 'faq_7', titleKey: 'faq7Title', descKey: 'faq7Desc' },
                    { id: 'faq_8', titleKey: 'faq8Title', descKey: 'faq8Desc' },
                    { id: 'faq_9', titleKey: 'faq9Title', descKey: 'faq9Desc' },
                    { id: 'faq_10', titleKey: 'faq10Title', descKey: 'faq10Desc' }
                ]
            }
        ];

        // Lista de idiomas disponibles
        const languages = [
            { code: 'es', name: 'Español 🇪🇸' },
            { code: 'eu', name: 'Euskara 🇪🇺' },
            { code: 'en', name: 'English 🇬🇧' }
        ];

        // Categorización explícita de todas las llaves de traducción
        const categoryMap = {
            // 1. Bienvenida y Seleccion de Idioma
            welcomeImageUrl: 'welcome', welcomeStickerUrl: 'welcome', welcomeMessage: 'welcome',
            lang_es: 'welcome', lang_eu: 'welcome', lang_en: 'welcome',

            // 2. Seleccion de Ubicacion del Restaurante (Tolosa / Madrid)
            selectLocationTitle: 'location', selectLocationBody: 'location', locPaisVasco: 'location', locMadrid: 'location', madridMsg: 'location',

            // 3. Cierre y Despedida
            thanksClosingMsg: 'closing',

            // 4. Menu Principal
            mainMenuHeader: 'main', menuButtonText: 'main',
            opt1Title: 'main', opt1Desc: 'main', opt2Title: 'main', opt2Desc: 'main',
            opt3Title: 'main', opt3Desc: 'main', optConsultaAbiertaTitle: 'main', optConsultaAbiertaDesc: 'main',
            opt5Title: 'main', opt5Desc: 'main',

            // 5. Reservas
            webReservaLinkMsg: 'reserva', reservaCardPrompt: 'reserva', reservaCardBtnSi: 'reserva', reservaCardBtnNo: 'reserva',
            
            // 5b. Modificaciones
            modCancelDataPrompt: 'mod', modReservationNotFoundMsg: 'mod', modReservationVerifyPrompt: 'mod',
            modReservationVerifyWithDetailsPrompt: 'mod', modReservationMismatchMsg: 'mod',
            modOptionsPrompt: 'mod', modOptComensales: 'mod', modOptDia: 'mod', modOptHora: 'mod',
            modComensalesPrompt: 'mod', modComensalesPromptUnknown: 'mod', maxComensalesErrorMsg: 'mod', modDiaPrompt: 'mod',
            modHoraPrompt: 'mod', modSuccessMsg: 'mod',

            // 5c. Cancelaciones
            cancelWaitlistPrompt: 'cancel', cancelWaitlistSuccessMsg: 'cancel', cancelWaitlistNotFoundMsg: 'cancel',
            cancelDataPrompt: 'cancel', cancelReservationNotFoundMsg: 'cancel', cancelReservationVerifyPrompt: 'cancel',
            cancelReservationVerifyWithDetailsPrompt: 'cancel', cancelReservationMismatchMsg: 'cancel', cancelSuccessMsg: 'cancel',

            btnOmitirDni: 'reserva', btnOmitirEmail: 'reserva',
            btnNinos0: 'reserva', btnNinos1: 'reserva', btnNinos2: 'reserva', requestSummaryHeader: 'reserva', confirmPrompt: 'reserva',
            confirmYesBtn: 'reserva', confirmNoBtn: 'reserva', confirmCancelledMsg: 'reserva',

            // 6. Menu Tradicion
            menuTradicionTitle: 'tradicion', menuTradicionOptRegalar: 'tradicion', menuTradicionOptReservar: 'tradicion', menuTradicionOptCaducidad: 'tradicion',
            regalarMenuCaption: 'tradicion', regalarMenuMsg: 'tradicion', menuTradStep1Tarjeta: 'tradicion', menuTradStep2Nombre: 'tradicion',
            menuTradStep2bDni: 'tradicion', menuTradStep2b2Email: 'tradicion', menuTradStep3Tipo: 'tradicion',
            menuTradStep4HoraComida: 'tradicion', menuTradStep4HoraCena: 'tradicion', menuTradStep5Dia1: 'tradicion', menuTradStep5Dia2: 'tradicion',
            menuTradStep5Dia3: 'tradicion', menuTradStep5CenaDia: 'tradicion', menuTradStep6Alergias: 'tradicion',
            menuTradCardVerified: 'tradicion', menuTradCardNotFound: 'tradicion', menuTradicionFormPrompt: 'tradicion', menuTradicionSuccessMsg: 'tradicion',
            menuTradicionCaducidadPrompt: 'tradicion', menuTradicionCaducidadMsg: 'tradicion', menuTradMoreCardsPrompt: 'tradicion',
            btnMtAddMismaMesa: 'tradicion', btnMtOtraMesa: 'tradicion', btnMtContinuar: 'tradicion', menuTradAddSameTablePrompt: 'tradicion',
            menuTradNewTablePrompt: 'tradicion', menuTradMaxTableCardsNotice: 'tradicion',

            // 7. Preguntas Frecuentes
            faqTitle: 'faq',
            faq1Title: 'faq', faq1Desc: 'faq', faq1Msg: 'faq',
            faq2Title: 'faq', faq2Desc: 'faq', faq2Msg: 'faq',
            faq3Title: 'faq', faq3Desc: 'faq', faq3Msg: 'faq',
            faq4Title: 'faq', faq4Desc: 'faq', faq4Msg: 'faq',
            faq5Title: 'faq', faq5Desc: 'faq', faq5Msg: 'faq',
            faq6Title: 'faq', faq6Desc: 'faq', faq6Msg: 'faq',
            faq7Title: 'faq', faq7Desc: 'faq', faq7Msg: 'faq',
            faq8Title: 'faq', faq8Desc: 'faq', faq8Msg: 'faq',
            faq9Title: 'faq', faq9Desc: 'faq', faq9Msg: 'faq',
            faq10Title: 'faq', faq10Desc: 'faq', faq10Msg: 'faq',
            faq11Title: 'faq', faq11Desc: 'faq', faq11Msg: 'faq',
            faq12Title: 'faq', faq12Desc: 'faq', faq12Msg: 'faq'
        };

        // Casos de Uso del Chatbot estructurados secuencialmente
        const useCases = [
            {
                order: 1,
                id: 'cu_1_saludo_idioma',
                title: 'Caso de Uso 1: Saludo de Bienvenida y Selección de Idioma',
                category: 'main',
                botAction: 'Envía foto oficial, sticker animado de Casa Julián, mensaje de bienvenida y lista desplegable con 14 idiomas.',
                keys: [
                    'welcomeImageUrl',
                    'welcomeStickerUrl',
                    'welcomeMessage',
                    'lang_es', 'lang_eu', 'lang_en'
                ]
            },
            {
                order: 2,
                id: 'cu_2_ubicacion',
                title: 'Caso de Uso 2: Selección de Ubicación del Restaurante (Tolosa vs Madrid)',
                category: 'main',
                botAction: 'Muestra 2 botones interactivos para elegir restaurante: Tolosa (Euskadi) o Madrid.',
                expectedCustomerInput: 'El cliente pulsa [ Tolosa (Euskadi) ] para ver servicios de Tolosa o [ Madrid ] para recibir los números de WhatsApp de los asadores de Madrid.',
                keys: ['selectLocationTitle', 'selectLocationBody', 'locPaisVasco', 'locMadrid', 'madridMsg']
            },
            {
                order: 3,
                id: 'cu_3_menu_principal',
                title: 'Caso de Uso 3: Menú Principal de Servicios de Casa Julián',
                category: 'main',
                keys: ['mainMenuHeader', 'menuButtonText', 'opt1Title', 'opt1Desc', 'opt2Title', 'opt2Desc', 'opt3Title', 'opt3Desc', 'optConsultaAbiertaTitle', 'optConsultaAbiertaDesc', 'opt5Title', 'opt5Desc']
            },
            {
                order: 4,
                id: 'cu_4_reserva_waitlist',
                title: 'Caso de Uso 4: Solicitud de Reserva',
                category: 'reserva',
                botAction: 'Pregunta si tiene Tarjeta Regalo (Menú Tradición) o envía directamente la tarjeta interactiva con enlace oficial a la reserva web.',
                expectedCustomerInput: 'El cliente pulsa [ Sí, tengo una ] para reservar con tarjeta regalo o [ No tengo ] para recibir el botón oficial de reserva online / lista de espera en la web.',
                keys: ['reservaCardPrompt', 'reservaCardBtnSi', 'reservaCardBtnNo', 'webReservaLinkMsg']
            },
            {
                order: 5,
                id: 'cu_5_modificacion_cancelacion',
                title: 'Caso de Uso 5: Modificación y Cancelación de Reserva Existente',
                category: 'reserva',
                botAction: 'Solicita Nombre completo y Teléfono para verificar la reserva en la base de datos.',
                expectedCustomerInput: 'El cliente escribe su Nombre y Teléfono (ej. "Ander Urien 612345678"). Para reservas en estado PENDIENTE CONFIRMACION, la cancelación se efectúa INMEDIATAMENTE cambiando a CANCELADA.',
                keys: ['modCancelDataPrompt', 'modReservationVerifyPrompt', 'modComensalesPrompt', 'modDiaPrompt', 'modHoraPrompt', 'modSuccessMsg', 'cancelDataPrompt', 'cancelReservationVerifyPrompt', 'cancelSuccessMsg']
            },
            {
                order: 6,
                id: 'cu_6_menu_tradicion',
                title: 'Caso de Uso 6: Tarjeta Regalo - Menú Tradición (Compra, Reserva o Caducidad)',
                category: 'tradicion',
                botAction: 'Muestra opciones: Regalar Menú (enlace de compra web), Reservar con Tarjeta o Consultar Caducidad.',
                expectedCustomerInput: 'Pulsar [ 🎁 Regalar Menú ], [ 📅 Reservar ] o [ ⏳ Fecha caducidad ]. El cliente introduce el código de tarjeta regalo (ej. MT-2026-001).',
                keys: ['menuTradicionTitle', 'menuTradicionOptRegalar', 'menuTradicionOptReservar', 'menuTradicionOptCaducidad', 'regalarMenuMsg', 'menuTradStep1Tarjeta', 'menuTradCardVerified', 'menuTraditionCaducidadPrompt']
            },
            {
                order: 7,
                id: 'cu_7_faqs',
                title: 'Caso de Uso 7: Otras Cuestiones (Consultas Frecuentes 1 a 10)',
                category: 'faq',
                botAction: 'Muestra la lista desplegable con las 10 consultas más frecuentes (Carta, Horarios, Vacaciones, Cancelación, Veganos, Mascotas, etc.).',
                expectedCustomerInput: 'El cliente selecciona una opción de la lista (ej. "1. Ver carta", "2. Horario atención", "6. Reducción comensales"). Para opción 6 el bot ofrece el botón directo [ Modificar reserva ].',
                keys: ['faqTitle', 'faq1Title', 'faq1Msg', 'faq2Title', 'faq2Msg', 'faq3Title', 'faq3Msg', 'faq4Title', 'faq4Msg', 'faq5Title', 'faq5Msg', 'faq6Title', 'faq6Msg', 'faq7Title', 'faq7Msg', 'faq8Title', 'faq8Msg', 'faq9Title', 'faq9Msg', 'faq10Title', 'faq10Msg']
            },
            {
                order: 8,
                id: 'cu_8_cierre_despedida',
                title: 'Caso de Uso 8: Cierre de Conversación, Confirmaciones y Despedida Final',
                category: 'main',
                botAction: 'Envía el mensaje de agradecimiento, dirección, teléfono de atención y enlace a la web oficial.',
                expectedCustomerInput: 'Mensaje final o despedida enviada por el chatbot tras completar una solicitud o consulta.',
                keys: ['thanksClosingMsg', 'requestSummaryHeader', 'confirmPrompt', 'confirmYesBtn', 'confirmNoBtn', 'confirmCancelledMsg']
            }
        ];

        const { getDisabledKeys, getCustomRules, getDraftChanges, getLastPublishTimestamp, getAttachments } = require('./database');
        const disabledKeys = getDisabledKeys(true);
        const customRules = getCustomRules(true);
        const draftChanges = getDraftChanges();
        const lastPublishTimestamp = getLastPublishTimestamp();
        const attachments = getAttachments(true);

        return res.json({
            success: true,
            flowTree,
            useCases,
            categoryMap,
            languages,
            staticTranslations: translations,
            dynamicTexts,
            menuItems,
            disabledKeys,
            customRules,
            draftChanges,
            lastPublishTimestamp,
            attachments
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 3. Actualizar texto de un idioma
router.post('/update-text', requireAdminAuth, async (req, res) => {
    const { lang, key, text, category } = req.body || {};
    if (!lang || !key || text === undefined) {
        return res.status(400).json({ error: 'Parámetros lang, key y text requeridos.' });
    }
    try {
        const { saveDynamicText, addDraftChange } = require('./database');
        await saveDynamicText(lang, key, text, category || 'general');

        await addDraftChange({
            changeType: 'Edición de Texto',
            sequenceLocation: `Clave: ${key} [${lang.toUpperCase()}]`,
            details: `Modificado texto de la clave "${key}" (${text.length} caracteres).`,
            payload: { type: 'text', lang, key, text }
        });

        return res.json({ success: true, lang, key, text });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 4. Actualizar carta y precios
router.post('/update-menu', requireAdminAuth, async (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'El parámetro items debe ser una lista de platos.' });
    }
    try {
        const { saveMenuItems, saveDynamicText, addDraftChange } = require('./database');
        await saveMenuItems(items);

        // Regenerar automáticamente el texto de la carta en faq12Msg (Ver carta) para español
        let cartaTxt = "📜 *CARTA - ASADOR CASA JULIÁN (TOLOSA)*\n\n";
        const categories = [...new Set(items.map(i => i.category))];
        
        categories.forEach(cat => {
            cartaTxt += `🥩 *${cat.toUpperCase()}:*\n`;
            items.filter(i => i.category === cat).forEach(item => {
                cartaTxt += `• ${item.name} — ${item.price} ${item.currency}\n`;
            });
            cartaTxt += "\n";
        });

        await saveDynamicText('es', 'faq12Msg', cartaTxt.trim(), 'carta');

        await addDraftChange({
            changeType: 'Carta & Precios',
            sequenceLocation: 'Paso 5 / Carta',
            details: `Modificados precios y platos de la carta (${items.length} platos en total).`,
            payload: { type: 'menu', count: items.length }
        });

        return res.json({ success: true, items, generatedCartaText: cartaTxt });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 5. Endpoint de Simulación Interactiva en Vivo
router.post('/simulate', requireAdminAuth, async (req, res) => {
    const { action, text, buttonId, listId } = req.body || {};
    const simUserPhone = 'sim_test_admin';

    try {
        if (action === 'reset') {
            clearSimMessages(simUserPhone);
            const { userStates, userLanguages, userLocations, handleUserMessage: processSimMessage } = require('./botLogic');
            if (userStates) userStates.delete(simUserPhone);
            if (userLanguages) userLanguages.delete(simUserPhone);
            if (userLocations) userLocations.delete(simUserPhone);

            await processSimMessage(simUserPhone, 'hola', 'text');
            const messages = getSimMessages(simUserPhone);
            return res.json({ success: true, messages });
        }

        const { handleUserMessage: processSimMessage } = require('./botLogic');
        if (buttonId) {
            await processSimMessage(simUserPhone, buttonId, 'interactive', { type: 'button', id: buttonId });
        } else if (listId) {
            await processSimMessage(simUserPhone, listId, 'interactive', { type: 'list', id: listId });
        } else if (text) {
            await processSimMessage(simUserPhone, text, 'text');
        }

        const messages = getSimMessages(simUserPhone);
        return res.json({ success: true, messages });
    } catch (e) {
        console.error("Error en simulación interactiva:", e);
        return res.status(500).json({ error: e.message });
    }
});

// 6. Activar / Desactivar (Ocultar / Silenciar) clave de texto
router.post('/toggle-key-status', requireAdminAuth, async (req, res) => {
    const { key, isDisabled } = req.body || {};
    if (!key) return res.status(400).json({ error: 'Parámetro key requerido.' });
    try {
        const { toggleDisabledKey, addDraftChange } = require('./database');
        const disabledKeys = await toggleDisabledKey(key, isDisabled);

        await addDraftChange({
            changeType: isDisabled ? 'Silenciar Mensaje' : 'Activar Mensaje',
            sequenceLocation: `Clave: ${key}`,
            details: isDisabled ? `Ocultado/Silenciado mensaje de la clave "${key}".` : `Activado mensaje de la clave "${key}".`,
            payload: { type: 'toggle', key, isDisabled }
        });

        return res.json({ success: true, key, isDisabled, disabledKeys });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 7. Eliminar clave personalizada
router.post('/delete-custom-key', requireAdminAuth, async (req, res) => {
    const { lang, key } = req.body || {};
    if (!lang || !key) return res.status(400).json({ error: 'Parámetros lang y key requeridos.' });
    try {
        const { deleteCustomTextKey, addDraftChange } = require('./database');
        await deleteCustomTextKey(lang, key);

        await addDraftChange({
            changeType: 'Eliminar Clave',
            sequenceLocation: `Clave: ${key} [${lang.toUpperCase()}]`,
            details: `Eliminada clave personalizada "${key}".`,
            payload: { type: 'delete', key }
        });

        return res.json({ success: true, lang, key });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 8. Crear / Actualizar regla dinámica por palabra clave
router.post('/update-custom-rule', requireAdminAuth, async (req, res) => {
    const { id, keyword, responseText, category, isActive } = req.body || {};
    if (!keyword || !responseText) {
        return res.status(400).json({ error: 'Parámetros keyword y responseText requeridos.' });
    }
    try {
        const { saveCustomRule, addDraftChange } = require('./database');
        const rule = await saveCustomRule({ id, keyword, responseText, category, isActive });

        await addDraftChange({
            changeType: 'Regla por Palabra Clave',
            sequenceLocation: `Palabra Clave: "${keyword}"`,
            details: `Configurada respuesta automática para cuando el cliente escriba "${keyword}".`,
            payload: { type: 'rule', keyword }
        });

        return res.json({ success: true, rule });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 9. Eliminar regla dinámica por palabra clave
router.post('/delete-custom-rule', requireAdminAuth, async (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Parámetro id requerido.' });
    try {
        const { deleteCustomRule, addDraftChange } = require('./database');
        await deleteCustomRule(id);

        await addDraftChange({
            changeType: 'Eliminar Regla Palabra Clave',
            sequenceLocation: `ID Regla: ${id}`,
            details: `Eliminada regla por palabra clave ID "${id}".`,
            payload: { type: 'delete_rule', id }
        });

        return res.json({ success: true, id });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 10. Descartar cambios borrador
router.post('/discard-draft', requireAdminAuth, async (req, res) => {
    const { draftId, all } = req.body || {};
    try {
        const { discardDraftChange, clearAllDraftChanges } = require('./database');
        if (all) {
            await clearAllDraftChanges();
        } else if (draftId) {
            await discardDraftChange(draftId);
        }
        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 11. SUBIR A PRODUCCIÓN (Publicar todos los cambios borrador)
router.post('/publish', requireAdminAuth, async (req, res) => {
    try {
        const { publishAllDraftChanges } = require('./database');
        const result = await publishAllDraftChanges();
        return res.json({
            success: true,
            timestamp: result.timestamp,
            message: '¡Cambios subidos a producción correctamente! El chatbot en vivo en WhatsApp reflejará las modificaciones de inmediato.'
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 12. Guardar adjunto multimedia para una clave de mensaje
router.post('/save-attachment', requireAdminAuth, async (req, res) => {
    const { key_name, media_type, media_url, caption, filename } = req.body || {};
    if (!key_name || !media_url) return res.status(400).json({ error: 'key_name y media_url requeridos.' });
    try {
        const { saveAttachment, addDraftChange } = require('./database');
        const attachment = await saveAttachment({ key_name, media_type: media_type || 'image', media_url, caption, filename });

        await addDraftChange({
            changeType: 'Adjunto Multimedia',
            sequenceLocation: `Clave: ${key_name}`,
            details: `Añadido adjunto ${media_type || 'image'} a la clave "${key_name}".`,
            payload: { type: 'attachment', key_name, media_type, media_url }
        });

        return res.json({ success: true, attachment });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 13. Eliminar adjunto multimedia de una clave de mensaje
router.post('/delete-attachment', requireAdminAuth, async (req, res) => {
    const { key_name } = req.body || {};
    if (!key_name) return res.status(400).json({ error: 'key_name requerido.' });
    try {
        const { deleteAttachment, addDraftChange } = require('./database');
        await deleteAttachment(key_name);

        await addDraftChange({
            changeType: 'Eliminar Adjunto',
            sequenceLocation: `Clave: ${key_name}`,
            details: `Eliminado adjunto multimedia de la clave "${key_name}".`,
            payload: { type: 'delete_attachment', key_name }
        });

        return res.json({ success: true });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// =========================================================================
// ENDPOINTS DE BANDEJA DE RECEPCIÓN (SOLICITUDES Y ATENCIÓN DIRECTA)
// =========================================================================

// 14. Obtener todas las solicitudes recibidas de clientes
router.get('/solicitudes', requireAdminAuth, async (req, res) => {
    try {
        const list = await getAllSolicitudes();
        return res.json({ success: true, solicitudes: list });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 15. Responder manualmente a una solicitud enviando WhatsApp directo al cliente (mantiene atención humana)
router.post('/solicitudes/:id/responder', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { respuestaText, nuevoEstado } = req.body || {};
        if (!respuestaText || !respuestaText.trim()) {
            return res.status(400).json({ error: 'El mensaje de respuesta no puede estar vacío.' });
        }

        const list = await getAllSolicitudes();
        const sol = list.find(s => s.id === id);
        if (!sol) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const targetPhone = sol.telefonoCliente || sol.telefonoReserva;
        if (!targetPhone) {
            return res.status(400).json({ error: 'No se encontró un teléfono de cliente válido para enviar el WhatsApp.' });
        }

        // Envío directo de WhatsApp vía WhatsApp Cloud API
        await sendMessage(targetPhone, respuestaText.trim());

        const statusToSet = (nuevoEstado || 'EN_GESTION').trim().toUpperCase();
        // Mantiene enAtencionHumana = true mientras se está chateando
        const updated = await updateSolicitudStatus(id, statusToSet, respuestaText.trim(), true);

        return res.json({
            success: true,
            message: `✅ Mensaje de WhatsApp enviado con éxito al cliente (+${targetPhone}).`,
            solicitud: updated
        });
    } catch (e) {
        console.error("⚠️ Error respondiendo solicitud por WhatsApp:", e.message);
        return res.status(500).json({ error: `Error enviando mensaje de WhatsApp: ${e.message}` });
    }
});

// 16. Concluir gestión y reactivar el bot automático para el cliente
router.post('/solicitudes/:id/concluir', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { estadoFinal, mensajeCierre } = req.body || {};

        const list = await getAllSolicitudes();
        const sol = list.find(s => s.id === id);
        if (!sol) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const targetPhone = sol.telefonoCliente || sol.telefonoReserva;

        // Si se redactó un mensaje final de despedida/confirmación, enviarlo por WhatsApp
        if (mensajeCierre && mensajeCierre.trim() && targetPhone) {
            await sendMessage(targetPhone, mensajeCierre.trim());
        }

        const finalStatus = (estadoFinal || 'CONFIRMADA').trim().toUpperCase();
        
        // Transición de ciclo de vida de Tarjetas Regalo (si aplica)
        const cardCode = extractGiftCardCodeFromText(sol.datosDetallados);
        if (cardCode) {
            if (finalStatus === 'CONFIRMADA' || finalStatus === 'RESUELTA') {
                console.log(`🎁 Solicitud ${id} confirmada: Tarjeta regalo ${cardCode} pasa a 'RESERVADA'.`);
                await updateGiftCardStatus(cardCode, 'RESERVADA');
            } else if (finalStatus === 'CANCELADA' || finalStatus === 'RECHAZADA') {
                const card = await getGiftCard(cardCode);
                if (card && isCardExpired(card.fecha_caducidad)) {
                    console.log(`🎁 Solicitud ${id} cancelada: Tarjeta regalo ${cardCode} está caducada -> 'CADUCADA'.`);
                    await updateGiftCardStatus(cardCode, 'CADUCADA');
                } else {
                    console.log(`🎁 Solicitud ${id} cancelada: Tarjeta regalo ${cardCode} vuelve a 'DISPONIBLE'.`);
                    await updateGiftCardStatus(cardCode, 'DISPONIBLE');
                }
            }
        }

        // Reactiva el bot (enAtencionHumana = false)
        const updated = await updateSolicitudStatus(
            id, 
            finalStatus, 
            mensajeCierre && mensajeCierre.trim() ? mensajeCierre.trim() : null, 
            false
        );

        return res.json({
            success: true,
            message: `✅ Gestión concluida. El bot automático ha sido reactivado para el cliente (+${targetPhone}).`,
            solicitud: updated
        });
    } catch (e) {
        console.error("⚠️ Error concluyendo gestión:", e.message);
        return res.status(500).json({ error: e.message });
    }
});

// 17. Activar o Pausar Modo de Atención Humana manualmente
router.post('/solicitudes/:id/atencion-humana', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { enAtencionHumana } = req.body || {};

        const list = await getAllSolicitudes();
        const sol = list.find(s => s.id === id);
        if (!sol) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const isHuman = enAtencionHumana === true;
        const updated = await updateSolicitudStatus(id, sol.estado, null, isHuman);

        return res.json({
            success: true,
            message: isHuman 
                ? '🟢 Modo Atención Humana activado (Bot pausado para este cliente).' 
                : '⚪ Modo Bot reactivado con éxito (El cliente puede usar el bot).',
            solicitud: updated
        });
    } catch (e) {
        console.error("⚠️ Error cambiando modo de atención humana:", e.message);
        return res.status(500).json({ error: e.message });
    }
});

// 18. Cambiar estado de una solicitud (PENDIENTE, CONFIRMADA, RECHAZADA, CANCELADA, ARCHIVADA)
router.post('/solicitudes/:id/estado', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body || {};
        if (!estado) return res.status(400).json({ error: 'El estado es requerido.' });

        const targetStatus = estado.trim().toUpperCase();
        const list = await getAllSolicitudes();
        const sol = list.find(s => s.id === id);

        // Transición de ciclo de vida de Tarjetas Regalo (si aplica)
        if (sol) {
            const cardCode = extractGiftCardCodeFromText(sol.datosDetallados);
            if (cardCode) {
                if (targetStatus === 'CONFIRMADA' || targetStatus === 'RESUELTA') {
                    console.log(`🎁 Solicitud ${id} estado cambiado a ${targetStatus}: Tarjeta ${cardCode} pasa a 'RESERVADA'.`);
                    await updateGiftCardStatus(cardCode, 'RESERVADA');
                } else if (targetStatus === 'CANCELADA' || targetStatus === 'RECHAZADA') {
                    const card = await getGiftCard(cardCode);
                    if (card && isCardExpired(card.fecha_caducidad)) {
                        await updateGiftCardStatus(cardCode, 'CADUCADA');
                    } else {
                        await updateGiftCardStatus(cardCode, 'DISPONIBLE');
                    }
                }
            }
        }

        const updated = await updateSolicitudStatus(id, targetStatus);
        return res.json({ success: true, solicitud: updated });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 18. Eliminar solicitud de forma permanente (uno a uno)
router.delete('/solicitudes/:id', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await deleteSolicitud(id);
        return res.json({ success: true, message: 'Solicitud eliminada definitivamente.' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 18-bulk. Eliminación masiva de solicitudes seleccionadas
router.post('/solicitudes/bulk-delete', requireAdminAuth, async (req, res) => {
    try {
        const { ids } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Se requiere una lista de IDs para eliminar.' });
        }
        for (const id of ids) {
            await deleteSolicitud(id);
        }
        return res.json({ success: true, deletedCount: ids.length, message: `${ids.length} solicitudes eliminadas definitivamente.` });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 18-bulk-archive. Archivado masivo de solicitudes seleccionadas
router.post('/solicitudes/bulk-archive', requireAdminAuth, async (req, res) => {
    try {
        const { ids } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Se requiere una lista de IDs para archivar.' });
        }
        for (const id of ids) {
            await updateSolicitudStatus(id, 'ARCHIVADA', null, false);
        }
        return res.json({ success: true, count: ids.length, message: `${ids.length} solicitudes archivadas.` });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 18b. Archivar una solicitud (estado ARCHIVADA — gestión concluida, historial)
router.post('/solicitudes/:id/archivar', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await updateSolicitudStatus(id, 'ARCHIVADA', null, false);
        return res.json({ success: true, solicitud: updated });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 18c. Restaurar una solicitud desde Archivo (vuelve a PENDIENTE)
router.post('/solicitudes/:id/restaurar', requireAdminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { estadoDestino } = req.body || {};
        const targetEstado = (estadoDestino || 'PENDIENTE').toUpperCase();
        const updated = await updateSolicitudStatus(id, targetEstado, null, false);
        return res.json({ success: true, solicitud: updated });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 18d. Obtener historial completo de interacción del cliente con el chatbot
router.get('/solicitudes/history/:telefono', requireAdminAuth, async (req, res) => {
    try {
        const { telefono } = req.params;
        const history = await getUserChatHistory(telefono);
        return res.json({ success: true, history });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 18e. Obtener todas las conversaciones de WhatsApp activas agrupadas por teléfono
router.get('/chats', requireAdminAuth, async (req, res) => {
    try {
        const { getAllWhatsAppConversations } = require('./database');
        const chats = await getAllWhatsAppConversations();
        return res.json({ success: true, chats });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 19. Obtener lista completa de tarjetas regalo con estados y fecha de caducidad a 6 meses
router.get('/tarjetas-regalo', requireAdminAuth, async (req, res) => {
    try {
        const cards = await getAllGiftCards();
        return res.json({ success: true, tarjetas: cards });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 20. Obtener ajustes del sistema (Estado del chatbot, notificaciones, etc.)
router.get('/settings', requireAdminAuth, async (req, res) => {
    try {
        const settings = await getSystemSettings();
        return res.json({ success: true, settings });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 21. Actualizar ajustes del sistema (Activar/Desactivar chatbot, mensaje de mantenimiento, etc.)
router.post('/settings', requireAdminAuth, async (req, res) => {
    try {
        const { botActive, maintenanceMessage, sendMaintenanceNotice } = req.body || {};
        
        if (botActive !== undefined) {
            await updateSystemSetting('botActive', !!botActive);
        }
        if (maintenanceMessage !== undefined) {
            await updateSystemSetting('maintenanceMessage', maintenanceMessage);
        }
        if (sendMaintenanceNotice !== undefined) {
            await updateSystemSetting('sendMaintenanceNotice', !!sendMaintenanceNotice);
        }

        const updatedSettings = await getSystemSettings();
        return res.json({ success: true, settings: updatedSettings });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// 22. Obtener diagnóstico general del sistema y APIs configuradas
router.get('/system-status', requireAdminAuth, async (req, res) => {
    try {
        const settings = await getSystemSettings();

        // 1. Estado de Base de Datos PostgreSQL
        let dbConnected = false;
        let dbLatencyMs = null;
        if (pool) {
            try {
                const t0 = Date.now();
                await pool.query('SELECT 1');
                dbLatencyMs = Date.now() - t0;
                dbConnected = true;
            } catch (err) {
                dbConnected = false;
            }
        }

        // 2. Estado de Meta WhatsApp Cloud API
        const metaConfigured = !!(process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID);
        const metaPhoneId = process.env.PHONE_NUMBER_ID ? `...${process.env.PHONE_NUMBER_ID.slice(-4)}` : 'No configurado';

        // 3. Estado de Servicios de Email
        const brevoConfigured = !!process.env.BREVO_API_KEY;
        const resendConfigured = !!process.env.RESEND_API_KEY;
        const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

        // 4. Entorno de Ejecución
        const uptimeSeconds = Math.floor(process.uptime());
        const memoryUsage = process.memoryUsage();

        return res.json({
            success: true,
            status: {
                botActive: settings.botActive !== false,
                environment: process.env.NODE_ENV || 'production',
                nodeVersion: process.version,
                uptime: uptimeSeconds,
                memoryMb: Math.round(memoryUsage.rss / (1024 * 1024)),
                database: {
                    type: 'PostgreSQL (Neon Cloud)',
                    connected: dbConnected,
                    latencyMs: dbLatencyMs,
                    host: process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1]?.split('/')[0] : 'Local'
                },
                apis: {
                    metaWhatsApp: {
                        name: 'Meta WhatsApp Cloud API (v19.0)',
                        configured: metaConfigured,
                        phoneIdSuffix: metaPhoneId,
                        status: metaConfigured ? 'ONLINE' : 'FALTA_CONFIG'
                    },
                    brevo: {
                        name: 'Brevo Email API (Transaccional)',
                        configured: brevoConfigured,
                        status: brevoConfigured ? 'ACTIVO' : 'NO_CONFIGURADO'
                    },
                    resend: {
                        name: 'Resend Email API',
                        configured: resendConfigured,
                        status: resendConfigured ? 'ACTIVO' : 'NO_CONFIGURADO'
                    },
                    smtp: {
                        name: 'Servidor SMTP (Office365 / Fallback)',
                        configured: smtpConfigured,
                        host: process.env.SMTP_HOST || 'smtp.office365.com',
                        status: smtpConfigured ? 'ACTIVO' : 'NO_CONFIGURADO'
                    }
                },
                settings: settings
            }
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Helper de cálculo de caducidad (+6 meses)
function calculateSixMonthsFromDateStr(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim();
    let d = null;
    const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
        d = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
    } else {
        const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (ymdMatch) {
            d = new Date(parseInt(ymdMatch[1], 10), parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10));
        }
    }
    if (!d || isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() + 6);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

// 25. Endpoint Webhook de Sincronización en Tiempo Real desde Google Apps Script (Opción A)
router.post('/sync-giftcards-webhook', async (req, res) => {
    try {
        const { secret, card, action, fullSyncList } = req.body || {};
        const DRIVE_SYNC_SECRET = process.env.DRIVE_SYNC_SECRET || 'casa_julian_drive_sync_2026';
        
        if (secret !== DRIVE_SYNC_SECRET && req.headers['x-sync-secret'] !== DRIVE_SYNC_SECRET) {
            return res.status(403).json({ success: false, error: 'Secreto de sincronización no válido.' });
        }

        const cleanVal = (val) => {
            if (val === null || val === undefined) return null;
            let s = String(val).trim();
            if (s.endsWith('.0') && s.slice(0, -2).match(/^\d+$/)) {
                s = s.slice(0, -2);
            }
            return (s === '' || s === '-' || s.toLowerCase() === 'none') ? null : s;
        };

        function determineCardStatus(usado, fechaCaducidad) {
            if (usado === true) return 'CONSUMIDA';
            if (fechaCaducidad) {
                const clean = fechaCaducidad.trim();
                let d = null;
                const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                if (dmyMatch) {
                    d = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10), 23, 59, 59);
                } else {
                    const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                    if (ymdMatch) {
                        d = new Date(parseInt(ymdMatch[1], 10), parseInt(ymdMatch[2], 10) - 1, parseInt(ymdMatch[3], 10), 23, 59, 59);
                    }
                }
                if (d && !isNaN(d.getTime())) {
                    if (new Date().getTime() > d.getTime()) {
                        return 'CADUCADA';
                    }
                }
            }
            return 'DISPONIBLE';
        }

        if (fullSyncList && Array.isArray(fullSyncList)) {
            console.log(`📥 Recibida lista completa de ${fullSyncList.length} tarjetas desde Google Apps Script...`);
            if (pool) {
                await pool.query('TRUNCATE TABLE tarjetas_regalo;');
                const insertQ = `
                    INSERT INTO tarjetas_regalo (
                        id, codigo, tipo_tarjeta_regalo, nombre_compra, nombre_comensal, telefono_compra,
                        importe, observaciones, creada_en_revo, fecha_compra,
                        entregado, fecha_entrega, pagado, fecha_pago, usado,
                        estado, fecha_caducidad, activo, fecha_ultima_modificacion
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10,
                        $11, $12, $13, $14, $15,
                        $16, $17, $18, (NOW() AT TIME ZONE 'Europe/Madrid')
                    )
                `;
                for (const c of fullSyncList) {
                    const idStr = String(c.id);
                    const codigoClean = cleanVal(c.codigo_tarjeta_regalo || c.codigo);
                    const codigoStr = codigoClean ? codigoClean : (`SINC-${idStr}`);
                    let fCad = cleanVal(c.fecha_caducidad);
                    if (!fCad) {
                        const baseDate = cleanVal(c.fecha_compra) || cleanVal(c.fecha_pago) || cleanVal(c.fecha_entrega);
                        if (baseDate) fCad = calculateSixMonthsFromDateStr(baseDate);
                    }
                    const estado = determineCardStatus(c.usado, fCad);
                    const activo = c.activo !== undefined && c.activo !== null ? Boolean(c.activo) : true;
                    await pool.query(insertQ, [
                        idStr,
                        codigoStr,
                        cleanVal(c.tipo_tarjeta_regalo) || 'PERSONALIZADAS',
                        cleanVal(c.nombre_compra),
                        cleanVal(c.nombre_comensal),
                        cleanVal(c.telefono_compra),
                        c.importe !== null && c.importe !== undefined ? Number(c.importe) : null,
                        cleanVal(c.observaciones),
                        c.creada_en_revo !== undefined ? c.creada_en_revo : null,
                        cleanVal(c.fecha_compra),
                        c.entregado !== undefined ? c.entregado : null,
                        cleanVal(c.fecha_entrega),
                        c.pagado !== undefined ? c.pagado : null,
                        cleanVal(c.fecha_pago),
                        c.usado !== undefined ? c.usado : null,
                        estado,
                        fCad,
                        activo
                    ]);
                }
            }
            return res.json({ success: true, count: fullSyncList.length, message: 'Sincronización completa aplicada.' });
        }

        if (card) {
            const rawCode = cleanVal(card.codigo_tarjeta_regalo || card.codigo);
            const idStr = String(card.id || rawCode || ('TR-' + Date.now()));
            const codigoStr = rawCode ? rawCode : (`SINC-${idStr}`);
            let fCad = cleanVal(card.fecha_caducidad);
            if (!fCad) {
                const baseDate = cleanVal(card.fecha_compra) || cleanVal(card.fecha_pago) || cleanVal(card.fecha_entrega);
                if (baseDate) fCad = calculateSixMonthsFromDateStr(baseDate);
            }
            const estado = determineCardStatus(card.usado, fCad);
            const activo = card.activo !== undefined && card.activo !== null ? Boolean(card.activo) : true;

            if (action === 'delete') {
                if (pool) {
                    await pool.query('DELETE FROM tarjetas_regalo WHERE id = $1 OR codigo = $2', [idStr, codigoStr]);
                }
                return res.json({ success: true, action: 'deleted', id: idStr });
            }

            if (pool) {
                const upsertQ = `
                    INSERT INTO tarjetas_regalo (
                        id, codigo, tipo_tarjeta_regalo, nombre_compra, nombre_comensal, telefono_compra,
                        importe, observaciones, creada_en_revo, fecha_compra,
                        entregado, fecha_entrega, pagado, fecha_pago, usado,
                        estado, fecha_caducidad, activo, fecha_ultima_modificacion
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10,
                        $11, $12, $13, $14, $15,
                        $16, $17, $18, (NOW() AT TIME ZONE 'Europe/Madrid')
                    ) ON CONFLICT (id) DO UPDATE SET
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
                        fecha_ultima_modificacion = (NOW() AT TIME ZONE 'Europe/Madrid')
                `;
                await pool.query(upsertQ, [
                    idStr,
                    codigoStr,
                    cleanVal(card.tipo_tarjeta_regalo) || 'PERSONALIZADAS',
                    cleanVal(card.nombre_compra),
                    cleanVal(card.nombre_comensal),
                    cleanVal(card.telefono_compra),
                    card.importe !== null && card.importe !== undefined ? Number(card.importe) : null,
                    cleanVal(card.observaciones),
                    card.creada_en_revo !== undefined ? card.creada_en_revo : null,
                    cleanVal(card.fecha_compra),
                    card.entregado !== undefined ? card.entregado : null,
                    cleanVal(card.fecha_entrega),
                    card.pagado !== undefined ? card.pagado : null,
                    cleanVal(card.fecha_pago),
                    card.usado !== undefined ? card.usado : null,
                    estado,
                    fCad,
                    activo
                ]);
            }
            return res.json({ success: true, action: 'upserted', card: { id: idStr, codigo: codigoStr } });
        }

        return res.status(400).json({ success: false, error: 'No se enviaron datos de tarjeta válidos.' });
    } catch (e) {
        console.error("Error en sync-giftcards-webhook:", e);
        return res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;


