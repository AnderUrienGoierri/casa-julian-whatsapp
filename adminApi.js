const express = require('express');
const router = express.Router();
const { getTranslation, translations } = require('./i18n');
const { getDynamicTexts, saveDynamicText, getMenuItems, saveMenuItems } = require('./database');
const { getSimMessages, clearSimMessages } = require('./whatsappApi');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'julian2026';
// Token estático basado en hash simple de contraseña
const VALID_TOKEN = Buffer.from(`admin_casa_julian_${ADMIN_PASSWORD}`).toString('base64');

// Middleware de autenticación
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['x-admin-token'] || req.headers['authorization'] || req.query.token;
    if (authHeader === VALID_TOKEN || authHeader === `Bearer ${VALID_TOKEN}`) {
        return next();
    }
    return res.status(401).json({ error: 'No autorizado. Token de administrador inválido o no proporcionado.' });
}

// 1. Login
router.post('/login', (req, res) => {
    const { password } = req.body || {};
    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: VALID_TOKEN });
    }
    return res.status(401).json({ success: false, error: 'Contraseña de administrador incorrecta.' });
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
                description: 'Envía sticker animado, imagen de bienvenida y solicita seleccionar idioma entre 14 opciones.',
                messageKey: 'welcomeMessage',
                buttons: ['1. Español', '2. Euskara', '3. English', '4. Français', '...']
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
                    { id: 'opt_regalar_menu_tradicion', titleKey: 'opt4Title', descKey: 'opt4Desc' },
                    { id: 'opt_otras_cuestiones', titleKey: 'opt5Title', descKey: 'opt5Desc' },
                    { id: 'opt_cambiar_idioma', titleKey: 'opt6Title', descKey: 'opt6Desc' }
                ]
            },
            {
                id: 'step_reserva',
                title: '4. Flujo de Reserva / Lista de Espera',
                type: 'branch',
                description: 'Pregunta por Tarjeta Regalo (Menú Tradición), solicita comensales, turnos, fechas y datos de contacto.',
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
                    { id: 'faq_1', titleKey: 'faq12Title', descKey: 'faq12Desc' },
                    { id: 'faq_2', titleKey: 'faq1Title', descKey: 'faq1Desc' },
                    { id: 'faq_3', titleKey: 'faq2Title', descKey: 'faq2Desc' },
                    { id: 'faq_4', titleKey: 'faq3Title', descKey: 'faq3Desc' },
                    { id: 'faq_5', titleKey: 'faq4Title', descKey: 'faq4Desc' },
                    { id: 'faq_6', titleKey: 'faq5Title', descKey: 'faq5Desc' },
                    { id: 'faq_7', titleKey: 'faq6Title', descKey: 'faq6Desc' },
                    { id: 'faq_8', titleKey: 'faq7Title', descKey: 'faq7Desc' },
                    { id: 'faq_9', titleKey: 'faq8Title', descKey: 'faq8Desc' },
                    { id: 'faq_10', titleKey: 'faq9Title', descKey: 'faq9Desc' }
                ]
            }
        ];

        // Lista de idiomas disponibles
        const languages = [
            { code: 'es', name: 'Español 🇪🇸' },
            { code: 'eu', name: 'Euskara' },
            { code: 'en', name: 'English 🇬🇧' },
            { code: 'fr', name: 'Français 🇫🇷' },
            { code: 'de', name: 'Deutsch 🇩🇪' },
            { code: 'it', name: 'Italiano 🇮🇹' },
            { code: 'pt', name: 'Português 🇵🇹' },
            { code: 'nl', name: 'Nederlands 🇳🇱' },
            { code: 'pl', name: 'Polski 🇵🇱' },
            { code: 'ro', name: 'Română 🇷🇴' },
            { code: 'ko', name: '한국어 🇰🇷' },
            { code: 'zh', name: '中文 🇨🇳' },
            { code: 'ja', name: '日本語 🇯🇵' },
            { code: 'ar', name: 'العربية 🇸🇦' }
        ];

        // Categorización explícita de todas las llaves de traducción
        const categoryMap = {
            // 1. Bienvenida y Seleccion de Idioma
            welcomeMessage: 'welcome', welcomeImageUrl: 'welcome', welcomeStickerUrl: 'welcome',
            welcomeLanguagePrompt: 'welcome', welcomeLanguageBtn: 'welcome',
            opt6Title: 'welcome', opt6Desc: 'welcome',
            lang_es: 'welcome', lang_eu: 'welcome', lang_en: 'welcome', lang_fr: 'welcome',
            lang_de: 'welcome', lang_nl: 'welcome', lang_sa: 'welcome', lang_pt: 'welcome',
            lang_it: 'welcome', lang_ca: 'welcome', lang_gl: 'welcome', lang_zh: 'welcome',
            lang_ja: 'welcome', lang_ru: 'welcome',

            // 2. Seleccion de Ubicacion del Restaurante
            selectLocationTitle: 'location', selectLocationBody: 'location',
            locPaisVasco: 'location', locMadrid: 'location', madridMsg: 'location',

            // 3. Cierre y Despedida
            thanksClosingMsg: 'closing',

            // 4. Menu Principal
            mainMenuHeader: 'main', menuButtonText: 'main',
            opt1Title: 'main', opt1Desc: 'main', opt2Title: 'main', opt2Desc: 'main',
            opt3Title: 'main', opt3Desc: 'main', opt3bTitle: 'main', opt3bDesc: 'main',
            opt4Title: 'main', opt4Desc: 'main', opt5Title: 'main', opt5Desc: 'main',

            // 5. Reservas & Lista de Espera
            reservaIntro: 'reserva', btnSolicitarReserva: 'reserva', btnAddListaEspera: 'reserva',
            webReservaLinkMsg: 'reserva', reservaCardPrompt: 'reserva', reservaCardBtnSi: 'reserva', reservaCardBtnNo: 'reserva',
            reservaNoCardPrompt: 'reserva', btnReservaWeb: 'reserva', btnReservaWaitlist: 'reserva', waitlistInitPrompt: 'reserva',
            waitlistStep1Nombre: 'reserva', waitlistStep1bDni: 'reserva', waitlistStep1b2Email: 'reserva', waitlistStep1cNac: 'reserva',
            waitlistStep2Comensales: 'reserva', waitlistStep3Tipo: 'reserva', waitlistStep3HoraComida: 'reserva', waitlistStep3HoraCena: 'reserva',
            waitlistStep4Dia1: 'reserva', waitlistStep4Dia2: 'reserva', waitlistStep4Dia3: 'reserva', waitlistStep4CenaDia: 'reserva',
            waitlistStep5Ninos: 'reserva', waitlistStep5NinosPrompt: 'reserva', waitlistStep6Alergias: 'reserva', waitlistStep7Idioma: 'reserva',
            waitlistSuccessMsg: 'reserva',
            
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

            btnOmitirDni: 'reserva', btnOmitirEmail: 'reserva', btnNacEs: 'reserva', btnNacFr: 'reserva', btnNacUk: 'reserva', btnNacOtro: 'reserva',
            btnNinos0: 'reserva', btnNinos1: 'reserva', btnNinos2: 'reserva', requestSummaryHeader: 'reserva', confirmPrompt: 'reserva',
            confirmYesBtn: 'reserva', confirmNoBtn: 'reserva', confirmCancelledMsg: 'reserva',

            // 6. Menu Tradicion
            menuTradicionTitle: 'tradicion', menuTradicionOptRegalar: 'tradicion', menuTradicionOptReservar: 'tradicion', menuTradicionOptCaducidad: 'tradicion',
            regalarMenuCaption: 'tradicion', regalarMenuMsg: 'tradicion', menuTradStep1Tarjeta: 'tradicion', menuTradStep2Nombre: 'tradicion',
            menuTradStep2bDni: 'tradicion', menuTradStep2b2Email: 'tradicion', menuTradStep2cNac: 'tradicion', menuTradStep3Tipo: 'tradicion',
            menuTradStep4HoraComida: 'tradicion', menuTradStep4HoraCena: 'tradicion', menuTradStep5Dia1: 'tradicion', menuTradStep5Dia2: 'tradicion',
            menuTradStep5Dia3: 'tradicion', menuTradStep5CenaDia: 'tradicion', menuTradStep6Alergias: 'tradicion', menuTradStep7Idioma: 'tradicion',
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
                expectedCustomerInput: 'El cliente pulsa "Seleccionar Idioma" y elige uno de los 14 idiomas disponibles (ej. 🇪🇸 Español, Euskara, 🇬🇧 English, etc.).',
                keys: ['welcomeMessage', 'welcomeImageUrl', 'welcomeStickerUrl']
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
                botAction: 'Envía la imagen oficial del restaurante y muestra la lista desplegable interactiva con los 6 servicios principales.',
                expectedCustomerInput: 'El cliente selecciona una opción de la lista: 1. Hacer una reserva, 2. Modificación, 3. Cancelar reserva, 4. Regalar Menú Tradición, 5. Otras cuestiones, 6. Cambiar Idioma.',
                keys: ['mainMenuHeader', 'opt1Title', 'opt1Desc', 'opt2Title', 'opt2Desc', 'opt3Title', 'opt3Desc', 'opt4Title', 'opt4Desc', 'opt5Title', 'opt5Desc', 'opt6Title', 'opt6Desc']
            },
            {
                order: 4,
                id: 'cu_4_reserva_waitlist',
                title: 'Caso de Uso 4: Solicitud de Reserva y Alta en Lista de Espera',
                category: 'reserva',
                botAction: 'Pregunta si tiene Tarjeta Regalo, ofrece enlace a la reserva web oficial o guía paso a paso (1 a 7) para la lista de espera.',
                expectedCustomerInput: 'El cliente pulsa [ Sí, tengo una ] o [ No tengo ]. Si no tiene tarjeta, elige entre [ 🌐 Reserva Web ] o [ 📝 Lista de Espera ]. En lista de espera introduce Nombre, Comensales (máx 6), Turno, Fechas de preferencia y Alergias.',
                keys: ['reservaCardPrompt', 'reservaCardBtnSi', 'reservaCardBtnNo', 'reservaNoCardPrompt', 'btnReservaWeb', 'btnReservaWaitlist', 'waitlistStep1Nombre', 'waitlistStep2Comensales', 'waitlistStep3Tipo', 'waitlistStep4Dia1', 'waitlistStep5Ninos', 'waitlistStep6Alergias', 'waitlistSuccessMsg']
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
                keys: ['faqTitle', 'faq12Title', 'faq12Msg', 'faq1Title', 'faq1Msg', 'faq2Title', 'faq2Msg', 'faq3Title', 'faq3Msg', 'faq4Title', 'faq4Msg', 'faq5Title', 'faq5Msg', 'faq6Title', 'faq6Msg', 'faq7Title', 'faq7Msg', 'faq8Title', 'faq8Msg', 'faq9Title', 'faq9Msg']
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

module.exports = router;

