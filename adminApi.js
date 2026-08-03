const express = require('express');
const router = express.Router();
const { getTranslation, translations } = require('./i18n');
const { getDynamicTexts, saveDynamicText, getMenuItems, saveMenuItems } = require('./database');

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
        const dynamicTexts = getDynamicTexts();
        const menuItems = getMenuItems();
        
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

        // Categorización explícita de todas las llaves de traducción
        const categoryMap = {
            welcomeMessage: 'main', menuButtonText: 'main', selectLocationTitle: 'main', selectLocationBody: 'main',
            locPaisVasco: 'main', locMadrid: 'main', madridMsg: 'main', mainMenuHeader: 'main',
            opt1Title: 'main', opt1Desc: 'main', opt2Title: 'main', opt2Desc: 'main',
            opt3Title: 'main', opt3Desc: 'main', opt3bTitle: 'main', opt3bDesc: 'main',
            opt4Title: 'main', opt4Desc: 'main', opt5Title: 'main', opt5Desc: 'main',
            opt6Title: 'main', opt6Desc: 'main', optLangTitle: 'main', optLangDesc: 'main',
            thanksClosingMsg: 'main', confirmPrompt: 'main', confirmYesBtn: 'main', confirmNoBtn: 'main', confirmCancelledMsg: 'main',

            reservaIntro: 'reserva', btnSolicitarReserva: 'reserva', btnAddListaEspera: 'reserva',
            webReservaLinkMsg: 'reserva', reservaCardPrompt: 'reserva', reservaCardBtnSi: 'reserva', reservaCardBtnNo: 'reserva',
            reservaNoCardPrompt: 'reserva', btnReservaWeb: 'reserva', btnReservaWaitlist: 'reserva', waitlistInitPrompt: 'reserva',
            waitlistStep1Nombre: 'reserva', waitlistStep1bDni: 'reserva', waitlistStep1b2Email: 'reserva', waitlistStep1cNac: 'reserva',
            waitlistStep2Comensales: 'reserva', waitlistStep3Tipo: 'reserva', waitlistStep3HoraComida: 'reserva', waitlistStep3HoraCena: 'reserva',
            waitlistStep4Dia1: 'reserva', waitlistStep4Dia2: 'reserva', waitlistStep4Dia3: 'reserva', waitlistStep4CenaDia: 'reserva',
            waitlistStep5Ninos: 'reserva', waitlistStep5NinosPrompt: 'reserva', waitlistStep6Alergias: 'reserva', waitlistStep7Idioma: 'reserva',
            waitlistSuccessMsg: 'reserva', cancelWaitlistPrompt: 'reserva', cancelWaitlistSuccessMsg: 'reserva', cancelWaitlistNotFoundMsg: 'reserva',
            modCancelDataPrompt: 'reserva', modReservationNotFoundMsg: 'reserva', modReservationVerifyPrompt: 'reserva',
            modReservationVerifyWithDetailsPrompt: 'reserva', modReservationMismatchMsg: 'reserva', cancelDataPrompt: 'reserva',
            cancelReservationNotFoundMsg: 'reserva', cancelReservationVerifyPrompt: 'reserva', cancelReservationVerifyWithDetailsPrompt: 'reserva',
            cancelReservationMismatchMsg: 'reserva', modOptionsPrompt: 'reserva', modOptComensales: 'reserva', modOptDia: 'reserva', modOptHora: 'reserva',
            modComensalesPrompt: 'reserva', modComensalesPromptUnknown: 'reserva', maxComensalesErrorMsg: 'reserva', modDiaPrompt: 'reserva',
            modHoraPrompt: 'reserva', modSuccessMsg: 'reserva', cancelSuccessMsg: 'reserva',

            menuTradicionTitle: 'tradicion', menuTradicionOptRegalar: 'tradicion', menuTradicionOptReservar: 'tradicion', menuTradicionOptCaducidad: 'tradicion',
            regalarMenuCaption: 'tradicion', regalarMenuMsg: 'tradicion', menuTradStep1Tarjeta: 'tradicion', menuTradStep2Nombre: 'tradicion',
            menuTradStep2bDni: 'tradicion', menuTradStep2b2Email: 'tradicion', menuTradStep2cNac: 'tradicion', menuTradStep3Tipo: 'tradicion',
            menuTradStep4HoraComida: 'tradicion', menuTradStep4HoraCena: 'tradicion', menuTradStep5Dia1: 'tradicion', menuTradStep5Dia2: 'tradicion',
            menuTradStep5Dia3: 'tradicion', menuTradStep5CenaDia: 'tradicion', menuTradStep6Alergias: 'tradicion', menuTradStep7Idioma: 'tradicion',
            menuTradCardVerified: 'tradicion', menuTradCardNotFound: 'tradicion', menuTradicionFormPrompt: 'tradicion', menuTradicionSuccessMsg: 'tradicion',
            menuTradicionCaducidadPrompt: 'tradicion', menuTradicionCaducidadMsg: 'tradicion', menuTradMoreCardsPrompt: 'tradicion',
            btnMtAddMismaMesa: 'tradicion', btnMtOtraMesa: 'tradicion', btnMtContinuar: 'tradicion', menuTradAddSameTablePrompt: 'tradicion',
            menuTradNewTablePrompt: 'tradicion', menuTradMaxTableCardsNotice: 'tradicion',

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
                botAction: 'Envía sticker animado de Casa Julián, mensaje de bienvenida y lista desplegable con 14 idiomas.',
                expectedCustomerInput: 'El cliente pulsa "Seleccionar Idioma" y elige uno de los 14 idiomas disponibles (ej. 🇪🇸 Español, Euskara, 🇬🇧 English, etc.).',
                keys: ['welcomeMessage']
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
            }
        ];

        return res.json({
            success: true,
            flowTree,
            useCases,
            categoryMap,
            languages,
            staticTranslations: translations,
            dynamicTexts,
            menuItems
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
        await saveDynamicText(lang, key, text, category || 'general');
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

        return res.json({ success: true, items, generatedCartaText: cartaTxt });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

module.exports = router;
